import { describe, expect, it } from "vitest";
import { formatVnDateTime, maskHmInput, normalizeHm, toVnHm, toVnYmd } from "@/app/lib/utils/vn-date";

// formatVnDateTime: thêm mới vì Deadline KPI hiện "cắt mất giờ" ở sidebar Đơn hàng — nơi hiển
// thị đọc trường JSON dạng "YYYY-MM-DD" (toVnYmd) thay vì mốc đầy đủ. Hàm này gộp cả ngày lẫn
// giờ về MỘT ĐỊNH DẠNG DUY NHẤT, dùng chung cho sidebar và màn NV 3D.

describe("formatVnDateTime", () => {
  it("07:00 UTC = 14:00 giờ VN — đúng ví dụ thực tế (giao 9h, KPI 4h, vắt nghỉ trưa)", () => {
    expect(formatVnDateTime("2026-08-10T07:00:00.000Z")).toBe("14:00 10/08/2026");
  });

  it("nhận cả Date và chuỗi ISO, ra cùng kết quả", () => {
    const iso = "2026-08-10T07:00:00.000Z";
    expect(formatVnDateTime(new Date(iso))).toBe(formatVnDateTime(iso));
  });

  it("null/undefined → gạch ngang, không ném lỗi", () => {
    expect(formatVnDateTime(null)).toBe("—");
    expect(formatVnDateTime(undefined)).toBe("—");
  });

  it("chuỗi rác → gạch ngang, không ném lỗi và không hiện 'Invalid Date'", () => {
    expect(formatVnDateTime("khong-phai-ngay")).toBe("—");
  });

  it("qua nửa đêm giờ VN — ngày hiện ra phải là ngày VN, không phải ngày UTC", () => {
    // 18:00 UTC ngày 10 = 01:00 sáng ngày 11 giờ VN.
    expect(formatVnDateTime("2026-08-10T18:00:00.000Z")).toBe("01:00 11/08/2026");
  });

  it("đệm số 0 cho giờ/phút/ngày/tháng một chữ số", () => {
    // 00:05 UTC ngày 01/01 = 07:05 giờ VN ngày 01/01.
    expect(formatVnDateTime("2026-01-01T00:05:00.000Z")).toBe("07:05 01/01/2026");
  });
});

describe("toVnHm / toVnYmd — hồi quy nhanh, đã dùng ở nơi khác từ trước", () => {
  it("toVnHm đọc đúng giờ-phút VN", () => {
    expect(toVnHm(new Date("2026-08-10T07:00:00.000Z"))).toBe("14:00");
  });

  it("toVnYmd đọc đúng ngày lịch VN, qua cả mốc nửa đêm", () => {
    expect(toVnYmd(new Date("2026-08-10T18:00:00.000Z"))).toBe("2026-08-11");
  });
});

// ─── Ô NHẬP GIỜ LUÔN 24H ─────────────────────────────────────────────────────
//
// ⚠️ Nhầm AM/PM lệch ĐÚNG 12 TIẾNG, và lệch IM LẶNG: "09:35" hợp lệ ở cả hai nửa ngày nên không có
// gì để báo lỗi. Ở màn Tạm dừng con số đó đi thẳng vào "Giờ đã làm" rồi vào KPI của nhân viên; ở
// khai báo tăng ca nó đi vào tiền lương. `<input type="time">` hiện AM/PM hay không là do LOCALE
// MÁY quyết định — nên muốn chắc 24h thì phải tự vẽ ô (TimeInput), và đây là phần logic của nó.
describe("maskHmInput", () => {
  it("gõ tới đâu chèn dấu hai chấm tới đó", () => {
    expect(maskHmInput("0")).toBe("0");
    expect(maskHmInput("09")).toBe("09");
    expect(maskHmInput("093")).toBe("09:3");
    expect(maskHmInput("0935")).toBe("09:35");
  });

  it("bỏ mọi ký tự không phải số", () => {
    expect(maskHmInput("09:35")).toBe("09:35");
  });

  // ⚠️ PHÂN VAI RÕ RÀNG: maskHmInput chỉ CHÈN DẤU theo từng phím, KHÔNG đoán ý.
  // "9h35" → ba số "935" → "93:5" (chưa hợp lệ, và đúng là chưa nên hợp lệ). Việc đọc "935" thành
  // 09:35 là của normalizeHm, chạy lúc RỜI Ô. Gộp hai việc vào một hàm thì ô sẽ tự nhảy số ngay
  // giữa lúc người dùng đang gõ dở — kiểu giao diện tự sửa tay người dùng.
  it("KHÔNG tự chuẩn hoá giữa chừng — đó là việc của normalizeHm lúc rời ô", () => {
    expect(maskHmInput("9h35")).toBe("93:5");
    expect(normalizeHm(maskHmInput("9h35"))).toBe("09:35");
  });

  it("cắt ở 4 số, không cho gõ tràn", () => {
    expect(maskHmInput("093599")).toBe("09:35");
  });
});

describe("normalizeHm", () => {
  it("gõ tắt thành giờ tròn — cách người ta gõ thật", () => {
    expect(normalizeHm("17")).toBe("17:00");
    expect(normalizeHm("7")).toBe("07:00");
  });

  it("ba số thì hai số cuối là phút", () => {
    expect(normalizeHm("935")).toBe("09:35");
  });

  it("đủ bốn số", () => {
    expect(normalizeHm("09:35")).toBe("09:35");
    expect(normalizeHm("2359")).toBe("23:59");
    expect(normalizeHm("0000")).toBe("00:00");
  });

  // ⚠️ 24 GIỜ, KHÔNG PHẢI 12: "24:00" và "13:00" phải xử lý khác nhau rõ ràng.
  it("giờ quá 23 hoặc phút quá 59 → null, không tự cuộn vòng", () => {
    expect(normalizeHm("2400")).toBeNull();
    expect(normalizeHm("0960")).toBeNull();
    expect(normalizeHm("9999")).toBeNull();
  });

  it("13:00 hợp lệ — đây chính là thứ AM/PM không diễn tả được trong một ô", () => {
    expect(normalizeHm("1300")).toBe("13:00");
  });

  it("rỗng hoặc rác → null", () => {
    expect(normalizeHm("")).toBeNull();
    expect(normalizeHm("abc")).toBeNull();
    expect(normalizeHm("12345")).toBeNull();
  });
});
