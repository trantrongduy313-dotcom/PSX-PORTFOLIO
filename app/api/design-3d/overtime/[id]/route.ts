import type { NextRequest } from "next/server";

import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { resolveProgressActor } from "@/app/lib/business/kpi-3d/actor";
import {
  deniedReasonForOvertimeDecision,
  formatMinutes,
  OVERTIME_STATUS_LABELS,
  overtimeDecisionSchema,
  statusAfterDecision,
  type OvertimeStatus,
} from "@/app/lib/business/kpi-3d/overtime";
import {
  isStaleAssignmentError,
  StaleAssignmentError,
} from "@/app/lib/business/kpi-3d/stale-state";

/** Câu chữ riêng cho phiếu tăng ca — thông điệp mặc định nói về "lượt giao việc". */
const STALE_OVERTIME_MESSAGE =
  "Phiếu tăng ca này vừa được người khác chốt (duyệt / từ chối / hủy). Hãy tải lại danh sách để xem quyết định hiện tại — hệ thống chưa ghi gì.";

// ─── PATCH /api/design-3d/overtime/[id] ──────────────────────────────────────
// Leader/Giám sát duyệt hoặc từ chối; người khai tự hủy yêu cầu đang chờ (yêu cầu #8).

const overtimeSelect = {
  id: true,
  startAt: true,
  endAt: true,
  minutes: true,
  reason: true,
  status: true,
  approvedAt: true,
  designer3D: { select: { id: true, name: true, code: true } },
  requestedBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
} as const;

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Errors.forbidden();

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.badRequest("Invalid JSON");
  }

  const parsed = overtimeDecisionSchema.safeParse(body);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);
  const { action, reason } = parsed.data;

  const existing = await prisma.design3DOvertimeRequest.findUnique({
    where: { id },
    select: {
      id: true,
      designer3DId: true,
      requestedById: true,
      status: true,
      minutes: true,
      assignment: { select: { orderId: true } },
    },
  });
  if (!existing) return Errors.notFound("Overtime request");

  const actor = await resolveProgressActor(user);
  const denied = deniedReasonForOvertimeDecision(
    { ...actor, userId: user.dbId ?? null },
    { ...existing, status: existing.status as OvertimeStatus },
    action,
  );
  // Đã chốt rồi mà cố đổi = xung đột trạng thái (409), không phải thiếu quyền (403).
  if (denied) {
    return denied.includes("không thể thay đổi") ? Errors.conflict(denied) : Errors.forbidden(denied);
  }

  const nextStatus = statusAfterDecision(action);
  const isApprovalDecision = action !== "CANCEL";

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // ⚠️ ĐIỀU KIỆN NẰM TRONG CHÍNH CÂU UPDATE — xem kpi-3d/stale-state.ts.
      //
      // `deniedReasonForOvertimeDecision` đã chặn các trạng thái đã chốt, nhưng nó kiểm trên bản vừa
      // đọc. Hai người cùng mở một phiếu tăng ca (rất dễ: nó nằm trong hàng chờ chung) thì cả hai
      // đều thấy PENDING, cả hai qua cửa, và trạng thái cuối do người ghi SAU quyết định — Duyệt có
      // thể biến thành Từ chối, hoặc ngược lại. Đúng cái bất biến mà file overtime.ts tuyên bố:
      // TERMINAL_STATUSES là không đổi được.
      //
      // Sửa được mấy dòng thì DB nói; 0 dòng nghĩa là người kia đã chốt trước.
      const decided = await tx.design3DOvertimeRequest.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: nextStatus,
          // Chỉ đóng dấu người duyệt cho hành động duyệt/từ chối — hủy là thao tác của
          // người khai, không phải quyết định phê duyệt.
          ...(isApprovalDecision ? { approvedById: user.dbId ?? null, approvedAt: new Date() } : {}),
          ...(reason?.trim() ? { reason: reason.trim() } : {}),
        },
      });
      if (decided.count === 0) throw new StaleAssignmentError(STALE_OVERTIME_MESSAGE);

      // Đọc lại để trả về bản đã ghi. `updateMany` không trả bản ghi — đổi lấy tính đúng đắn, và
      // một lần đọc thêm trong cùng transaction thì rẻ hơn nhiều so với một phiếu bị chốt hai lần.
      const row = await tx.design3DOvertimeRequest.findUniqueOrThrow({
        where: { id },
        select: overtimeSelect,
      });

      // Ghi Lịch sử SAU khi đã giành được quyết định. Ghi trước thì mỗi lần tranh chấp để lại một
      // dòng lịch sử cho một quyết định không hề có hiệu lực.
      await tx.workflowHistory.create({
        data: {
          orderId: existing.assignment.orderId,
          performedById: user.dbId ?? null,
          action: "FIELD_UPDATED",
          comment: `Tăng ca 3D ${formatMinutes(existing.minutes)} — ${OVERTIME_STATUS_LABELS[nextStatus]}`,
          metadata: {
            source: "DESIGN_3D_OVERTIME",
            overtimeRequestId: id,
            minutes: existing.minutes,
            status: nextStatus,
          } as never,
        },
      });

      return row;
    });

    return ok(updated);
  } catch (err) {
    if (isStaleAssignmentError(err)) return Errors.conflict((err as Error).message);
    console.error("[PATCH /api/design-3d/overtime/:id]", err);
    return Errors.internal();
  }
}
