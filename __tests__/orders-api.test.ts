import { describe, it, expect } from "vitest";

import { createOrderSchema, ordersQuerySchema } from "@/app/lib/schemas/order";
import { orderStatusWhere } from "@/app/lib/business/orders/status-where";
import { scopeOrdersQueryForRole } from "@/app/lib/business/orders/query-scope";

// GET/POST /api/orders — đọc THẲNG từ module thật.
//
// Bản chép cũ ở đây lệch bốn chỗ, và một trong số đó canh một route KHÁC:
//
//   1. Schema truy vấn thiếu `all`, `ids`, `storeId`, `phanLoaiKh`, và `stageFilter` chưa có
//      giới hạn độ dài. (Đã nối module thật ở lần sửa trước.)
//   2. `createOrderSchema` bịa ra trường `zone`; schema thật dùng `loaiDon`. (Đã sửa.)
//   3. 🔴 `computeStatusWhere` của nó có nhánh `psxActive`. Tham số đó KHÔNG TỒN TẠI trong
//      /api/orders — nó thuộc /api/stores/[storeId]/orders. Ba trong tám test của mục đó canh
//      một nhánh không có thật ở route mà file này tự nhận là đang kiểm.
//   4. 🔴 Nó khẳng định tab Đã hủy loại đơn đã Hoàn tất. Route làm NGƯỢC LẠI, và có chủ ý: một
//      SO đã Hoàn tất vẫn có thể có MO bị huỷ riêng, MO đó phải hiện ở tab Đã hủy.
//
// Mục "SALES store scoping" cũng xoá: bản chép của nó thiếu hẳn nhánh thật thứ ba (chọn một
// cửa hàng CÓ trong danh sách được gán thì thu hẹp về đúng cửa hàng đó). Luật thật bám vào
// `getUserStoreIds` nên chưa tách ra được — ghi ra để không ai tưởng là có lưới.
//
// Mục "date boundary" cũng xoá: nó tự viết lại `buildDateFilter` bằng `setHours` rồi kiểm
// `getHours()` của chính mình — hai lần giờ ĐỊA PHƯƠNG, nên trên Vercel (UTC) nó vẫn xanh
// trong khi dự án đã trả giá một lần đúng vì lệch 7 tiếng kiểu này.

// ─── 1. Query schema ──────────────────────────────────────────────────────────

