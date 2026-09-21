import { describe, expect, it } from "vitest";

import {
  CRITICAL_LOCK_STATUSES,
  isCriticalFieldLocked,
  isMoInProduction,
} from "@/app/lib/business/orders/critical-field-lock";

// Khoá Khách hàng / Sales khi MO đã vào sản xuất. Ý định: tên khách đã theo phiếu xuống xưởng thì
// đổi nó là làm lệch giấy tờ đang chạy ngoài thực tế.
//
// Hai lỗi dưới đây từng chỉ được ghi bằng comment, và cả hai đều CHẶN OAN.
// Chuyện đầy đủ: docs/04_ENGINEERING_GUIDELINES.md § Khoá field quan trọng theo MO

const locked = (o: Partial<Parameters<typeof isCriticalFieldLocked>[0]> = {}) =>
  isCriticalFieldLocked({
    itemStatus: "IN_PRODUCTION",
    orderStatus: "IN_PRODUCTION",
    currentValue: "Chị Lan",
    ...o,
  });

describe("Lỗi 1 — đo trạng thái của MO, KHÔNG phải của SO", () => {
  // Bản cũ dùng `CRITICAL_LOCK_STATUSES.includes(order.status)`. Nhưng Khách hàng/Sales ghi
  // RIÊNG THEO MO. Một SO có 3 MO, MỘT MO xuống sản xuất → order.status = IN_PRODUCTION → hai MO
  // còn lại vẫn ở Phòng Thiết Kế cũng bị khoá, dù chưa đi đâu cả.
  it("SO đã vào sản xuất nhưng MO này còn ở PTK → KHÔNG khoá", () => {
    expect(locked({ itemStatus: "IN_DESIGN", orderStatus: "IN_PRODUCTION" })).toBe(false);
  });

  it("MO này đã vào sản xuất dù SO còn ở PTK → KHOÁ", () => {
    expect(locked({ itemStatus: "IN_PRODUCTION", orderStatus: "IN_DESIGN" })).toBe(true);
  });

  // `item.itemStatus ?? order.status` — cùng cách `activeItemSuspended` và route items/[itemId]
  // đã phải sửa. Riêng dòng này bị bỏ quên.
  it("MO không có trạng thái riêng → ăn theo SO", () => {
    expect(locked({ itemStatus: null, orderStatus: "COMPLETED" })).toBe(true);
    expect(locked({ itemStatus: null, orderStatus: "IN_DESIGN" })).toBe(false);
  });

  it("thiếu cả hai trạng thái → KHÔNG khoá, mặc định là MỞ", () => {
    expect(locked({ itemStatus: null, orderStatus: null })).toBe(false);
  });
});

describe("Lỗi 2 — chặn ĐỔI, không chặn ĐIỀN", () => {
  // Đơn nhập từ script thường trống tên khách; tới lúc phát hiện thì MO đã xuống sản xuất, và
  // không còn đường nào nhập vào — ô bị làm mờ vĩnh viễn. Ô trống thì không có giấy tờ nào đang
  // mang giá trị cũ để lệch.
  it("ô còn TRỐNG → cho điền, dù MO đã vào sản xuất", () => {
    for (const empty of [null, undefined, "", "   "]) {
      expect(locked({ currentValue: empty }), JSON.stringify(empty)).toBe(false);
    }
  });

  it("ô ĐÃ CÓ giá trị + MO đã vào sản xuất → khoá", () => {
    expect(locked({ currentValue: "Chị Lan" })).toBe(true);
  });

  it("ô đã có giá trị nhưng MO chưa vào sản xuất → không khoá", () => {
    expect(locked({ itemStatus: "IN_DESIGN", currentValue: "Chị Lan" })).toBe(false);
  });
});

describe("isMoInProduction — tách riêng, và phải tách", () => {
  // Banner trả lời câu KHÁC: "đơn này đã vào sản xuất" là sự thật về MO, không phụ thuộc field
  // nào đang trống. Gộp hai câu vào một cờ thì banner biến mất chỉ vì tên khách còn trống — đúng
  // lúc người dùng cần biết nhất.
  it("KHÔNG phụ thuộc field có trống hay không", () => {
    for (const status of CRITICAL_LOCK_STATUSES) {
      expect(isMoInProduction({ itemStatus: status, orderStatus: "IN_DESIGN" })).toBe(true);
    }
  });

  it("ô trống thì banner VẪN hiện, dù khoá thì không", () => {
    const args = { itemStatus: "IN_PRODUCTION", orderStatus: "IN_PRODUCTION" };
    expect(isMoInProduction(args)).toBe(true);
    expect(isCriticalFieldLocked({ ...args, currentValue: "" })).toBe(false);
  });

  it("MO chưa vào sản xuất → không hiện banner", () => {
    expect(isMoInProduction({ itemStatus: "IN_DESIGN", orderStatus: "IN_DESIGN" })).toBe(false);
  });
});
