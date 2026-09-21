// Client-safe builder: OrderDetail → OrderSummary row shape.
//
// Khi tạo phiên bản mới, detail API (/api/orders/:id) trả về OrderDetail (có `items`
// thô, KHÔNG có `firstItem`/`allItems`/`productionSummary`). Danh sách lại cần
// OrderSummary. Hàm này dựng đúng shape để chèn optimistic vào snapshot cache,
// tránh crash do thiếu mảng `allItems` và tránh dòng trống.
//
// Đây là bản sao client-side của vòng map trong app/api/orders/route.ts. Các field
// production (congDoan, tl*, productionSummary) chỉ là tạm — background refetch sẽ
// reconcile lại bằng dữ liệu server trong ~1s.
import { computeCongDoan, computeCongDoanStatus, computeCongDoanForItem } from "@/app/lib/business/production-stage";
import { nonEmpty } from "@/app/lib/utils/order-helpers";
import { readBomState, currentBomDate } from "@/app/lib/business/bom";
import type { OrderDetail, OrderSummary, OrderFirstItem, OrderItem } from "@/app/lib/types/order";

function mapItem(
  it: OrderItem,
  orderNumber: string,
  perItemMap: Record<string, Record<string, unknown>>,
  pd: Record<string, unknown> | null,
  isMasterHub: boolean,
  order: { customerName: string; salesName: string | null; donHang3Sao: boolean; linkChat: string | null },
): OrderFirstItem {
  const itSpecs = (it.specifications ?? {}) as Record<string, unknown>;
  const ipd = perItemMap[it.id] ?? {};
  return {
    itemId:             it.id,
    moNumber:           it.moNumber ?? orderNumber,
    zone:               it.zone,
    itemStatus:         null,
    // Bản lạc quan dựng từ payload thô của client; payload đó không mang mã số mẫu (R&D nhập
    // sau, ở PSX). Để null thay vì đoán — dòng thật từ server sẽ thay chỗ ngay sau đó.
    masoMau:            null,
    // Bản dựng lạc quan phía client — chưa gọi server nên chưa biết kết quả duyệt 3D.
    // Để null: thà ô trống một nhịp còn hơn đoán rồi nhấp nháy sang giá trị khác khi dữ liệu thật về.
    design3dReviewStatus: null,
    design3dCompletedAt: null,
    design3dKpiStatus:   null,
    productName:        it.productName,
    nvl:                it.nvl ?? null,
    size:               it.size ?? null,
    mainStoneType:      it.mainStoneType ?? null,
    mainStoneSize:      it.mainStoneSize ?? null,
    ghiChuSp:           (itSpecs.ghiChuSp as string) ?? null,
    techNote:           it.techNote ?? null,
    loaiSp:             (itSpecs.loaiSp as string) ?? null,
    techClassification: it.techClassification ?? [],
    platingType:        it.platingType ?? null,
    designFileUrl:      it.designFileUrl ?? null,
    designImageUrl:     it.designImageUrl ?? null,
    weightGram:         it.weightGram != null ? String(it.weightGram) : null,
    chiTietDaTam:       (itSpecs.chiTietDaTam as string) ?? null,
    quantity:           it.quantity ?? 1,
    isShowroom:         (itSpecs.isShowroom as boolean) === true,
    orderDate:          it.orderDate ?? null,
    estimatedDate:      it.estimatedDate ?? null,
    requiredDate:       it.requiredDate ?? null,
    completedAt:        null,
    saleNote:           it.saleNote ?? null,
    priorityCode:       it.priorityCode || "Normal",
    isPriority:         it.isPriority ?? false,
    isRush:             it.isRush ?? false,
    ...(() => { const b = readBomState(itSpecs); return { bomStatus: b.status, bomDate: currentBomDate(b) }; })(),
    // Ghi đè riêng theo MO (Nguồn không có override, luôn dùng chung SO)
    customerName:       nonEmpty(itSpecs.customerName) ?? order.customerName,
    salesName:          nonEmpty(itSpecs.salesName) ?? order.salesName,
    donHang3Sao:        (itSpecs.donHang3SaoOverride as boolean) ?? order.donHang3Sao,
    linkChat:           (itSpecs.linkChatOverride as string) ?? order.linkChat,
    ownAlertTitle:      null,
    ownAlertCount:      0,
    tl3d:        (ipd.tl3d as string) ?? null,
    tlXuong:     (ipd.tlXuong as string) ?? null,
    qd24k:       (ipd.qd24k as string) ?? null,
    qdPt:        (ipd.qdPt as string) ?? null,
    qdBac:       (ipd.qdBac as string) ?? null,
    tlThucTeHt:  (ipd.tlThucTeHt as string) ?? null,
    danhGiaTl:   (ipd.danhGiaTl as string) ?? null,
    pctChenLech: (ipd.pctChenLech as string) ?? null,
    thongTinHt:  (ipd.thongTinHt as string) ?? null,
    completedDate: (ipd.completedDate as string) ?? ((it as any).completedAt ? new Date((it as any).completedAt).toISOString() : null),
    ...(isMasterHub
      ? computeCongDoanForItem(pd, it.id)
      : { congDoan: null, congDoanCode: null, congDoanStatus: null }),
  };
}

