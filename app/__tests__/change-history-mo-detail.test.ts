/**
 * change-history-mo-detail.test.ts
 *
 * Kiểm tra hiển thị chi tiết MO trong Lịch sử thay đổi (gap A: tạo đơn; gap B: thêm MO).
 * Test hàm thuần formatMoListDetail — nguồn dữ liệu MO ("Đã tạo/thêm N MO: ...") + cắt bớt.
 */

import { describe, it, expect } from "vitest";
import { formatMoListDetail } from "@/app/dashboard/admin/change-history/_components/change-history-client";

describe("formatMoListDetail — chi tiết MO trong lịch sử", () => {
  it("CREATED → 'Đã tạo N MO: ...'", () => {
    expect(formatMoListDetail("CREATED", ["26.111", "26.112"], 2))
      .toBe("Đã tạo 2 MO: 26.111, 26.112");
  });

  it("Thêm MO (FIELD_UPDATED) → 'Đã thêm N MO: ...'", () => {
    expect(formatMoListDetail("FIELD_UPDATED", ["26.201"], 1))
      .toBe("Đã thêm 1 MO: 26.201");
  });

  it("Danh sách dài > 5 → cắt bớt kèm '…+K nữa'", () => {
    const mos = ["26.1", "26.2", "26.3", "26.4", "26.5", "26.6", "26.7"];
    expect(formatMoListDetail("CREATED", mos, 7))
      .toBe("Đã tạo 7 MO: 26.1, 26.2, 26.3, 26.4, 26.5 …+2 nữa");
  });

  it("Đúng 5 MO → không có phần '…+K nữa'", () => {
    const mos = ["26.1", "26.2", "26.3", "26.4", "26.5"];
    expect(formatMoListDetail("CREATED", mos, 5))
      .toBe("Đã tạo 5 MO: 26.1, 26.2, 26.3, 26.4, 26.5");
  });

  it("MO# hiển thị RAW (giữ nguyên hậu tố phiên bản)", () => {
    expect(formatMoListDetail("FIELD_UPDATED", ["26.37254.2"], 1))
      .toBe("Đã thêm 1 MO: 26.37254.2");
  });

  it("Log cũ không có moNumbers → trả '' (client sẽ hiện SO như cũ, không vỡ)", () => {
    expect(formatMoListDetail("CREATED", null, null)).toBe("");
    expect(formatMoListDetail("CREATED", [], 0)).toBe("");
  });

  it("addedCount thiếu → suy từ độ dài danh sách", () => {
    expect(formatMoListDetail("CREATED", ["26.1", "26.2"], null))
      .toBe("Đã tạo 2 MO: 26.1, 26.2");
  });
});
