import type { NextRequest } from "next/server";

import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { configuredCalendarToWorkingCalendar } from "@/app/lib/business/kpi-3d/calendar-adapter";
import {
  assignmentStatusAfterReviewDecision,
  deniedReasonForReview,
  resolveActualMinutesFreeze,
  reviewDecisionInputSchema,
  reviewHistoryComment,
  resolveDesignFilePush,
  reviewStatusAfterDecision,
} from "@/app/lib/business/kpi-3d/review";

// ─── POST /api/design-3d/assignments/[id]/review ─────────────────────────────
// Order/Admin kiểm kết quả NGAY SAU khi NV 3D gửi kết quả — TRƯỚC khi gửi khách duyệt
// (OrderStatus.DESIGN_REVIEW). Hai bước khác nhau, không trộn: bước này là nội bộ.
//
// Route CỐ Ý MỎNG: xác thực → nạp assignment → hỏi module business → ghi. Toàn bộ quy tắc
// (quyền, KPI giữ nguyên khi làm lại, có đẩy trạng thái đơn hay không) nằm ở kpi-3d/review.ts.

const assignmentSelect = {
  id: true,
  orderId: true,
  orderItemId: true,
  status: true,
  completedAt: true,
  kpiStatus: true,
  // Bốn thứ dưới đây để CHỐT giờ thực tế lúc duyệt — xem resolveActualMinutesFreeze.
  // Không chốt thì con số của lượt cũ vẫn được suy ra mỗi lần mở sidebar, và nó dùng lịch đang
  // active nên admin sửa ca là số của đơn ĐÃ DUYỆT đổi theo.
  actualMinutes: true,
  acknowledgedAt: true,
  assignedAt: true,
  // Khoảng bị Admin/Order bắt tạm dừng — TRỪ khỏi giờ thực tế (xem kpi-3d/pause.ts).
  pauses: { select: { pausedAt: true, resumedAt: true } },
  workingCalendar: { include: { sessions: true, holidays: true } },
  // Duyệt xong thì link Render trở thành file chính thức của MO — cần link mới nhất NV đã nộp
  // và link MO đang có để biết có thật sự đổi gì không.
  orderItem: { select: { id: true, designFileUrl: true } },
  progressLogs: {
    where: { renderInfoUrl: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { renderInfoUrl: true },
  },
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

  const parsed = reviewDecisionInputSchema.safeParse(body);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);
  const entry = parsed.data;

  const assignment = await prisma.design3DAssignment.findUnique({
    where: { id },
    select: assignmentSelect,
  });
  if (!assignment) return Errors.notFound("Design 3D assignment");

  const denied = deniedReasonForReview(user.role, assignment);
  if (denied) return Errors.forbidden(denied);

  const now = new Date();
  const newReviewStatus = reviewStatusAfterDecision(entry.decision);
  const newAssignmentStatus = assignmentStatusAfterReviewDecision(entry.decision);
  const note = entry.note?.trim() || null;

  // DUYỆT = CHỐT. Đóng dấu giờ thực tế vào cột ngay tại đây nếu chưa có, để nó thôi được tính
  // lại mỗi lần mở sidebar — nếu không, admin sửa lịch làm việc là số của đơn đã duyệt đổi theo.
  const frozenActualMinutes = resolveActualMinutesFreeze({
    decision: entry.decision,
    actualMinutes: assignment.actualMinutes,
    completedAt: assignment.completedAt,
    acknowledgedAt: assignment.acknowledgedAt,
    assignedAt: assignment.assignedAt,
    calendar: assignment.workingCalendar
      ? configuredCalendarToWorkingCalendar(assignment.workingCalendar)
      : undefined,
    // Trừ thời gian bị Admin/Order bắt gác. Con số chốt ở đây là VĨNH VIỄN, nên quên trừ ở
    // đúng chỗ này là đóng băng một con số sai.
    pauses: assignment.pauses,
  });

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.design3DAssignment.update({
      where: { id: assignment.id },
      data: {
        reviewStatus: newReviewStatus,
        reviewedById: user.dbId ?? null,
        reviewedAt: now,
        reviewNote: note,
        ...(frozenActualMinutes != null ? { actualMinutes: frozenActualMinutes } : {}),
        ...(entry.decision === "REWORK" ? { reworkCount: { increment: 1 } } : {}),
        ...(newAssignmentStatus ? { status: newAssignmentStatus } : {}),
      },
      select: { ...assignmentSelect, reviewStatus: true, reviewedAt: true, reworkCount: true },
    });

    // KHÔNG chiếu trạng thái kiểm sang extraData JSON nữa — sidebar đọc thẳng cột
    // reviewStatus ở trên qua API đơn hàng. Hai nơi lưu cùng một sự thật thì sớm muộn lệch.

    await tx.workflowHistory.create({
      data: {
        orderId: assignment.orderId,
        performedById: user.dbId ?? null,
        action: "FIELD_UPDATED",
        comment: reviewHistoryComment(entry.decision),
        metadata: {
          source: "DESIGN_3D_REVIEW",
          assignmentId: assignment.id,
          decision: entry.decision,
          ...(note ? { note } : {}),
        } as never,
      },
    });

    // ─── Duyệt xong → File Render thành FILE CHÍNH THỨC của MO ────────────────
    //
    // CỐ Ý NẰM NGOÀI khối điều kiện trạng thái bên dưới. Khối đó chỉ chạy khi đơn đang đúng ở
    // IN_DESIGN; mà giao việc 3D KHÔNG tự đặt trạng thái đó (Order đổi tay). Nhét việc đẩy
    // file vào trong thì nó sẽ âm thầm không chạy với mọi MO chưa được đổi trạng thái — đúng
    // loại lỗi im lặng khó truy.
    const nextDesignFileUrl = resolveDesignFilePush({
      decision: entry.decision,
      renderInfoUrl: assignment.progressLogs[0]?.renderInfoUrl,
      currentDesignFileUrl: assignment.orderItem?.designFileUrl,
    });
    if (nextDesignFileUrl) {
      await tx.orderItem.update({
        where: { id: assignment.orderItemId },
        data: { designFileUrl: nextDesignFileUrl },
      });
      // Ghi CẢ link cũ: ghi đè là mất dữ liệu nếu không còn dấu vết. MO nhiều NV 3D thì mỗi
      // lần duyệt lại đè lên lần trước, nên đây là đường duy nhất lấy lại bản cũ.
      await tx.workflowHistory.create({
        data: {
          orderId: assignment.orderId,
          performedById: user.dbId ?? null,
          action: "FIELD_UPDATED",
          comment: "Đã nhận kết quả 3D — cập nhật File 3D của MO từ File Render",
          metadata: {
            source: "DESIGN_3D_REVIEW",
            assignmentId: assignment.id,
            scopedItemId: assignment.orderItemId,
            field: "designFileUrl",
            from: assignment.orderItem?.designFileUrl ?? null,
            to: nextDesignFileUrl,
          } as never,
        },
      });
    }

    // Kiểm nội bộ xong → mới tới lượt "chờ khách duyệt". Chỉ đẩy khi đơn đang ở đúng bước
    // trước đó — không tự ý nhảy trạng thái khi Order/Admin đã xử lý đơn theo hướng khác.
    if (entry.decision === "ACCEPT") {
      const order = await tx.order.findUnique({
        where: { id: assignment.orderId },
        select: { id: true, status: true, zone: true, version: true },
      });
      if (order && order.zone === "PRE_PRODUCTION" && order.status === "IN_DESIGN") {
        await tx.order.update({
          where: { id: order.id },
          data: { status: "DESIGN_REVIEW", version: { increment: 1 } },
        });
        await tx.workflowHistory.create({
          data: {
            orderId: order.id,
            performedById: user.dbId ?? null,
            action: "STATUS_CHANGED",
            fromStatus: "IN_DESIGN",
            toStatus: "DESIGN_REVIEW",
            comment: "Đã nhận kết quả thiết kế 3D — chuyển sang chờ khách duyệt",
          },
        });
      }
    }

    return updated;
  });

  return ok(result, 200);
}
