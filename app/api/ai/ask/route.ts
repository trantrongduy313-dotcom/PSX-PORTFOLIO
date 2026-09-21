import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { prisma } from "@/app/lib/prisma";
import { defaultGuideRoleFor } from "@/app/lib/guide/guide-role";
import { askModel, isAiConfigured } from "@/app/lib/ai/client";
import { checkAiBudget } from "@/app/lib/ai/budget-check";
import { KNOWLEDGE_TOPICS } from "@/app/lib/ai/knowledge/generated";
import { parseAnswer } from "@/app/lib/business/ai/answer";
import { findTopic, selectKnowledge } from "@/app/lib/business/ai/knowledge";
import { docStaleness } from "@/app/lib/business/docs/staleness";
import { loadChangelogPublishedAt } from "@/app/lib/changelog/published-dates";
import { buildSystemBlocks } from "@/app/lib/business/ai/prompt";
import {
  MAX_CONVERSATION_TURNS,
  MAX_QUESTION_LENGTH,
  oneLine,
  trimConversation,
  validateQuestion,
} from "@/app/lib/business/ai/validate";

// ─── Hỏi trợ lý ──────────────────────────────────────────────────────────────
//
// Route CỐ Ý MỎNG: xác thực → hạn mức → kiểm câu hỏi → dựng prompt → gọi mô hình → ghi log.
// Mọi luật (chọn mục nào, chỉ thị gì, đọc câu trả lời ra sao, ngưỡng bao nhiêu) nằm ở
// app/lib/business/ai/* và có test chạy được KHÔNG CẦN API KEY.
//
// ⚠️ THỨ TỰ Ở ĐÂY LÀ MỘT PHẦN CỦA THIẾT KẾ, KHÔNG PHẢI TÌNH CỜ:
//
//   HẠN MỨC ĐỨNG TRƯỚC LỆNH GỌI MÔ HÌNH. Đảo lại là đã tốn tiền rồi mới từ chối — một cái trần
//   chi phí đặt sau chỗ tiêu tiền thì không chặn được gì.
//
// MỌI ROLE ĐANG ĐĂNG NHẬP đều hỏi được, cùng lý do với nút Góp ý: một kênh mà thợ 3D, Sales,
// Đặt đơn đều dùng được.

