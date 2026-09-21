import { type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";

// Xuất để test đọc thẳng, không chép lại: __tests__/alerts-system.test.ts
export const ResolveSchema = z.object({
  resolvedNote: z.string().max(1000).optional(),
  resumeOrder: z.boolean().default(false), // chỉ áp dụng nếu autoSuspended=true
});

// PATCH /api/alerts/[id] — giải quyết cảnh báo, tuỳ chọn tiếp tục đơn
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return Errors.forbidden();

  const { id } = await params;
  const body = await request.json();
  const parsed = ResolveSchema.safeParse(body);
  if (!parsed.success) return Errors.badRequest(parsed.error.issues[0].message);

  const { resolvedNote, resumeOrder } = parsed.data;

  const alert = await prisma.alert.findUnique({
    where: { id },
    include: {
      order: { select: { id: true, status: true, isSuspended: true } },
    },
  });
  if (!alert) return Errors.notFound("Không tìm thấy cảnh báo");
  if (alert.isResolved) return Errors.badRequest("Cảnh báo đã được giải quyết");

  await prisma.$transaction(async (tx) => {
    await tx.alert.update({
      where: { id },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedNote,
      },
    });

    await tx.workflowHistory.create({
      data: {
        orderId: alert.orderId,
        action: "ALERT_RESOLVED",
        comment: resolvedNote ? `Giải quyết: ${resolvedNote}` : "Đã giải quyết cảnh báo",
        metadata: { alertId: id },
        performedById: user.dbId,
      },
    });

    // Tiếp tục đơn nếu người dùng chọn resume
    if (resumeOrder && alert.autoSuspended) {
      // Find which item was suspended by this alert via workflowHistory metadata.
      // Per-item alerts store scopedItemId; full-order alerts do not.
      const suspendEntry = await tx.workflowHistory.findFirst({
        where: {
          orderId: alert.orderId,
          action: "SUSPENDED",
          metadata: { path: ["alertId"], equals: id },
        },
        orderBy: { performedAt: "desc" },
        select: { metadata: true },
      });
      const scopedItemId = (suspendEntry?.metadata as Record<string, unknown>)?.scopedItemId as string | undefined;

      if (scopedItemId) {
        // Per-item alert: only resume the specific item that was suspended by this alert
        await tx.orderItem.update({
          where: { id: scopedItemId },
          data: { itemStatus: null },
        });
        // Bump Order.updatedAt so the 60s heartbeat detects this per-MO resume
        await tx.order.update({
          where: { id: alert.orderId },
          data: { updatedAt: new Date() },
        });
      } else {
        // Full-order alert: clear all suspended items + resume order
        await tx.orderItem.updateMany({
          where: { orderId: alert.orderId, itemStatus: "SUSPENDED" },
          data: { itemStatus: null },
        });

        if (alert.order.isSuspended) {
          await tx.order.update({
            where: { id: alert.orderId },
            data: { isSuspended: false, status: "IN_PRODUCTION" },
          });

          await tx.workflowHistory.create({
            data: {
              orderId: alert.orderId,
              action: "RESUMED",
              fromStatus: "SUSPENDED",
              toStatus: "IN_PRODUCTION",
              comment: "Tiếp tục sản xuất sau khi giải quyết cảnh báo",
              metadata: { alertId: id },
              performedById: user.dbId,
            },
          });
        }
      }
    }
  });

  return ok({ success: true });
}
