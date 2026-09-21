import type { NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod";

import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { prisma } from "@/app/lib/prisma";
import { currentCommitSha, normalizeFeedbackContext } from "@/app/lib/business/feedback/context";
import { feedbackImageUrl, isValidFeedbackImagePath } from "@/app/lib/business/feedback/image";
import { FEEDBACK_KINDS, isFeedbackKind } from "@/app/lib/business/feedback/kind";
import {
  MAX_FEEDBACK_IMAGES,
  isDuplicateSubmission,
  validateFeedbackDraft,
} from "@/app/lib/business/feedback/validate";
import { notifyNewFeedback } from "@/app/lib/notify/notify-feedback";

// ─── Gửi & đọc phản hồi ──────────────────────────────────────────────────────
//
// Route CỐ Ý MỎNG: xác thực → hỏi module business → ghi → bắn chuông qua `after()`. Mọi luật
// (loại nào bắn chuông, độ dài, chống trùng, bối cảnh hợp lệ) nằm ở app/lib/business/feedback/*
// và có test. Nếu phải mở file này để biết luật thì luật đã lọt sai tầng.
//
// MỌI ROLE ĐANG ĐĂNG NHẬP đều gửi được. Đó là toàn bộ mục đích: một kênh mà thợ 3D, Sales,
// Đặt đơn đều dùng được, để không ai phải mở Zalo.

const createSchema = z.object({
  kind: z.string(),
  summary: z.string(),
  detail: z.string().optional(),
  imagePaths: z.array(z.string()).max(MAX_FEEDBACK_IMAGES).optional(),
  // ⚠️ Client CHỈ gửi những gì nó thật sự biết: đường dẫn, hai id đọc từ URL, và thông tin
  // trình duyệt. Số đơn / số MO / phiên bản do SERVER tự tra từ id (xem `resolveOrderContext`).
  //
  // Hai lý do, và lý do thứ hai mới là lý do chính:
  //   1. DB là nguồn đúng — client có thể đang hiển thị dữ liệu cũ từ lần tải trước.
  //   2. KHÔNG COUPLING. Nút góp ý chỉ đọc `?orderId` và `?activeItemId` từ URL, không đọc gì
  //      từ OrderDetailPanel (8000+ dòng). Hợp đồng giữa hai bên là URL, nên panel có bị viết
  //      lại toàn bộ thì nút vẫn chạy.
  context: z
    .object({
      pageUrl: z.string().optional(),
      orderId: z.string().optional(),
      activeItemId: z.string().optional(),
      userAgent: z.string().optional(),
      viewport: z.string().optional(),
    })
    .optional(),
});

/**
 * Tra số đơn / số MO / phiên bản từ id đọc được trên URL.
 *
 * KHÔNG BAO GIỜ ném lỗi và không bao giờ chặn: bối cảnh là thứ phụ trợ, và để một phản hồi
 * thất bại vì id trên URL đã cũ là biến công cụ báo lỗi thành một lỗi nữa.
 */
async function resolveOrderContext(params: { orderId: string | null; activeItemId: string | null }) {
  const empty = { orderNumber: null, moNumber: null, orderVersion: null };
  if (!params.orderId) return empty;
  try {
    const order = await prisma.order.findUnique({
      where: { id: params.orderId },
      select: { orderNumber: true, version: true },
    });
    if (!order) return empty;

    // MO chỉ tra khi URL có activeItemId — một đơn có nhiều MO, và đoán lấy MO đầu tiên là
    // gắn cho báo cáo một số hiệu SAI. Một dòng sai còn tệ hơn một dòng thiếu: nó trông như
    // dữ liệu thật nên không ai kiểm lại.
    let moNumber: string | null = null;
    if (params.activeItemId) {
      const item = await prisma.orderItem.findUnique({
        where: { id: params.activeItemId },
        select: { moNumber: true },
      });
      moNumber = item?.moNumber ?? null;
    }
    return { orderNumber: order.orderNumber, moNumber, orderVersion: order.version };
  } catch (error) {
    console.error("[feedback] Không tra được bối cảnh đơn:", error);
    return empty;
  }
}

/** POST — gửi một phản hồi mới. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Errors.forbidden();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.badRequest("Invalid JSON");
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);

  const { kind } = parsed.data;
  if (!isFeedbackKind(kind)) {
    return Errors.badRequest(`Loại phản hồi phải là một trong: ${FEEDBACK_KINDS.join(", ")}.`);
  }

  const imagePaths = parsed.data.imagePaths ?? [];

  // Chốt chặn từng đường dẫn ảnh. Server sẽ GHÉP chuỗi này thành URL công khai rồi lưu vào
  // DB — không kiểm thì một chuỗi tuỳ ý biến ô ảnh thành nơi trỏ tới object bất kỳ trong
  // project. Xem business/feedback/image.ts:isValidFeedbackImagePath.
  const badPath = imagePaths.find((p) => !isValidFeedbackImagePath(p));
  if (badPath) {
    console.error("[feedback] Đường dẫn ảnh không hợp lệ:", badPath);
    return Errors.badRequest("Ảnh không hợp lệ — hãy thử tải lại ảnh.");
  }

  const draft = {
    kind,
    summary: parsed.data.summary,
    detail: parsed.data.detail ?? "",
    imagePaths,
  };

  const invalid = validateFeedbackDraft(draft);
  if (invalid) return Errors.badRequest(invalid);

  // ─── Chống bấm Gửi hai lần ──────────────────────────────────────────────────
  // Chỉ so với phản hồi GẦN NHẤT CỦA CHÍNH NGƯỜI ĐÓ. Hai nhân viên gặp cùng một lỗi và mô tả
  // giống nhau là chuyện có thật, và cả hai đều phải được ghi lại.
  //
  // Bỏ qua bước này khi không có dbId (VIRTUAL_ADMIN không có hàng users nên không truy được
  // "phản hồi gần nhất của người đó").
  if (user.dbId) {
    const previous = await prisma.feedbackReport.findFirst({
      where: { reporterId: user.dbId },
      orderBy: { createdAt: "desc" },
      select: { kind: true, summary: true, createdAt: true },
    });
    if (
      previous &&
      isFeedbackKind(previous.kind) &&
      isDuplicateSubmission({
        draft,
        previous: { kind: previous.kind, summary: previous.summary, createdAt: previous.createdAt },
        now: new Date(),
      })
    ) {
      // 200 chứ KHÔNG phải lỗi: với người dùng, phản hồi của họ ĐÃ được ghi nhận — đúng như
      // họ mong. Trả lỗi ở đây là làm họ tưởng mất công vô ích và gửi lại lần thứ ba.
      return ok({ duplicate: true });
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  if (imagePaths.length > 0 && !supabaseUrl) {
    // Không âm thầm bỏ ảnh: người dùng đính ảnh vì ảnh LÀ bằng chứng. Nói thật để họ biết
    // phải mô tả bằng chữ, thay vì gửi xong mới phát hiện ảnh không tới.
    return Errors.serviceUnavailable("Chưa cấu hình SUPABASE_URL — chưa lưu được ảnh kèm.");
  }

  const context = normalizeFeedbackContext(parsed.data.context);
  const resolved = await resolveOrderContext({
    orderId: context.orderId,
    activeItemId: parsed.data.context?.activeItemId?.trim() || null,
  });

  const created = await prisma.feedbackReport.create({
    data: {
      kind,
      summary: draft.summary.trim(),
      detail: draft.detail.trim(),
      imageUrls: imagePaths.map((path) => feedbackImageUrl({ supabaseUrl: supabaseUrl!, path })),

      reporterId: user.dbId ?? null,
      // Ảnh chụp danh tính lúc gửi — xem ghi chú ở schema.prisma. `??` đủ ở đây vì cả ba đều
      // có giá trị mặc định hợp lý và không có trường nào là chuỗi rỗng hợp lệ.
      reporterName: user.name?.trim() || user.email?.trim() || "Không rõ",
      reporterEmail: user.email?.trim() || "",
      reporterRole: user.role,

      ...context,
      // Ghi ĐÈ ba trường tra từ DB lên bối cảnh client gửi — DB là nguồn đúng.
      ...resolved,
      // commitSha đọc ở SERVER, KHÔNG nhận từ client: tab mở từ hôm qua vẫn đang chạy bundle
      // cũ sau khi đã deploy bản mới, nên client chỉ biết bản build của bundle nó đã tải.
      commitSha: currentCommitSha(process.env),
    },
    select: { id: true, kind: true, status: true, createdAt: true },
  });

  // Bắn chuông SAU khi response đã đi — xem notify-feedback.ts. Quyết định "loại nào bắn
  // chuông" nằm trong đó (shouldNotifyChat), KHÔNG phải ở route này.
  after(() => notifyNewFeedback(created.id));

  return ok(created, 201);
}

const LIST_LIMIT = 100;

/**
 * GET — danh sách.
 *
 *   ?scope=mine (mặc định) — phản hồi CỦA TÔI, mọi role. Đây là nửa "đóng vòng": người gửi
 *                            thấy lại trạng thái và câu trả lời. Thiếu nó thì sau lần thứ hai
 *                            không hồi âm, họ quay về nhắn tin.
 *   ?scope=all             — toàn bộ, CHỈ ADMIN.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Errors.forbidden();

  const scope = request.nextUrl.searchParams.get("scope") ?? "mine";
  if (scope !== "mine" && scope !== "all") {
    return Errors.badRequest("scope phải là 'mine' hoặc 'all'.");
  }
  if (scope === "all" && user.role !== "ADMIN") return Errors.forbidden();

  // VIRTUAL_ADMIN không có dbId nên không có phản hồi "của mình" — trả rỗng, không nổ.
  if (scope === "mine" && !user.dbId) return ok([]);

  const rows = await prisma.feedbackReport.findMany({
    where: scope === "mine" ? { reporterId: user.dbId } : {},
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    select: {
      id: true,
      kind: true,
      status: true,
      summary: true,
      detail: true,
      imageUrls: true,
      reporterName: true,
      reporterEmail: true,
      reporterRole: true,
      pageUrl: true,
      orderNumber: true,
      moNumber: true,
      orderVersion: true,
      commitSha: true,
      adminReply: true,
      repliedAt: true,
      createdAt: true,
    },
  });

  return ok(rows);
}
