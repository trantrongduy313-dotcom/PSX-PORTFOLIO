import { describe, expect, it } from "vitest";

import { productSpecRows, type ProductSpecSource } from "@/app/lib/business/product-specs";

// NV 3D dựng mẫu theo đúng những dòng này. Thiếu một dòng thì họ dựng sai thông số mà không ai
// biết cho tới lúc kiểm — nên từng quy tắc lọc/gộp phải có test.

const src = (o: Partial<ProductSpecSource> = {}): ProductSpecSource => ({ ...o });

describe("Đổi thông số sản phẩm thành dòng hiển thị", () => {
  it("không có gì → danh sách rỗng, không phải chín dòng gạch ngang", () => {
    expect(productSpecRows(src())).toEqual([]);
    expect(productSpecRows(null)).toEqual([]);
    expect(productSpecRows(undefined)).toEqual([]);
  });

  it("BỎ HẲN dòng trống thay vì hiện '—'", () => {
    // Khối có tới chín trường mà một MO thường chỉ nhập bốn năm cái. Hiện đủ chín thì hơn nửa
    // khối là dấu gạch ngang và NV 3D phải đọc qua chúng để tìm thứ có thật.
    const rows = productSpecRows(src({ nvl: "18KW", size: null, color: "" }));
    expect(rows).toEqual([{ label: "NVL", value: "18KW" }]);
  });

  it("giữ ĐÚNG THỨ TỰ ưu tiên: Diễn giải SP → NVL → Size → TL → ... ", () => {
    const rows = productSpecRows(src({
      techNote: "Lắc charm trái tim", nvl: "18KW", size: "7", weightGram: 3.5, platingType: "white",
    }));
    expect(rows.map((r) => r.label)).toEqual(["Diễn giải SP", "NVL", "Size", "TL YC (g)", "Xi mạ"]);
  });

  it("chuỗi chỉ có khoảng trắng không tính là có dữ liệu", () => {
    expect(productSpecRows(src({ nvl: "   ", size: "\t" }))).toEqual([]);
  });

  it("cắt khoảng trắng hai đầu", () => {
    expect(productSpecRows(src({ nvl: "  18KW  " }))[0].value).toBe("18KW");
  });
});

describe("Trọng lượng", () => {
  it("bỏ số 0 vô nghĩa ở cuối — Prisma trả Decimal ra chuỗi '3.500'", () => {
    // Hiện nguyên "3.500" trông như độ chính xác tới miligram trong khi Order chỉ gõ "3.5".
    expect(productSpecRows(src({ weightGram: "3.500" }))[0].value).toBe("3.5");
  });

  it("nhận cả number", () => {
    expect(productSpecRows(src({ weightGram: 12 }))[0].value).toBe("12");
  });

  it("0 hoặc rác → bỏ dòng, không hiện '0 g'", () => {
    expect(productSpecRows(src({ weightGram: 0 }))).toEqual([]);
    expect(productSpecRows(src({ weightGram: "abc" }))).toEqual([]);
    expect(productSpecRows(src({ weightGram: -5 }))).toEqual([]);
  });
});

describe("Số lượng", () => {
  it("SL = 1 thì KHÔNG nêu — gần như mọi MO đều là 1, dòng đó không mang tin", () => {
    expect(productSpecRows(src({ quantity: 1 }))).toEqual([]);
  });

  it("SL khác 1 thì PHẢI nêu — đó là thứ NV 3D cần biết ngay", () => {
    expect(productSpecRows(src({ quantity: 3 }))).toEqual([{ label: "SL", value: "3" }]);
  });

  it("SL = 0 hoặc null → bỏ", () => {
    expect(productSpecRows(src({ quantity: 0 }))).toEqual([]);
    expect(productSpecRows(src({ quantity: null }))).toEqual([]);
  });
});

