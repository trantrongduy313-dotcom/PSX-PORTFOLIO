import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  canAllowDuplicateMo,
  duplicateInPsxBadgeText,
  duplicateInPsxOf,
  duplicateMoConfirmText,
  type PsxRow,
} from "@/app/lib/business/orders/duplicate-mo";
import { isLivePsxItem } from "@/app/lib/business/orders/psx-sibling";

// TEST CHO ĐÚNG LỖI ĐÃ GẶP TRÊN PRODUCTION:
//
//   MO 25.32658.5 bị huỷ với lý do "sai phiên bản" nhưng vẫn nằm bên PSX, và nó CHẶN việc chuyển
//   xưởng của 25.32658_4. Một bản ĐÃ BỊ TUYÊN LÀ SAI đang chặn bản đúng.
//
// Gốc: phép kiểm trùng ở promote/route.ts lọc `zone: MASTER_HUB, deletedAt: null` mà KHÔNG loại
// trạng thái HUỶ — trong khi huy hiệu "Đã ở PSX" (psx-sibling.ts luật 2) thì có loại. Hai nơi hỏi
// cùng một câu, trả lời trái nhau.

const row = (over: Partial<PsxRow> = {}): PsxRow => ({
  moNumber: "25.32658_4",
  itemStatus: null,
  orderStatus: "IN_PRODUCTION",
  orderNumber: "25.9431",
  zone: "MASTER_HUB",
  ...over,
});

describe("isLivePsxItem — vị từ DÙNG CHUNG giữa huy hiệu và chốt chặn", () => {
  it("MO bị huỷ theo itemStatus → KHÔNG còn hiệu lực", () => {
    expect(isLivePsxItem({ itemStatus: "CANCELLED", orderStatus: "IN_PRODUCTION" })).toBe(false);
  });

  it("MO không có trạng thái riêng thì ăn theo ĐƠN — đơn huỷ là hết hiệu lực", () => {
    expect(isLivePsxItem({ itemStatus: null, orderStatus: "CANCELLED" })).toBe(false);
  });

  it("itemStatus THẮNG orderStatus: đơn huỷ nhưng MO còn chạy → vẫn còn hiệu lực", () => {
    expect(isLivePsxItem({ itemStatus: "IN_PRODUCTION", orderStatus: "CANCELLED" })).toBe(true);
  });

  it("MO đã HOÀN TẤT vẫn tính là còn hiệu lực", () => {
    // Nó đã được sản xuất thật, và đó chính là lúc cần cảnh báo nhất để không làm trùng.
    expect(isLivePsxItem({ itemStatus: "COMPLETED", orderStatus: "COMPLETED" })).toBe(true);
  });
});

describe("duplicateInPsxOf — xưởng ơi, MO này có bản song song không", () => {
  it("chỉ một bản trong họ → không có gì để báo", () => {
    expect(duplicateInPsxOf(row(), [row()])).toBeNull();
  });

  it("hai phiên bản CÒN HIỆU LỰC cùng ở PSX → báo, và nêu tên bản kia", () => {
    const me = row({ moNumber: "25.32658_4" });
    const other = row({ moNumber: "25.32658_7", orderNumber: "25.9431" });
    const dup = duplicateInPsxOf(me, [me, other]);
    expect(dup?.count).toBe(2);
    expect(dup?.others.map((o) => o.moNumber)).toEqual(["25.32658_7"]);
  });

  it("bản kia ĐÃ HUỶ → KHÔNG báo. Đây chính là ca đã chặn sai trên production", () => {
    const me = row({ moNumber: "25.32658_4" });
    const cancelled = row({ moNumber: "25.32658.5", itemStatus: "CANCELLED" });
    expect(duplicateInPsxOf(me, [me, cancelled])).toBeNull();
  });

  it("lẫn dấu '.' và '_' vẫn nhận ra CÙNG một họ", () => {
    // order-helpers.ts:76 — dữ liệu CŨ lưu ".", dữ liệu MỚI lưu "_". Không gộp được hai dạng thì
    // phép kiểm trùng bỏ sót đúng những cặp dễ trùng nhất.
    const me = row({ moNumber: "25.32658_4" });
    const old = row({ moNumber: "25.32658.7" });
    expect(duplicateInPsxOf(me, [me, old])?.others[0].moNumber).toBe("25.32658.7");
  });

  it("họ KHÁC chỉ vì tiền tố giống → KHÔNG báo", () => {
    // "26.1234" cũng khớp startsWith của "26.12345". Đối chiếu lại bằng stripVersionSuffix.
    const me = row({ moNumber: "25.32658_4" });
    const kindaSimilar = row({ moNumber: "25.326589_1" });
    expect(duplicateInPsxOf(me, [me, kindaSimilar])).toBeNull();
  });

  it("dòng đang ở PTK → KHÔNG xét (đó là câu hỏi của psxSiblingOf, không phải của hàm này)", () => {
    const me = row({ zone: "PRE_PRODUCTION" });
    expect(duplicateInPsxOf(me, [me, row({ moNumber: "25.32658_7" })])).toBeNull();
  });

  it("chính nó đã huỷ → không báo cho nó nữa", () => {
    const me = row({ itemStatus: "CANCELLED" });
    expect(duplicateInPsxOf(me, [me, row({ moNumber: "25.32658_7" })])).toBeNull();
  });

  it("MO trống → không báo, không nổ", () => {
    expect(duplicateInPsxOf(row({ moNumber: null }), [])).toBeNull();
  });

  it("cùng moNumber trùng lặp (dữ liệu hỏng) → không báo vì không chỉ ra được bản nào", () => {
    const me = row({ moNumber: "25.32658_4" });
    expect(duplicateInPsxOf(me, [me, row({ moNumber: "25.32658_4" })])).toBeNull();
  });

  it("nhiều bản → liệt kê theo thứ tự phiên bản tăng dần", () => {
    const me = row({ moNumber: "25.32658_4" });
    const rows = [me, row({ moNumber: "25.32658_9" }), row({ moNumber: "25.32658_6" })];
    expect(duplicateInPsxOf(me, rows)?.others.map((o) => o.version)).toEqual([6, 9]);
  });
});

