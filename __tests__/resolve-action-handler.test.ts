import { describe, expect, it, vi } from "vitest";

// Route keo theo next-auth qua auth-helpers; test nay chi can `handleAction` nen chan o bien.
vi.mock("@/app/lib/auth-helpers", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/app/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/app/lib/rate-limit", () => ({
  checkActionRateLimit: vi.fn(), rateLimitMessage: vi.fn(),
}));

import { handleAction } from "@/app/api/orders/[id]/resolve-action/route";

// 821 dòng, 0 test, và nó chạm các hành động TERMINAL trên đơn thật: Hủy & Bàn giao, Tiếp tục
// sản xuất, Chuyển Showroom, Mở lại.
//
// Đo trước khi sửa cho thấy đây KHÔNG phải "luật thuần trốn trong route": 11 nhánh, nhánh nào
// cũng 2–11 lệnh ghi DB trong 24–121 dòng. Nó là ĐIỀU PHỐI. Rút ra `app/lib/business` sẽ chỉ
// sinh ra một tá hàm một dòng — nên thay vì tách, bơm một `tx` giả và đọc lại chuỗi lệnh ghi.

type Call = { model: string; method: string; args: Record<string, unknown> };

/** `tx` giả: ghi lại mọi lệnh, trả về cái test dặn trước. */
function fakeTx(seed: {
  order?: Record<string, unknown> | null;
  workflowHistory?: Record<string, unknown> | null;
  orderItems?: Record<string, unknown>[];
  alert?: Record<string, unknown> | null;
}) {
  const calls: Call[] = [];
  const record = (model: string, method: string, fallback: unknown = {}) =>
    vi.fn(async (args: Record<string, unknown> = {}) => {
      calls.push({ model, method, args });
      return fallback;
    });

  const tx = {
    order: {
      findUnique: record("order", "findUnique", seed.order ?? null),
      update: record("order", "update", { id: "so-1", ...(seed.order ?? {}) }),
    },
    orderItem: {
      update: record("orderItem", "update"),
      updateMany: record("orderItem", "updateMany", { count: 1 }),
      findMany: record("orderItem", "findMany", seed.orderItems ?? []),
    },
    workflowHistory: {
      create: record("workflowHistory", "create"),
      findFirst: record("workflowHistory", "findFirst", seed.workflowHistory ?? null),
    },
    productionDetail: { update: record("productionDetail", "update") },
    alert: {
      create: record("alert", "create"),
      update: record("alert", "update"),
      updateMany: record("alert", "updateMany", { count: 0 }),
      findFirst: record("alert", "findFirst", seed.alert ?? null),
    },
    user: {
      findFirst: record("user", "findFirst", { id: "u-1" }),
      create: record("user", "create", { id: "u-1" }),
    },
  };

  const of = (model: string, method: string) =>
    calls.filter((c) => c.model === model && c.method === method);
  return { tx, calls, of };
}

const suspendedOrder = (over: Record<string, unknown> = {}) => ({
  id: "so-1", version: 3, status: "SUSPENDED", isSuspended: true,
  customerName: "Khach A", productionDetail: { orderId: "so-1", extraData: {} },
  ...over,
});

const run = (tx: unknown, input: Record<string, unknown>) =>
  handleAction(tx as never, "so-1", input as never);

describe("chốt chặn trước mọi hành động", () => {
  it("không tìm thấy đơn → NOT_FOUND, không ghi gì", async () => {
    const { tx, calls } = fakeTx({ order: null });

    const result = await run(tx, { action: "RESUME", version: 1 });

    expect(result.tag).toBe("NOT_FOUND");
    expect(calls.filter((c) => c.method !== "findUnique")).toEqual([]);
  });

  // 🔴 Khoá lạc quan. Hai người cùng mở một đơn, người sau bấm sau: version đã đổi nên phải bị
  // chặn, nếu không thay đổi của người trước bị ghi đè im lặng.
  it("version lệch → CONFLICT, không ghi gì", async () => {
    const { tx, calls } = fakeTx({ order: suspendedOrder({ version: 5 }) });

    const result = await run(tx, { action: "RESUME", version: 3 });

    expect(result.tag).toBe("CONFLICT");
    expect(calls.filter((c) => c.method !== "findUnique")).toEqual([]);
  });
});

