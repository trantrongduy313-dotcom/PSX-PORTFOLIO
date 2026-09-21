import type { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { searchOrderIds } from "@/app/lib/db/order-search";
import { ok, paginated, Errors } from "@/app/lib/api-response";
import { ordersQuerySchema, createOrderSchema, type OrdersQuery } from "@/app/lib/schemas/order";
import { getCurrentUser, getUserStoreIds } from "@/app/lib/auth-helpers";
import {
  isMoFromWebapp,
  priorityToFlags,
  stripVersionSuffix,
  type PriorityCode,
} from "@/app/lib/business/order-helpers";
import { scopeOrdersQueryForRole } from "@/app/lib/business/orders/query-scope";
import { orderStatusWhere } from "@/app/lib/business/orders/status-where";
import { mergeWhere } from "@/app/lib/business/orders/where-merge";
import { buildItemCountWhere } from "@/app/lib/business/orders/item-count-where";
import { psxSiblingByMoBase, psxSiblingOf } from "@/app/lib/business/orders/psx-sibling";
import { computeCongDoan, computeCongDoanStatus, computeCongDoanForItem, orderMatchesStageFilter } from "@/app/lib/business/production-stage";
import { STAGE_FILTER_DEFS, nonEmpty, calcAutoProduction } from "@/app/lib/utils/order-helpers";
import { TOP_PRIORITY_CODE } from "@/app/lib/business/priority";
import { readBomState, currentBomDate } from "@/app/lib/business/bom";
import { summarizeDesign3DForOrder } from "@/app/lib/business/kpi-3d/review";
import { indexCancelHistory, resolveCancelInfo } from "@/app/lib/business/orders/cancel-info";

// Max orders to load when filtering by stage. Stage filtering runs in JS (not SQL)
// because it inspects extraData.perItem JSON. Raise if active order volume exceeds this.
const STAGE_FILTER_FETCH_LIMIT = 5000;

// Lượt giao việc 3D CÒN HIỆU LỰC. Khai ở ngoài vì object `include` bên dưới có `as const`, mà
// `as const` đóng băng mảng thành readonly và Prisma từ chối kiểu đó.
const ACTIVE_3D_ASSIGNMENTS: Prisma.Design3DAssignmentWhereInput = {
  status: { notIn: ["REASSIGNED", "CANCELLED"] },
};

// V2 ref: % CHÊNH LỆCH = (TL HT - TL 3D) / TL 3D × 100
function computePctChenLech(tlHt: string | null, tl3d: string | null): string | null {
  const ht = parseFloat(tlHt ?? "");
  const d3 = parseFloat(tl3d ?? "");
  if (!tlHt || !tl3d || isNaN(ht) || isNaN(d3) || d3 === 0) return null;
  return ((ht - d3) / d3 * 100).toFixed(2);
}

// ─── GET /api/orders ─────────────────────────────────────────────────────────
// Query params:
//   zone, status, isSuspended, isPriority, assignedToId, search
//   sortBy, sortDir, page, limit

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return Errors.forbidden();

  const raw = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = ordersQuerySchema.safeParse(raw);

  if (!parsed.success) {
    return Errors.validationFailed(parsed.error.issues);
  }

  const query: OrdersQuery = parsed.data;
  const {
    zone: rawZone,
    status,
    isSuspended,
    isPriority,
    assignedToId,
    search,
    dateFrom,
    dateTo,
    requiredDateFrom,
    requiredDateTo,
    history: rawHistory,
    sortBy,
    sortDir,
    page,
    limit,
    stageFilter,
    all: allMode,
    ids,
    storeId,
    phanLoaiKh: phanLoaiKhFilter,
  } = query;

  // 🔴 SIẾT PHẠM VI THEO VAI — ở ĐÂY, không phải ở giao diện. Ẩn tab chỉ là tấm rèm; đây là
  // cái khoá. Vai không bị hạn chế đi qua nguyên vẹn. Xem business/orders/query-scope.ts.
  const scope = scopeOrdersQueryForRole(currentUser.role, { zone: rawZone, history: rawHistory });
  if (scope.denied) return Errors.forbidden(scope.reason);
  const zone = scope.zone;
  const history = scope.history;

  // When stageFilter is active: fetch all matching orders (no pagination), filter in-memory.
  // This is safe because the filtered set is small (a few orders per stage at any time).
  const isStageFilterMode = !!stageFilter;

  // Build WHERE clause dynamically
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { deletedAt: null };

  // 🔴 GỘP, KHÔNG GHI ĐÈ — bốn bộ lọc dưới đây tranh nhau `items` và `OR`.
  // Lỗi đã trả giá: __tests__/orders-where-merge.test.ts
  const addWhere = (cond: Record<string, unknown>) => mergeWhere(where, cond);

  // Batch fetch by IDs (silent patch) — narrow to specific orders, preserving zone context
  if (ids) {
    const idList = ids.split(",").map(s => s.trim()).filter(Boolean);
    if (idList.length > 0) where.id = { in: idList };
  }

  // Store-level access control: SALES users can only see orders from their assigned stores
  if (currentUser.role === "SALES") {
    const storeIds = await getUserStoreIds(currentUser.id);
    if (storeIds.length === 0) {
      return paginated([], { page: 1, limit: query.limit, total: 0, totalPages: 0 });
    }
    // If user selected a specific store from the Store Quick Bar AND it's in their assignments → narrow
    if (storeId && storeIds.includes(storeId)) {
      where.storeId = storeId;
    } else {
      where.storeId = { in: storeIds };
    }
  } else if (storeId) {
    // Non-SALES users can filter by a specific store via the store dropdown
    where.storeId = storeId;
  }

  if (zone) {
    // Lọc PER-MO cho CẢ PTK lẫn PSX: hiện SO nếu CÓ item thuộc zone này — không lọc theo
    // zone cấp Order. 1 SO nay có thể "pha trộn" MO ở cả 2 phòng (VD SO đã chuyển PSX/Hoàn
    // tất nhưng vừa thêm 1 MO mới vào PTK) → MO mới phải hiện đúng ở tab phòng của nó.
    // Trước đây PTK lọc theo where.zone cấp Order nên MO PTK nằm trong Order MASTER_HUB bị ẩn.
    addWhere({ items: { some: { zone } } });
  }

  // Bốn nhánh lọc trạng thái nằm ở app/lib/business/orders/status-where.ts (đều PER-MO).
  addWhere(orderStatusWhere({ history, status }));

  // allMode (snapshot): skip user-level filters — client handles them
  if (!allMode) {
    if (isSuspended !== undefined) where.isSuspended = isSuspended;
    // Filter on items — priority là PER-MO (priorityCode), cờ Order-level có thể lệch.
    // Nút "Ưu tiên" = CHỈ UT1 (nguồn chân lý: TOP_PRIORITY_CODE). Coarse-filter: giữ đơn có
    // ≥1 MO UT1; client sau đó expand + lọc per-MO để loại MO Normal anh em.
    //
    // ⚠️ TỪNG CÓ `|| isRush` Ở ĐÂY, và đó chính là bằng chứng hai nút trùng nhau: nút "Hỏa tốc"
    // đi vào ĐÚNG câu điều kiện này nên ra ĐÚNG cùng một tập. Nút đó đã bỏ. Cột dữ liệu
    // `isRush` thì vẫn còn — nó suy từ priorityCode và nuôi cờ "Gấp" ở màn chi tiết.
    if (isPriority) {
      addWhere({ items: { some: { priorityCode: TOP_PRIORITY_CODE } } });
    }
    if (assignedToId) where.assignedToId = assignedToId;

    // Date range filter on orderDate (ngày tạo)
    if (dateFrom || dateTo) {
      where.orderDate = {};
      if (dateFrom) where.orderDate.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.orderDate.lte = end;
      }
    }

    // Date range filter on requiredDate (deadline) — dùng cho preset Deadline / Quá hạn
    if (requiredDateFrom || requiredDateTo) {
      where.requiredDate = {};
      if (requiredDateFrom) where.requiredDate.gte = new Date(requiredDateFrom);
      if (requiredDateTo) {
        const end = new Date(requiredDateTo);
        end.setHours(23, 59, 59, 999);
        where.requiredDate.lte = end;
      }
    }
    if (search) {
      const ids = await searchOrderIds(search);
      where.id = { in: ids };
    }
    // Phân loại KH filter — SR cần OR với isShowroom per-item
    if (phanLoaiKhFilter) {
      if (phanLoaiKhFilter === "SR") {
        addWhere({
          OR: [
            { phanLoaiKh: "SR" },
            { items: { some: { specifications: { path: ["isShowroom"], equals: true } } } },
          ],
        });
      } else {
        where.phanLoaiKh = phanLoaiKhFilter;
      }
    }
  }

  const skip = (page - 1) * limit;

  // History/terminal tabs: sort by completedDate DESC by default
  const effectiveSortBy = history && sortBy === "orderDate" ? "completedDate" : sortBy;
  const effectiveSortDir = history && sortBy === "orderDate" ? "desc" : sortDir;

  // V2 ref: MASTER_HUB cần thêm productionDetail cho tab Tiến độ / Kỹ thuật / Kết quả
  const isMasterHub = zone === "MASTER_HUB";
  // Stage filters that need productionDetail to match (excludes pure status filters)
  const STATUS_ONLY_FILTERS = new Set(["COMPLETED","CANCELLED","SUSPENDED","HOLD:CHO_DX_NL","HOLD:CHO_NL"]);
  // history (tab Hoàn tất/Đã hủy) cần productionDetail để đọc perItem.completedDate (Ngày HT per-MO)
  const needsProductionDetail = isMasterHub || history || (isStageFilterMode && !STATUS_ONLY_FILTERS.has(stageFilter!));

  // Build a stable multi-field orderBy that:
  //   1. Applies the user's chosen sort as primary key
  //   2. Uses sortKey (= COALESCE(baseOrderNumber, orderNumber)) as tiebreaker so all
  //      versions of the same MO land adjacent — even when the primary key ties (e.g.
  //      26.36806 and 26.36806.2 both created on 03/06 with same orderDate)
  //   3. Within a group: base order (versionNumber = null) always first, then .1, .2, .3…
  //
  // When the primary sort is already "orderNumber", sortKey is redundant (string comparison
  // naturally places "26.36806" < "26.36806.2"), so we skip it to avoid a duplicate column.
  const verSort: Prisma.OrderOrderByWithRelationInput = {
    versionNumber: { sort: "asc" as const, nulls: "first" as const },
  };

  const orderByFields: Prisma.OrderOrderByWithRelationInput[] =
    effectiveSortBy === "orderNumber"
      ? [{ orderNumber: effectiveSortDir }, verSort]
      : [{ [effectiveSortBy]: effectiveSortDir }, { sortKey: effectiveSortDir }, verSort];

  try {
    const queryInclude = {
      createdBy: { select: { id: true, name: true, role: true } },
      assignedTo: { select: { id: true, name: true, role: true } },
      _count: { select: { items: true, alerts: true } },
      alerts: {
        where: { isResolved: false },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { title: true, severity: true },
      },
      items: {
        orderBy: { lineNumber: "asc" },
        select: {
          id: true,
          zone: true,
          itemStatus: true,
          moNumber: true,
          productName: true,
          nvl: true,
          size: true,
          quantity: true,
          mainStoneType: true,
          mainStoneSize: true,
          specifications: true,
          techClassification: true,
          platingType: true,
          designFileUrl: true,
          designImageUrl: true,
          techNote: true,
          masoMau: true,
          weightGram: true,
          orderDate: true,
          estimatedDate: true,
          requiredDate: true,
          completedAt: true,
          saleNote: true,
          priorityCode: true,
          isPriority: true,
          isRush: true,
        },
      },
      ...(needsProductionDetail ? { productionDetail: true } : {}),
      // Kết quả 3D ĐÃ DUYỆT — lọc ngay ở DB thay vì lấy hết rồi lọc trong bộ nhớ: đây là
      // endpoint danh sách, mỗi đơn lấy thừa vài dòng là nhân lên theo cả trang.
      // MỌI lượt còn hiệu lực, KHÔNG chỉ lượt đã duyệt: Order cần thấy cả "đã nộp, chờ mình
      // duyệt" — lọc sớm ở đây thì trạng thái đó biến mất khỏi bảng, y hệt "chưa ai làm gì".
      design3DAssignments: {
        where: ACTIVE_3D_ASSIGNMENTS,
        select: { orderItemId: true, reviewStatus: true, completedAt: true, kpiStatus: true },
      },
    } as const;

    const [rawOrders, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        // stageFilter mode: fetch all (no pagination), filter in-memory after mapping
        skip: (isStageFilterMode || allMode) ? 0 : skip,
        take: (isStageFilterMode || allMode) ? STAGE_FILTER_FETCH_LIMIT : limit,
        orderBy: orderByFields,
        include: queryInclude,
      }),
      // Đếm MO (OrderItem), không đếm SO — huy hiệu tab phải khớp số dòng bảng hiện.
      prisma.orderItem.count({
        where: buildItemCountWhere({ orderWhere: where, zone, history, status }),
      }),
    ]);

    // Map items[0] → firstItem; build productionSummary từ productionDetail
    const orders = rawOrders.map(({ items, productionDetail, design3DAssignments, ...rest }: typeof rawOrders[number]) => {
      const first = items[0] as typeof items[number] | undefined;
      const specs = (first?.specifications ?? {}) as Record<string, unknown>;

      // V2 ref: MO# col 3 — danh sách tất cả MO# của đơn (dùng cho multi-item display)
      const allMoNumbers = items
        .map((it) => it.moNumber ?? null)
        .filter((n): n is string => n !== null);

      // V2 ref: TIẾN ĐỘ SẢN XUẤT — tính CÔNG ĐOẠN từ stage dates + lấy extra từ extraData
      const pd = (productionDetail ?? null) as Record<string, unknown> | null;
      const extra = (pd?.extraData ?? {}) as Record<string, unknown>;
      // Per-item production data (extraData.perItem[itemId]) — dùng để tránh contamination
      const perItemMap = (extra.perItem as Record<string, Record<string, unknown>> | undefined) ?? {};

      const mapItem = (it: typeof items[number]) => {
        const itSpecs = (it.specifications ?? {}) as Record<string, unknown>;
        // Per-item production fields: read from perItem[itemId], no fallback to order-level
        // (order-level fallback happens in orders-client.tsx when merging productionSummary)
        const ipd = perItemMap[it.id] ?? {};
        return {
          itemId:             it.id,
          zone:               it.zone,
          itemStatus:         it.itemStatus ?? null,
          moNumber:           it.moNumber ?? (rest as Record<string, unknown>).orderNumber as string,
          productName:        it.productName,
          nvl:                it.nvl ?? null,
          size:               it.size ?? null,
          quantity:           it.quantity ?? 1,
          mainStoneType:      it.mainStoneType ?? null,
          mainStoneSize:      it.mainStoneSize ?? null,
          ghiChuSp:           (itSpecs.ghiChuSp as string) ?? null,
          techNote:           it.techNote ?? null,
          masoMau:            it.masoMau ?? null,
          loaiSp:             (itSpecs.loaiSp as string) ?? null,
          isShowroom:         (itSpecs.isShowroom as boolean) === true,
          techClassification: it.techClassification ?? [],
          platingType:        it.platingType ?? null,
          designFileUrl:      it.designFileUrl ?? null,
          designImageUrl:     it.designImageUrl ?? null,
          ...(() => {
            const mine = (design3DAssignments ?? []).filter((a) => a.orderItemId === it.id);
            const s3d = summarizeDesign3DForOrder(mine);
            return {
              design3dReviewStatus: s3d.reviewStatus,
              design3dCompletedAt: s3d.completedAt ? s3d.completedAt.toISOString() : null,
              design3dKpiStatus: s3d.kpiStatus,
            };
          })(),
          weightGram:         it.weightGram != null ? String(it.weightGram) : null,
          chiTietDaTam:       (itSpecs.chiTietDaTam as string) ?? null,
          // Ngày lên đơn PTK per-item
          orderDate:     it.orderDate     != null ? (it.orderDate     as Date).toISOString() : null,
          // Per-MO scheduling & priority
          estimatedDate: it.estimatedDate != null ? (it.estimatedDate as Date).toISOString() : null,
          requiredDate:  it.requiredDate  != null ? (it.requiredDate  as Date).toISOString() : null,
          completedAt:   it.completedAt   != null ? (it.completedAt   as Date).toISOString() : null,
          saleNote:      (it as Record<string, unknown>).saleNote as string ?? null,
          priorityCode:  (it as Record<string, unknown>).priorityCode as string || "Normal",
          isPriority:    (it as Record<string, unknown>).isPriority as boolean ?? false,
          isRush:        (it as Record<string, unknown>).isRush as boolean ?? false,
          // Theo dõi BOM per-MO (PTK) — readBomState hiểu cả specs.bom mới lẫn key phẳng cũ.
          ...(() => { const b = readBomState(itSpecs); return { bomStatus: b.status, bomDate: currentBomDate(b) }; })(),
          // Ghi đè riêng theo MO (Khách hàng/Sales/3 Sao/Link chat) — MO không ghi đè thì
          // dùng chung giá trị của SO (Nguồn KHÔNG có override, luôn dùng chung SO).
          // Fix B: override RỖNG/"" coi như không override (nonEmpty), không che giá trị SO.
          customerName: nonEmpty(itSpecs.customerName) ?? ((rest as Record<string, unknown>).customerName as string),
          salesName:    nonEmpty(itSpecs.salesName) ?? ((rest as Record<string, unknown>).salesName as string ?? null),
          donHang3Sao:  (itSpecs.donHang3SaoOverride as boolean) ?? ((rest as Record<string, unknown>).donHang3Sao as boolean ?? false),
          linkChat:     (itSpecs.linkChatOverride as string) ?? ((rest as Record<string, unknown>).linkChat as string ?? null),
          // Per-item production data — null when not yet saved per-item (pre-fix data)
          tl3d:        (ipd.tl3d as string) ?? null,
          tlXuong:     (ipd.tlXuong as string) ?? null,
          // QĐ 24K/PT/Bạc: dùng giá trị đã lưu nếu có; nếu CẢ BA đều trống mà đã có tl3d
          // (dữ liệu cũ chưa từng qua panel, hoặc công thức Bạc mới thêm sau) → tự tính bằng
          // CHÍNH hàm calcAutoProduction mà panel dùng (toProductionForm) — một nguồn công
          // thức duy nhất, không lặp lại logic, không cần migrate/backfill dữ liệu cũ.
          ...(() => {
            const storedQd24k = (ipd.qd24k as string) ?? "";
            const storedQdPt  = (ipd.qdPt as string) ?? "";
            const storedQdBac = (ipd.qdBac as string) ?? "";
            const tl3dStr = (ipd.tl3d as string) ?? "";
            if (storedQd24k || storedQdPt || storedQdBac || !tl3dStr) {
              return { qd24k: storedQd24k || null, qdPt: storedQdPt || null, qdBac: storedQdBac || null };
            }
            const auto = calcAutoProduction(it.nvl ?? "", parseFloat(tl3dStr) || 0, 0, 0);
            return { qd24k: auto.qd24k || null, qdPt: auto.qdPt || null, qdBac: auto.qdBac || null };
          })(),
          tlThucTeHt:  (ipd.tlThucTeHt as string) ?? null,
          danhGiaTl:   (ipd.danhGiaTl as string) ?? null,
          pctChenLech: (ipd.pctChenLech as string) ?? null,
          thongTinHt:  (ipd.thongTinHt as string) ?? null,
          sku:         (ipd.sku as string) ?? null,
          // Ngày HT PER-MO: user nhập (extraData.perItem[id].completedDate) ?? ngày hoàn tất thật (completedAt).
          // KHÔNG dùng order.completedDate (cấp SO dùng chung).
          completedDate: (ipd.completedDate as string) ?? (it.completedAt ? (it.completedAt as Date).toISOString() : null),
          // Per-item alert info — will be populated after workflowHistory lookup below
          ownAlertTitle: null as string | null,
          ownAlertCount: 0,
          // Per-item congDoan — only this item's stages, avoids sibling contamination
          ...(isMasterHub ? computeCongDoanForItem(pd, it.id) : { congDoan: null, congDoanCode: null, congDoanStatus: null }),
          // Dùng để quyết định hiện "_1" phiên bản ngầm định cho MO bare hay không. Luật nằm ở
          // business/order-helpers vì popup nhắc việc cũng cần đúng cờ này — hồi nó còn inline
          // ở đây, chỗ kia không với tới nên đóng cứng `true` và hiển thị sai.
          isFromWebapp: isMoFromWebapp({
            specifications: it.specifications,
            orderCreatedById: (rest as Record<string, unknown>).createdById as string | null,
          }),
        };
      };

      const firstItem = first ? mapItem(first) : null;
      // allItems: tất cả sản phẩm — dùng để hiển thị mỗi MO một dòng trên bảng
      const allItems = items.map(mapItem);

      const cdStatus = isMasterHub ? computeCongDoanStatus(pd) : null;
      // Dùng CHUNG điều kiện needsProductionDetail (đã quyết định productionDetail có được
      // query về hay không) thay vì check lại isMasterHub riêng — tránh 2 tầng lệch pha nhau
      // (query đã include productionDetail nhưng summary vẫn không dựng, khiến field như
      // thongTinHt luôn rỗng dù dữ liệu đã có trong DB, ví dụ ở tab history/stage-filter).
      const productionSummary = needsProductionDetail
        ? {
            tl3d:       (extra.tl3d as string) ?? (firstItem?.tl3d ?? null),
            tlXuong:    (extra.tlXuong as string) ?? null,
            // Fallback về firstItem (đã tự tính qua calcAutoProduction ở mapItem nếu thiếu) —
            // cùng pattern với tl3d ở trên, tránh tính lại lần 2.
            qd24k:      (extra.qd24k as string) ?? (firstItem?.qd24k ?? null),
            qdPt:       (extra.qdPt as string) ?? (firstItem?.qdPt ?? null),
            qdBac:      (extra.qdBac as string) ?? (firstItem?.qdBac ?? null),
            congDoan:       computeCongDoan(pd),
            congDoanCode:   cdStatus?.code ?? null,
            congDoanStatus: cdStatus?.status ?? null,
            ngayHoanTat: (rest as Record<string, unknown>).completedDate
              ? String((rest as Record<string, unknown>).completedDate)
              : null,
            tlThucTeHt: (extra.tlThucTeHt as string) ?? null,
            danhGiaTl:  (extra.danhGiaTl as string) ?? ((pd?.qcResult as string) ?? null),
            pctChenLech: computePctChenLech(
              (extra.tlThucTeHt as string) ?? null,
              (extra.tl3d as string) ?? (firstItem?.tl3d ?? null)
            ),
            thongTinHt: (extra.thongTinHt as string) ?? ((pd?.internalNote as string) ?? null),
            // canhBaoDacBiet: from productionDetail extraData only (NOT saleNote).
            // saleNote = sales notes from create form, not a production warning.
            canhBaoDacBiet: (extra.canhBaoDacBiet as string) ?? null,
          }
        : null;

      // Per-item alert mapping: each item should show its OWN alert, not the order's latest alert.
      // The order-level alerts include all items' alerts → both rows would show same count/title.
      // Use workflowHistory metadata (scopedItemId) to map alerts → specific items.
      const orderAlerts = (rest as any).alerts as Array<{ title: string; severity: string }> | undefined;
      // For now keep order-level activeAlertTitle as fallback for full-order alerts
      const activeAlertTitle = orderAlerts?.[0]?.title ?? null;

      const { alerts: _alerts, ...restWithoutAlerts } = rest as any;

      // Pre-compute stage filter keys for client-side filtering in snapshot mode
      const stageMatchKeys = (allMode && isMasterHub)
        ? STAGE_FILTER_DEFS.map(d => d.key).filter(key =>
            orderMatchesStageFilter(pd, (rest as Record<string, unknown>).status as string, key)
          )
        : undefined;

      // Build per-item alert info by looking at which item each alert was created for.
      // We fetch workflowHistory SUSPENDED entries and correlate via alertId metadata.
      // This is done outside the transaction for the full batch of orders below.
      return { ...restWithoutAlerts, firstItem, allItems, productionSummary, allMoNumbers, activeAlertTitle, stageMatchKeys };
    });

    // Enrich allItems with per-item alert info (ownAlertTitle, ownAlertCount).
    // Fetch workflowHistory SUSPENDED entries in bulk → map alertId → itemId → alert.
    const orderIds = orders.map(o => (o as any).id as string);
    if (orderIds.length > 0) {
      const suspendEntries = await prisma.workflowHistory.findMany({
        where: { orderId: { in: orderIds }, action: "SUSPENDED" },
        select: { orderId: true, metadata: true },
      });
      // Build map: itemId → alertId
      const itemToAlertId = new Map<string, string>();
      for (const entry of suspendEntries) {
        const meta = entry.metadata as Record<string, unknown> | null;
        const alertId = meta?.alertId as string | undefined;
        const scopedItemId = meta?.scopedItemId as string | undefined;
        if (alertId && scopedItemId) itemToAlertId.set(scopedItemId, alertId);
      }

      // Fetch all unresolved alerts for these orders
      const unresolvedAlerts = await prisma.alert.findMany({
        where: { orderId: { in: orderIds }, isResolved: false },
        select: { id: true, orderId: true, title: true },
      });
      // Map: alertId → title
      const alertTitleMap = new Map(unresolvedAlerts.map(a => [a.id, a.title]));
      // Map: orderId → unscoped alert count (full-order alerts with no scopedItemId)
      const orderAlertCounts = new Map<string, number>();
      for (const a of unresolvedAlerts) {
        orderAlertCounts.set(a.orderId, (orderAlertCounts.get(a.orderId) ?? 0) + 1);
      }

      // Patch allItems in each order with ownAlertTitle and ownAlertCount
      for (const order of orders) {
        const o = order as any;
        o.allItems = (o.allItems as any[]).map((item: any) => {
          const alertId = itemToAlertId.get(item.itemId);
          const ownAlertTitle = alertId ? (alertTitleMap.get(alertId) ?? null) : null;
          // Count only alerts scoped to this specific item
          const ownAlertCount = alertId && alertTitleMap.has(alertId) ? 1 : 0;
          return { ...item, ownAlertTitle, ownAlertCount };
        });
      }
    }

    // ── Tab Đã hủy: nối NGÀY HỦY + LÝ DO HỦY vào từng MO ──────────────────────
    //
    // Không có cột `cancelledAt`/`cancelReason` nào trong schema, và `completedDate` bị set
    // null khi hủy — nên dấu vết duy nhất là workflowHistory. Đọc ngược từ đó thay vì thêm
    // cột: KHÔNG cần migration trên DB production.
    //
    // CHỈ CHẠY Ở TAB ĐÃ HỦY. Đây là một query thêm; bật cho mọi request thì mọi tab khác
    // phải trả giá cho dữ liệu chúng không hiển thị.
    //
    // Dùng lại đúng quy ước `metadata.scopedItemId` mà khối alert ngay phía trên đang dùng.
    if (history && status === "CANCELLED" && orderIds.length > 0) {
      const cancelEntries = await prisma.workflowHistory.findMany({
        where: { orderId: { in: orderIds }, action: "STATUS_CHANGED", toStatus: "CANCELLED" },
        // KHÔNG select `comment`: nó là trường hệ thống ("Tất cả MO đã hủy"), không phải lý
        // do người dùng. Không lấy về để không ai vô tình dùng lại — xem cancel-info.ts.
        select: { orderId: true, metadata: true, performedAt: true },
        // CŨ NHẤT TRƯỚC để bản ghi MỚI NHẤT ghi đè khi cùng một MO có nhiều lần hủy (hủy →
        // admin mở lại → hủy lại). Lần hủy đang có hiệu lực là lần cuối, không phải lần đầu.
        orderBy: { performedAt: "asc" },
      });

      // Quy tắc ưu tiên (MO thắng SO, lần hủy cuối thắng lần đầu, metadata.reason thắng
      // comment) nằm trong module thuần đã có test — xem app/lib/business/orders/cancel-info.ts.
      const cancelIndex = indexCancelHistory(cancelEntries.map((e) => ({
        orderId: e.orderId,
        metadata: e.metadata as Record<string, unknown> | null,
        performedAt: e.performedAt,
      })));

      for (const order of orders) {
        const o = order as Record<string, unknown>;
        const attach = (item: Record<string, unknown>) => {
          const info = resolveCancelInfo(cancelIndex, item.itemId as string, o.id as string);
          return {
            ...item,
            cancelledAt: info?.cancelledAt ?? null,
            cancelReason: info?.cancelReason ?? null,
          };
        };
        o.allItems = ((o.allItems as Array<Record<string, unknown>>) ?? []).map(attach);
        if (o.firstItem) o.firstItem = attach(o.firstItem as Record<string, unknown>);
      }
    }

    // PTK tab: phát hiện MO đã chuyển sang PSX (MASTER_HUB) — gắn cờ ĐÚNG THEO TỪNG MO
    // (so theo gốc số MO đã bỏ hậu tố phiên bản), KHÔNG theo cấp SO. 1 SO giờ có thể có
    // nhiều MO độc lập (có cái ở PTK, có cái ở PSX) — gắn theo baseOrderNumber (SO) như
    // trước sẽ làm MỌI MO khác trong cùng SO bị gắn nhầm badge dù chẳng liên quan gì tới
    // MO đã chuyển đi.
    if (zone === "PRE_PRODUCTION" && orders.length > 0) {
      const moBases = new Set<string>();
      for (const order of orders as Array<Record<string, unknown>>) {
        for (const item of (order.allItems as Array<Record<string, unknown>>) ?? []) {
          if (item.moNumber) moBases.add(stripVersionSuffix(item.moNumber as string));
        }
      }
      if (moBases.size > 0) {
        const baseList = Array.from(moBases);
        // startsWith chỉ dùng làm bộ lọc THÔ ở SQL (index-backed) — vì "26.1234" startsWith
        // cũng khớp nhầm "26.12345", nên PHẢI re-check chính xác bằng stripVersionSuffix
        // ở bước dưới trước khi tin kết quả.
        const psxItems = await prisma.orderItem.findMany({
          where: {
            zone: "MASTER_HUB",
            OR: baseList.map((b) => ({ moNumber: { startsWith: b } })),
          },
          select: { moNumber: true, itemStatus: true, order: { select: { orderNumber: true, status: true } } },
        });
        // Luật chọn (đối chiếu lại base, loại bản đã huỷ, lấy phiên bản cao nhất) nay nằm ở
        // business/orders/psx-sibling.ts — dùng CHUNG với sidebar, có unit test riêng. Trước đây
        // luật chỉ sống ở đây nên bảng biết còn sidebar thì không.
        const psxByMoBase = psxSiblingByMoBase(
          psxItems.map((it) => ({
            moNumber: it.moNumber,
            itemStatus: it.itemStatus,
            orderStatus: it.order.status,
            orderNumber: it.order.orderNumber,
          })),
          moBases,
        );
        for (const order of orders as Array<Record<string, unknown>>) {
          const patchItem = (item: Record<string, unknown> | null) => {
            if (!item?.moNumber) return item;
            return {
              ...item,
              psxSibling: psxSiblingOf(
                { moNumber: item.moNumber as string, zone: item.zone as string | null },
                psxByMoBase,
              ),
            };
          };
          order.allItems = ((order.allItems as Array<Record<string, unknown>>) ?? []).map(patchItem);
          order.firstItem = patchItem(order.firstItem as Record<string, unknown> | null);
        }
      }
    }

    // allMode (snapshot): return full list — client handles filtering/pagination
    if (allMode) {
      return paginated(orders, { page: 1, limit: orders.length || 1, total: orders.length, totalPages: 1 });
    }

    // stageFilter: post-compute filter — match orders whose production stage fits the filter key,
    // then trim allItems to only the MOs that individually match (not all sibling MOs in the SO).
    // Uses pre-computed congDoanCode/congDoanStatus on each item — same source as the CONG DOAN
    // column, so results are guaranteed consistent with what the table already displays.
    if (stageFilter) {
      const stageMatchSet = new Set<string>();
      rawOrders.forEach((raw) => {
        const pd = ((raw as Record<string, unknown>).productionDetail ?? null) as Record<string, unknown> | null;
        const rowStatus = (raw as Record<string, unknown>).status as string;
        if (orderMatchesStageFilter(pd, rowStatus, stageFilter)) {
          stageMatchSet.add((raw as Record<string, unknown>).id as string);
        }
      });

      // Parse filter key once outside the loop
      const ORDER_LEVEL_KEYS = new Set(["COMPLETED", "CANCELLED", "SUSPENDED"]);
      const isOrderLevel = ORDER_LEVEL_KEYS.has(stageFilter);
      const colonIdx = stageFilter.lastIndexOf(":");
      const filterCode   = colonIdx >= 0 ? stageFilter.slice(0, colonIdx) : null;
      const filterStatus = colonIdx >= 0 ? stageFilter.slice(colonIdx + 1) : null;
      const isActiveFilter = filterStatus === "active";

      const filtered = (orders as Record<string, unknown>[])
        .filter((o) => stageMatchSet.has(o.id as string))
        .map((o) => {
          // SUSPENDED/COMPLETED/CANCELLED apply to the whole order — show all MOs
          if (isOrderLevel) return o;

          const filteredItems = (o.allItems as Record<string, unknown>[]).filter((item) => {
            const code   = item.congDoanCode   as string | null;
            const status = item.congDoanStatus as string | null;
            if (!code || !filterCode) return false;
            if (code !== filterCode) return false;
            return isActiveFilter || status === filterStatus;
          });

          if (filteredItems.length === 0) return null;
          return { ...o, allItems: filteredItems, firstItem: filteredItems[0] ?? null };
        })
        .filter(Boolean);

      return paginated(filtered as Record<string, unknown>[], { page: 1, limit: filtered.length || 1, total: filtered.length, totalPages: 1 });
    }

    return paginated(orders, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("[GET /api/orders]", err);
    return Errors.internal();
  }
}