describe("Câu chữ phải KIỂM ĐƯỢC, không chỉ nói 'có trùng'", () => {
  it("câu xác nhận nêu TÊN cả MO và đơn", () => {
    const t = duplicateMoConfirmText({ existingMoNumber: "25.32658.5", existingOrderNumber: "25.9431" });
    expect(t).toContain("25.32658.5");
    expect(t).toContain("25.9431");
  });

  it("câu xác nhận nói rõ HỆ QUẢ, không chỉ nói có xung đột", () => {
    const t = duplicateMoConfirmText({ existingMoNumber: "A", existingOrderNumber: "B" });
    expect(t).toContain("xưởng");
  });

  it("huy hiệu nêu tên bản còn lại", () => {
    expect(
      duplicateInPsxBadgeText({ count: 2, others: [{ orderNumber: "X", moNumber: "25.32658_7", version: 7 }] }),
    ).toContain("25.32658_7");
  });
});

describe("canAllowDuplicateMo", () => {
  it.each(["ADMIN", "ORDER"])("%s được tự quyết", (r) => {
    expect(canAllowDuplicateMo(r)).toBe(true);
  });

  it.each(["SALES", "PRODUCTION", "DESIGN_3D", undefined])("%s thì không", (r) => {
    expect(canAllowDuplicateMo(r)).toBe(false);
  });
});

describe("Route promote thật sự dùng vị từ dùng chung, không viết lại luật", () => {
  const src = readFileSync(
    join(process.cwd(), "app", "api", "orders", "[id]", "promote", "route.ts"),
    "utf8",
  );

  it("BỘ DÒ CÒN CHẠY — vẫn thấy nhánh DUPLICATE_MO trong route", () => {
    expect(src).toContain("DUPLICATE_MO");
  });

  it("gọi isLivePsxItem — không diễn đạt lại luật 'huỷ thì hết hiệu lực'", () => {
    expect(src).toContain("isLivePsxItem(");
  });

  it("KHÔNG còn dùng findFirst cho phép kiểm trùng", () => {
    // findFirst không thể lọc bản huỷ ở tầng JS: nó trả về đúng MỘT dòng, và nếu dòng đó là bản
    // huỷ thì ta mất luôn cơ hội thấy các bản còn hiệu lực phía sau.
    expect(src).not.toMatch(/orderItem\.findFirst/);
  });

  it("có cờ allowDuplicateMo RIÊNG, không dùng lại `force`", () => {
    // `force` đang bỏ qua bốn phép kiểm khác (trạng thái, Khách hàng, Sales, NVL). Gộp vào là xác
    // nhận một chuyện lại âm thầm bỏ qua bốn chuyện khác. Một cờ, một nghĩa.
    expect(src).toContain("allowDuplicateMo");
    expect(src).toMatch(/if \(!allowDuplicateMo\)/);
  });

  it("ghi vết ai cho phép trùng vào metadata", () => {
    expect(src).toContain("duplicateMoAllowed");
  });

  it("dùng 428 kèm details để client phân biệt được, không dựa vào câu chữ", () => {
    expect(src).toMatch(/Errors\.preconditionRequired\([\s\S]{0,300}code: "DUPLICATE_MO"/);
  });

  it("KHÔNG mượn 409 cho ca cần xác nhận", () => {
    // 409 trong dự án này đã có nghĩa "đơn vừa bị người khác sửa, tải lại đi", và client bắt nó
    // theo STATUS rồi ném `Error("CONFLICT")` TRẦN — mất luôn câu thông báo. Mượn 409 là người
    // dùng nhận đúng một chữ "CONFLICT" cùng một lời khuyên tải lại chẳng liên quan gì.
    const duplicateBranch = src.slice(src.indexOf('case "DUPLICATE_MO"'));
    expect(duplicateBranch.slice(0, 800)).not.toContain("Errors.conflict(");
  });
});