const askSchema = z.object({
  question: z.string(),
  pageUrl: z.string().optional(),
  // Lịch sử do CLIENT giữ, không có phiên ở server. Một cuộc hỏi đáp ngắn không đáng có một
  // bảng "phiên" cùng với việc dọn phiên cũ; và client giữ thì đóng hộp thoại là quên sạch —
  // đúng cái người dùng mong.
  history: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .max(MAX_CONVERSATION_TURNS)
    .optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Errors.forbidden("Bạn cần đăng nhập để dùng trợ lý.");

  // Chưa cấu hình key thì trả 503, không phải 500: đây là vấn đề vận hành, không phải bug xử lý
  // request. Bình thường người dùng không bao giờ gặp — client ẩn hẳn nút khi chưa cấu hình.
  if (!isAiConfigured()) {
    return Errors.serviceUnavailable("Trợ lý chưa được cấu hình. Bạn xem ở Hướng dẫn sử dụng nhé.");
  }

  const parsed = askSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Errors.validationFailed(parsed.error.flatten());

  const question = oneLine(parsed.data.question);
  const invalid = validateQuestion(question);
  if (invalid) return Errors.badRequest(invalid);

  // ⚠️ TỪ CHỐI khi hội thoại đã đầy, KHÔNG âm thầm cắt. Âm thầm cắt là người dùng thấy trợ lý
  // "quên" mất điều họ vừa nói mà không có lời giải thích nào — và họ sẽ nghĩ nó hỏng.
  const history = parsed.data.history ?? [];
  if (history.length >= MAX_CONVERSATION_TURNS) {
    return Errors.badRequest(
      `Một lượt trò chuyện tối đa ${MAX_CONVERSATION_TURNS} câu. Hãy bắt đầu câu hỏi mới.`,
    );
  }

  const budget = await checkAiBudget(user.dbId);
  if (!budget.allowed) return Errors.badRequest(budget.message);

  const guideRole = defaultGuideRoleFor(user.role);

  // ─── Mục nào CÓ THỂ ĐÃ CŨ ───────────────────────────────────────────────────
  //
  // Server tính, mô hình chỉ đọc cờ — xem chú thích ở formatKnowledgeBlock. Một mốc thời gian
  // dùng cho CẢ tập mục: hai lần `new Date()` có thể rơi hai bên ranh giới tháng ở đúng nửa đêm.
  //
  // `.catch` nằm sẵn trong helper: mất danh sách changelog chỉ làm mất cờ dè dặt, KHÔNG được làm
  // hỏng một lượt hỏi đang chạy được.
  const changelogPublishedAt = await loadChangelogPublishedAt();
  const now = new Date();
  const staleIds = new Set(
    KNOWLEDGE_TOPICS.filter(
      (t) => docStaleness(t.lastReviewed, changelogPublishedAt, now).level !== "FRESH",
    ).map((t) => t.id),
  );

  const knowledge = selectKnowledge(KNOWLEDGE_TOPICS, guideRole, staleIds);

  // Bộ nội dung rỗng cho vai trò này. Nói thật thay vì gọi mô hình với một khối trống — nó sẽ
  // trả lời bằng kiến thức chung, đúng thứ luật số 1 của chỉ thị cấm.
  if (knowledge.topics.length === 0) {
    return Errors.serviceUnavailable(
      "Chưa có nội dung hướng dẫn cho vai trò của bạn. Bạn gửi Góp ý để được trả lời nhé.",
    );
  }

  const pageUrl = safePageUrl(parsed.data.pageUrl);

  const result = await askModel({
    system: buildSystemBlocks({ knowledge, userRole: user.role, pageUrl }),
    question,
    history: trimConversation(history),
  });

  // Hạ tầng lỗi thì KHÔNG ghi log và KHÔNG tính vào hạn mức: không có câu hỏi nào được trả lời,
  // nên tính vào hạn mức là trừ lượt của người dùng cho một lỗi của hệ thống.
  if (!result.ok) return Errors.serviceUnavailable(result.message);

  const answer = parseAnswer(result.text, knowledge.allowedIds);

  if (answer.droppedIds.length > 0) {
    // Ghi log máy chủ ngoài việc lưu DB: đây là dấu hiệu chỉ thị hoặc bộ id đang có vấn đề, và
    // nó cần nhìn thấy được ngay trong log Vercel chứ không chỉ khi có người mở bảng ra xem.
    console.warn(`[ai] loại id không có thật: ${answer.droppedIds.join(", ")}`);
  }

  // ⚠️ GHI LOG KHÔNG ĐƯỢC LÀM MẤT CÂU TRẢ LỜI. Người dùng đã có câu trả lời đúng trong tay; để
  // một lỗi ghi DB (bảng chưa có migration, kết nối chớp) biến nó thành lỗi 500 là phá đúng
  // việc vừa làm xong. Log là để ĐO, và một phép đo bị mất không đáng bằng một câu trả lời.
  const logId = await prisma.aiQuestionLog
    .create({
      data: {
        userId: user.dbId ?? null,
        userRole: user.role,
        question,
        answer: answer.text,
        pageUrl,
        sourceIds: answer.sourceIds,
        wasUnanswered: answer.unanswered,
        droppedIds: answer.droppedIds,
        tokensIn: result.usage.inputTokens,
        tokensOut: result.usage.outputTokens,
        tokensCacheRead: result.usage.cacheReadTokens,
      },
      select: { id: true },
    })
    .then((r) => r.id)
    .catch((err) => {
      console.error("[ai] không ghi được log câu hỏi:", err);
      return null;
    });

  return ok({
    // `logId` có thể null (ghi log thất bại). Client dùng nó cho nút 👍/👎, nên null = ẩn hai
    // nút đó đi — không hiện một nút bấm vào không làm gì.
    logId,
    text: answer.text,
    unanswered: answer.unanswered,
    // ─── PHẠM VI trợ lý ĐANG CÓ, gửi kèm để nói thật khi không trả lời được ───
    //
    // 🔴 VÌ SAO CẦN: hộp thoại ghi "Trả lời từ hướng dẫn sử dụng", nghe như nó biết TOÀN BỘ
    // hướng dẫn (23 chương). Thực tế nó biết vài chủ đề. Người dùng hỏi "Chờ ĐX NL là gì", nhận
    // "nội dung hướng dẫn chưa nói về việc này", rồi kết luận TRỢ LÝ HỎNG — trong khi nó đang
    // làm đúng (luật 1 cấm suy diễn).
    //
    // Nói ra danh sách chủ đề thì họ hiểu NGAY vì sao, và biết câu của mình nằm ngoài phạm vi.
    // Đây là đổi một giới hạn im lặng thành một giới hạn nói được.
    //
    // Chỉ TIÊU ĐỀ, không kèm nội dung: client không cần bộ kiến thức, và gửi nó xuống là vài
    // chục nghìn ký tự cho một dòng chữ.
    scope: knowledge.topics.map((t) => t.title),
    // Dựng phần dẫn nguồn NGAY Ở ĐÂY, không gửi id trần cho client. Client không có bộ nội dung
    // nên không tra được tiêu đề, và bắt nó tải cả bộ về chỉ để hiện một cái nhãn là gửi vài
    // chục nghìn ký tự xuống trình duyệt cho một dòng chữ.
    sources: answer.sourceIds
      .map((id) => findTopic(knowledge.topics, id))
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .map((t) => ({ id: t.id, title: t.title, lastReviewed: t.lastReviewed })),
  });
}

/**
 * Chỉ nhận đường dẫn tương đối.
 *
 * ⚠️ CÙNG LỚP LỖI ĐÃ SUÝT LỌT Ở TÍNH NĂNG GÓP Ý: `pageUrl` do client gửi, được lưu vào DB rồi
 * hiện lại trên trang admin. Nhận nguyên văn là nhận cả `javascript:...` — và `new URL()` phân
 * tích chuỗi đó THÀNH CÔNG, nên một phép kiểm bằng URL sẽ cho nó đi qua.
 *
 * Ở đây chặt hơn context.ts của Góp ý: CHỈ nhận đường dẫn tương đối. Trợ lý không có lý do gì
 * nhận một địa chỉ tuyệt đối — trang đang mở luôn là một trang của chính ứng dụng.
 * `//evil.com` bị loại vì nó là URL giao thức tương đối, không phải đường dẫn.
 */
function safePageUrl(value: string | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value.slice(0, MAX_QUESTION_LENGTH);
}
