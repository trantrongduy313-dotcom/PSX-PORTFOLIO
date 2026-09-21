/**
 * Test: Per-MO zone independence khi promote
 *
 * Kịch bản chính:
 *   Đơn hàng có 2 MO (item1, item2) cùng SO.
 *   Khi user promote item1 → chỉ item1.zone = MASTER_HUB.
 *   item2.zone vẫn là PRE_PRODUCTION.
 */

import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest";

// ─── Mock các dependency trước khi import route ────────────────────────────────

// Mock server-only (Next.js server module guard)
vi.mock("server-only", () => ({}));

// Mock auth
vi.mock("@/app/lib/auth-helpers", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ id: "user-1", role: "ORDER" }),
}));

// Mock order-helpers (dùng real implementation)
vi.mock("@/app/lib/utils/order-helpers", async (importOriginal) => {
  return await importOriginal();
});

// ─── Prisma mock factory ────────────────────────────────────────────────────────

function makeMockTx(overrides: Record<string, unknown> = {}) {
  return {
    order: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: "order-1", version: 2 }),
    },
    orderItem: {
      // Phép kiểm trùng MO nay dùng findMany + lọc bản HUỶ ở tầng JS bằng đúng vị từ mà huy hiệu
      // dùng (isLivePsxItem) — không diễn đạt lại luật đó bằng cú pháp `where` của Prisma.
      // Mảng rỗng = không có bản trùng nào.
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    productionDetail: {
      findUnique: vi.fn().mockResolvedValue(null), // chưa có detail
      create: vi.fn().mockResolvedValue({ id: "pd-1" }),
      update: vi.fn().mockResolvedValue({ id: "pd-1" }),
    },
    workflowHistory: {
      create: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

// Build một order fixture với 2 items
function makeOrder(item1Zone = "PRE_PRODUCTION", item2Zone = "PRE_PRODUCTION") {
  return {
    id: "order-1",
    orderNumber: "26.10680",
    version: 1,
    zone: "PRE_PRODUCTION",
    status: "DESIGN_APPROVED",
    isSuspended: false,
    customerName: "Nguyễn Văn A",
    salesName: "Sales B",
    deletedAt: null,
    items: [
      {
        id: "item-1",
        moNumber: "26.10680",
        nvl: "18KY",
        zone: item1Zone,
        itemStatus: item1Zone === "MASTER_HUB" ? "IN_PRODUCTION" : null,
      },
      {
        id: "item-2",
        moNumber: "26.10680-2",
        nvl: "18KW",
        zone: item2Zone,
        itemStatus: item2Zone === "MASTER_HUB" ? "IN_PRODUCTION" : null,
      },
    ],
  };
}

// Helper: tạo NextRequest giả
function makeRequest(body: Record<string, unknown>) {
  return {
    json: () => Promise.resolve(body),
  } as unknown as import("next/server").NextRequest;
}

// Lazy import sau khi mocks đã khai báo
let mockPrisma: ReturnType<typeof makeMockTx>;

vi.mock("@/app/lib/prisma", () => ({
  get prisma() {
    return {
      $transaction: async (
        callback: (tx: unknown) => Promise<unknown>,
        _opts?: unknown
      ) => {
        return callback(mockPrisma);
      },
    };
  },
}));

// Import route sau khi mock setup xong
const { POST } = await import("@/app/api/orders/[id]/promote/route");

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/orders/[id]/promote — per-MO zone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Promote MO1, MO2 phải ở lại PTK ──────────────────────────────────────
  it("chỉ cập nhật zone cho MO được chỉ định (activeItemId), MO còn lại giữ nguyên", async () => {
    const order = makeOrder(); // cả 2 items đều PRE_PRODUCTION
    mockPrisma = makeMockTx();
    mockPrisma.order.findUnique.mockResolvedValue(order);

    const req = makeRequest({ version: 1, activeItemId: "item-1" });
    const res = await POST(req, { params: Promise.resolve({ id: "order-1" }) });

    expect(res.status).toBe(200);

    // updateMany phải được gọi với filter chỉ item-1
    expect(mockPrisma.orderItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "item-1" },
        data: expect.objectContaining({ zone: "MASTER_HUB" }),
      })
    );

    // KHÔNG gọi updateMany cho tất cả order items (orderId: "order-1")
    const allCalls = (mockPrisma.orderItem.updateMany as MockInstance).mock.calls;
    const broadUpdate = allCalls.find(
      (args: any) => {
        const arg = args[0] as { where?: { orderId?: string; id?: string } } | undefined;
        return arg?.where?.orderId === "order-1" && !("id" in (arg?.where ?? {}));
      }
    );
    expect(broadUpdate).toBeUndefined();
  });

  // ── 2. Promote MO2 sau khi MO1 đã ở PSX ─────────────────────────────────────
  it("cho phép promote MO2 khi MO1 đã là MASTER_HUB (ProductionDetail đã tồn tại)", async () => {
    // MO1 đã MASTER_HUB, MO2 vẫn PRE_PRODUCTION
    const order = makeOrder("MASTER_HUB", "PRE_PRODUCTION");
    order.zone = "MASTER_HUB" as typeof order.zone; // order-level zone đã thay đổi
    order.status = "IN_PRODUCTION";

    mockPrisma = makeMockTx();
    mockPrisma.order.findUnique.mockResolvedValue(order);
    // ProductionDetail ĐÃ TỒN TẠI
    mockPrisma.productionDetail.findUnique.mockResolvedValue({ id: "pd-1", orderId: "order-1" });
    // MO2 có itemStatus DESIGN_APPROVED (per-item override)
    order.items[1].itemStatus = "DESIGN_APPROVED" as typeof order.items[1]["itemStatus"];

    const req = makeRequest({ version: 1, activeItemId: "item-2" });
    const res = await POST(req, { params: Promise.resolve({ id: "order-1" }) });

    expect(res.status).toBe(200);

    // Phải update zone cho item-2
    expect(mockPrisma.orderItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "item-2" },
        data: expect.objectContaining({ zone: "MASTER_HUB" }),
      })
    );

    // KHÔNG tạo thêm ProductionDetail (đã tồn tại)
    expect(mockPrisma.productionDetail.create).not.toHaveBeenCalled();
    expect(mockPrisma.productionDetail.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: "order-1" },
      })
    );
  });

  // ── 3. Block promote item đã ở MASTER_HUB ────────────────────────────────────
  it("trả về 400 WRONG_ZONE khi item đã ở MASTER_HUB", async () => {
    const order = makeOrder("MASTER_HUB", "PRE_PRODUCTION");
    order.zone = "MASTER_HUB" as typeof order.zone;

    mockPrisma = makeMockTx();
    mockPrisma.order.findUnique.mockResolvedValue(order);

    const req = makeRequest({ version: 1, activeItemId: "item-1" });
    const res = await POST(req, { params: Promise.resolve({ id: "order-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
    // updateMany KHÔNG được gọi
    expect(mockPrisma.orderItem.updateMany).not.toHaveBeenCalled();
  });

  // ── 4. Promote cả order (không có activeItemId) → tất cả items về PSX ────────
  it("promote toàn bộ order (không activeItemId) → updateMany theo orderId", async () => {
    const order = makeOrder();
    mockPrisma = makeMockTx();
    mockPrisma.order.findUnique.mockResolvedValue(order);

    const req = makeRequest({ version: 1 }); // không có activeItemId
    const res = await POST(req, { params: Promise.resolve({ id: "order-1" }) });

    expect(res.status).toBe(200);

    // updateMany phải được gọi với orderId (tất cả items)
    expect(mockPrisma.orderItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: "order-1" },
        data: expect.objectContaining({ zone: "MASTER_HUB" }),
      })
    );
  });

  // ── 5. Block khi optimistic lock conflict ─────────────────────────────────────
  it("trả về 409 khi version không khớp", async () => {
    const order = makeOrder();
    order.version = 5; // DB version 5, client gửi 1

    mockPrisma = makeMockTx();
    mockPrisma.order.findUnique.mockResolvedValue(order);

    const req = makeRequest({ version: 1, activeItemId: "item-1" });
    const res = await POST(req, { params: Promise.resolve({ id: "order-1" }) });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
  });

  // ── 6. Block khi trạng thái không phải DESIGN_APPROVED ───────────────────────
  it("trả về 400 khi item chưa ở trạng thái Chốt 3D", async () => {
    const order = makeOrder();
    order.status = "IN_DESIGN"; // chưa được duyệt
    (order.items[0] as any).itemStatus = null;

    mockPrisma = makeMockTx();
    mockPrisma.order.findUnique.mockResolvedValue(order);

    const req = makeRequest({ version: 1, activeItemId: "item-1" });
    const res = await POST(req, { params: Promise.resolve({ id: "order-1" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("Chốt 3D");
  });
});
