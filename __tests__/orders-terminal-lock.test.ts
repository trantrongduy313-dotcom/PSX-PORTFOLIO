import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isTerminalLocked, terminalLockReason, TERMINAL_STATUSES } from "@/app/lib/business/orders/terminal-lock";

// TEST CHO ĐÚNG LỖ ĐÃ TÌM RA: route production có HAI nhánh khoá "MO đã chốt" và chúng ĐO Ở HAI
// CẤP KHÁC NHAU. Lệnh lưu từ tab Thiết kế không gửi `scopedItemId` nên rơi vào nhánh đo cấp SO:
//
//   SO có 3 MO. MO#1 đã COMPLETED (itemStatus riêng), `order.status` vẫn IN_PRODUCTION vì hai MO
//   kia chưa xong. Sửa được thông số thiết kế của MO#1 ĐÃ CHỐT — trong khi cùng thao tác đó qua
//   route items/[itemId] thì bị chặn.

describe("isTerminalLocked — đo TRẠNG THÁI HIỆU DỤNG CỦA MO, không phải của SO", () => {
  it("MO đã hoàn tất thì KHOÁ, dù SO vẫn đang sản xuất — đây chính là ca bị bỏ lọt", () => {
    expect(isTerminalLocked({ itemStatus: "COMPLETED", orderStatus: "IN_PRODUCTION" })).toBe(true);
  });

  it("MO đã hủy thì khoá, dù SO vẫn đang sản xuất", () => {
    expect(isTerminalLocked({ itemStatus: "CANCELLED", orderStatus: "IN_PRODUCTION" })).toBe(true);
  });

  it("SO đã hoàn tất nhưng MO này CHƯA thì KHÔNG khoá — chiều CHẶN OAN của cùng một lỗi", () => {
    expect(isTerminalLocked({ itemStatus: "IN_PRODUCTION", orderStatus: "COMPLETED" })).toBe(false);
  });

  it("MO không có trạng thái riêng thì MỚI ăn theo SO — đó là nghĩa của null", () => {
    expect(isTerminalLocked({ itemStatus: null, orderStatus: "COMPLETED" })).toBe(true);
    expect(isTerminalLocked({ itemStatus: undefined, orderStatus: "IN_PRODUCTION" })).toBe(false);
  });

  it("adminOverride mở khoá — quyền đã được route xét TRƯỚC transaction", () => {
    expect(isTerminalLocked({ itemStatus: "COMPLETED", orderStatus: "COMPLETED", adminOverride: true })).toBe(false);
  });

  it("thiếu cả hai trạng thái thì KHÔNG khoá — không có gì để kết luận là đã chốt", () => {
    expect(isTerminalLocked({ itemStatus: null, orderStatus: null })).toBe(false);
  });

  it("mọi trạng thái đang chạy đều không khoá", () => {
    for (const st of ["DRAFT", "IN_DESIGN", "DESIGN_APPROVED", "IN_PRODUCTION", "QUALITY_CHECK", "SUSPENDED"]) {
      expect(isTerminalLocked({ itemStatus: st, orderStatus: st }), st).toBe(false);
    }
  });

  it("đúng HAI trạng thái được coi là chốt — SUSPENDED không phải một trong hai", () => {
    expect([...TERMINAL_STATUSES]).toEqual(["COMPLETED", "CANCELLED"]);
  });
});

describe("terminalLockReason — nêu tên MO và chỉ đường đi tiếp", () => {
  it("nói MO, KHÔNG nói 'đơn hàng': trên SO nhiều MO, câu cũ khiến user tưởng cả đơn bị khoá", () => {
    const msg = terminalLockReason({ moNumber: "26.42341_1", itemStatus: "COMPLETED", orderStatus: "IN_PRODUCTION" });
    expect(msg).toContain("MO 26.42341_1");
    expect(msg).toContain("ĐÃ HOÀN TẤT");
  });

  it("phân biệt hủy với hoàn tất — hai việc khác nhau, xử lý tiếp cũng khác", () => {
    expect(terminalLockReason({ itemStatus: "CANCELLED", orderStatus: null })).toContain("ĐÃ HỦY");
  });

  it("CHỈ ĐƯỜNG: đường Sửa dữ liệu (Admin) có thật, nhưng user không đoán ra được", () => {
    const msg = terminalLockReason({ itemStatus: "COMPLETED", orderStatus: null });
    expect(msg).toContain("Sửa dữ liệu (Admin)");
    expect(msg).toContain("Mở lại đơn");
  });

  it("không có MO# thì vẫn thành câu, không ra 'MO null'", () => {
    expect(terminalLockReason({ moNumber: null, itemStatus: "COMPLETED", orderStatus: null }))
      .toContain("MO này");
  });
});

describe("Đường lưu tab Thiết kế phải gửi scopedItemId", () => {
  const PANEL = join(process.cwd(), "app", "dashboard", "orders", "_components", "order-detail-panel.tsx");
  const ROUTE = join(process.cwd(), "app", "api", "orders", "[id]", "production", "route.ts");

  it("panel gửi scopedItemId kèm khối thiết kế — thiếu nó là khoá đo ở cấp SO", () => {
    const src = readFileSync(PANEL, "utf8");
    expect(src).toContain("scopedItemId: designItemKey");
  });

  it("route KHÔNG còn tự viết lại điều kiện terminal — cả hai nhánh gọi isTerminalLocked", () => {
    // Ba bản chép tay của một luật thì không có cách nào biết chúng còn khớp nhau, và lần lệch đầu
    // tiên chính là cái đang được sửa ở đây.
    const src = readFileSync(ROUTE, "utf8");
    expect(src.split("isTerminalLocked(").length - 1).toBeGreaterThanOrEqual(2);
    expect(src).not.toMatch(/===\s*"COMPLETED"\s*\|\|\s*\w+\s*===\s*"CANCELLED"\s*\)\s*&&\s*!adminOverride/);
  });
});
