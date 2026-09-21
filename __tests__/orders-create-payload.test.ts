import { describe, expect, it } from "vitest";

import {
  calcDukien,
  formatDateVN,
  parseZodErrors,
  toPayload,
  todayVn,
  type FormDraft,
  type ItemDraft,
} from "@/app/lib/business/orders/create-order-payload";

// Luật của form Tạo đơn từng nằm thẳng trong create-order-form.tsx (1.233 dòng), không test.
// Đây là chỗ quyết định dữ liệu nào đi vào DB cho một đơn MỚI — sai ở đây là đơn sai từ lúc
// sinh ra, và mọi màn sau đều đọc lại cái sai đó.

const item = (over: Partial<ItemDraft> = {}): ItemDraft => ({
  moId: "26.36938", tenSp: "Nhẫn", nvl: "18K", soLuong: "1", size: "",
  trongLuongYc: "", xiMa: "", loaiHotChu: "", thongSoDaChu: "",
  thongSoDaTam: "", file3d: "", dienGiai: "", ghiChuSp: "",
  ...over,
});

const form = (over: Partial<FormDraft> = {}): FormDraft => ({
  soOdoo: "26.10905", khachHang: "Khách lẻ", salesName: "Sale A",
  nguon: "CH1", phanLoaiKh: "", uuTien: "Normal",
  ngayChot: "2026-09-01", ngayDukien: "2026-09-08", dateIsAuto: true,
  donHang3Sao: false, linkChat: "", ghiChu: "",
  loaiDon: "production", items: [item()],
  ...over,
});

const STORES = { CH1: "store-uuid-1" };

describe("todayVn", () => {
  // 🔴 Dùng UTC trần thì trong khung 00:00–07:00 giờ VN, ngày mặc định của form LÙI MỘT NGÀY.
  it("00:30 giờ VN → vẫn là ngày hôm đó, không lùi về hôm trước", () => {
    // 17:30 UTC ngày 31/08 = 00:30 VN ngày 01/09.
    expect(todayVn(new Date("2026-08-31T17:30:00.000Z"))).toBe("2026-09-01");
  });

  it("giữa trưa giờ VN → đúng ngày", () => {
    expect(todayVn(new Date("2026-09-01T05:00:00.000Z"))).toBe("2026-09-01");
  });
});