// ─── POST /api/orders ────────────────────────────────────────────────────────
// Body: CreateOrderInput (see schemas/order.ts)

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return Errors.forbidden();
  if (!["ADMIN", "ORDER"].includes(currentUser.role)) return Errors.forbidden();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.badRequest("Invalid JSON body");
  }

  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.validationFailed(parsed.error.issues);
  }

  const {
    orderNumber,
    customerName,
    saleNote,
    nguon,
    phanLoaiKh,
    donHang3Sao,
    linkChat,
    priorityCode,
    requiredDate,
    estimatedDate,
    estimatedTotal,
    depositAmount,
    currency,
    designBriefUrl,
    referenceUrls,
    salesName,
    createdById,
    assignedToId,
    loaiDon,
    storeId,
    items,
  } = parsed.data;

  // V2 ref: targetSheetName = isPreProd ? SHEETS.PRE_PRODUCTION : SHEETS.MASTER_HUB
  // "production" → MASTER_HUB + IN_PRODUCTION; "pre_production" → PRE_PRODUCTION + DRAFT
  const zone           = loaiDon === "production" ? "MASTER_HUB"    : "PRE_PRODUCTION";
  const initialStatus  = loaiDon === "production" ? "IN_PRODUCTION" : "DRAFT";

  // isPriority / isRush luôn được tính từ priorityCode (Single Source of Truth)
  // V2 ref: mapping CAP_DO_UU_TIEN → flag trong 02_MasterHub.js
  const code = (priorityCode ?? "Normal") as PriorityCode;
  const { isPriority, isRush } = priorityToFlags(code);

  try {
    const order = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // SO# do user nhập từ Odoo — không tự sinh
      // Client luôn gửi ĐÚNG giá trị đang hiển thị trên form (kể cả giá trị auto-tính) —
      // không nhận được (user để trống, VD tab Phòng Thiết Kế) → lưu blank, không tự bịa
      // ra ngày (trước đây dùng calcRequiredDate() làm fallback, gây ra ngày không mong muốn).
      const computedRequiredDate = requiredDate ? new Date(requiredDate) : null;

      // SO# (orderNumber) = SO gốc từ Odoo, KHÔNG bao giờ gắn version — chỉ MO mới có .1/.2.
      // inputOrderNumber = SO gốc (lưu vào orderNumber). versionedMoBase = base để sinh MO .1.
      const inputOrderNumber = orderNumber;
      const versionedMoBase = `${orderNumber}.1`;

      // Append .1 to any MO# that doesn't already carry a version suffix (≥3 dot-parts, last = integer).
      // Applies to both manually-entered and auto-generated MO#s so the table always shows X.Y.1.
      function ensureVersionSuffix(mo: string): string {
        const p = mo.split(".");
        if (p.length >= 3 && /^\d+$/.test(p[p.length - 1])) return mo; // already versioned
        return `${mo}.1`;
      }

      // sortKey = base MO# of first item — groups this order with its MO family for sorting.
      // Strip version suffix if somehow present (edge case: user types "26.36806.1").
      const firstMoRaw = items?.[0]?.moNumber?.trim() || versionedMoBase;
      const firstMoBase = (() => {
        const p = firstMoRaw.split(".");
        if (p.length >= 3) {
          const last = parseInt(p[p.length - 1], 10);
          if (!isNaN(last) && String(last) === p[p.length - 1]) return p.slice(0, -1).join(".");
        }
        return firstMoRaw;
      })();

      const created = await tx.order.create({
        data: {
          orderNumber: inputOrderNumber,  // SO gốc — KHÔNG gắn version (chỉ MO mới có .1/.2)
          sortKey: firstMoBase,    // base MO# — MO-level grouping, not SO-level
          baseOrderNumber: inputOrderNumber, // = orderNumber; giữ để tương thích logic nhóm/psxSibling
          versionNumber: 1,

          // V2 ref: zone xác định từ loaiDon khi tạo đơn
          zone,
          status: initialStatus,
          customerName,
          saleNote,
          nguon,
          phanLoaiKh,
          donHang3Sao: donHang3Sao ?? false,
          linkChat,
          isPriority,
          isRush,
          priorityCode: code,
          requiredDate: computedRequiredDate,
          estimatedDate: estimatedDate ? new Date(estimatedDate) : null,
          estimatedTotal,
          depositAmount,
          currency,
          designBriefUrl,
          referenceUrls,
          salesName,
          createdById: currentUser.dbId,
          assignedToId,
          storeId: storeId ?? null,
          items: {
            create: items.map((item, index) => {
              const lineNum = index + 1;
              // V2 ref: MO# user nhập thủ công; fallback về versioned SO# + "-N" nếu không có
              const autoMoNumber = lineNum === 1 ? versionedMoBase : `${versionedMoBase}-${lineNum}`;
              const rawMo = item.moNumber?.trim() || autoMoNumber;
              return {
                ...item,
                lineNumber: lineNum,
                moNumber: ensureVersionSuffix(rawMo),
                zone,
                weightGram: item.weightGram,
                unitPrice: item.unitPrice,
                specifications: item.specifications as Prisma.InputJsonValue ?? null,
                // Per-MO scheduling & priority — copied from order-level form at creation time
                estimatedDate: estimatedDate ? new Date(estimatedDate) : null,
                requiredDate: computedRequiredDate,
                saleNote: saleNote ?? null,
                priorityCode: code,
                isPriority,
                isRush,
              };
            }),
          },
        },
        include: {
          items: true,
          createdBy: { select: { id: true, name: true, role: true } },
          assignedTo: { select: { id: true, name: true, role: true } },
        },
      });

      // V2 ref: "Sản xuất ngay" → tạo ProductionDetail ngay lập tức với MO# = item đầu tiên
      // 02_MasterHub.js createOrderRows() → ghi thẳng vào MASTER_HUB sheet
      if (zone === "MASTER_HUB") {
        const firstMo = items[0]?.moNumber?.trim() || versionedMoBase;
        await tx.productionDetail.create({
          data: {
            orderId: created.id,
            productionCode: firstMo,
          },
        });
      }

      await tx.workflowHistory.create({
        data: {
          orderId: created.id,
          action: "CREATED",
          toStatus: initialStatus,
          toZone: zone,
          performedById: currentUser.dbId,
          metadata: {
            priorityCode: code,
            requiredDate: computedRequiredDate?.toISOString() ?? null,
            loaiDon,
            // Ghi vết các MO đã tạo cùng đơn — để Lịch sử thay đổi hiện "Đã tạo N MO: ..."
            // thay vì chỉ SO#. created.items có sẵn (query kèm include items).
            addedCount: created.items.length,
            moNumbers: created.items.map((i) => i.moNumber),
          },
        },
      });

      return created;
    }, { maxWait: 10_000, timeout: 30_000 });

    return ok(order, 201);
  } catch (err) {
    // SO# collision cực hiếm nhờ transaction isolation, nhưng vẫn handle
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return Errors.conflict("SO# đã tồn tại trong hệ thống");
    }
    console.error("[POST /api/orders]", err);
    // Trong dev: trả về chi tiết lỗi để debug
    if (process.env.NODE_ENV !== "production") {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json({ error: { code: "INTERNAL_ERROR", message: msg } }, { status: 500 });
    }
    return Errors.internal();
  }
}
