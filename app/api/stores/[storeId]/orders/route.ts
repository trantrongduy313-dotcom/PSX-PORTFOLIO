import type { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { searchOrderIds } from "@/app/lib/db/order-search";
import { paginated, Errors } from "@/app/lib/api-response";
import { getCurrentUser, getUserStoreIds } from "@/app/lib/auth-helpers";
import { z } from "zod";

const querySchema = z.object({
  zone:      z.enum(["PRE_PRODUCTION", "MASTER_HUB"]).optional(),
  status:    z.string().optional(),
  search:    z.string().optional(),
  sortBy:    z.string().default("orderDate"),
  sortDir:   z.enum(["asc", "desc"]).default("desc"),
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(20),
  activeOnly: z.coerce.boolean().optional(),
  psxActive:  z.coerce.boolean().optional(),
  dateFrom:   z.string().optional(),
  dateTo:     z.string().optional(),
  all:        z.coerce.boolean().optional().default(false),
  ids:        z.string().max(2000).optional(),
});

type RouteParams = { params: Promise<{ storeId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return Errors.forbidden();

  const { storeId } = await params;

  // SALES users can only access their assigned stores
  if (currentUser.role === "SALES") {
    const storeIds = await getUserStoreIds(currentUser.id);
    if (!storeIds.includes(storeId)) return Errors.forbidden();
  }

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return Errors.notFound("Store not found");

  const raw = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);

  const { zone, status, search, sortBy, sortDir, page, limit, activeOnly, psxActive, dateFrom, dateTo, all, ids } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { storeId, deletedAt: null };

  // Batch fetch by IDs (silent patch) — narrow to specific orders, preserving zone context
  if (ids) {
    const idList = ids.split(",").map((s: string) => s.trim()).filter(Boolean);
    if (idList.length > 0) where.id = { in: idList };
  }

  // PTK view: filter at order.zone level to hide PSX orders that still have PRE_PRODUCTION items.
  // Matches the same pattern used in /api/orders/route.ts.
  if (zone === "PRE_PRODUCTION") {
    where.zone = "PRE_PRODUCTION";
  } else if (zone === "MASTER_HUB") {
    where.items = { some: { zone: "MASTER_HUB" } };
  }

  // Precedence: psxActive > specific status > activeOnly
  if (psxActive) {
    where.status = { in: ["IN_PRODUCTION", "SUSPENDED"] };
  } else if (status) {
    if (status === "COMPLETED" || status === "CANCELLED") {
      where.AND = [
        {
          OR: [
            { status: status },
            { items: { some: { itemStatus: status } } },
          ],
        },
      ];
    } else if (zone === "PRE_PRODUCTION") {
      // PTK tab: displayed status = item.itemStatus ?? order.status.
      // Must filter on effective status, not just order.status.
      if (!where.AND) where.AND = [];
      where.AND.push({
        OR: [
          // Item explicitly carries this status
          { items: { some: { zone: "PRE_PRODUCTION", itemStatus: status } } },
          // Item has no override → inherits from order.status
          { status, items: { some: { zone: "PRE_PRODUCTION", itemStatus: null } } },
        ],
      });
      // where.zone = "PRE_PRODUCTION" remains active from the zone filter block above — no cleanup needed.
    } else {
      where.status = status;
    }
  } else if (activeOnly) {
    where.status = {
      in: ["DRAFT", "PENDING_DESIGN", "IN_DESIGN", "DESIGN_REVIEW",
           "DESIGN_APPROVED", "IN_PRODUCTION", "SUSPENDED"],
    };
  }

  // Date range filter — dùng cho tab Hoàn Tất (lọc theo tháng)
  if (dateFrom || dateTo) {
    where.orderDate = {};
    if (dateFrom) where.orderDate.gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setUTCHours(23, 59, 59, 999);
      where.orderDate.lte = end;
    }
  }

  if (search) {
    const ids = await searchOrderIds(search, storeId);
    where.id = { in: ids };
  }

  // Build item-level where for pagination count so `total` reflects MO rows, not SO rows.
  // Mirrors the order-level `where` but resolves status to item.itemStatus (with OR fallback
  // to inherited order.status for items where itemStatus is null).
  const baseOrderFilter: Record<string, any> = { storeId, deletedAt: null };
  if (where.orderDate) baseOrderFilter.orderDate = where.orderDate;
  if (where.id)        baseOrderFilter.id        = where.id;

  const itemCountWhere: Record<string, any> = {};
  if (zone) itemCountWhere.zone = zone;

  const ACTIVE_STATUSES = ["DRAFT", "PENDING_DESIGN", "IN_DESIGN", "DESIGN_REVIEW",
                            "DESIGN_APPROVED", "IN_PRODUCTION", "SUSPENDED"] as const;

  if (psxActive) {
    itemCountWhere.order = { ...baseOrderFilter, status: { in: ["IN_PRODUCTION", "SUSPENDED"] } };
  } else if (status === "COMPLETED" || status === "CANCELLED") {
    itemCountWhere.OR = [
      { itemStatus: status, order: baseOrderFilter },
      { itemStatus: null,   order: { ...baseOrderFilter, status } },
    ];
  } else if (zone === "PRE_PRODUCTION" && status) {
    // PTK tab: effective status = item.itemStatus ?? order.status
    itemCountWhere.OR = [
      { itemStatus: status, order: baseOrderFilter },
      { itemStatus: null,   order: { ...baseOrderFilter, status } },
    ];
  } else if (status) {
    itemCountWhere.order = { ...baseOrderFilter, status };
  } else if (activeOnly) {
    itemCountWhere.OR = [
      { itemStatus: null,                          order: { ...baseOrderFilter, status: { in: ACTIVE_STATUSES } } },
      { itemStatus: { in: ACTIVE_STATUSES }, order: baseOrderFilter },
    ];
  } else {
    itemCountWhere.order = baseOrderFilter;
  }

  const skip = all ? 0 : (page - 1) * limit;
  const isMasterHub = zone === "MASTER_HUB";

  // Same grouped-sort strategy as /api/orders:
  // primary = user's chosen field; tiebreaker = sortKey (groups versions with their base);
  // tertiary = versionNumber asc nulls first (base order always before its versions).
  const storeVerSort: Prisma.OrderOrderByWithRelationInput = {
    versionNumber: { sort: "asc" as const, nulls: "first" as const },
  };

  const storeOrderBy: Prisma.OrderOrderByWithRelationInput[] =
    sortBy === "orderNumber"
      ? [{ orderNumber: sortDir }, storeVerSort]
      : [{ [sortBy]: sortDir }, { sortKey: sortDir }, storeVerSort];

  try {
    const [rawOrders, countResult] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        ...(all ? {} : { take: limit }),
        orderBy: storeOrderBy,
        include: {
          createdBy:  { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
          _count:     { select: { items: true, alerts: true } },
          items: {
            orderBy: { lineNumber: "asc" },
            select: {
              id:            true,
              zone:          true,   // needed for per-MO zone filtering
              itemStatus:    true,
              moNumber:      true,
              productName:   true,
              nvl:           true,
              size:          true,
              quantity:      true,
              platingType:   true,
              weightGram:    true,
              mainStoneType: true,
              mainStoneSize: true,
            },
          },
          ...(isMasterHub ? { productionDetail: true } : {}),
        },
      }),
      all ? Promise.resolve(0) : prisma.orderItem.count({ where: itemCountWhere }),
    ]);
    const total = all ? rawOrders.length : countResult;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orders = rawOrders.map((rawOrder: any) => {
      const { items, productionDetail, ...rest } = rawOrder;
      const pd = (productionDetail ?? null) as Record<string, unknown> | null;
      const extra = (pd?.extraData ?? {}) as Record<string, unknown>;

      // Filter items by zone when a zone param is specified (per-MO independence)
      const filteredItems = zone
        ? (items ?? []).filter((item: any) => item.zone === zone)
        : (items ?? []);

      return {
        ...rest,
        // Override order.zone with the actual zone being viewed for this response.
        // Clients can use this to show the correct badge per row.
        zone: zone ?? rest.zone,
        allItems: filteredItems.map((item: any) => ({
          id:            item.id,
          zone:          item.zone,
          itemStatus:    item.itemStatus ?? null,
          moNumber:      item.moNumber ?? null,
          productName:   item.productName,
          nvl:           item.nvl ?? null,
          size:          item.size ?? null,
          quantity:      item.quantity ?? 1,
          platingType:   item.platingType ?? null,
          weightGram:    item.weightGram != null ? String(item.weightGram) : null,
          mainStoneType: item.mainStoneType ?? null,
          mainStoneSize: item.mainStoneSize ?? null,
        })),
        productionSummary: pd ? {
          tl3d:        (extra.tl3d        as string) ?? null,
          tlXuong:     (extra.tlXuong     as string) ?? null,
          danhGiaTl:   (extra.danhGiaTl   as string) ?? null,
          pctChenLech: (extra.pctChenLech as string) ?? null,
        } : null,
      };
    });

    return paginated(orders, all
      ? { page: 1, limit: orders.length || 1, total: orders.length, totalPages: 1 }
      : { page, limit, total, totalPages: Math.ceil(total / limit) }
    );
  } catch (err) {
    console.error("[GET /api/stores/[storeId]/orders]", err);
    return Errors.internal();
  }
}
