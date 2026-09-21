import { describe, expect, it } from "vitest";

import {
  CRAFTSMAN_CODE_MAX,
  CRAFTSMAN_LEVELS,
  KHAU_OPTIONS,
  LEVEL_RANK,
  craftsmanInputSchema,
  levelRankOf,
  normalizeCraftsmanCode,
} from "@/app/lib/business/craftsman";

// ─── Danh mục thợ ────────────────────────────────────────────────────────────
//
// Trước khi có file này, danh sách bậc thợ nằm ở NĂM chỗ (dropdown client, zod của POST, zod
// của PUT, LEVEL_RANK × 2). Các hằng dưới đây được chép NGUYÊN VĂN từ bản cũ trước khi rút —
// test này xanh nghĩa là phép rút không đổi hành vi, chứ không phải nó khớp với code vừa viết.

describe("CRAFTSMAN_LEVELS — giữ nguyên bản cũ", () => {
  it("đúng 11 bậc, đúng thứ tự dropdown cũ", () => {
    expect([...CRAFTSMAN_LEVELS]).toEqual([
      "KTSX", "Bậc 5", "Bậc 4", "Bậc 3", "Bậc 2", "Bậc 1",
      "ĐBXM", "AZ", "Resin", "Dây lắc", "Đúc",
    ]);
  });

  it("đúng 10 khâu như bản cũ", () => {
    expect([...KHAU_OPTIONS]).toEqual([
      "Nguội", "Hột", "TC Dây", "ĐBXM", "Đúc", "QC", "Resin", "AZ", "Dây lắc", "Khác",
    ]);
  });

  // 🔴 BẤT BIẾN THEN CHỐT. Hai danh sách này từng là hai hằng riêng ở hai file; thêm một bậc mà
  // quên khai hạng thì thợ đó rơi xuống nhóm cuối — sai thứ tự, không sai dữ liệu, nên không ai
  // phát hiện. Nay chúng buộc phải trùng khoá.
  it("mọi bậc đều có hạng, và không có hạng thừa", () => {
    expect(Object.keys(LEVEL_RANK).sort()).toEqual([...CRAFTSMAN_LEVELS].sort());
  });

  it("giữ nguyên thang hạng cũ", () => {
    expect(levelRankOf("KTSX")).toBe(9);
    expect(levelRankOf("Bậc 5")).toBe(5);
    expect(levelRankOf("Bậc 1")).toBe(1);
  });

  // 0 KHÔNG phải "kém nhất" — nó là "không nằm trong thang bậc". Năm giá trị này là tên khâu
  // được dùng ở ô bậc, nên chúng cùng rơi xuống nhóm cuối.
  it("tên khâu dùng ở ô bậc đều hạng 0", () => {
    for (const l of ["ĐBXM", "AZ", "Resin", "Dây lắc", "Đúc"]) {
      expect(levelRankOf(l), l).toBe(0);
    }
  });

  it("bậc lạ hoặc rỗng → 0, không làm hỏng sắp xếp", () => {
    expect(levelRankOf("")).toBe(0);
    expect(levelRankOf("Bậc 9")).toBe(0);
    expect(levelRankOf("__khong_ton_tai__")).toBe(0);
  });
});

describe("normalizeCraftsmanCode", () => {
  // 🎯 RỖNG LÀ HỢP LỆ. Mã thợ là nhãn, không bắt buộc — khác Designer3D.code vốn `min(1)`.
  it("rỗng / trắng / thiếu đều thành chuỗi rỗng, KHÔNG phải lỗi", () => {
    expect(normalizeCraftsmanCode("")).toBe("");
    expect(normalizeCraftsmanCode("   ")).toBe("");
    expect(normalizeCraftsmanCode(null)).toBe("");
    expect(normalizeCraftsmanCode(undefined)).toBe("");
  });

  it("cắt khoảng trắng hai đầu, giữ nguyên phần giữa", () => {
    expect(normalizeCraftsmanCode("  265  ")).toBe("265");
    expect(normalizeCraftsmanCode("T 07")).toBe("T 07");
  });

  // Trả "" chứ không phải null — khớp `code String @default("")` trong schema, cùng hình dạng
  // với Designer3D.code. Một khuôn cho "mã nhân sự" trong cả codebase.
  it("luôn trả về string, không bao giờ null", () => {
    for (const v of ["", "  ", null, undefined, "x"]) {
      expect(typeof normalizeCraftsmanCode(v as string)).toBe("string");
    }
  });
});

describe("craftsmanInputSchema — một schema cho cả TẠO lẫn SỬA", () => {
  it("chỉ cần tên; level/khau/code đều có mặc định", () => {
    const r = craftsmanInputSchema.parse({ name: "Phan Hồng Đạt" });
    expect(r).toEqual({ name: "Phan Hồng Đạt", level: "", khau: "", code: "" });
  });

  it("thiếu tên thì chặn", () => {
    expect(craftsmanInputSchema.safeParse({}).success).toBe(false);
    expect(craftsmanInputSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("nhận đủ 11 bậc, từ chối bậc lạ", () => {
    for (const l of CRAFTSMAN_LEVELS) {
      expect(craftsmanInputSchema.safeParse({ name: "A", level: l }).success, l).toBe(true);
    }
    expect(craftsmanInputSchema.safeParse({ name: "A", level: "Bậc 9" }).success).toBe(false);
  });

  // ⚠️ `khau` CỐ Ý còn lỏng — xem ghi chú ở craftsman.ts. Test này ghi lại hiện trạng để lần
  // siết sau là một thay đổi CÓ CHỦ Ý, không phải một dòng lọt vào.
  it("khau hiện nhận chuỗi tự do (chưa siết theo KHAU_OPTIONS)", () => {
    expect(craftsmanInputSchema.safeParse({ name: "A", khau: "Nguoi sai chinh ta" }).success).toBe(true);
  });

  it("mã thợ bỏ trống được, và được cắt khoảng trắng", () => {
    expect(craftsmanInputSchema.parse({ name: "A" }).code).toBe("");
    expect(craftsmanInputSchema.parse({ name: "A", code: "  265 " }).code).toBe("265");
  });

  it("mã thợ quá dài thì chặn", () => {
    const ok  = "x".repeat(CRAFTSMAN_CODE_MAX);
    const bad = "x".repeat(CRAFTSMAN_CODE_MAX + 1);
    expect(craftsmanInputSchema.safeParse({ name: "A", code: ok }).success).toBe(true);
    expect(craftsmanInputSchema.safeParse({ name: "A", code: bad }).success).toBe(false);
  });
});
