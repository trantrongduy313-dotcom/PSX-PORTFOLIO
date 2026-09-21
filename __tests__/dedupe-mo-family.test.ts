import { describe, it, expect } from "vitest";

import {
  dedupeItemsByMoFamily, moItemRichness, stripVersionSuffix, versionOf,
  type MoFamilyItem,
} from "@/app/lib/business/order-helpers";

// Bộ test này khoá lại một lỗi ĐÃ XẢY RA TRÊN PRODUCTION ngày 07/08/2026:
// đơn 26.10887 có hai dòng "26.36681" và "26.36681.1"; tạo phiên bản xong thì CẢ HAI cùng
// mang mã "26.36681_2" — hai dòng trùng mã trong một đơn.
//
// Các tình huống dưới đây dựng lại từ dữ liệu thật đã rà (513 họ MO có nhiều dòng).

function item(over: Partial<MoFamilyItem> & { moNumber: string | null; lineNumber: number }): MoFamilyItem {
  return { specifications: {}, techClassification: [], ...over };
}

/** Dòng "chính": mang đầy đủ thông tin đơn hàng — giống dòng bare trên production. */
const rich = (moNumber: string | null, lineNumber: number) => item({
  moNumber, lineNumber,
  specifications: { bom: "x", loaiSp: "RI", salesName: "Paul", customerName: "KH.CH1", loaiHang: "A" },
  techClassification: ["LAB"],
  nvl: "14KR", size: "5 US", productName: "Vỏ nhẫn",
});

/** Dòng "đánh dấu phiên bản": mỏng, hầu như không có thông tin — giống dòng .N. */
const thin = (moNumber: string | null, lineNumber: number) => item({
  moNumber, lineNumber,
  specifications: { loaiSp: "RI" },
});

describe("dedupeItemsByMoFamily — bịt lỗi trùng mã khi tạo phiên bản", () => {
  it("đơn 26.10887: hai dòng cùng họ chỉ còn MỘT", () => {
    const out = dedupeItemsByMoFamily([rich("26.36681", 1), thin("26.36681.1", 2)]);
    expect(out).toHaveLength(1);
    expect(out[0].moNumber).toBe("26.36681");
  });

  it("giữ dòng NHIỀU DỮ LIỆU, không phải dòng phiên bản cao nhất", () => {
    // Đây là điểm mấu chốt: rà production thấy dòng gốc giàu hơn ở 376/513 ca. Chọn theo
    // "mới nhất" sẽ mang sang dòng nghèo và đánh mất thông tin đơn hàng.
    const out = dedupeItemsByMoFamily([rich("26.35803", 1), thin("26.35803.2", 2)]);
    expect(out[0].moNumber).toBe("26.35803");
  });

  it("nhưng nếu dòng phiên bản MỚI mới là dòng giàu thì giữ nó (27 ca trên production)", () => {
    const out = dedupeItemsByMoFamily([thin("26.35803", 1), rich("26.35803.2", 2)]);
    expect(out[0].moNumber).toBe("26.35803.2");
  });

  it("ba dòng cùng họ (X, X.2, X.4) gộp còn một", () => {
    const out = dedupeItemsByMoFamily([
      rich("25.34391", 1), thin("25.34391.2", 2), thin("25.34391.4", 3),
    ]);
    expect(out.map(i => i.moNumber)).toEqual(["25.34391"]);
  });

  it("hai họ MO khác nhau vẫn giữ đủ hai dòng — không gộp nhầm", () => {
    const out = dedupeItemsByMoFamily([
      rich("26.36681", 1), thin("26.36681.1", 2),
      rich("26.36962", 3), thin("26.36962.1", 4),
    ]);
    expect(out.map(i => i.moNumber)).toEqual(["26.36681", "26.36962"]);
  });

  it("đơn bình thường (mỗi MO một dòng) KHÔNG bị đổi gì", () => {
    const input = [rich("26.37244", 1), rich("26.37194", 2), rich("26.37261", 3)];
    expect(dedupeItemsByMoFamily(input)).toEqual(input);
  });

  it("giữ nguyên thứ tự lineNumber, không xáo dòng", () => {
    const out = dedupeItemsByMoFamily([
      rich("26.36962", 3), thin("26.36962.1", 4), rich("26.36681", 1),
    ]);
    expect(out.map(i => i.lineNumber)).toEqual([1, 3]);
  });

  it("dòng KHÔNG có moNumber được giữ hết — không có mã thì không thuộc họ nào", () => {
    const out = dedupeItemsByMoFamily([rich(null, 1), rich(null, 2), rich("26.36681", 3)]);
    expect(out).toHaveLength(3);
  });

  it("hoà dữ liệu → ưu tiên phiên bản THẤP hơn (dòng gốc)", () => {
    const out = dedupeItemsByMoFamily([thin("26.36681.1", 2), thin("26.36681", 1)]);
    expect(out[0].moNumber).toBe("26.36681");
  });

  it("hoà cả dữ liệu lẫn phiên bản → lấy lineNumber nhỏ hơn (kết quả tất định)", () => {
    const a = dedupeItemsByMoFamily([thin("26.36681", 5), thin("26.36681", 2)]);
    const b = dedupeItemsByMoFamily([thin("26.36681", 2), thin("26.36681", 5)]);
    expect(a[0].lineNumber).toBe(2);
    expect(b[0].lineNumber).toBe(2);
  });

  it("danh sách rỗng không làm nổ", () => {
    expect(dedupeItemsByMoFamily([])).toEqual([]);
  });
});

describe("Số phiên bản mới vẫn tính đúng sau khi gộp", () => {
  it("26.36681 + 26.36681.1 → phiên bản kế tiếp là _2 (đúng như người dùng mong đợi)", () => {
    // Số mới = max(version trong họ, 1) + 1, tính trên TOÀN BỘ dòng của họ, kể cả dòng bị gộp.
    const family = ["26.36681", "26.36681.1"];
    const maxVer = Math.max(...family.map(versionOf));
    expect(Math.max(maxVer, 1) + 1).toBe(2);
    expect(stripVersionSuffix("26.36681.1")).toBe("26.36681");
  });

  it("25.34391 + .2 + .4 → phiên bản kế tiếp là _5", () => {
    const family = ["25.34391", "25.34391.2", "25.34391.4"];
    expect(Math.max(Math.max(...family.map(versionOf)), 1) + 1).toBe(5);
  });
});

describe("moItemRichness", () => {
  it("đếm specifications có giá trị + phân loại KT + trường scalar", () => {
    expect(moItemRichness(rich("26.36681", 1))).toBe(5 + 1 + 3);
  });

  it("bỏ qua trường rỗng/null/mảng rỗng", () => {
    const it = item({
      moNumber: "x", lineNumber: 1,
      specifications: { a: "", b: null, c: "co" }, techClassification: [], nvl: "",
    });
    expect(moItemRichness(it)).toBe(1);
  });

  it("dòng mỏng luôn thấp điểm hơn dòng đầy đủ", () => {
    expect(moItemRichness(thin("x", 1))).toBeLessThan(moItemRichness(rich("x", 1)));
  });
});