describe("calcDukien", () => {
  it("cộng đúng số ngày SLA của mức ưu tiên", () => {
    const due = calcDukien("Normal", "2026-09-01");
    expect(due).toMatch(/^2026-09-\d{2}$/);
    expect(due > "2026-09-01").toBe(true);
  });

  // 🔴 Parse theo giờ LOCAL rồi đọc lại bằng toISOString là hai múi giờ, LỆCH MỘT NGÀY:
  // máy VN (+7) đọc "00:00 ngày 19" thành "17:00 ngày 18 UTC" rồi cắt ra "18".
  it("không lệch ngày dù máy ở múi giờ dương", () => {
    // SLA của UT1 là số ngày cố định; chỉ cần kết quả cách mốc ĐÚNG số ngày đó.
    const start = "2026-09-19";
    const due = calcDukien("UT1", start);
    const days = (Date.parse(`${due}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
    expect(Number.isInteger(days)).toBe(true);
    expect(days).toBeGreaterThan(0);
  });

  it("qua ranh giới tháng vẫn đúng", () => {
    expect(calcDukien("Normal", "2026-08-30").startsWith("2026-09")).toBe(true);
  });

  // Thiếu một trong hai thì để TRỐNG — bịa ra một ngày là đặt hạn mà không ai chọn.
  it("thiếu ưu tiên hoặc thiếu ngày chốt → chuỗi rỗng", () => {
    expect(calcDukien("", "2026-09-01")).toBe("");
    expect(calcDukien("Normal", "")).toBe("");
  });
});

describe("formatDateVN", () => {
  it("đổi sang dd/mm/yyyy", () => {
    expect(formatDateVN("2026-09-01")).toBe("01/09/2026");
  });

  it("chuỗi rỗng → chuỗi rỗng, không ra 'undefined/undefined/'", () => {
    expect(formatDateVN("")).toBe("");
  });
});

describe("parseZodErrors", () => {
  it("gộp đường dẫn thành khoá phẳng", () => {
    const map = parseZodErrors([{ path: ["items", 0, "moNumber"], message: "Bắt buộc" }]);
    expect(map["items.0.moNumber"]).toBe("Bắt buộc");
  });

  // Hiện lỗi thứ hai đè lên lỗi đầu là bắt người dùng sửa theo thứ tự ngược.
  it("một ô nhiều lỗi → giữ lỗi ĐẦU TIÊN", () => {
    const map = parseZodErrors([
      { path: ["khachHang"], message: "Bắt buộc" },
      { path: ["khachHang"], message: "Quá ngắn" },
    ]);
    expect(map.khachHang).toBe("Bắt buộc");
  });
});

describe("toPayload — cấp đơn", () => {
  it("cắt khoảng trắng ở SO#", () => {
    expect(toPayload(form({ soOdoo: "  26.10905  " }), STORES).orderNumber).toBe("26.10905");
  });

  // 🔴 Server phân biệt "không gửi" với "gửi chuỗi rỗng": gửi rỗng là GHI ĐÈ giá trị cũ bằng
  // rỗng, còn không gửi là để nguyên.
  it("ô trống → KHÔNG gửi trường đó, không gửi chuỗi rỗng", () => {
    const payload = toPayload(form({ linkChat: "", phanLoaiKh: "", salesName: "", ghiChu: "  " }), STORES);
    expect(payload.linkChat).toBeUndefined();
    expect(payload.phanLoaiKh).toBeUndefined();
    expect(payload.salesName).toBeUndefined();
    expect(payload.saleNote).toBeUndefined();
  });

  it("nguồn có trong danh mục → gửi kèm FK cửa hàng", () => {
    expect(toPayload(form({ nguon: "CH1" }), STORES).storeId).toBe("store-uuid-1");
  });

  // Mã lạ (danh mục đổi, dữ liệu cũ) → gửi `nguon` nhưng KHÔNG bịa FK.
  it("nguồn không có trong danh mục → không gửi FK, vẫn gửi mã", () => {
    const payload = toPayload(form({ nguon: "CH9" }), STORES);
    expect(payload.storeId).toBeUndefined();
    expect(payload.nguon).toBe("CH9");
  });

  it("không chọn ưu tiên → mặc định Normal", () => {
    expect(toPayload(form({ uuTien: "" }), STORES).priorityCode).toBe("Normal");
  });

  it("ngày gửi lên là mốc UTC nửa đêm của đúng ngày người dùng chọn", () => {
    const payload = toPayload(form({ ngayChot: "2026-09-19", ngayDukien: "2026-09-26" }), STORES);
    expect(payload.estimatedDate).toBe("2026-09-19T00:00:00.000Z");
    expect(payload.requiredDate).toBe("2026-09-26T00:00:00.000Z");
  });

  // Tab Phòng Thiết Kế xoá sạch ngày → không gửi. Server KHÔNG còn tự bịa ngày thay.
  it("ngày để trống → không gửi, không thay bằng hôm nay", () => {
    const payload = toPayload(form({ ngayChot: "", ngayDukien: "" }), STORES);
    expect(payload.estimatedDate).toBeUndefined();
    expect(payload.requiredDate).toBeUndefined();
  });
});

describe("toPayload — cấp MO", () => {
  const first = (over: Partial<ItemDraft>) => toPayload(form({ items: [item(over)] }), STORES).items[0];

  it("cắt khoảng trắng ở MO# và link file 3D", () => {
    const line = first({ moId: " 26.36938 ", file3d: "  https://drive/x  " });
    expect(line.moNumber).toBe("26.36938");
    expect(line.designFileUrl).toBe("https://drive/x");
  });

  it("số lượng không đọc được → 1, không phải NaN", () => {
    for (const soLuong of ["", "abc", "0"]) {
      expect(first({ soLuong }).quantity).toBe(1);
    }
  });

  // 🔴 Trọng lượng 0 hoặc âm là chưa cân, không phải "cân được 0g". Gửi 0 lên là ghi một số
  // đo không có thật vào đơn.
  it("trọng lượng trống, 0 hoặc âm → KHÔNG gửi", () => {
    for (const trongLuongYc of ["", "0", "-5"]) {
      expect(first({ trongLuongYc }).weightGram).toBeUndefined();
    }
  });

  it("trọng lượng hợp lệ → gửi dạng số, không phải chuỗi", () => {
    expect(first({ trongLuongYc: "3.75" }).weightGram).toBe(3.75);
  });

  // Khoá `chiTietDaTam` phải khớp đúng cái sidebar đọc — lệch tên là dữ liệu vào DB rồi
  // nhưng sidebar không bao giờ hiện.
  it("đá tấm và ghi chú SP vào specifications, đúng tên khoá", () => {
    const specs = first({ thongSoDaTam: "2ly x 10v", ghiChuSp: "gấp" }).specifications;
    expect(specs).toEqual({ chiTietDaTam: "2ly x 10v", ghiChuSp: "gấp" });
  });

  // specifications rỗng mà vẫn gửi `{}` là ghi đè specs cũ bằng object rỗng.
  it("không có gì để nhét vào specifications → KHÔNG gửi trường đó", () => {
    expect(first({ thongSoDaTam: "", ghiChuSp: "" }).specifications).toBeUndefined();
  });

  it("mỗi MO trên form thành một dòng trong payload", () => {
    const payload = toPayload(form({ items: [item({ moId: "a" }), item({ moId: "b" })] }), STORES);
    expect(payload.items.map((line) => line.moNumber)).toEqual(["a", "b"]);
  });
});
