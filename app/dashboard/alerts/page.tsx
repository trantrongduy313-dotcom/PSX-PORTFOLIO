import { requireRole } from "@/app/lib/auth-helpers";
import { prisma } from "@/app/lib/prisma";
import { AlertsClient } from "./_components/alerts-client";

export const metadata = { title: "Cảnh báo — Jewelry ERP" };

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  await requireRole(["ADMIN", "PRODUCTION", "ORDER"]);
  const { orderId: initialOrderId } = await searchParams;

  const [rawAlerts, orders] = await Promise.all([
    prisma.alert.findMany({
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            customerName: true,
            status: true,
            zone: true,
            isSuspended: true,
            version: true,
            store: { select: { id: true, code: true, name: true } },
            items: { select: { id: true, moNumber: true } },
          },
        },
        raisedBy: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
      orderBy: [{ isResolved: "asc" }, { severity: "desc" }, { createdAt: "desc" }],
    }),

    // Danh sách đơn để chọn khi tạo cảnh báo
    // Chỉ hiện orders có ít nhất 1 PSX item còn active (zone=MASTER_HUB, chưa terminal)
    // NOTE: must use OR [null, notIn] — Prisma's notIn excludes NULL in SQL
    prisma.order.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ["CANCELLED", "COMPLETED"] },
        items: {
          some: {
            zone: "MASTER_HUB",
            OR: [
              { itemStatus: null },
              { itemStatus: { notIn: ["CANCELLED", "COMPLETED"] } },
            ],
          },
        },
      },
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        status: true,
        store: { select: { code: true } },
        items: {
          where: {
            zone: "MASTER_HUB",
            OR: [
              { itemStatus: null },
              { itemStatus: { notIn: ["CANCELLED", "COMPLETED"] } },
            ],
          },
          select: { id: true, moNumber: true, productName: true },
          orderBy: { lineNumber: "asc" },
        },
      },
      orderBy: { orderNumber: "desc" },
      take: 200,
    }),
  ]);

  // Compute scopedMoNumber server-side via workflowHistory metadata
  const alertIds = rawAlerts.map(a => a.id);
  const suspendEntries = alertIds.length > 0
    ? await prisma.workflowHistory.findMany({
        where: { action: "SUSPENDED", orderId: { in: rawAlerts.map(a => a.orderId) } },
        select: { metadata: true },
      })
    : [];
  const alertToScopedItem = new Map<string, string>();
  for (const entry of suspendEntries) {
    const meta = entry.metadata as Record<string, unknown> | null;
    const aId = meta?.alertId as string | undefined;
    const sId = meta?.scopedItemId as string | undefined;
    if (aId && sId) alertToScopedItem.set(aId, sId);
  }
  const alerts = rawAlerts.map(alert => {
    const scopedItemId = alertToScopedItem.get(alert.id);
    const scopedMoNumber = scopedItemId
      ? (alert.order.items?.find((i: { id: string; moNumber: string | null }) => i.id === scopedItemId)?.moNumber ?? null)
      : null;
    const { items: _items, ...orderWithoutItems } = alert.order as typeof alert.order & { items?: unknown[] };
    return { ...alert, order: orderWithoutItems, scopedMoNumber };
  });

  return <AlertsClient alerts={alerts as never} orders={orders} initialOrderId={initialOrderId} />;
}
