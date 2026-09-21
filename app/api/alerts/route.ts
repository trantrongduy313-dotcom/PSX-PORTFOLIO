import { type NextRequest } from "next/server";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";

// GET /api/alerts?resolved=false&severity=CRITICAL&orderId=xxx
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Errors.forbidden();

  const { searchParams } = request.nextUrl;
  const resolvedParam = searchParams.get("resolved");
  const severity = searchParams.get("severity") ?? undefined;
  const orderId = searchParams.get("orderId") ?? undefined;

  const isResolved =
    resolvedParam === "true" ? true :
    resolvedParam === "false" ? false :
    undefined;

  const VALID_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  if (severity && !VALID_SEVERITIES.includes(severity)) {
    return Response.json({ error: { code: "BAD_REQUEST" } }, { status: 400 });
  }

  // Alerts per page — bounded to prevent unbounded queries on large datasets.
  // The alerts page is always filtered (by resolved/severity/orderId), so 200
  // is more than enough for any realistic use case.
  const ALERTS_FETCH_LIMIT = 200;

  try {
    const rawAlerts = await prisma.alert.findMany({
      where: {
        ...(isResolved !== undefined ? { isResolved } : {}),
        ...(severity ? { severity: severity as never } : {}),
        ...(orderId ? { orderId } : {}),
      },
      take: ALERTS_FETCH_LIMIT,
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
      orderBy: [
        { isResolved: "asc" },
        { severity: "desc" },
        { createdAt: "desc" },
      ],
    });

    // For each alert, find the workflowHistory SUSPENDED entry that references this alertId
    // to determine which specific MO (scopedItemId → MO#) was suspended.
    const alertIds = rawAlerts.map(a => a.id);
    const suspendEntries = alertIds.length > 0
      ? await prisma.workflowHistory.findMany({
          where: { action: "SUSPENDED", orderId: { in: rawAlerts.map(a => a.orderId) } },
          select: { metadata: true },
        })
      : [];

    // Build map: alertId → scopedItemId
    const alertToScopedItem = new Map<string, string>();
    for (const entry of suspendEntries) {
      const meta = entry.metadata as Record<string, unknown> | null;
      const aId = meta?.alertId as string | undefined;
      const sId = meta?.scopedItemId as string | undefined;
      if (aId && sId) alertToScopedItem.set(aId, sId);
    }

    const alerts = rawAlerts.map((alert) => {
      const scopedItemId = alertToScopedItem.get(alert.id);
      const scopedMoNumber = scopedItemId
        ? (alert.order.items.find(i => i.id === scopedItemId)?.moNumber ?? null)
        : null;
      const { items: _items, ...orderWithoutItems } = alert.order;
      return { ...alert, order: orderWithoutItems, scopedMoNumber };
    });

    return ok(alerts);
  } catch (e) {
    console.error("[GET /api/alerts]", e);
    return Response.json({ error: { code: "INTERNAL_ERROR" } }, { status: 500 });
  }
}