describe("ordersQuerySchema", () => {
  it("applies defaults when no params provided", () => {
    const result = ordersQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.page).toBe(1);
    expect(result.data.limit).toBe(20);
    expect(result.data.sortBy).toBe("orderDate");
    expect(result.data.sortDir).toBe("desc");
    expect(result.data.history).toBe(false);
    expect(result.data.psxActive).toBe(false);
  });

  it("coerces string booleans correctly", () => {
    const result = ordersQuerySchema.safeParse({
      isSuspended: "true",
      isPriority: "false",
      history: "1",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.isSuspended).toBe(true);
    expect(result.data.isPriority).toBe(false);
    expect(result.data.history).toBe(true);
  });

  it("coerces string numbers for page/limit", () => {
    const result = ordersQuerySchema.safeParse({ page: "3", limit: "50" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.page).toBe(3);
    expect(result.data.limit).toBe(50);
  });

  it("rejects invalid zone", () => {
    const result = ordersQuerySchema.safeParse({ zone: "WAREHOUSE" });
    expect(result.success).toBe(false);
  });

  it("rejects limit > 100", () => {
    const result = ordersQuerySchema.safeParse({ limit: "200" });
    expect(result.success).toBe(false);
  });

  it("rejects search longer than 100 chars", () => {
    const result = ordersQuerySchema.safeParse({ search: "a".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("rejects invalid sortBy field", () => {
    const result = ordersQuerySchema.safeParse({ sortBy: "nonexistent" });
    expect(result.success).toBe(false);
  });

  it("accepts valid stageFilter key", () => {
    const result = ordersQuerySchema.safeParse({ stageFilter: "DUC:doing" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.stageFilter).toBe("DUC:doing");
  });
});

// ─── 6. Order creation schema ─────────────────────────────────────────────────

describe("createOrderSchema", () => {
  const baseValid = {
    orderNumber: "26.123456",
    customerName: "Nguyễn Văn A",
    items: [{ productName: "Nhẫn vàng 18k", quantity: 2 }],
  };

  it("accepts a minimal valid payload", () => {
    expect(createOrderSchema.safeParse(baseValid).success).toBe(true);
  });

  it("rejects empty orderNumber", () => {
    expect(createOrderSchema.safeParse({ ...baseValid, orderNumber: "" }).success).toBe(false);
  });

  it("rejects empty customerName", () => {
    expect(createOrderSchema.safeParse({ ...baseValid, customerName: "" }).success).toBe(false);
  });

  // 🔴 Bản chép cũ ở đây bịa ra một trường `zone` và test rằng "WAREHOUSE" bị từ chối.
  // Schema thật KHÔNG HỀ có `zone` — nó dùng `loaiDon`. Test đó canh một luật không tồn tại,
  // và xanh suốt vì zod bỏ qua khoá lạ.
  it("luồng đơn đi bằng loaiDon, không phải zone", () => {
    expect(createOrderSchema.safeParse({ ...baseValid, loaiDon: "production" }).success).toBe(true);
    expect(createOrderSchema.safeParse({ ...baseValid, loaiDon: "WAREHOUSE" }).success).toBe(false);
  });

  it("không khai loaiDon → mặc định Phòng Thiết Kế", () => {
    const parsed = createOrderSchema.safeParse(baseValid);
    expect(parsed.success && parsed.data.loaiDon).toBe("pre_production");
  });

  // 🔴 Luật SO# CHƯA TỪNG được test: bản chép chỉ có min(1).max(100), còn schema thật bắt
  // đúng định dạng `YY.NNNNN`. Sai định dạng là đơn không tra ngược được về Odoo.
  it("SO# phải đúng định dạng YY.NNNNN", () => {
    for (const bad of ["abc", "26-10680", "2610680", "26.123", "26."]) {
      expect(createOrderSchema.safeParse({ ...baseValid, orderNumber: bad }).success).toBe(false);
    }
    expect(createOrderSchema.safeParse({ ...baseValid, orderNumber: "26.10680" }).success).toBe(true);
  });

  it("rejects empty items array", () => {
    expect(createOrderSchema.safeParse({ ...baseValid, items: [] }).success).toBe(false);
  });

  it("rejects item with empty productName", () => {
    const payload = { ...baseValid, items: [{ productName: "", quantity: 1 }] };
    expect(createOrderSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects item quantity of 0", () => {
    const payload = { ...baseValid, items: [{ productName: "Nhẫn", quantity: 0 }] };
    expect(createOrderSchema.safeParse(payload).success).toBe(false);
  });

  // Mức ưu tiên mặc định phải là Normal — thiếu mặc định là đơn không có ưu tiên nào và
  // rơi khỏi mọi bộ lọc theo ưu tiên.
  it("không khai priorityCode → mặc định Normal", () => {
    const parsed = createOrderSchema.safeParse(baseValid);
    expect(parsed.success && parsed.data.priorityCode).toBe("Normal");
  });
});

describe("mệnh đề lọc trạng thái — module thật", () => {
  // Tab "Tất cả" giấu đơn đã chốt, NHƯNG phải giữ SO có MO riêng lẻ còn chạy: một SO đã Hoàn
  // tất vừa được thêm MO mới để làm tiếp thì MO đó không được biến mất.
  it("mặc định: giấu đơn đã chốt nhưng giữ SO có MO còn chạy", () => {
    const where = orderStatusWhere({ history: false });
    expect(where.OR).toEqual([
      { status: { notIn: ["COMPLETED", "CANCELLED"] } },
      { items: { some: { itemStatus: { notIn: ["COMPLETED", "CANCELLED"] } } } },
    ]);
  });

  it("có chọn trạng thái cụ thể → lọc thẳng theo trạng thái đó", () => {
    expect(orderStatusWhere({ history: false, status: "DRAFT" })).toEqual({ status: "DRAFT" });
  });

  it("tab lịch sử không chọn gì → cả Hoàn tất lẫn Đã hủy", () => {
    expect(orderStatusWhere({ history: true })).toEqual({
      status: { in: ["COMPLETED", "CANCELLED"] },
    });
  });

  it("tab Hoàn tất → loại đơn đã huỷ, và vẫn bắt theo từng MO", () => {
    const where = orderStatusWhere({ history: true, status: "COMPLETED" });
    expect(where.NOT).toEqual({ status: "CANCELLED" });
    expect(where.OR).toEqual([
      { status: "COMPLETED" },
      { items: { some: { itemStatus: "COMPLETED" } } },
    ]);
  });

  // 🔴 KHÔNG đối xứng, và đó là chủ ý. Bản chép cũ khẳng định ngược lại. Một SO đã Hoàn tất
  // vẫn có thể có một MO bị huỷ riêng; loại nó ra là MO đó không hiện ở ĐÂU CẢ.
  it("tab Đã hủy KHÔNG loại đơn đã Hoàn tất", () => {
    expect(orderStatusWhere({ history: true, status: "CANCELLED" }).NOT).toBeUndefined();
  });

  // Trạng thái không phải terminal mà đi kèm cờ lịch sử thì bỏ qua nó — hai tab lịch sử chỉ
  // có hai trạng thái, gửi thứ khác là gửi sai.
  it("cờ lịch sử + trạng thái không phải terminal → về danh sách terminal", () => {
    expect(orderStatusWhere({ history: true, status: "IN_PRODUCTION" })).toEqual({
      status: { in: ["COMPLETED", "CANCELLED"] },
    });
  });
});

describe("phạm vi dữ liệu theo vai — module thật", () => {
  it("vai thường → giữ nguyên truy vấn", () => {
    expect(scopeOrdersQueryForRole("ADMIN", { zone: "PRE_PRODUCTION", history: false }))
      .toEqual({ denied: false, zone: "PRE_PRODUCTION", history: false });
  });

  // Ép, không từ chối: giao diện mặc định vẫn có thể gửi kèm zone khác lúc khởi tạo.
  it("vai chỉ-xem-PSX gửi zone khác → ép về PSX, không báo lỗi", () => {
    expect(scopeOrdersQueryForRole("RND", { zone: "PRE_PRODUCTION", history: false }))
      .toEqual({ denied: false, zone: "MASTER_HUB", history: false });
  });

  // Ngược lại thì TỪ CHỐI: tab lịch sử bị ẩn khỏi giao diện của vai này nên tham số đó chỉ tới
  // được bằng cách gõ tay. Ép âm thầm là kẻ dò tìm nhận về danh sách trông như hợp lệ.
  it("vai chỉ-xem-PSX bật cờ lịch sử → từ chối, không ép", () => {
    const scoped = scopeOrdersQueryForRole("RND", { zone: "MASTER_HUB", history: true });
    expect(scoped.denied).toBe(true);
  });
});
