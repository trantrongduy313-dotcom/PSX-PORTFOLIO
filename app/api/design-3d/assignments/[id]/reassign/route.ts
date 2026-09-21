import type { NextRequest } from "next/server";

import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { configuredCalendarToWorkingCalendar } from "@/app/lib/business/kpi-3d/calendar-adapter";
import { calculate3DKpiDeadline } from "@/app/lib/business/kpi-3d-deadline";
import { freezeMinutesOnHandover } from "@/app/lib/business/kpi-3d/handover-freeze";
import { isStaleAssignmentError, StaleAssignmentError } from "@/app/lib/business/kpi-3d/stale-state";
import {
  deniedReasonForReassign,
  handoverNote,
  reassignHistoryComment,
  reassignInputSchema,
} from "@/app/lib/business/kpi-3d/reassign";

// ─── POST /api/design-3d/assignments/[id]/reassign ───────────────────────────
//
// Admin/Order không duyệt kết quả và chuyển việc sang NV 3D khác.
//
// Route CỐ Ý MỎNG: xác thực → nạp → hỏi module business → ghi. Luật nằm ở kpi-3d/reassign.ts.
//
// Cả chuỗi nằm trong MỘT transaction. Đóng lượt cũ mà không mở được lượt mới là bỏ rơi một MO
// không còn ai phụ trách — và không màn hình nào hiện ra điều đó.

