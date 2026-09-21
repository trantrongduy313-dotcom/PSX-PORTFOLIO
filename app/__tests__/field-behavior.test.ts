/**
 * field-behavior.test.ts
 *
 * Kiểm tra 3 vấn đề:
 *   A. Trường nào bị KHÓA (disabled) — không chỉnh sửa được
 *   B. Trường nào SHARED (thay đổi 1 MO → ảnh hưởng MO khác cùng SO)
 *   C. Trường nào ISOLATED (mỗi MO độc lập)
 *
 * Không cần DB — test pure business logic.
 */

import { describe, it, expect } from "vitest";
import { isCriticalFieldLocked } from "@/app/lib/business/orders/critical-field-lock";
import {
  toFormState,
  toItemForm,
  toProductionForm,
  toStageForms,
  getBaseSoNumber,
  calcAutoProduction,
} from "@/app/lib/utils/order-helpers";
import type { OrderDetail, OrderItem } from "@/app/lib/types/order";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id:            "item-1",
    orderId:       "order-1",
    lineNumber:    1,
    moNumber:      "26.123456",
    productName:   "Nhẫn vàng",
    nvl:           "18K",
    platingType:   "Vàng",
    size:          "16",
    quantity:      1,
    weightGram:    null,
    mainStoneType: "CZ",
    mainStoneSize: "3mm",
    designFileUrl: null,
    specifications: {},
    zone:          "PRE_PRODUCTION",
    itemStatus:    null,
    createdAt:     new Date("2026-01-01"),
    updatedAt:     new Date("2026-01-01"),
    ...overrides,
  } as unknown as OrderItem;
}

function makeOrder(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id:            "order-1",
    orderNumber:   "26.123456",
    orderDate:     new Date("2026-01-01").toISOString(),
    zone:          "PRE_PRODUCTION",
    status:        "IN_DESIGN",
    version:       1,
    isSuspended:   false,
    customerName:  "Khách A",
    customerPhone: null,
    customerEmail: null,
    salesName:     "Duy",
    nguon:         "CH1",
    phanLoaiKh:    "KH",
    donHang3Sao:   false,
    linkChat:      null,
    saleNote:      null,
    priorityCode:  "Normal",
    isPriority:    false,
    isRush:        false,
    requiredDate:  null,
    estimatedDate: null,
    completedDate: null,
    storeId:       null,
    createdById:   "user-1",
    assignedToId:  null,
    designBriefUrl: null,
    referenceUrls:  [],
    deletedAt:     null,
    createdAt:     new Date("2026-01-01").toISOString(),
    updatedAt:     new Date("2026-01-01").toISOString(),
    items:         [makeItem()],
    productionDetail: null,
    workflowHistory:  [],
    createdBy:     { id: "user-1", name: "Admin", role: "ADMIN" },
    assignedTo:    null,
    _count:        { versions: 0 },
    ...overrides,
  } as unknown as OrderDetail;
}

// ─── Helpers trích xuất logic từ panel (không import component) ────────────────

type ActiveItemSuspendedInput = {
  activeItem: { itemStatus: string | null; zone: string } | null;
  order: { status: string; isSuspended: boolean };
};

/** Logic từ order-detail-panel.tsx — activeItemSuspended */
function calcActiveItemSuspended({ activeItem, order }: ActiveItemSuspendedInput): boolean {
  if (!activeItem) return order.status === "SUSPENDED" || order.isSuspended;

  const iStatus = activeItem.itemStatus;
  const itemZone = activeItem.zone;
  const isTerminalItem = iStatus === "COMPLETED" || iStatus === "CANCELLED";

  if (itemZone === "PRE_PRODUCTION") {
    // PTK items: chỉ kiểm tra itemStatus hoặc order.status trực tiếp
    return iStatus === "SUSPENDED" || (!iStatus && order.status === "SUSPENDED");
  }
  return (
    iStatus === "SUSPENDED" ||
    (!iStatus && order.status === "SUSPENDED") ||
    (!isTerminalItem && order.isSuspended)
  );
}

