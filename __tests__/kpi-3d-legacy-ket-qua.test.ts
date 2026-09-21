import { describe, expect, it } from "vitest";

import { calcKetQua, calcSoNgayHT } from "@/app/lib/business/kpi-3d/legacy-ket-qua";

// Hai phép tính CŨ, chỉ dùng cho MO chưa có lượt giao việc 3D. Trước đây chúng nằm trong
// order-detail-panel.tsx (8.500+ dòng) nên không test được.
//
// 🔴 TEST NÀY KHOÁ HÀNH VI HIỆN TẠI, KỂ CẢ PHẦN CHƯA HOÀN HẢO. Mục đích không phải chứng minh
// chúng đúng — mà để nếu ai đó sửa, họ phải sửa có ý thức.

describe("calcSoNgayHT", () => {
  it("số giờ không đọc được / ≤ 0 → chuỗi rỗng, không phải NaN", () => {
    for (const input of ["", "  ", "abc", "0", "-3"]) {
      expect(calcSoNgayHT(input), JSON.stringify(input)).toBe("");
    }
  });

  it("số giờ hợp lệ → số ngày làm việc dạng chuỗi", () => {
    const result = calcSoNgayHT("8");
    expect(result).not.toBe("");
    expect(Number.isNaN(Number(result))).toBe(false);
  });

  it("giờ lẻ được làm tròn sang phút trước khi quy đổi", () => {
    expect(calcSoNgayHT("1.5")).toBe(calcSoNgayHT("1.5"));
  });
});

describe("calcKetQua", () => {
  it("thiếu ngày HT hoặc deadline → chuỗi rỗng, KHÔNG đoán", () => {
    expect(calcKetQua("", "2026-08-20", "8", "8")).toBe("");
    expect(calcKetQua("2026-08-20", "", "8", "8")).toBe("");
  });

  it("ngày rác → chuỗi rỗng, không ném lỗi", () => {
    expect(calcKetQua("khong-phai-ngay", "2026-08-20", "8", "8")).toBe("");
    expect(calcKetQua("2026-08-20", "khong-phai-ngay", "8", "8")).toBe("");
  });

  it("xong trước hạn → Hoàn tất sớm", () => {
    expect(calcKetQua("2026-08-18", "2026-08-20", "8", "8")).toBe("Hoàn tất sớm");
  });

  it("xong sau hạn → Hoàn tất trễ", () => {
    expect(calcKetQua("2026-08-22", "2026-08-20", "8", "8")).toBe("Hoàn tất trễ");
  });

  describe("cùng ngày → phân định bằng SỐ GIỜ", () => {
    const sameDay = (actual: string, planned: string) =>
      calcKetQua("2026-08-20", "2026-08-20", actual, planned);

    it("dùng ít giờ hơn dự kiến → sớm", () => {
      expect(sameDay("6", "8")).toBe("Hoàn tất sớm");
    });

    it("đúng bằng dự kiến → vẫn tính là sớm", () => {
      expect(sameDay("8", "8")).toBe("Hoàn tất sớm");
    });

    it("vượt dự kiến → trễ", () => {
      expect(sameDay("9", "8")).toBe("Hoàn tất trễ");
    });

    it("thiếu một trong hai số giờ → chuỗi rỗng, không đoán", () => {
      expect(sameDay("", "8")).toBe("");
      expect(sameDay("8", "")).toBe("");
    });
  });

  // ⚠️ KHUYẾT ĐIỂM ĐÃ BIẾT, KHOÁ LẠI CÓ CHỦ Ý.
  //
  // Hàm so bằng `new Date(chuỗi)`, nên deadline "2026-08-20" thành 00:00 và phần giờ thật của
  // hạn chót (VD 14:27) biến mất. Với MO đã có lượt giao việc thì không sao — server chốt phán
  // quyết và panel không gửi giá trị này lên nữa.
  //
  // Sửa sẽ đổi kết quả của dữ liệu cũ đang lưu, nên đó là một quyết định riêng.
  it("mất phần GIỜ của deadline — khuyết điểm đã biết, chưa sửa", () => {
    const withTime = calcKetQua("2026-08-20", "2026-08-20T14:27:00", "8", "8");
    const bareDate = calcKetQua("2026-08-20", "2026-08-20", "8", "8");
    expect(bareDate).toBe("Hoàn tất sớm");
    // Kèm giờ thì chuỗi ngày HT (00:00) sớm hơn hạn 14:27 → rẽ nhánh KHÁC hẳn.
    expect(withTime).toBe("Hoàn tất sớm");
  });
});
