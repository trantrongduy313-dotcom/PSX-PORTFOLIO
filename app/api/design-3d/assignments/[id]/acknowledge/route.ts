import type { NextRequest } from "next/server";

import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { resolveProgressActor } from "@/app/lib/business/kpi-3d/actor";
import {
  blockedReasonForAcknowledge,
  handoverDelayMinutes,
  isAcknowledgedEarly,
} from "@/app/lib/business/kpi-3d/acknowledge";
import { deniedReasonFor } from "@/app/lib/business/kpi-3d/permissions";
import { classifyDbError } from "@/app/lib/db-error";

// ─── POST /api/design-3d/assignments/[id]/acknowledge ────────────────────────
// NV 3D xác nhận đã nhận việc, để Order biết việc bàn giao đã thật sự xảy ra.
// ADMIN/ORDER xác nhận hộ được khi NV vắng mặt — nhưng acknowledgedById ghi rõ AI bấm.
//
// Route CỐ Ý MỎNG: xác thực → nạp → hỏi module business → ghi.
// Phân quyền ở kpi-3d/permissions.ts (năng lực ACKNOWLEDGE), quy tắc ở kpi-3d/acknowledge.ts.

const assignmentSelect = {
  id: true,
  orderId: true,
  orderItemId: true,
  designer3DId: true,
  status: true,
  assignedAt: true,
  acknowledgedAt: true,
} as const;

export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Errors.forbidden();

  const { id } = await ctx.params;

  try {
    const assignment = await prisma.design3DAssignment.findUnique({
      where: { id },
      select: assignmentSelect,
    });
    if (!assignment) return Errors.notFound("Design 3D assignment");

    const actor = await resolveProgressActor(user);
    const denied = deniedReasonFor("ACKNOWLEDGE", actor, assignment);
    if (denied) return Errors.forbidden(denied);

    const blocked = blockedReasonForAcknowledge(assignment);
    if (blocked) return Errors.badRequest(blocked);

    const now = new Date();
    const delayMinutes = handoverDelayMinutes(assignment.assignedAt, now);
    const early = isAcknowledgedEarly(assignment.assignedAt, now);

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.design3DAssignment.update({
        where: { id: assignment.id },
        data: { acknowledgedAt: now, acknowledgedById: user.dbId ?? null },
        select: { ...assignmentSelect, acknowledgedById: true },
      });

      // Ghi vào Lịch sử thay đổi của ĐƠN — cùng chỗ với mọi thao tác khác trên đơn.
      // Độ trễ bàn giao lưu ở metadata: đo được KỶ LUẬT BÀN GIAO mà KHÔNG đụng KPI tiến độ
      // (deadline vẫn tính từ assignedAt — phương án (c), xem kpi-3d/acknowledge.ts).
      await tx.workflowHistory.create({
        data: {
          orderId: assignment.orderId,
          performedById: user.dbId ?? null,
          action: "FIELD_UPDATED",
          comment: "NV Thiết kế 3D đã xác nhận nhận việc",
          metadata: {
            source: "DESIGN_3D_ACKNOWLEDGE",
            assignmentId: assignment.id,
            acknowledgedAt: now.toISOString(),
            handoverDelayMinutes: delayMinutes,
            acknowledgedEarly: early,
            // Phân biệt "NV tự nhận" với "Order/Admin nhận hộ" — liên quan trách nhiệm.
            byRole: user.role ?? null,
          } as never,
        },
      });

      return row;
    });

    return ok({ ...updated, handoverDelayMinutes: delayMinutes, acknowledgedEarly: early });
  } catch (error) {
    const classified = classifyDbError(error);
    console.error("[design-3d/acknowledge] DB error:", classified.kind, error);
    if (classified.kind === "UNKNOWN") return Errors.internal();
    return Errors.serviceUnavailable(classified.message);
  }
}
