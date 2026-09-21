import type { NextRequest } from "next/server";

import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { resolveProgressActor } from "@/app/lib/business/kpi-3d/actor";
import { configuredCalendarToWorkingCalendar } from "@/app/lib/business/kpi-3d/calendar-adapter";
import {
  blockedReasonForProgress,
  canReadProgress,
  deniedReasonForProgressWrite,
  progressEntryInputSchema,
  PROGRESS_STATUS_LABELS,
  resolveAssignmentStateAfterProgress,
} from "@/app/lib/business/kpi-3d/progress";

// ─── /api/design-3d/assignments/[id]/progress ────────────────────────────────
// Nhân viên Thiết kế 3D cập nhật tiến độ cho lượt giao việc của mình (yêu cầu #5),
// hệ thống tự đóng dấu giờ hoàn tất (#6) và tự đánh giá Đúng/Trễ hạn (#7).
//
// Route CỐ Ý MỎNG: xác thực → nạp assignment → hỏi module business → ghi.
// Toàn bộ quy tắc (quyền, đóng dấu 1 lần, đánh giá KPI) nằm ở kpi-3d/progress.ts và có
// unit test riêng — cùng pattern với /api/import/sheet-sync.

const assignmentSelect = {
  id: true,
  orderId: true,
  orderItemId: true,
  designer3DId: true,
  deadlineAt: true,
  status: true,
  completedAt: true,
  acknowledgedAt: true,
  // Khoảng bị Admin/Order bắt tạm dừng — TRỪ khỏi giờ thực tế (xem kpi-3d/pause.ts).
  pauses: { select: { pausedAt: true, resumedAt: true } },
  // Hai thứ dưới đây để đóng dấu GIỜ THỰC TẾ lúc hoàn tất.
  //
  // assignedAt là mốc dự phòng khi chưa có mốc nhận việc (dữ liệu cũ, hoặc PRODUCTION ghi hộ).
  //
  // workingCalendar phải là lịch CỦA CHÍNH LƯỢT NÀY (workingCalendarId đã lưu lúc giao việc),
  // không phải lịch đang active: nếu admin đổi lịch giữa lúc giao và lúc xong thì đo bằng lịch
  // mới sẽ ra con số không khớp với deadline đã chốt bằng lịch cũ.
  assignedAt: true,
  workingCalendar: { include: { sessions: true, holidays: true } },
} as const;

