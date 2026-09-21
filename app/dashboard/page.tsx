import { redirect } from "next/navigation";
import { requireUser } from "@/app/lib/auth-helpers";
import { shouldRedirectFromDashboard } from "@/app/lib/business/auth/landing";
import { prisma } from "@/app/lib/prisma";
import { stripVersionSuffix } from "@/app/lib/business/order-helpers";
import { DashboardClient } from "./_components/dashboard-client";

export const metadata = { title: "Dashboard — Jewelry ERP" };

export default async function DashboardPage() {
  const user = await requireUser();

  // Vai nào có trang làm việc riêng thì đi thẳng tới đó, không dừng ở Dashboard.
  //
  // Trước đây chỗ này chỉ biết mỗi SALES, nên nhân viên 3D đăng nhập xong đứng lại ở Dashboard
  // — một màn hình đầy số liệu đơn hàng mà sidebar của họ còn không có mục nào trỏ tới. Bảng
  // quyết định nằm ở business/auth/landing.ts, dùng chung với nút "Vào hệ thống" ở trang chủ.
  const target = shouldRedirectFromDashboard(user.role);
  if (target) redirect(target);

  // ── Fetch dashboard data server-side ──────────────────────────────────────
  const now = new Date();

  const [preProdStat, masterHubStat, productionOrders, criticalAlerts, overdueCount] = await Promise.all([
    // PTK: order.zone = PRE_PRODUCTION so promoted orders don't inflate the badge
    prisma.orderItem.count({
      where: {
        zone: "PRE_PRODUCTION",
        order: { deletedAt: null, zone: "PRE_PRODUCTION", status: { notIn: ["COMPLETED", "CANCELLED"] } },
        OR: [
          { itemStatus: null },
          { itemStatus: { notIn: ["COMPLETED", "CANCELLED"] } },
        ],
      },
    }),
    // PSX: item.zone = MASTER_HUB (no order.zone constraint needed)
    prisma.orderItem.count({
      where: {
        zone: "MASTER_HUB",
        order: { deletedAt: null, status: { notIn: ["COMPLETED", "CANCELLED"] } },
        OR: [
          { itemStatus: null },
          { itemStatus: { notIn: ["COMPLETED", "CANCELLED"] } },
        ],
      },
    }),

    // Dự đoán vàng: MASTER_HUB + chưa qua công đoạn Đúc (castingDoneAt IS NULL)
    // Loại trừ COMPLETED và CANCELLED — SUSPENDED vẫn tính vì có thể tiếp tục sản xuất
    prisma.order.findMany({
      where: {
        zone: "MASTER_HUB",
        deletedAt: null,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        productionDetail: { castingDoneAt: null },
      },
      select: {
        id: true,
        orderNumber: true,
        baseOrderNumber: true,
        versionNumber: true,
        customerName: true,
        requiredDate: true,
        items: {
          select: { id: true, moNumber: true, productName: true, nvl: true, weightGram: true, quantity: true },
        },
        productionDetail: { select: { extraData: true } },
      },
      orderBy: { requiredDate: "asc" },
    }),

    prisma.alert.count({ where: { isResolved: false, severity: "CRITICAL" } }),

    // MO quá hạn: item.requiredDate < now, hoặc fallback order.requiredDate khi item chưa có
    prisma.orderItem.count({
      where: {
        order: { deletedAt: null },
        itemStatus: { notIn: ["COMPLETED", "CANCELLED"] },
        OR: [
          { requiredDate: { lt: now } },
          { requiredDate: null, order: { requiredDate: { lt: now }, status: { notIn: ["COMPLETED", "CANCELLED"] } } },
        ],
      },
    }),
  ]);

  // Stat cards — PTK uses order.zone filter; PSX uses item.zone filter
  const preProd   = preProdStat;
  const masterHub = masterHubStat;
  const total     = preProd + masterHub;

  // Suspended: non-terminal items that are currently suspended
  // null itemStatus items: suspended when order.isSuspended = true
  const suspended = await prisma.orderItem.count({
    where: {
      order: { deletedAt: null, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      OR: [
        { itemStatus: "SUSPENDED" },
        { itemStatus: null, order: { isSuspended: true, status: { notIn: ["COMPLETED", "CANCELLED"] } } },
      ],
    },
  });

  // Gold estimation — de-duplicated by MO base so only the latest version of each MO
  // is counted. Fixes double-counting when e.g. 26.10902.2 and 26.10902.3 are both in
  // MASTER_HUB (same MO, different revision levels).
  //
  // Algorithm:
  //   1. Iterate all orders × items → track the entry with the HIGHEST versionNumber
  //      per MO base (stripVersionSuffix of item.moNumber). null versionNumber = -1.
  //   2. Group surviving entries by base SO# for display.
  //   3. Sort groups by earliest requiredDate ASC.

  type MoEntry = {
    baseSoNumber: string;
    customerName: string;
    requiredDate: Date | null;
    orderTl3d: number;
    perItemData: Record<string, Record<string, unknown>>;
    versionNumber: number;
    item: typeof productionOrders[number]["items"][number];
  };

  // Step 1: de-dup by MO base — highest versionNumber wins
  const latestByMoBase = new Map<string, MoEntry>();
  for (const order of productionOrders) {
    const extra = (order.productionDetail?.extraData ?? {}) as Record<string, unknown>;
    const orderTl3d = parseFloat(String(extra.tl3d ?? ""));
    const perItemData = (extra.perItem as Record<string, Record<string, unknown>> | undefined) ?? {};
    const baseSoNumber = order.baseOrderNumber ?? stripVersionSuffix(order.orderNumber);
    const versionNumber = order.versionNumber ?? -1;

    for (const item of order.items) {
      const moBase = stripVersionSuffix(item.moNumber ?? order.orderNumber);
      const existing = latestByMoBase.get(moBase);
      if (!existing || versionNumber > existing.versionNumber) {
        latestByMoBase.set(moBase, {
          baseSoNumber,
          customerName: order.customerName,
          requiredDate: order.requiredDate,
          orderTl3d,
          perItemData,
          versionNumber,
          item,
        });
      }
    }
  }

  // Step 2: group by base SO# for display
  const soGroups = new Map<string, MoEntry[]>();
  for (const entry of latestByMoBase.values()) {
    const group = soGroups.get(entry.baseSoNumber);
    if (group) group.push(entry);
    else soGroups.set(entry.baseSoNumber, [entry]);
  }

  // Step 3: build GoldRow per SO group, sort by earliest requiredDate
  const goldEstimate = Array.from(soGroups.entries()).map(([baseSoNumber, entries]) => {
    const nvlSet = new Set<string>();
    const items: Array<{ moNumber: string | null; productName: string; nvl: string; weight: number }> = [];
    let totalWeight = 0;

    for (const entry of entries) {
      const { item, orderTl3d, perItemData } = entry;
      const nvl = item.nvl?.trim() || "Chưa xác định";
      const perItemTl3d = parseFloat(String((perItemData[item.id] ?? {}).tl3d ?? ""));
      // Weight priority: perItem[id].tl3d → order-level tl3d → item.weightGram
      const baseWeight = (!isNaN(perItemTl3d) && perItemTl3d > 0)
        ? perItemTl3d
        : (!isNaN(orderTl3d) && orderTl3d > 0)
        ? orderTl3d
        : parseFloat(String(item.weightGram ?? "0")) || 0;
      const itemWeight = baseWeight * (item.quantity || 1);
      totalWeight += itemWeight;
      nvlSet.add(nvl);
      items.push({ moNumber: item.moNumber, productName: item.productName, nvl, weight: itemWeight });
    }

    // Use the earliest requiredDate among entries in this SO group
    const requiredDate = entries
      .map((e) => e.requiredDate)
      .filter((d): d is Date => d != null)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

    return {
      orderNumber: baseSoNumber,
      customerName: entries[0].customerName,
      requiredDate: requiredDate?.toISOString() ?? null,
      nvls: Array.from(nvlSet),
      totalWeight,
      castingNeeded: totalWeight * 1.05,
      moCount: items.length,
      items,
    };
  }).sort((a, b) => {
    if (!a.requiredDate && !b.requiredDate) return 0;
    if (!a.requiredDate) return 1;
    if (!b.requiredDate) return -1;
    return new Date(a.requiredDate).getTime() - new Date(b.requiredDate).getTime();
  });

  const stats = { total, preProd, masterHub, overdue: overdueCount, suspended, criticalAlerts };

  return (
    <DashboardClient
      stats={stats}
      goldEstimate={goldEstimate}
      pendingCount={goldEstimate.length}
      currentDate={now.toISOString()}
    />
  );
}