describe("Đá chủ gộp một dòng", () => {
  it("loại + thông số + số viên", () => {
    const rows = productSpecRows(src({ mainStoneType: "CVD", mainStoneSize: "0.3ct", mainStoneQty: 2 }));
    expect(rows).toEqual([{ label: "Đá chủ", value: "CVD · 0.3ct · 2 viên" }]);
  });

  it("chỉ có loại", () => {
    expect(productSpecRows(src({ mainStoneType: "moissanite" }))[0].value).toBe("moissanite");
  });

  it("chỉ có thông số, không có loại", () => {
    expect(productSpecRows(src({ mainStoneSize: "4x6mm" }))[0].value).toBe("4x6mm");
  });

  it("số viên = 0 thì không nêu", () => {
    expect(productSpecRows(src({ mainStoneType: "CZ", mainStoneQty: 0 }))[0].value).toBe("CZ");
  });

  it("không có gì về đá → không có dòng Đá chủ", () => {
    expect(productSpecRows(src({ mainStoneQty: 0 }))).toEqual([]);
  });
});

describe("Phân loại kỹ thuật", () => {
  it("nhiều giá trị → nối bằng dấu phẩy", () => {
    const rows = productSpecRows(src({ techClassification: ["TRƠN", "LAB"] }));
    expect(rows).toEqual([{ label: "Phân loại KT", value: "TRƠN, LAB" }]);
  });

  it("mảng rỗng → bỏ dòng", () => {
    expect(productSpecRows(src({ techClassification: [] }))).toEqual([]);
  });

  it("mảng chỉ có chuỗi rỗng → bỏ dòng, không hiện dấu phẩy trơ trọi", () => {
    expect(productSpecRows(src({ techClassification: ["", "  "] }))).toEqual([]);
  });
});

// ─── Diễn giải SP ────────────────────────────────────────────────────────────
//
// 🔴 TRƯỜNG NÀY CÓ MỘT ANH EM DỄ NHẦM. Màn Việc thiết kế 3D hiện HAI khối chữ:
//
//   "Diễn giải SP"        = OrderItem.techNote      · PTK/PSX điền ở tab Kỹ thuật  ← ở đây
//   "Yêu cầu chi tiết KT" = design.yeucauKyThuat    · ORDER điền khi giao việc
//
// Màn đó TỪNG hiện techNote dưới nhãn của cái kia — xem cảnh báo ở kpi-3d/design-request.ts.
// Nay cả hai cùng hiện, mỗi thứ một nhãn. Test dưới đây chốt nhãn để lần sau không dán nhầm.

describe("Diễn giải SP", () => {
  it("hiện dưới ĐÚNG nhãn 'Diễn giải SP' — không phải 'Yêu cầu chi tiết KT'", () => {
    const rows = productSpecRows(src({ techNote: "Lắc charm trái tim + cà heo" }));
    expect(rows).toEqual([{ label: "Diễn giải SP", value: "Lắc charm trái tim + cà heo" }]);
  });

  // ĐỨNG ĐẦU theo đúng thứ tự cột của bảng Đơn hàng (DIỄN GIẢI SP trước NVL/SIZE): nó nói sản
  // phẩm LÀ GÌ, các thông số phía dưới chỉ định lượng cho nó.
  it("đứng TRƯỚC mọi thông số khác", () => {
    const rows = productSpecRows(src({ engraving: "ABC", techNote: "Vỏ nhẫn", nvl: "18KY" }));
    expect(rows[0]).toEqual({ label: "Diễn giải SP", value: "Vỏ nhẫn" });
  });

  it("trống / chỉ khoảng trắng → BỎ HẲN dòng, như mọi thông số khác", () => {
    expect(productSpecRows(src({ techNote: "" }))).toEqual([]);
    expect(productSpecRows(src({ techNote: "   " }))).toEqual([]);
    expect(productSpecRows(src({ techNote: null }))).toEqual([]);
  });

  it("cắt khoảng trắng hai đầu, giữ nguyên xuống dòng bên trong", () => {
    const rows = productSpecRows(src({ techNote: "  dòng 1\ndòng 2  " }));
    expect(rows[0].value).toBe("dòng 1\ndòng 2");
  });
});