describe("RESUME — Tiếp tục sản xuất", () => {
  const base = { action: "RESUME", version: 3, performedById: "u-1" };

  it("đơn KHÔNG đang tạm ngưng → BAD_REQUEST", async () => {
    const { tx } = fakeTx({ order: suspendedOrder({ isSuspended: false }) });

    const result = await run(tx, base);

    expect(result.tag).toBe("BAD_REQUEST");
  });

  // Khôi phục về ĐÚNG trạng thái trước khi ngưng, đọc từ WorkflowHistory — không đoán.
  it("trả đơn về trạng thái trước khi ngưng", async () => {
    const { tx, of } = fakeTx({
      order: suspendedOrder(),
      workflowHistory: { fromStatus: "QUALITY_CHECK", metadata: {} },
    });

    await run(tx, base);

    const update = of("order", "update")[0].args.data as Record<string, unknown>;
    expect(update.status).toBe("QUALITY_CHECK");
    expect(update.isSuspended).toBe(false);
  });

  // Không có lịch sử ngưng thì KHÔNG được để trống trạng thái — đơn sẽ biến khỏi mọi tab.
  it("không tìm thấy lịch sử ngưng → rơi về IN_DESIGN, không để trống", async () => {
    const { tx, of } = fakeTx({ order: suspendedOrder(), workflowHistory: null });

    await run(tx, base);

    expect((of("order", "update")[0].args.data as Record<string, unknown>).status).toBe("IN_DESIGN");
  });

  it("chuyển Showroom → luôn về IN_PRODUCTION, bỏ qua trạng thái cũ", async () => {
    const { tx, of } = fakeTx({
      order: suspendedOrder(),
      workflowHistory: { fromStatus: "QUALITY_CHECK", metadata: {} },
    });

    await run(tx, { ...base, convertToShowroom: true });

    expect((of("order", "update")[0].args.data as Record<string, unknown>).status).toBe("IN_PRODUCTION");
  });

  // 🔴 ĐỘC LẬP THEO MO. Cảnh báo gắn vào MỘT MO thì chỉ MO đó được chạy lại; xoá hàng loạt là
  // cho chạy lại cả những MO đang ngưng vì lý do khác.
  it("ngưng theo MO → chỉ chạy lại ĐÚNG MO đó", async () => {
    const { tx, of } = fakeTx({
      order: suspendedOrder(),
      workflowHistory: { fromStatus: "IN_PRODUCTION", metadata: { scopedItemId: "mo-a" } },
    });

    await run(tx, base);

    expect(of("orderItem", "update")).toHaveLength(1);
    expect((of("orderItem", "update")[0].args.where as Record<string, unknown>).id).toBe("mo-a");
    expect(of("orderItem", "updateMany")).toHaveLength(0);
  });

  it("ngưng cả đơn → chạy lại mọi MO đang ngưng", async () => {
    const { tx, of } = fakeTx({
      order: suspendedOrder(),
      workflowHistory: { fromStatus: "IN_PRODUCTION", metadata: {} },
    });

    await run(tx, base);

    expect(of("orderItem", "update")).toHaveLength(0);
    expect(of("orderItem", "updateMany")).toHaveLength(1);
  });

  it("gỡ mọi cảnh báo chưa xử lý của đơn", async () => {
    const { tx, of } = fakeTx({ order: suspendedOrder(), workflowHistory: null });

    await run(tx, base);

    const data = of("alert", "updateMany")[0].args.data as Record<string, unknown>;
    expect(data.isResolved).toBe(true);
  });

  it("ghi một dòng lịch sử cho mỗi lần chạy lại", async () => {
    const { tx, of } = fakeTx({ order: suspendedOrder(), workflowHistory: null });

    await run(tx, base);

    expect(of("workflowHistory", "create").length).toBeGreaterThan(0);
  });
});

describe("người thực hiện", () => {
  // `performedById` là FK sang bảng users. "system"/"VIRTUAL_ADMIN" không có trong bảng đó —
  // ghi thẳng vào là lỗi ràng buộc khoá ngoại và cả transaction rollback.
  it.each(["system", "VIRTUAL_ADMIN", "", null, undefined])(
    "%s → ghi null, không ghi chuỗi không có trong bảng users",
    async (performedById) => {
      const { tx, of } = fakeTx({ order: suspendedOrder(), workflowHistory: null });

      await run(tx, { action: "RESUME", version: 3, performedById });

      for (const call of of("workflowHistory", "create")) {
        expect((call.args.data as Record<string, unknown>).performedById).toBeNull();
      }
    },
  );

  it("id người dùng thật → giữ nguyên", async () => {
    const { tx, of } = fakeTx({ order: suspendedOrder(), workflowHistory: null });

    await run(tx, { action: "RESUME", version: 3, performedById: "user-abc" });

    expect((of("workflowHistory", "create")[0].args.data as Record<string, unknown>).performedById)
      .toBe("user-abc");
  });
});