export function buildOptimisticSummary(detail: OrderDetail): OrderSummary {
  const items = detail.items ?? [];
  const isMasterHub = detail.zone === "MASTER_HUB";
  const pd = (detail.productionDetail ?? null) as Record<string, unknown> | null;
  const extra = (pd?.extraData ?? {}) as Record<string, unknown>;
  const perItemMap = (extra.perItem as Record<string, Record<string, unknown>> | undefined) ?? {};

  const allItems = items.map((it) => mapItem(it, detail.orderNumber, perItemMap, pd, isMasterHub, {
    customerName: detail.customerName,
    salesName: detail.salesName,
    donHang3Sao: detail.donHang3Sao,
    linkChat: detail.linkChat,
  }));
  const firstItem = allItems[0] ?? null;
  const allMoNumbers = items.map((it) => it.moNumber).filter((n): n is string => n != null);

  const cdStatus = isMasterHub ? computeCongDoanStatus(pd) : null;
  const productionSummary = isMasterHub
    ? {
        tl3d:    (extra.tl3d as string) ?? firstItem?.tl3d ?? null,
        tlXuong: (extra.tlXuong as string) ?? null,
        qd24k:   (extra.qd24k as string) ?? null,
        qdPt:    (extra.qdPt as string) ?? null,
        qdBac:   (extra.qdBac as string) ?? null,
        congDoan:       computeCongDoan(pd),
        congDoanCode:   cdStatus?.code ?? null,
        congDoanStatus: cdStatus?.status ?? null,
        ngayHoanTat:    detail.completedDate ?? null,
        tlThucTeHt:     (extra.tlThucTeHt as string) ?? null,
        danhGiaTl:      (extra.danhGiaTl as string) ?? null,
        pctChenLech:    null,
        thongTinHt:     (extra.thongTinHt as string) ?? null,
        canhBaoDacBiet: (extra.canhBaoDacBiet as string) ?? null,
      }
    : null;

  const activeAlertTitle = detail.alerts?.[0]?.title ?? null;

  // Loại các field chỉ có ở OrderDetail (items/productionDetail/alerts/...) để row khớp
  // OrderSummary; phần còn lại (top-level fields) đã đúng tên & kiểu.
  const {
    items: _i, productionDetail: _pd, alerts: _a, workflowHistory: _wh,
    finalTotal: _ft, currency: _c, designBriefUrl: _db, referenceUrls: _ru, productionNote: _pn,
    ...rest
  } = detail as OrderDetail & Record<string, unknown>;

  return {
    ...(rest as unknown as OrderSummary),
    // detail API trả _count: { versions } — list cần { items, alerts }
    _count: { items: allItems.length, alerts: detail.alerts?.length ?? 0 },
    firstItem,
    allItems,
    allMoNumbers,
    productionSummary,
    activeAlertTitle,
    stageMatchKeys: undefined,
  };
}
