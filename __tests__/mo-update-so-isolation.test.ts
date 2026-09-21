/**
 * mo-update-so-isolation.test.ts
 *
 * Kiểm tra: khi user cập nhật TẤT CẢ các trường của 1 MO (OrderItem) qua
 * PATCH /api/orders/[id]/items/[itemId], thì:
 *   - Chỉ đúng MO đó được ghi (orderItem.update where id = itemId).
 *   - SO (Order) KHÔNG bị cập nhật giá trị trường nào — chỉ bump updatedAt.
 *   - MO anh em (sibling) KHÔNG bị đụng tới.
 *   - Ghi đè riêng theo MO (Khách hàng/Sales/3 Sao/Link chat) vào item.specifications,
 *     KHÔNG ghi vào Order.customerName/salesName/... cấp SO.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/auth-helpers", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ dbId: "user-1", id: "user-1", role: "ORDER" }),
}));

// ─── Prisma mock ────────────────────────────────────────────────────────────────
function makeMockTx() {
  return {
    orderItem: {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: "item-1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    order: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: "order-1", version: 2 }),
    },
    productionDetail: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    workflowHistory: { create: vi.fn().mockResolvedValue({}) },
    alert: { update: vi.fn(), updateMany: vi.fn() },
  };
}

let mockPrisma: ReturnType<typeof makeMockTx>;
vi.mock("@/app/lib/prisma", () => ({
  get prisma() {
    return { $transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma) };
  },
}));

function makeRequest(body: Record<string, unknown>) {
  return { json: () => Promise.resolve(body) } as unknown as import("next/server").NextRequest;
}

// SO có 2 MO cùng đơn — SALES/nguồn cấp SO để kiểm tra không bị đụng.
function makeOrder() {
  return {
    id: "order-1",
    orderNumber: "26.10680",
    version: 1,
    zone: "PRE_PRODUCTION",
    status: "IN_DESIGN",
    isSuspended: false,
    customerName: "KH cấp SO",
    salesName: "Sales cấp SO",
    nguon: "CH1",
    phanLoaiKh: "KH",
    donHang3Sao: false,
    saleNote: "ghi chú SO",
    deletedAt: null,
    productionDetail: null,
  };
}
function makeExistingItem() {
  return {
    id: "item-1",
    orderId: "order-1",
    moNumber: "26.10680",
    itemStatus: null,
    productName: "Nhẫn cũ",
    nvl: "18KY",
    specifications: {},
  };
}

const { PATCH } = await import("@/app/api/orders/[id]/items/[itemId]/route");

// Body gồm TẤT CẢ trường sửa được của MO (updateOrderItemSchema)
const FULL_BODY = {
  version: 1,
  itemStatus: "IN_DESIGN",
  moNumber: "26.10680-NEW",
  productName: "Nhẫn MỚI",
  nvl: "24K",
  platingType: "Vàng hồng",
  size: "18",
  weightGram: 5.5,
  mainStoneType: "Kim cương",
  mainStoneSize: "4mm",
  designFileUrl: "https://example/file",
  specifications: {
    ghiChuSp: "ghi chú SP",
    chiTietDaTam: "đá tấm",
    customerName: "KH RIÊNG MO",      // per-MO override → phải vào item.specifications
    salesName: "Sales RIÊNG MO",
    donHang3SaoOverride: true,
    linkChatOverride: "https://zalo.me/mo",
  },
  estimatedDate: "2026-07-20T00:00:00.000Z",
  requiredDate: "2026-07-25T00:00:00.000Z",
  saleNote: "ghi chú riêng MO",
  priorityCode: "UT1",
  techClassification: ["TRƠN"],
  techNote: "diễn giải SP",
};

// Các trường CẤP SO tuyệt đối không được xuất hiện trong data ghi vào Order.
const SO_LEAK_FIELDS = ["customerName", "salesName", "nguon", "phanLoaiKh", "donHang3Sao",
  "productName", "nvl", "size", "weightGram", "platingType", "mainStoneType", "mainStoneSize",
  "moNumber", "itemStatus", "techNote", "techClassification", "priorityCode", "version"];

describe("Sửa TẤT CẢ trường MO → không cập nhật SO/MO khác", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = makeMockTx();
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder());
    mockPrisma.orderItem.findFirst.mockResolvedValue(makeExistingItem());
  });

  async function run() {
    const res = await PATCH(makeRequest(FULL_BODY), {
      params: Promise.resolve({ id: "order-1", itemId: "item-1" }),
    });
    return res;
  }

  it("Ghi ĐÚNG MO đang sửa (orderItem.update where id = item-1)", async () => {
    const res = await run();
    expect(res.status).toBe(200);
    expect(mockPrisma.orderItem.update).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.orderItem.update.mock.calls[0][0] as { where: { id: string }; data: Record<string, unknown> };
    expect(arg.where).toEqual({ id: "item-1" });
    // Trường MO ghi đúng giá trị mới
    expect(arg.data.productName).toBe("Nhẫn MỚI");
    expect(arg.data.nvl).toBe("24K");
    expect(arg.data.priorityCode).toBe("UT1");
    expect(arg.data.techNote).toBe("diễn giải SP");
  });

  it("SO (Order) KHÔNG bị cập nhật trường nào — chỉ bump updatedAt", async () => {
    await run();
    // Mọi lời gọi order.update chỉ được chứa updatedAt, không rò trường cấp SO/MO.
    for (const call of mockPrisma.order.update.mock.calls) {
      const data = (call[0] as { data: Record<string, unknown> }).data;
      for (const f of SO_LEAK_FIELDS) {
        expect(data).not.toHaveProperty(f);
      }
      expect(Object.keys(data)).toEqual(["updatedAt"]);
    }
  });

  it("MO anh em (item-2) KHÔNG bị đụng tới", async () => {
    await run();
    const touchedIds = mockPrisma.orderItem.update.mock.calls.map(
      (c) => (c[0] as { where: { id: string } }).where.id
    );
    expect(touchedIds).toEqual(["item-1"]);
    expect(touchedIds).not.toContain("item-2");
  });

  it("Ghi đè Khách hàng/Sales/3 Sao/Link chat riêng MO → vào item.specifications, KHÔNG vào Order", async () => {
    await run();
    const itemData = (mockPrisma.orderItem.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    const specs = itemData.specifications as Record<string, unknown>;
    expect(specs.customerName).toBe("KH RIÊNG MO");
    expect(specs.salesName).toBe("Sales RIÊNG MO");
    expect(specs.donHang3SaoOverride).toBe(true);
    expect(specs.linkChatOverride).toBe("https://zalo.me/mo");
    // Order.customerName/salesName cấp SO giữ nguyên — không bị override MO ghi đè
    for (const call of mockPrisma.order.update.mock.calls) {
      const data = (call[0] as { data: Record<string, unknown> }).data;
      expect(data).not.toHaveProperty("customerName");
      expect(data).not.toHaveProperty("salesName");
    }
  });

  it("Ngày/ghi chú/ưu tiên riêng MO ghi vào OrderItem, không vào Order", async () => {
    await run();
    const itemData = (mockPrisma.orderItem.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(itemData.estimatedDate).toBeInstanceOf(Date);
    expect(itemData.requiredDate).toBeInstanceOf(Date);
    expect(itemData.saleNote).toBe("ghi chú riêng MO");
    expect(itemData.priorityCode).toBe("UT1");
    for (const call of mockPrisma.order.update.mock.calls) {
      const data = (call[0] as { data: Record<string, unknown> }).data;
      expect(data).not.toHaveProperty("saleNote");
      expect(data).not.toHaveProperty("estimatedDate");
      expect(data).not.toHaveProperty("requiredDate");
    }
  });
});