const assignmentSelect = {
  id: true,
  orderId: true,
  orderItemId: true,
  status: true,
  reviewStatus: true,
  designer3DId: true,
  designer3D: { select: { name: true } },
  kpiGroupId: true,
  workingCalendarId: true,
  standardMinutesSnapshot: true,
  // Bốn thứ dưới để CHỐT giờ thực tế của lượt cũ — xem freezeActualMinutes.
  actualMinutes: true,
  completedAt: true,
  acknowledgedAt: true,
  assignedAt: true,
  pauses: { select: { pausedAt: true, resumedAt: true, confirmedMinutes: true } },
  workingCalendar: { include: { sessions: true, holidays: true } },
} as const;

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

  const parsed = reassignInputSchema.safeParse(body);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);
  const input = parsed.data;

  try {
    const assignment = await prisma.design3DAssignment.findUnique({
      where: { id },
      select: assignmentSelect,
    });
    if (!assignment) return Errors.notFound("Design 3D assignment");

    const denied = deniedReasonForReassign(user.role, assignment, input.designer3DId);
    if (denied) return Errors.forbidden(denied);

    const newDesigner = await prisma.designer3D.findUnique({
      where: { id: input.designer3DId },
      select: { id: true, name: true, isActive: true },
    });
    if (!newDesigner) return Errors.notFound("Designer3D");
    // Giao cho người đã nghỉ thì đơn rơi vào khoảng không: họ không đăng nhập nữa nên không ai
    // thấy việc, mà lượt vẫn đếm vào tải công việc.
    if (!newDesigner.isActive) {
      return Errors.badRequest("Nhân viên 3D này đã ngừng hoạt động — chọn người khác.");
    }

    const now = new Date();
    const calendar = assignment.workingCalendar
      ? configuredCalendarToWorkingCalendar(assignment.workingCalendar)
      : undefined;

    // CHỐT giờ của lượt cũ NGAY TẠI ĐÂY. Không chốt thì con số vẫn được suy ra mỗi lần hiển
    // thị, và nó đo từ lúc nhận việc tới "bây giờ" — tức giờ của người đã rời đơn vẫn phình
    // ra theo thời gian NGƯỜI MỚI làm.
    //
    // Phép đo nằm ở module DÙNG CHUNG với đường lưu form (handover-freeze.ts). Trước đây nó chỉ
    // có ở đây, nên đường kia đóng lượt bằng đúng một dòng `status: "REASSIGNED"` và bỏ qua toàn
    // bộ việc chốt giờ. Đây là luật tính LƯƠNG: hai bản chép tay thì không có cách nào biết
    // chúng còn khớp nhau.
    const frozenWithoutSubmit = freezeMinutesOnHandover({
      actualMinutes: assignment.actualMinutes,
      completedAt: assignment.completedAt,
      acknowledgedAt: assignment.acknowledgedAt,
      assignedAt: assignment.assignedAt,
      calendar,
      pauses: assignment.pauses,
      now,
    });

    // Lượt mới nhận NGUYÊN suất giờ chuẩn: họ bắt đầu lại từ một bản bị bác, bắt họ gánh phần
    // giờ người trước đã tiêu là phạt oan.
    //
    // Người giao CHỌN được nhóm KPI và mốc giao — cùng bốn ô với khối Giao việc ở Danh sách
    // đơn hàng. Không chọn thì giữ nguyên nhóm của lượt cũ và lấy mốc bây giờ, tức hành vi
    // mặc định vẫn là "giao lại y như cũ".
    let kpiGroupId = assignment.kpiGroupId;
    let standardMinutes = assignment.standardMinutesSnapshot;

    if (input.kpiGroupId && input.kpiGroupId !== assignment.kpiGroupId) {
      const group = await prisma.kpi3DGroup.findUnique({
        where: { id: input.kpiGroupId },
        select: { id: true, standardMinutes: true, isActive: true },
      });
      if (!group) return Errors.notFound("Kpi3DGroup");
      // Nhóm đã tắt là nhóm không còn dùng nữa; giao việc mới theo nó thì báo cáo về sau đọc
      // một cấu hình mà admin tưởng đã bỏ.
      if (!group.isActive) {
        return Errors.badRequest("Nhóm KPI này đã ngừng sử dụng — chọn nhóm khác.");
      }
      kpiGroupId = group.id;
      // ĐÓNG DẤU số phút vào lượt, không giữ tham chiếu tới nhóm: admin sửa cấu hình nhóm về
      // sau thì ngân sách của lượt đã giao KHÔNG được đổi theo.
      standardMinutes = group.standardMinutes;
    }

    // Mốc giao do người giao chọn. Deadline tính TỪ mốc đó, nên nó quyết định người mới đúng
    // hay trễ hạn — không được lặng lẽ thay bằng "bây giờ".
    const assignedAt = input.assignedAt ?? now;
    if (Number.isNaN(assignedAt.getTime())) {
      return Errors.badRequest("Mốc giao việc không hợp lệ.");
    }

    const deadlineAt = calculate3DKpiDeadline(assignedAt, standardMinutes, calendar);

    const created = await prisma.$transaction(async (tx) => {
      // `updateMany` KÈM ĐIỀU KIỆN, không `update` theo id: chốt chống bấm đôi và chống hai người
      // cùng xử lý một MO. Lý do đầy đủ ở kpi-3d/stale-state.ts. Không có nó, hai request đều
      // thấy lượt cũ còn chạy, đều qua cửa, và MO có hai lượt đang chạy cho hai người khác nhau.
      const closed = await tx.design3DAssignment.updateMany({
        where: {
          id: assignment.id,
          status: { notIn: ["REASSIGNED", "CANCELLED"] },
          // Đã duyệt là chốt — nếu người kia vừa bấm Nhận kết quả thì lượt này không còn được
          // đem đi giao lại nữa.
          reviewStatus: { not: "ACCEPTED" },
        },
        data: {
          status: "REASSIGNED",
          reassignedAt: now,
          kpiCounted: input.countKpiForPrevious,
          reassignDecidedById: user.dbId ?? null,
          // Ghi cả trục kiểm: đây LÀ một phán quyết "không duyệt", chỉ khác ở chỗ việc không
          // quay lại người cũ. Bỏ trống thì lượt này mãi mang reviewStatus PENDING_REVIEW và
          // hàng chờ kiểm sẽ đếm nó như còn việc phải làm.
          reviewStatus: "REWORK",
          reviewedById: user.dbId ?? null,
          reviewedAt: now,
          reviewNote: input.reason,
          reworkCount: { increment: 1 },
          ...(frozenWithoutSubmit != null && frozenWithoutSubmit > 0 ? { actualMinutes: frozenWithoutSubmit } : {}),
        },
      });
      if (closed.count === 0) throw new StaleAssignmentError();

      // Đập nhịp `Order.version` để form đơn hàng mở từ TRƯỚC lúc đổi người không lưu đè lên lượt
      // mới. Chỉ đập ở các cửa đổi cấu trúc — xem chú thích dài ở route continue.
      await tx.order.update({
        where: { id: assignment.orderId },
        data: { version: { increment: 1 } },
      });

      // Đóng nốt khoảng tạm dừng còn mở. Lượt đã đóng mà còn một khoảng dừng chưa mở lại thì
      // nó hiện là "đang tạm dừng" vĩnh viễn ở mọi màn hình đọc theo resumedAt = null.
      await tx.design3DPause.updateMany({
        where: { assignmentId: assignment.id, resumedAt: null },
        data: {
          resumedAt: now,
          resumedById: user.dbId ?? null,
          resumeNote: "Tự đóng — đơn đã chuyển sang nhân viên khác",
        },
      });

      const next = await tx.design3DAssignment.create({
        data: {
          orderId: assignment.orderId,
          orderItemId: assignment.orderItemId,
          designer3DId: newDesigner.id,
          kpiGroupId,
          workingCalendarId: assignment.workingCalendarId,
          assignedById: user.dbId ?? null,
          reassignedFromId: assignment.id,
          // Nói thẳng vì sao có lượt này, để sidebar hiện được "Lần 2 (bản trước không được
          // duyệt)". Suy ra từ reassignedAt + reviewStatus cũng được, nhưng suy đoán sẽ sai
          // ngay khi có luồng thứ ba tạo lượt mới.
          continuationReason: "REJECT_REASSIGN",
          assignedAt,
          standardMinutesSnapshot: standardMinutes,
          deadlineAt,
          status: "ASSIGNED",
          // Lý do bản trước bị bác, viết cho NGƯỜI MỚI đọc — lượt cũ đã biến mất khỏi màn hình
          // của họ ngay khi bàn giao xong.
          reviewNote: handoverNote({
            fromDesignerName: assignment.designer3D?.name ?? "nhân viên trước",
            reason: input.reason,
          }),
        },
        select: { id: true, deadlineAt: true, designer3DId: true },
      });

      await tx.workflowHistory.create({
        data: {
          orderId: assignment.orderId,
          performedById: user.dbId ?? null,
          action: "FIELD_UPDATED",
          comment: reassignHistoryComment({
            fromDesignerName: assignment.designer3D?.name ?? "—",
            toDesignerName: newDesigner.name,
            countKpiForPrevious: input.countKpiForPrevious,
          }),
          metadata: {
            source: "DESIGN_3D_REASSIGN",
            scopedItemId: assignment.orderItemId,
            fromAssignmentId: assignment.id,
            toAssignmentId: next.id,
            countKpiForPrevious: input.countKpiForPrevious,
            reason: input.reason,
          } as never,
        },
      });

      return next;
    });

    return ok(created, 201);
  } catch (err) {
    if (isStaleAssignmentError(err)) return Errors.conflict((err as Error).message);
    console.error("[POST /api/design-3d/assignments/:id/reassign]", err);
    return Errors.internal();
  }
}
