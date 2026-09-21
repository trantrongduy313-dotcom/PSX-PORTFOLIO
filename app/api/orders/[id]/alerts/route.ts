import { type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";

// Xuất để test đọc thẳng, không chép lại: __tests__/alerts-system.test.ts
export const RaiseAlertSchema = z.object({
  type: z.enum(["SPECIAL", "MATERIAL_SHORTAGE", "RUSH_ORDER", "QUALITY_ISSUE", "DESIGN_CHANGE", "CUSTOMER_COMPLAINT"]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("HIGH"),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  // Per-MO: suspend only this specific item, not the entire order
  scopedItemId: z.string().optional(),
});

// POST /api/orders/[id]/alerts
// Rules:
//   1. Chỉ dành cho PSX (MASTER_HUB zone)
//   2. Mọi cảnh báo đều tự động tạm ngưng MO
//   3. Cảnh báo cũ tự động được resolve (chỉ giữ 1 alert active per đơn)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return Errors.forbidden();

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.badRequest("Invalid JSON body");
  }

  const parsed = RaiseAlertSchema.safeParse(body);
  if (!parsed.success) return Errors.badRequest(parsed.error.issues[0].message);

  const { type, severity, title, description, scopedItemId } = parsed.data;

  try {
    const order = await prisma.order.findUnique({
      where: { id, deletedAt: null },
      select: {
        id: true, orderNumber: true, status: true, isSuspended: true, zone: true,
        items: { select: { id: true, zone: true, moNumber: true }, where: { zone: "MASTER_HUB" } },
      },
    });
    if (!order) return Errors.notFound("Không tìm thấy đơn hàng");

    // Rule 1: Chỉ PSX — order.zone=MASTER_HUB HOẶC có ít nhất 1 item trong MASTER_HUB
    const psxItems = order.items ?? [];
    if (order.zone !== "MASTER_HUB" && psxItems.length === 0) {
      return Errors.badRequest("Cảnh báo chỉ dành cho đơn đang ở Phòng Sản Xuất.");
    }

    // If scopedItemId provided, verify it's a PSX item in this order
    const targetItem = scopedItemId
      ? psxItems.find(i => i.id === scopedItemId) ?? null
      : null;
    if (scopedItemId && !targetItem) {
      return Errors.badRequest("MO không hợp lệ hoặc không ở Phòng Sản Xuất.");
    }

    const [alert] = await prisma.$transaction(async (tx) => {
      // Rule 3: Auto-resolve alerts cũ — chỉ resolve alerts của cùng item (per-MO independence).
      // Per-item alert: chỉ resolve alerts trước đó của CÙNG item đó.
      // Full-order alert: resolve TẤT CẢ alerts của order.
      if (scopedItemId) {
        // Find alert IDs that were associated with this specific item via workflowHistory metadata
        const prevSuspendEntries = await tx.workflowHistory.findMany({
          where: {
            orderId: id,
            action: "SUSPENDED",
            metadata: { path: ["scopedItemId"], equals: scopedItemId },
          },
          select: { metadata: true },
        });
        const prevAlertIds = prevSuspendEntries
          .map(e => (e.metadata as Record<string, unknown>)?.alertId as string | undefined)
          .filter((aid): aid is string => Boolean(aid));

        if (prevAlertIds.length > 0) {
          await tx.alert.updateMany({
            where: { id: { in: prevAlertIds }, isResolved: false },
            data: { isResolved: true, resolvedAt: new Date(), resolvedNote: `Thay thế bởi cảnh báo mới: "${title}"` },
          });
        }
      } else {
        // Full-order alert: resolve all unresolved alerts for this order
        await tx.alert.updateMany({
          where: { orderId: id, isResolved: false },
          data: { isResolved: true, resolvedAt: new Date(), resolvedNote: `Thay thế bởi cảnh báo mới: "${title}"` },
        });
      }

      const newAlert = await tx.alert.create({
        data: {
          orderId: id, type, severity, title, description,
          raisedById: user.dbId,   // null-safe: undefined → NULL khi virtual admin
          autoSuspended: true,
        },
      });

      if (targetItem) {
        // Per-MO: chỉ suspend item cụ thể — không ảnh hưởng order-level hay items khác
        await tx.orderItem.update({
          where: { id: targetItem.id },
          data: { itemStatus: "SUSPENDED" },
        });
        // Bump Order.updatedAt so the 60s heartbeat detects this per-MO suspend
        // (OrderItem.updatedAt alone is not tracked by /api/orders/meta)
        await tx.order.update({
          where: { id },
          data: { updatedAt: new Date() },
        });
        await tx.workflowHistory.create({
          data: {
            orderId: id, action: "SUSPENDED",
            fromStatus: order.status, toStatus: "SUSPENDED",
            comment: `Tạm ngưng MO ${targetItem.moNumber ?? targetItem.id} do cảnh báo: ${title}`,
            metadata: { alertId: newAlert.id, scopedItemId: targetItem.id },
            performedById: user.dbId,
          },
        });
      } else {
        // Full-order suspend (khi không chỉ định MO cụ thể)
        await tx.order.update({
          where: { id },
          data: { isSuspended: true, status: "SUSPENDED" },
        });
        await tx.workflowHistory.create({
          data: {
            orderId: id, action: "SUSPENDED",
            fromStatus: order.status, toStatus: "SUSPENDED",
            comment: `Tạm ngưng do cảnh báo: ${title}`,
            metadata: { alertId: newAlert.id },
            performedById: user.dbId,
          },
        });
      }

      await tx.workflowHistory.create({
        data: {
          orderId: id, action: "ALERT_RAISED",
          comment: `[${severity}] ${title}`,
          metadata: { alertId: newAlert.id, type, severity, ...(scopedItemId ? { scopedItemId } : {}) },
          performedById: user.dbId,
        },
      });

      return [newAlert];
    });

    return ok(alert, 201);
  } catch (err) {
    console.error("[POST /api/orders/:id/alerts]", err);
    return Errors.internal();
  }
}