// ⚠️ TRƯỚC ĐÂY Ở ĐÂY LÀ MỘT BẢN CHÉP TAY CỦA LUẬT KHOÁ:
//
//     const CRITICAL_LOCK_STATUSES = ["IN_PRODUCTION", "COMPLETED"];
//     function calcIsCriticalLocked(orderStatus: string) { return CRITICAL_LOCK_STATUSES.includes(orderStatus); }
//
// Bốn test dưới đều XANH, và cùng lúc đó chức năng thật đang khoá oan ô Khách hàng của các MO còn
// ở Phòng Thiết Kế trên production. Vì test chỉ kiểm BẢN CHÉP, không kiểm code đang chạy — nên nó
// tạo cảm giác "đã có test" mà không bảo vệ được gì.
//
// Nay gọi thẳng hàm thật. Bốn test dưới giữ nguyên ý nghĩa cũ (bậc trạng thái nào thì khoá), phần
// per-MO và "ô trống vẫn điền được" nằm ở __tests__/order-item-hotfix.test.ts.
function calcIsCriticalLocked(orderStatus: string): boolean {
  return isCriticalFieldLocked({ itemStatus: null, orderStatus, currentValue: "Chị Mai" });
}

function calcIsReadOnly(readOnly: boolean, orderStatus: string): boolean {
  const isTerminal = orderStatus === "COMPLETED" || orderStatus === "CANCELLED";
  return readOnly || isTerminal;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. TRƯỜNG NÀO BỊ KHÓA (không chỉnh sửa được)
// ═══════════════════════════════════════════════════════════════════════════════

describe("A. Trường bị khóa (không chỉnh sửa được)", () => {

  describe("A1. isReadOnly — toàn bộ panel bị khóa", () => {
    it("SALES role → isReadOnly = true (readOnly prop)", () => {
      expect(calcIsReadOnly(true, "IN_DESIGN")).toBe(true);
    });

    it("ADMIN/ORDER/PRODUCTION role → isReadOnly = false", () => {
      expect(calcIsReadOnly(false, "IN_DESIGN")).toBe(false);
    });

    it("Order COMPLETED → isReadOnly = true (terminal)", () => {
      expect(calcIsReadOnly(false, "COMPLETED")).toBe(true);
    });

    it("Order CANCELLED → isReadOnly = true (terminal)", () => {
      expect(calcIsReadOnly(false, "CANCELLED")).toBe(true);
    });

    it("Order DESIGN_APPROVED → isReadOnly = false", () => {
      expect(calcIsReadOnly(false, "DESIGN_APPROVED")).toBe(false);
    });

    it("Order SUSPENDED → isReadOnly = false (không terminal)", () => {
      // SUSPENDED không phải terminal — panel vẫn hiển thị nhưng activeItemSuspended = true
      expect(calcIsReadOnly(false, "SUSPENDED")).toBe(false);
    });
  });

  describe("A2. isCriticalLocked — khóa trường Khách hàng + Sales khi đã vào SX", () => {
    it("IN_PRODUCTION → customerName bị khóa", () => {
      expect(calcIsCriticalLocked("IN_PRODUCTION")).toBe(true);
    });

    it("COMPLETED → customerName bị khóa", () => {
      expect(calcIsCriticalLocked("COMPLETED")).toBe(true);
    });

    it("DESIGN_APPROVED → customerName không bị khóa", () => {
      expect(calcIsCriticalLocked("DESIGN_APPROVED")).toBe(false);
    });

    it("IN_DESIGN → customerName không bị khóa", () => {
      expect(calcIsCriticalLocked("IN_DESIGN")).toBe(false);
    });
  });

  describe("A3. activeItemSuspended — panel bị khóa vì Tạm ngưng", () => {

    it("PTK order bị SUSPENDED (order.status) → panel bị khóa", () => {
      expect(calcActiveItemSuspended({
        activeItem: null,
        order: { status: "SUSPENDED", isSuspended: true },
      })).toBe(true);
    });

    it("PTK order bình thường → panel không bị khóa", () => {
      expect(calcActiveItemSuspended({
        activeItem: null,
        order: { status: "IN_DESIGN", isSuspended: false },
      })).toBe(false);
    });

    it("[BUG ĐÃ FIX] PTK item trong mixed-zone order: order.isSuspended=true (do PSX) → PTK KHÔNG bị khóa", () => {
      // PSX item bị suspend → order.isSuspended = true
      // PTK item (zone=PRE_PRODUCTION) KHÔNG nên bị ảnh hưởng
      expect(calcActiveItemSuspended({
        activeItem: { itemStatus: null, zone: "PRE_PRODUCTION" },
        order: { status: "DESIGN_APPROVED", isSuspended: true },
      })).toBe(false); // FIX: phải là false sau khi sửa lỗi
    });

    it("PTK item có itemStatus=SUSPENDED → bị khóa", () => {
      expect(calcActiveItemSuspended({
        activeItem: { itemStatus: "SUSPENDED", zone: "PRE_PRODUCTION" },
        order: { status: "IN_DESIGN", isSuspended: false },
      })).toBe(true);
    });

    it("PSX item có itemStatus=SUSPENDED → bị khóa", () => {
      expect(calcActiveItemSuspended({
        activeItem: { itemStatus: "SUSPENDED", zone: "MASTER_HUB" },
        order: { status: "IN_PRODUCTION", isSuspended: true },
      })).toBe(true);
    });

    it("PSX item bình thường (IN_PRODUCTION) + order.isSuspended=true → bị khóa", () => {
      // PSX item không có itemStatus riêng → fallback order.isSuspended
      expect(calcActiveItemSuspended({
        activeItem: { itemStatus: null, zone: "MASTER_HUB" },
        order: { status: "IN_PRODUCTION", isSuspended: true },
      })).toBe(true);
    });

    it("PSX item đã COMPLETED → không bị khóa bởi order.isSuspended (terminal)", () => {
      // isTerminalItem = true → bỏ qua order.isSuspended
      expect(calcActiveItemSuspended({
        activeItem: { itemStatus: "COMPLETED", zone: "MASTER_HUB" },
        order: { status: "IN_PRODUCTION", isSuspended: true },
      })).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. TRƯỜNG SHARED — thay đổi 1 MO ảnh hưởng MO khác cùng SO
// ═══════════════════════════════════════════════════════════════════════════════

describe("B. Trường SHARED (chia sẻ giữa các MO cùng Order)", () => {

  describe("B1. toFormState — order-level fields (PATCH /api/orders/[id])", () => {
    it("tất cả order-level fields được map vào form", () => {
      const order = makeOrder({
        customerName:  "Khách test",
        salesName:     "Sales test",
        nguon:         "CH2",
        phanLoaiKh:    "VIP",
        linkChat:      "https://zalo.me/abc",
        donHang3Sao:   true,
        saleNote:      "Ghi chú đặc biệt",
        priorityCode:  "UT1",
        requiredDate:  new Date("2026-06-01").toISOString(),
        estimatedDate: new Date("2026-05-15").toISOString(),
        status:        "IN_DESIGN",
      });

      const form = toFormState(order);

      // PanelForm now only contains shared editable fields (locked/per-MO fields moved)
      expect(form.status).toBe("IN_DESIGN");
      expect(form.linkChat).toBe("https://zalo.me/abc");
      expect(form.donHang3Sao).toBe(true);
      // customerName, salesName → LOCKED (read from order.xxx directly)
      // nguon, phanLoaiKh → SHARED editable fields.
      // saleNote, priorityCode, estimatedDate, requiredDate → PER-MO (in itemForms)
    });

    it("⚠ LOCKED: customerName, salesName không có trong PanelForm", () => {
      const order = makeOrder({ customerName: "Khách test", salesName: "Duy" });
      const form = toFormState(order);

      // Các trường này bị KHÓA — không có trong form, không thể sửa qua panel
      expect(form).not.toHaveProperty("customerName");
      expect(form).not.toHaveProperty("salesName");
      expect(form).toHaveProperty("nguon");
      expect(form).toHaveProperty("phanLoaiKh");

      // Muốn sửa → đọc trực tiếp từ order.customerName (read-only display)
      expect(order.customerName).toBe("Khách test");
    });

    it("DANH SÁCH trường SHARED trong PanelForm:", () => {
      const sharedFields = [
        "status",       // Trạng thái MO (PTK workflow)
        "nguon",        // Nguồn / cửa hàng
        "phanLoaiKh",   // Phân loại khách
        "linkChat",     // Link chat chung
        "donHang3Sao",  // 3 sao chung
      ];

      const form = toFormState(makeOrder());

      // Chỉ 3 trường này trong PanelForm
      for (const field of sharedFields) {
        expect(form).toHaveProperty(field);
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. TRƯỜNG ISOLATED — mỗi MO độc lập
// ═══════════════════════════════════════════════════════════════════════════════

describe("C. Trường ISOLATED (mỗi MO độc lập)", () => {

  describe("C1. toItemForm — item-level fields (PATCH /api/orders/[id]/items/[itemId])", () => {
    it("tất cả item-level fields được map đúng", () => {
      const item = makeItem({
        productName:   "Nhẫn kim cương",
        nvl:           "18K",
        platingType:   "Trắng",
        size:          "52mm",
        weightGram:    5.5 as unknown as null,
        mainStoneType: "XOÀN TN",
        mainStoneSize: "RD3mm",
        specifications: {
          chiTietDaTam: "3 viên tấm",
          ghiChuSp:     "Ghi chú item riêng",
        },
      });

      const form = toItemForm(item);

      expect(form.productName).toBe("Nhẫn kim cương");
      expect(form.nvl).toBe("18K");
      expect(form.platingType).toBe("Trắng");
      expect(form.size).toBe("52mm");
      expect(form.weightGram).toBe("5.5");
      expect(form.mainStoneType).toBe("XOÀN TN");
      expect(form.mainStoneSize).toBe("RD3mm");
      expect(form.chiTietDaTam).toBe("3 viên tấm");
      expect(form.ghiChuSp).toBe("Ghi chú item riêng");
    });

    it("⚠ ISOLATED: thay đổi nvl item-1 → KHÔNG ảnh hưởng item-2", () => {
      const item1 = makeItem({ id: "item-1", nvl: "18K" });
      const item2 = makeItem({ id: "item-2", nvl: "14K" });

      const form1 = toItemForm(item1);
      const form2 = toItemForm(item2);

      // Item-level fields độc lập
      expect(form1.nvl).toBe("18K");
      expect(form2.nvl).toBe("14K");

      // Thay đổi item-1 KHÔNG ảnh hưởng item-2
      const form1Updated = toItemForm({ ...item1, nvl: "24K" });
      expect(form1Updated.nvl).toBe("24K");
      expect(form2.nvl).toBe("14K"); // item-2 không thay đổi
    });

    it("DANH SÁCH trường ISOLATED (item-level) — bao gồm per-MO fields mới:", () => {
      const isolatedFields = [
        "productName",    // Tên sản phẩm
        "nvl",            // NVL (nguyên vật liệu)
        "platingType",    // Mạ xi
        "size",           // Size
        "weightGram",     // Trọng lượng yêu cầu
        "mainStoneType",  // Loại đá chủ
        "mainStoneSize",  // Đá chủ (kích thước)
        "chiTietDaTam",   // Chi tiết đá tấm
        "ghiChuSp",       // Ghi chú SP
        "designFileUrl",  // File 3D
        // Per-MO fields (mới — đã chuyển từ Order sang OrderItem)
        "estimatedDate",  // Ngày chốt SX — mỗi MO có deadline riêng
        "requiredDate",   // Ngày DK hoàn thành — mỗi MO có deadline riêng
        "saleNote",       // Cảnh báo ĐB — mỗi MO có ghi chú riêng
        "priorityCode",   // Ưu tiên — mỗi MO có độ ưu tiên riêng
      ];

      const form = toItemForm(makeItem());

      for (const field of isolatedFields) {
        expect(form).toHaveProperty(field);
      }
    });

    it("per-MO: estimatedDate, requiredDate, saleNote, priorityCode độc lập giữa các MO", () => {
      const item1 = makeItem({ id: "item-1", estimatedDate: "2026-05-01" as unknown as null, priorityCode: "UT1" } as any);
      const item2 = makeItem({ id: "item-2", estimatedDate: "2026-06-15" as unknown as null, priorityCode: "Normal" } as any);

      const form1 = toItemForm(item1 as any);
      const form2 = toItemForm(item2 as any);

      expect(form1.estimatedDate).toBe("2026-05-01");
      expect(form2.estimatedDate).toBe("2026-06-15");
      expect(form1.priorityCode).toBe("UT1");
      expect(form2.priorityCode).toBe("Normal");
    });
  });

  describe("C2. toProductionForm — per-MO production data isolation (extraData.perItem)", () => {
    it("khi không có activeItemId → đọc extraData chung", () => {
      const order = makeOrder({
        zone: "MASTER_HUB",
        status: "IN_PRODUCTION",
        productionDetail: {
          id: "pd-1",
          orderId: "order-1",
          productionCode: "26.123456",
          extraData: {
            tl3d: "5.2",
            tlXuong: "4.8",
          },
        } as any,
      });

      const form = toProductionForm(order, null);
      expect(form.tl3d).toBe("5.2");
      expect(form.tlXuong).toBe("4.8");
    });

    it("khi activeItemId có perItem data → đọc data riêng của item đó", () => {
      const order = makeOrder({
        zone: "MASTER_HUB",
        status: "IN_PRODUCTION",
        productionDetail: {
          id: "pd-1",
          orderId: "order-1",
          productionCode: "26.123456",
          extraData: {
            tl3d: "5.2",     // shared
            perItem: {
              "item-1": { tl3d: "3.1", tlXuong: "2.9" },   // MO-1 độc lập
              "item-2": { tl3d: "7.5", tlXuong: "7.1" },   // MO-2 độc lập
            },
          },
        } as any,
      });

      const formItem1 = toProductionForm(order, "item-1");
      const formItem2 = toProductionForm(order, "item-2");

      // Mỗi MO có data riêng
      expect(formItem1.tl3d).toBe("3.1");
      expect(formItem2.tl3d).toBe("7.5");

      // Thay đổi item-1 KHÔNG ảnh hưởng item-2
      expect(formItem1.tlXuong).toBe("2.9");
      expect(formItem2.tlXuong).toBe("7.1");
    });

    it("toStageForms — stages per MO độc lập qua perItem[id].stages", () => {
      const pd = {
        id: "pd-1",
        orderId: "order-1",
        resinCrafter: null, resinStartAt: null, resinDoneAt: null,
        castingCrafter: null, castingStartAt: null, castingDoneAt: null,
        handcraftCrafter: null, handcraftStartAt: null, handcraftDoneAt: null,
        coldworkCrafter: null, coldworkStartAt: null, coldworkDoneAt: null,
        settingCrafter: null, settingStartAt: null, settingDoneAt: null,
        machineCrafter: null, machineStartAt: null, machineDoneAt: null,
        platingCrafter: null, platingStartAt: null, platingDoneAt: null,
        qcCrafter: null, qcStartAt: null, qcDoneAt: null,
        productionCode: "26.123456",
        workshopCode: null, workshopName: null, supervisorName: null,
        internalNote: null, createdAt: new Date(), updatedAt: new Date(),
        extraData: {
          perItem: {
            "item-1": {
              stages: {
                RESIN: { stageStatus: "done",  crafter: "Thợ A", startAt: "2026-01-01", doneAt: "2026-01-02" },
                DUC:   { stageStatus: "doing", crafter: "Thợ B", startAt: "2026-01-02", doneAt: null },
              },
            },
            "item-2": {
              stages: {
                RESIN: { stageStatus: "pending", crafter: "", startAt: null, doneAt: null },
              },
            },
          },
        },
      } as any;

      const stages1 = toStageForms(pd, "item-1");
      const stages2 = toStageForms(pd, "item-2");

      const resinStage1 = stages1.find(s => s.code === "RESIN")!;
      const resinStage2 = stages2.find(s => s.code === "RESIN")!;

      // MO-1 và MO-2 có stage data khác nhau → độc lập
      expect(resinStage1.stageStatus).toBe("done");
      expect(resinStage2.stageStatus).toBe("pending");
      expect(resinStage1.crafter).toBe("Thợ A");
      expect(resinStage2.crafter).toBe("");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. TỔNG HỢP — Phân loại tất cả trường
// ═══════════════════════════════════════════════════════════════════════════════

describe("D. Bảng phân loại trường — tóm tắt hành vi", () => {

  it("SHARED fields: áp dụng cho cả SO, lưu qua PATCH /orders/[id]", () => {
    // Shared editable fields in PanelForm.
    const SHARED = {
      "Trạng thái MO": { field: "status",      note: "PTK workflow" },
      "Nguồn":         { field: "nguon",       note: "Chung cho cả SO" },
      "Phân loại KH":  { field: "phanLoaiKh",  note: "Chung cho cả SO" },
      "Link Chat":     { field: "linkChat",    note: "Chung cho cả SO" },
      "3 Sao":         { field: "donHang3Sao", note: "Chung cho cả SO" },
    };

    const order = makeOrder();
    const form = toFormState(order);
    for (const [, { field }] of Object.entries(SHARED)) {
      expect(form).toHaveProperty(field);
    }
    expect(Object.keys(SHARED)).toHaveLength(5);
  });

  it("LOCKED fields: không thể sửa sau khi tạo — đọc từ order.xxx", () => {
    const LOCKED = ["customerName", "salesName"];
    const order = makeOrder();
    const form = toFormState(order);
    // Các trường này không có trong form (không thể gửi qua PATCH)
    for (const field of LOCKED) {
      expect(form).not.toHaveProperty(field);
    }
    // Nhưng vẫn đọc được từ order (hiển thị read-only)
    expect(order.customerName).toBeTruthy();
  });

  it("ISOLATED fields: mỗi MO có giá trị riêng — không ảnh hưởng nhau", () => {
    const ISOLATED = {
      // Tab Sản phẩm — PATCH /orders/[id]/items/[itemId]
      "Tên SP":           { field: "productName"   },
      "NVL":              { field: "nvl"           },
      "Mạ xi":            { field: "platingType"   },
      "Size":             { field: "size"          },
      "Trọng lượng YC":   { field: "weightGram"    },
      "Loại đá chủ":      { field: "mainStoneType" },
      "Đá chủ (kích thước)": { field: "mainStoneSize" },
      "Chi tiết đá tấm":  { field: "chiTietDaTam"  },
      "Ghi chú SP":       { field: "ghiChuSp"      },
      "File thiết kế 3D": { field: "designFileUrl" },
      // Per-MO scheduling — chuyển từ Order → OrderItem (mới)
      "Ngày chốt SX":     { field: "estimatedDate" },
      "Ngày DK HT":       { field: "requiredDate"  },
      "Cảnh báo ĐB":      { field: "saleNote"      },
      "Ưu tiên":          { field: "priorityCode"  },
    };

    const form = toItemForm(makeItem());
    for (const [, { field }] of Object.entries(ISOLATED)) {
      expect(form).toHaveProperty(field);
    }
    expect(Object.keys(ISOLATED)).toHaveLength(14);
  });

  it("READ-ONLY fields (auto-calc — không thể sửa trực tiếp)", () => {
    const READ_ONLY = {
      "QĐ 24K":       "tự động tính từ NVL + TL 3D",
      "QĐ PT":        "tự động tính từ NVL + TL 3D",
      "Đánh giá TL":  "tự động tính từ TL Xưởng vs TL Thực tế HT",
      "% Chênh lệch": "tự động tính từ TL Xưởng vs TL Thực tế HT",
      "MO#":          "từ Odoo — không thể sửa qua panel",
      "SO#":          "từ Odoo — không thể sửa qua panel",
      "Ngày tạo":     "set khi tạo đơn — không thể sửa",
      "Tuần dự kiến": "tính từ requiredDate",
    };

    // Kiểm tra calcAutoProduction trả về đúng
    const result = calcAutoProduction("18K", 5.0, 4.8, 4.7);
    expect(result.qd24k).toBeTruthy();
    expect(result.qdPt).toBe(""); // 18K không có PT
    expect(result.danhGiaTl).toBeTruthy();
    expect(result.pctChenLech).toBeTruthy();

    expect(Object.keys(READ_ONLY)).toHaveLength(8);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. AUTO-CALC — QĐ, Đánh giá TL
// ═══════════════════════════════════════════════════════════════════════════════

describe("E. Auto-calc fields (read-only, tự động tính)", () => {
  it("18K: tính QĐ 24K đúng", () => {
    const { qd24k, qdPt } = calcAutoProduction("18K", 5.0, 0, 0);
    expect(parseFloat(qd24k)).toBeCloseTo(5.0 * 18 / 24 / 0.9999, 2);
    expect(qdPt).toBe(""); // không có Platinum
  });

  it("PT950: tính QĐ PT đúng", () => {
    const { qdPt, qd24k } = calcAutoProduction("PT950", 4.0, 0, 0);
    expect(parseFloat(qdPt)).toBeCloseTo(4.0 * 0.95, 2);
    expect(qd24k).toBe(""); // không có vàng
  });

  it("Đánh giá TL: |chênh lệch| ≤ 5% → Đạt", () => {
    const { danhGiaTl, pctChenLech } = calcAutoProduction("18K", 5.0, 4.8, 4.9);
    // pct = (4.8 - 4.9) / 4.9 * 100 ≈ -2.04%
    expect(danhGiaTl).toBe("Đạt");
    expect(Math.abs(parseFloat(pctChenLech))).toBeLessThanOrEqual(5);
  });

  it("Đánh giá TL: |chênh lệch| > 5% → Không đạt", () => {
    const { danhGiaTl } = calcAutoProduction("18K", 5.0, 4.8, 5.5);
    // pct = (5.5 - 4.8) / 4.8 * 100 ≈ 14.6%
    expect(danhGiaTl).toBe("Không đạt");
  });

  it("Không có TL xưởng hoặc TL thực tế → không tính được", () => {
    const { danhGiaTl, pctChenLech } = calcAutoProduction("18K", 5.0, 0, 0);
    expect(danhGiaTl).toBe("");
    expect(pctChenLech).toBe("");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. getBaseSoNumber — MO# parsing
// ═══════════════════════════════════════════════════════════════════════════════

describe("F. SO# / MO# parsing", () => {
  it("3-part (26.123.1) → strip version suffix", () => {
    expect(getBaseSoNumber("26.123456.1")).toBe("26.123456");
    expect(getBaseSoNumber("26.123456.2")).toBe("26.123456");
  });

  it("2-part (26.123456) → giữ nguyên (Odoo SO#)", () => {
    expect(getBaseSoNumber("26.123456")).toBe("26.123456");
  });

  it("MO# = SO# (không có suffix) → giữ nguyên", () => {
    expect(getBaseSoNumber("26.99887766")).toBe("26.99887766");
  });

  it("1-part → giữ nguyên", () => {
    expect(getBaseSoNumber("12345")).toBe("12345");
  });
});
