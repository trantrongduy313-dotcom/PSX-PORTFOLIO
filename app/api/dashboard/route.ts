import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { Errors } from "@/app/lib/api-response";

// ─── GET /api/dashboard ───────────────────────────────────────────────────────
// Returns: order stats + gold estimation for DESIGN_APPROVED orders

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Errors.forbidden();

  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const [stats, approvedOrders, alertCount] = await Promise.all([
      // Order counts by zone/status
      prisma.order.groupBy({
        by: ["zone", "status"],
        where: { deletedAt: null },
        _count: { id: true },
      }),

      // DESIGN_APPROVED orders — gold estimation source
      prisma.order.findMany({
        where: { status: "DESIGN_APPROVED", zone: "PRE_PRODUCTION", deletedAt: null },
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          requiredDate: true,
          items: {
            select: {
              moNumber: true,
              productName: true,
              nvl: true,
              weightGram: true,
              quantity: true,
            },
          },
          productionDetail: { select: { extraData: true } },
        },
        orderBy: { requiredDate: "asc" },
      }),

      // Unresolved critical alerts
      prisma.alert.count({
        where: { isResolved: false, severity: "CRITICAL" },
      }),
    ]);

    // ── Stat cards ────────────────────────────────────────────────────────────
    let total = 0, preProd = 0, masterHub = 0, designApproved = 0, completed = 0, suspended = 0;
    for (const row of stats) {
      const n = row._count.id;
      total += n;
      if (row.zone === "PRE_PRODUCTION") preProd += n;
      if (row.zone === "MASTER_HUB") masterHub += n;
      if (row.status === "DESIGN_APPROVED") designApproved += n;
      if (row.status === "COMPLETED") completed += n;
      if (row.status === "SUSPENDED") suspended += n;
    }

    // ── Gold estimation ───────────────────────────────────────────────────────
    // Group by NVL — use tl3d if available (post-design weight), else weightGram
    const nvlMap: Record<string, {
      totalWeight: number;
      castingNeeded: number;
      moCount: number;
      orders: Array<{ orderNumber: string; moNumber: string | null; productName: string; weight: number }>;
    }> = {};

    for (const order of approvedOrders) {
      const extra = (order.productionDetail?.extraData ?? {}) as Record<string, unknown>;
      const tl3d = parseFloat(String(extra.tl3d ?? ""));

      for (const item of order.items) {
        const nvl = item.nvl?.trim() || "Chưa xác định";
        // tl3d is per-order (not per-item), weightGram is per-item
        const baseWeight = (!isNaN(tl3d) && tl3d > 0)
          ? tl3d
          : parseFloat(String(item.weightGram ?? "0")) || 0;
        const totalItemWeight = baseWeight * (item.quantity || 1);

        if (!nvlMap[nvl]) {
          nvlMap[nvl] = { totalWeight: 0, castingNeeded: 0, moCount: 0, orders: [] };
        }
        nvlMap[nvl].totalWeight += totalItemWeight;
        nvlMap[nvl].castingNeeded += totalItemWeight * 1.05; // 5% hao hụt đúc
        nvlMap[nvl].moCount += 1;
        nvlMap[nvl].orders.push({
          orderNumber: order.orderNumber,
          moNumber: item.moNumber,
          productName: item.productName,
          weight: totalItemWeight,
        });
      }
    }

    const goldEstimate = Object.entries(nvlMap)
      .map(([nvl, data]) => ({ nvl, ...data }))
      .sort((a, b) => b.totalWeight - a.totalWeight);

    return NextResponse.json({
      data: {
        stats: { total, preProd, masterHub, designApproved, completed, suspended, criticalAlerts: alertCount },
        goldEstimate,
        pendingCount: approvedOrders.length,
      },
    });
  } catch (err) {
    console.error("[GET /api/dashboard]", err);
    return NextResponse.json({ error: { message: "Internal error" } }, { status: 500 });
  }
}
