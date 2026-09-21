import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser, getUserStoreIds } from "@/app/lib/auth-helpers";
import type { NextRequest } from "next/server";

// GET /api/stores — store list + order counts per store
// SALES users only see their assigned stores; ADMIN/PRODUCTION/ORDER see all
export async function GET(_request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return Errors.forbidden();

  let allowedStoreIds: string[] | null = null;
  if (currentUser.role === "SALES") {
    allowedStoreIds = await getUserStoreIds(currentUser.id);
    if (allowedStoreIds.length === 0) return ok([]);
  }

  const storeWhere = {
    isActive: true,
    ...(allowedStoreIds ? { id: { in: allowedStoreIds } } : {}),
  };

  try {
    const stores = await prisma.store.findMany({
      where: storeWhere,
      orderBy: { code: "asc" },
    });

    if (stores.length === 0) return ok([]);

    const storeIds = stores.map((s) => s.id);
    const baseWhere = { storeId: { in: storeIds }, deletedAt: null };

    // 4 groupBy queries instead of 4×N individual count queries
    const [totalCounts, preProdCounts, masterHubCounts, suspendedCounts] = await Promise.all([
      prisma.order.groupBy({ by: ["storeId"], where: baseWhere, _count: { _all: true } }),
      prisma.order.groupBy({ by: ["storeId"], where: { ...baseWhere, zone: "PRE_PRODUCTION" }, _count: { _all: true } }),
      prisma.order.groupBy({ by: ["storeId"], where: { ...baseWhere, zone: "MASTER_HUB" }, _count: { _all: true } }),
      prisma.order.groupBy({ by: ["storeId"], where: { ...baseWhere, isSuspended: true }, _count: { _all: true } }),
    ]);

    const toMap = (arr: { storeId: string | null; _count: { _all: number } }[]) =>
      Object.fromEntries(arr.filter((r) => r.storeId).map((r) => [r.storeId!, r._count._all]));

    const totalMap     = toMap(totalCounts);
    const preProdMap   = toMap(preProdCounts);
    const masterHubMap = toMap(masterHubCounts);
    const suspendedMap = toMap(suspendedCounts);

    const storesWithCounts = stores.map((store) => ({
      id: store.id,
      code: store.code,
      name: store.name,
      isActive: store.isActive,
      counts: {
        total:     totalMap[store.id]     ?? 0,
        preProd:   preProdMap[store.id]   ?? 0,
        masterHub: masterHubMap[store.id] ?? 0,
        suspended: suspendedMap[store.id] ?? 0,
      },
    }));

    return ok(storesWithCounts);
  } catch (e) {
    console.error("[GET /api/stores]", e);
    return Errors.internal();
  }
}