const logSelect = {
  id: true,
  status: true,
  progressPercent: true,
  renderInfoUrl: true,
  note: true,
  // NV 3D báo lại thực tế đã làm. TRẢ VỀ để màn hình vá được ngay bằng số của server, không
  // phải tự suy ở trình duyệt rồi chờ một vòng kéo lại 200 lượt mới thấy.
  reportedDesignRequest: true,
  createdAt: true,
  updatedBy: { select: { id: true, name: true } },
} as const;

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canReadProgress(user.role)) return Errors.forbidden();

  const { id } = await ctx.params;

  const assignment = await prisma.design3DAssignment.findUnique({
    where: { id },
    select: {
      ...assignmentSelect,
      kpiStatus: true,
      kpiDeltaMinutes: true,
      standardMinutesSnapshot: true,
      assignedAt: true,
      reviewStatus: true,
      reviewedAt: true,
      reviewNote: true,
      reworkCount: true,
      reviewedBy: { select: { id: true, name: true } },
      designer3D: { select: { id: true, name: true, code: true } },
      kpiGroup: { select: { id: true, name: true, code: true } },
      progressLogs: { select: logSelect, orderBy: { createdAt: "desc" } },
    },
  });
  if (!assignment) return Errors.notFound("Design 3D assignment");

  return ok(assignment);
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Errors.forbidden();

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.badRequest("Invalid JSON");
  }

  const parsed = progressEntryInputSchema.safeParse(body);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);
  const entry = parsed.data;

  const assignment = await prisma.design3DAssignment.findUnique({
    where: { id },
    select: assignmentSelect,
  });
  if (!assignment) return Errors.notFound("Design 3D assignment");

  const actor = await resolveProgressActor(user);
  const denied = deniedReasonForProgressWrite(actor, assignment);
  if (denied) return Errors.forbidden(denied);

  // Truyền TRẠNG THÁI của dòng đang ghi: lúc đơn bị gác, ghi tiến độ thì được mà gửi kết quả
  // thì không — luật ở kpi-3d/progress.ts.
  const blocked = blockedReasonForProgress(assignment, entry.status);
  if (blocked) return Errors.badRequest(blocked);

  // MỘT mốc thời gian dùng cho cả dòng log lẫn giờ hoàn tất — nếu lấy new Date() hai lần,
  // hai giá trị lệch nhau vài mili giây và số liệu đối soát về sau sẽ không khớp tuyệt đối.
  const now = new Date();

  // MỘT lần chuẩn hoá, dùng cho cả dòng log lẫn Lịch sử thay đổi. Chuẩn hoá hai lần là hai chỗ
  // phải nhớ cùng một luật "" → null.
  const reportedDesignRequest = entry.reportedDesignRequest?.trim() || null;

  const patch = resolveAssignmentStateAfterProgress(
    assignment,
    entry,
    now,
    // Lượt cũ chưa gắn lịch → để undefined, module business tự dùng lịch mặc định.
    assignment.workingCalendar ? configuredCalendarToWorkingCalendar(assignment.workingCalendar) : undefined,
  );

  const result = await prisma.$transaction(async (tx) => {
    // Lượt hoàn tất mà còn khoảng dừng chưa đóng thì nó mang cờ "đang tạm dừng" vĩnh viễn, và
    // mọi màn hình đọc theo `resumedAt = null` sẽ hiện sai trạng thái cho một việc đã xong.
    //
    // ⚠️ LƯỚI AN TOÀN, KHÔNG PHẢI ĐƯỜNG CHẠY THƯỜNG. `blockedReasonForProgress` nay CHẶN gửi kết
    // quả khi đang bị gác (tạm dừng là chốt sổ cho phiên đó — xem chú thích dài ở progress.ts),
    // nên đường tới đây với một khoảng dừng đang mở lẽ ra không còn. Giữ lại vì dữ liệu cũ có thể
    // đã ở trạng thái đó, và vì một lượt "đã xong nhưng đang tạm dừng" là thứ không màn hình nào
    // đọc đúng được.
    if (patch.completedAt) {
      await tx.design3DPause.updateMany({
        where: { assignmentId: assignment.id, resumedAt: null },
        data: { resumedAt: now, resumedById: user.dbId ?? null, resumeNote: "Tự đóng — NV 3D đã gửi kết quả" },
      });
    }

    const log = await tx.design3DProgressLog.create({
      data: {
        assignmentId: assignment.id,
        updatedById: user.dbId ?? null,
        status: entry.status,
        progressPercent: entry.progressPercent ?? null,
        renderInfoUrl: entry.renderInfoUrl?.trim() || null,
        note: entry.note?.trim() || null,
        // Chuỗi rỗng → null: ô chọn ở giao diện gửi "" khi NV để nguyên mục "— giữ nguyên yêu
        // cầu". Lưu "" thì cột có hai cách viết cho cùng một nghĩa "không báo gì", và mọi câu
        // đếm về sau phải nhớ kiểm cả hai.
        reportedDesignRequest,
        createdAt: now,
      },
      select: logSelect,
    });

    const updated = await tx.design3DAssignment.update({
      where: { id: assignment.id },
      data: {
        status: patch.status,
        ...(patch.completedAt ? { completedAt: patch.completedAt } : {}),
        ...(patch.kpiStatus ? { kpiStatus: patch.kpiStatus } : {}),
        ...(patch.kpiDeltaMinutes != null ? { kpiDeltaMinutes: patch.kpiDeltaMinutes } : {}),
        // Giờ thực tế đóng dấu một lần cùng completedAt. Order vẫn sửa được về sau, nhưng số
        // sửa tay nằm ở extraData JSON chứ KHÔNG ghi đè cột này — xem chú thích ở
        // resolveActualMinutes (kpi-3d/actual-minutes.ts) về việc phân biệt hai con số.
        ...(patch.actualMinutes != null ? { actualMinutes: patch.actualMinutes } : {}),
        // Mỗi lần gửi kết quả đều cần Order/Admin kiểm lại — kể cả lần gửi lại sau khi bị
        // yêu cầu làm lại. KHÔNG đụng completedAt/kpiStatus đã chốt (quy tắc đóng dấu một lần).
        ...(entry.status === "SENT_RESULT" ? { reviewStatus: "PENDING_REVIEW" as const } : {}),
        // KHÔNG còn tự đóng dấu nhận việc hộ: blockedReasonForProgress đã chặn từ đầu route,
        // nên tới được đây nghĩa là NV đã nhận việc rồi.
      },
      // Trả đủ để MÀN HÌNH VÁ ĐƯỢC NGAY bằng số của server, không phải tự suy ở trình duyệt rồi
      // chờ một vòng kéo lại 200 lượt mới thấy kết quả.
      //
      // `reviewStatus` và `pauses` là hai trường KHÔNG THỂ thiếu ở đây: cả hai đều do chính giao
      // dịch này đổi (nộp kết quả → chờ duyệt; đang gác → tự đóng khoảng dừng), nên nếu client
      // phải tự đoán thì luật nghiệp vụ tồn tại ở hai nơi. `pauses` phải chọn lại đầy đủ vì
      // assignmentSelect chỉ lấy hai mốc để TÍNH GIỜ, không đủ để hiển thị.
      select: {
        ...assignmentSelect,
        kpiStatus: true,
        kpiDeltaMinutes: true,
        reviewStatus: true,
        pauses: {
          select: { id: true, pausedAt: true, resumedAt: true, reason: true, confirmedMinutes: true },
          // CÙNG THỨ TỰ với route danh sách (mới nhất trước). Trả về thứ tự khác là màn hình sau
          // khi vá hiện đúng dữ liệu nhưng sai khoảng dừng "đang mở", rồi tự sửa lại sau một
          // giây — kiểu nhảy số khó truy nhất.
          orderBy: { pausedAt: "desc" },
        },
      },
    });

    // KHÔNG chiếu kết quả sang extraData JSON nữa. Bản chiếu cũ gây ba lỗi: ISO đầy đủ nhét
    // vào ô ngày "YYYY-MM-DD" nên hiển thị sai, `ketQua` bị trình duyệt tính lại rồi ghi đè
    // phán quyết của server, và trạng thái kiểm tồn tại ở hai nơi. Sidebar giờ đọc thẳng từ
    // bảng này qua API đơn hàng — một nguồn sự thật duy nhất.

    // Ghi Lịch sử thay đổi của ĐƠN để việc cập nhật của NV 3D hiện chung với mọi thao tác
    // khác trên đơn — không tạo màn hình lịch sử riêng chỉ cho 3D.
    await tx.workflowHistory.create({
      data: {
        orderId: assignment.orderId,
        performedById: user.dbId ?? null,
        action: "FIELD_UPDATED",
        // Báo lệch đi VÀO CÂU CHỮ, không chỉ vào metadata: Lịch sử thay đổi hiện `comment`, còn
        // `metadata` là thứ phải bung ra mới thấy. Một thay đổi phân loại việc đáng được đọc
        // ngay ở dòng đầu.
        comment:
          `Cập nhật tiến độ 3D — ${PROGRESS_STATUS_LABELS[entry.status]}` +
          (reportedDesignRequest ? ` · 3D báo thực tế đã làm: ${reportedDesignRequest}` : ""),
        metadata: {
          source: "DESIGN_3D_PROGRESS",
          assignmentId: assignment.id,
          ...(reportedDesignRequest ? { reportedDesignRequest } : {}),
          ...(patch.completedAt ? { completedAt: patch.completedAt.toISOString() } : {}),
          ...(patch.kpiStatus ? { kpiStatus: patch.kpiStatus, kpiDeltaMinutes: patch.kpiDeltaMinutes } : {}),
        } as never,
      },
    });

    return { log, assignment: updated };
  });

  return ok(result, 201);
}
