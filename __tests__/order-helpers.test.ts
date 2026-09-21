import { describe, it, expect } from "vitest";
import { getBaseSoNumber } from "@/app/lib/utils/order-helpers";

describe("getBaseSoNumber", () => {
  it("trả về nguyên SO# dạng 2 phần (Odoo chuẩn)", () => {
    expect(getBaseSoNumber("26.10680")).toBe("26.10680");
  });

  it("strip suffix khi có 3 phần và phần cuối là số nguyên", () => {
    expect(getBaseSoNumber("26.10680.1")).toBe("26.10680");
    expect(getBaseSoNumber("26.10680.2")).toBe("26.10680");
    expect(getBaseSoNumber("26.10680.10")).toBe("26.10680");
  });

  it("KHÔNG strip khi phần cuối không phải số nguyên thuần", () => {
    expect(getBaseSoNumber("26.10680.1a")).toBe("26.10680.1a");
    expect(getBaseSoNumber("26.10680.abc")).toBe("26.10680.abc");
  });

  it("xử lý đúng SO# chỉ 1 phần hoặc rỗng", () => {
    expect(getBaseSoNumber("26")).toBe("26");
    expect(getBaseSoNumber("")).toBe("");
  });

  it("KHÔNG nhầm Odoo 2-phần số dài thành version", () => {
    // "26.12312312312" — chỉ có 2 phần → không strip
    expect(getBaseSoNumber("26.12312312312")).toBe("26.12312312312");
  });
});
