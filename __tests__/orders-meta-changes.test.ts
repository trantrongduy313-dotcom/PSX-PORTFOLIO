import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { mergeChangedOrders, latestStamp } from "@/app/lib/business/orders/meta-changes";

// TEST CHO ĐÚNG LỖ ĐÃ TÌM RA: nhịp tim /api/orders/meta chỉ theo dõi Order.updatedAt, trong khi
// hai hành động thường gặp nhất của NV 3D KHÔNG chạm tới bảng đó:
//
//   acknowledge (nhận việc) và progress (gửi kết quả) chỉ ghi Design3DAssignment.
//
// Nên Đặt đơn không hề được báo — dù dải cảnh báo "Đơn này vừa được cập nhật bởi người khác" đã
// tồn tại và đã nối dây đầy đủ. Nó không hỏng, nó BỊ BỎ ĐÓI.

const ORDER_ROW = {
  id: "o1", orderNumber: "26.42341", store: { name: "CH1" },
  items: [{ id: "i1", moNumber: "26.42341_1" }],
};

const ASSIGN_ROW = {
  orderItemId: "i1",
  order: { id: "o1", orderNumber: "26.42341", store: { name: "CH1" } },
  orderItem: { moNumber: "26.42341_1" },
};

describe("mergeChangedOrders — NV 3D cập nhật thì đơn PHẢI vào danh sách", () => {
  it("chỉ có thay đổi từ lượt 3D (Order không đổi) → vẫn báo được", () => {
    const out = mergeChangedOrders([], [ASSIGN_ROW]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("o1");
  });

  it("PHẢI kèm orderItemId — thiếu nó thì mọi thứ khác đúng hết mà cảnh báo không bao giờ hiện", () => {
    // `panelOrderStale` chỉ coi sidebar là cũ khi ĐÚNG MO đang xem nằm trong changedItemIds;
    // mảng rỗng bị hiểu là "đổi ở cấp đơn" và CỐ Ý không kích hoạt cảnh báo.
    expect(mergeChangedOrders([], [ASSIGN_ROW])[0].changedItemIds).toEqual(["i1"]);
  });

  it("mang theo MO# để dòng đúng MO đó được nháy", () => {
    expect(mergeChangedOrders([], [ASSIGN_ROW])[0].changedMoNumbers).toEqual(["26.42341_1"]);
  });
});

describe("mergeChangedOrders — GỘP theo đơn, không nối hai mảng", () => {
  it("đổi ở CẢ HAI đường trong một nhịp → vẫn chỉ MỘT dòng", () => {
    // Đặt đơn sửa NVL trong lúc NV 3D gửi kết quả. Nối thẳng thì đơn hiện hai lần và số
    // "N đơn vừa đổi" nói quá — một chỉ báo nói quá bị bỏ qua nhanh y như một chỉ báo không hiện.
    const out = mergeChangedOrders([ORDER_ROW], [ASSIGN_ROW]);
    expect(out).toHaveLength(1);
    expect(out[0].changedItemIds).toEqual(["i1"]);
  });

  it("hai MO khác nhau của cùng đơn → một dòng, hai itemId", () => {
    const out = mergeChangedOrders(
      [{ ...ORDER_ROW, items: [{ id: "i1", moNumber: "A_1" }] }],
      [{ ...ASSIGN_ROW, orderItemId: "i2", orderItem: { moNumber: "A_2" } }],
    );
    expect(out).toHaveLength(1);
    expect([...out[0].changedItemIds].sort()).toEqual(["i1", "i2"]);
    expect([...out[0].changedMoNumbers].sort()).toEqual(["A_1", "A_2"]);
  });

  it("hai đơn khác nhau → hai dòng", () => {
    const out = mergeChangedOrders([ORDER_ROW], [{
      orderItemId: "i9",
      order: { id: "o2", orderNumber: "26.99999", store: null },
      orderItem: { moNumber: null },
    }]);
    expect(out).toHaveLength(2);
  });

  it("lượt mồ côi (không kèm order) bị bỏ qua, không làm hỏng cả danh sách", () => {
    const out = mergeChangedOrders([ORDER_ROW], [{ orderItemId: "x", order: null, orderItem: null }]);
    expect(out).toHaveLength(1);
  });

  it("MO# null thì bỏ khỏi danh sách MO, KHÔNG đẩy null vào mảng chuỗi", () => {
    const out = mergeChangedOrders([], [{ ...ASSIGN_ROW, orderItem: { moNumber: null } }]);
    expect(out[0].changedMoNumbers).toEqual([]);
    expect(out[0].changedItemIds).toEqual(["i1"]);
  });

  it("không có gì đổi → mảng rỗng", () => {
    expect(mergeChangedOrders([], [])).toEqual([]);
  });
});

describe("latestStamp — mốc phải là MAX của MỌI bảng trong chữ ký", () => {
  it("lấy mốc muộn nhất, kể cả khi nó đến từ bảng lượt 3D", () => {
    // Client gửi mốc này lại làm `changedSince` ở nhịp sau. Chỉ lấy mốc của Order thì mốc gửi đi
    // CŨ HƠN thực tế, và cùng một thay đổi 3D được báo lại ở MỌI nhịp — người dùng sẽ học cách
    // bỏ qua cảnh báo, và lần sau cảnh báo thật cũng bị bỏ qua theo.
    const older = new Date("2026-08-19T01:00:00.000Z");
    const newer = new Date("2026-08-19T02:00:00.000Z");
    expect(latestStamp(older, newer)).toBe(newer.toISOString());
    expect(latestStamp(newer, older)).toBe(newer.toISOString());
  });

  it("một bên rỗng thì lấy bên còn lại", () => {
    const d = new Date("2026-08-19T02:00:00.000Z");
    expect(latestStamp(null, d)).toBe(d.toISOString());
    expect(latestStamp(d, undefined)).toBe(d.toISOString());
  });

  it("không có mốc nào → null, không ra 'Invalid Date'", () => {
    expect(latestStamp(null, undefined)).toBeNull();
    expect(latestStamp()).toBeNull();
  });
});

describe("Route meta thật sự hỏi bảng lượt giao việc 3D", () => {
  const src = readFileSync(join(process.cwd(), "app", "api", "orders", "meta", "route.ts"), "utf8");

  it("có truy vấn design3DAssignment — nếu không thì mọi test trên chỉ kiểm một hàm không ai gọi", () => {
    expect(src).toContain("prisma.design3DAssignment");
  });

  it("dùng module gộp dùng chung, không tự ghép tay lần nữa", () => {
    expect(src).toContain("mergeChangedOrders(");
    expect(src).toContain("latestStamp(");
  });
});
