import { describe, expect, it } from "vitest";

import { computeRowStatus } from "@/app/dashboard/orders/_components/orders-client";

// `computeRowStatus` tự nhận trong comment là "NGUỒN DUY NHẤT dùng cho cả badge hiển thị lẫn
// bộ lọc trạng thái" — nhưng nó CHƯA TỪNG có test.
//
// 🔴 Và chỗ này có một cái bẫy đắt hơn: app/__tests__/filter-system.test.ts (1.170 dòng) cùng
// app/__tests__/mo-status-transitions.test.ts (410 dòng) đều ghi "mirrors orders-client.tsx
// flatRows logic" — chúng CHÉP LẠI luật rồi test bản chép. `flatRows` nay KHÔNG CÒN TỒN TẠI
// trong orders-client. 1.580 dòng test đó xanh vĩnh viễn và không canh gì của hệ thống thật.
//
// File này đi hướng ngược lại: import ĐÚNG hàm đang chạy.

const item = (over: { zone?: string | null; itemStatus?: string | null } = {}) => ({
  zone: "PRE_PRODUCTION", itemStatus: null, ...over,
});

const order = (status: string, isSuspended = false) =>
  ({ status, isSuspended }) as never;

const statusOf = (
  itemOver: Parameters<typeof item>[0],
  orderStatus: string,
  isSuspended = false,
) => computeRowStatus(item(itemOver), order(orderStatus, isSuspended));

describe("kế thừa trạng thái từ đơn", () => {
  it("MO không có trạng thái riêng → kế thừa trạng thái của SO", () => {
    expect(statusOf({}, "IN_DESIGN")).toBe("IN_DESIGN");
  });

  it("MO có trạng thái riêng → trạng thái riêng thắng", () => {
    expect(statusOf({ itemStatus: "DESIGN_REVIEW" }, "IN_DESIGN")).toBe("DESIGN_REVIEW");
  });
});

describe("đơn TRỘN ZONE — một MO đã chuyển xưởng, MO anh em còn ở PTK", () => {
  // 🔴 Đây là lý do hàm này tồn tại. Chuyển một MO sang PSX làm `order.status` thành
  // IN_PRODUCTION; các MO anh em CÒN Ở PTK không được kế thừa trạng thái đó — chúng chưa vào
  // sản xuất, và hiện "Đang sản xuất" là nói sai về việc chưa ai làm.
  it("MO ở PTK KHÔNG kế thừa trạng thái chỉ có nghĩa ở PSX", () => {
    expect(statusOf({ zone: "PRE_PRODUCTION" }, "IN_PRODUCTION")).toBe("DRAFT");
    expect(statusOf({ zone: "PRE_PRODUCTION" }, "PENDING_PRODUCTION")).toBe("DRAFT");
  });

  // Chiều ngược lại: MO đã sang PSX mà `itemStatus` còn lưu trạng thái PTK cũ thì bỏ qua nó.
  it("MO ở PSX bỏ qua trạng thái PTK còn sót trong itemStatus", () => {
    for (const stale of ["DRAFT", "IN_DESIGN", "DESIGN_APPROVED", "DESIGN_COMPLETED"]) {
      expect(statusOf({ zone: "MASTER_HUB", itemStatus: stale }, "IN_PRODUCTION")).toBe("IN_PRODUCTION");
    }
  });

  it("MO ở PTK VẪN dùng được trạng thái PTK của chính nó", () => {
    expect(statusOf({ zone: "PRE_PRODUCTION", itemStatus: "DESIGN_REVIEW" }, "IN_PRODUCTION"))
      .toBe("DESIGN_REVIEW");
  });
});

describe("thứ tự ưu tiên", () => {
  // Terminal thắng TẤT CẢ, kể cả cờ tạm ngưng cấp SO: một MO đã hủy thì đã hủy, không phải
  // "đang tạm ngưng".
  it("MO đã hoàn tất hoặc đã hủy → thắng cả cờ tạm ngưng của SO", () => {
    expect(statusOf({ itemStatus: "COMPLETED" }, "IN_DESIGN", true)).toBe("COMPLETED");
    expect(statusOf({ itemStatus: "CANCELLED" }, "IN_DESIGN", true)).toBe("CANCELLED");
  });

  it("SO đang tạm ngưng → MO hiện Tạm ngưng", () => {
    expect(statusOf({}, "IN_PRODUCTION", true)).toBe("SUSPENDED");
  });

  it("MO tạm ngưng riêng → hiện Tạm ngưng dù SO không ngưng", () => {
    expect(statusOf({ itemStatus: "SUSPENDED", zone: "MASTER_HUB" }, "IN_PRODUCTION")).toBe("SUSPENDED");
  });

  // Tạm ngưng đứng TRÊN trạng thái thường: MO đang sản xuất nhưng SO bị ngưng thì nó KHÔNG
  // được hiện "Đang sản xuất" — xưởng phải thấy nó dừng.
  it("SO tạm ngưng → che trạng thái thường của MO", () => {
    expect(statusOf({ itemStatus: "IN_PRODUCTION", zone: "MASTER_HUB" }, "IN_PRODUCTION", true))
      .toBe("SUSPENDED");
  });
});

describe("dữ liệu thiếu", () => {
  it("MO không có zone → vẫn tính được, kế thừa trạng thái SO", () => {
    expect(statusOf({ zone: null }, "IN_DESIGN")).toBe("IN_DESIGN");
    expect(statusOf({ zone: undefined }, "IN_DESIGN")).toBe("IN_DESIGN");
  });

  it("itemStatus rỗng khác với itemStatus có giá trị", () => {
    expect(statusOf({ itemStatus: null }, "DRAFT")).toBe("DRAFT");
  });
});
