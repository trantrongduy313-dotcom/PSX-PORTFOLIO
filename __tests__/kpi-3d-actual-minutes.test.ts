import { describe, expect, it } from "vitest";

import {
  actualMinutesHint,
  actualMinutesToHours,
  hasDesign3DResult,
  resolveActualMinutes,
  workingDaysFromMinutes,
} from "@/app/lib/business/kpi-3d/actual-minutes";

// Yêu cầu của user có hai phần chống nhau nếu làm cẩu thả: "tự động xuất hiện khi hoàn thành"
// NHƯNG "vẫn cho Order sửa khi cần". Một con số vừa hệ thống ghi vừa người sửa mà không phân
// biệt được sẽ hỏng im lặng — công sửa bị ghi đè, hoặc người đọc báo cáo không biết đang đọc số
// của ai. Nên từng nhánh chọn số phải có test.

describe("Chọn số nào: hệ thống đo hay Order sửa tay", () => {
  it("chỉ có số hệ thống → dùng số hệ thống", () => {
    expect(resolveActualMinutes({ systemMinutes: 115, manualHours: null }))
      .toEqual({ minutes: 115, source: "SYSTEM", systemMinutes: 115 });
  });

  it("SỐ SỬA TAY THẮNG số hệ thống", () => {
    // Order chỉ gõ vào khi họ biết điều hệ thống không biết (NV làm hộ máy khác, quên bấm gửi
    // kết quả, việc bị gián đoạn ngoài lịch). Để hệ thống thắng thì ô sửa thành vô nghĩa.
    const r = resolveActualMinutes({ systemMinutes: 115, manualHours: 5 });
    expect(r.minutes).toBe(300);
    expect(r.source).toBe("MANUAL");
  });

  it("giữ RIÊNG số hệ thống kể cả khi đã bị sửa tay — còn đường quay về", () => {
    expect(resolveActualMinutes({ systemMinutes: 115, manualHours: 5 }).systemMinutes).toBe(115);
  });

  it("chưa có gì cả → NONE, không phải 0", () => {
    // 0 và "chưa có" là hai chuyện khác nhau: một cái nói việc xong trong 0 phút, một cái nói
    // chưa ai đo. Trộn hai thứ đó là cách ô này từng hiện "0" cho đơn đã duyệt.
    expect(resolveActualMinutes({ systemMinutes: null, manualHours: null }))
      .toEqual({ minutes: null, source: "NONE", systemMinutes: null });
  });

  it("SỐ 0 TRONG JSON KHÔNG TÍNH LÀ ĐÃ SỬA — đúng lỗi đang thấy trên màn hình", () => {
    // Ô nhập cũ để trống lưu thành 0, và toàn bộ dữ liệu staging đang là `gioThucTe: 0`.
    // Coi 0 là "Order cố ý ghi 0 giờ" sẽ khiến mọi lượt cũ che mất số hệ thống vừa đo được.
    const r = resolveActualMinutes({ systemMinutes: 115, manualHours: 0 });
    expect(r.minutes).toBe(115);
    expect(r.source).toBe("SYSTEM");
  });

  it("SỐ HỆ THỐNG NHẬN CẢ 0 — 'đo được và ra 0' khác 'không đo được'", () => {
    // ĐỔI QUY TẮC CÓ CHỦ Ý. Gộp hai thứ đó thành NONE là lý do thật khiến ô "Giờ thực tế" vẫn
    // trống dù đã sửa hai lần: NV bấm nhận việc rồi gửi kết quả trong CÙNG một phút → phép đo
    // ra 0 → bị coi như không đo được → hiện "—".
    // Tới được đây thì số 0 rác trong cột đã bị resolveSystemActualMinutes loại và thay bằng
    // phép đo thật, nên 0 ở đây LÀ một phép đo.
    const r = resolveActualMinutes({ systemMinutes: 0, manualHours: null });
    expect(r.minutes).toBe(0);
    expect(r.source).toBe("SYSTEM");
  });

  it("số hệ thống ÂM vẫn không tính — âm thì không phải phép đo", () => {
    expect(resolveActualMinutes({ systemMinutes: -30, manualHours: null }).source).toBe("NONE");
  });

  it("NaN / undefined không lọt qua thành con số", () => {
    expect(resolveActualMinutes({ systemMinutes: undefined, manualHours: NaN }).source).toBe("NONE");
    expect(resolveActualMinutes({ systemMinutes: NaN, manualHours: undefined }).source).toBe("NONE");
  });

  it("giờ sửa tay lẻ → làm tròn về phút", () => {
    expect(resolveActualMinutes({ systemMinutes: null, manualHours: 1.5 }).minutes).toBe(90);
    expect(resolveActualMinutes({ systemMinutes: null, manualHours: 2.25 }).minutes).toBe(135);
  });
});

describe("Đổi phút sang giờ để đổ vào ô nhập", () => {
  it("làm tròn tới 0.01 giờ", () => {
    expect(actualMinutesToHours(115)).toBe(1.92);
    expect(actualMinutesToHours(180)).toBe(3);
  });

  it("null giữ nguyên null — ô để trống, không phải 0", () => {
    expect(actualMinutesToHours(null)).toBeNull();
  });
});

describe("Số ngày hoàn tất", () => {
  it("chia theo NGÀY LÀM VIỆC CỦA LỊCH (470 phút), không phải hằng số 8 giờ", () => {
    // calcSoNgayHT cũ chia cứng cho 8: 470/480 = 0.98 → làm tròn 1.0. Đúng phải là 1.0 ngày
    // vì 470 phút CHÍNH LÀ trọn một ngày làm việc của lịch này.
    expect(workingDaysFromMinutes(470)).toBe(1);
  });

  it("hai ngày làm việc", () => {
    expect(workingDaysFromMinutes(940)).toBe(2);
  });

  it("nửa ngày → 0.5", () => {
    expect(workingDaysFromMinutes(235)).toBe(0.5);
  });

  it("chưa đo được → null", () => {
    expect(workingDaysFromMinutes(null)).toBeNull();
  });

  it("đo được 0 phút → 0 ngày, KHÔNG phải null", () => {
    // Nếu trả null thì ô "Giờ thực tế" hiện 0 mà ô "Số ngày HT" hiện "—" — hai ô cạnh nhau nói
    // hai điều khác nhau về cùng một phép đo.
    expect(workingDaysFromMinutes(0)).toBe(0);
  });

  it("số âm → null", () => {
    expect(workingDaysFromMinutes(-60)).toBeNull();
  });

  it("lịch không có ca nào → null, không chia cho 0 ra Infinity", () => {
    expect(workingDaysFromMinutes(470, { weeklyDaysOff: [], holidays: [], sessions: [] })).toBeNull();
  });
});

describe("Khối Kết quả thực hiện có gì để hiện hay không", () => {
  it("CHƯA GIAO VIỆC → ẩn hẳn. Đây là vấn đề chính đang sửa", () => {
    // Lúc Order giao việc, bốn ô kết quả không thể có nội dung nhưng vẫn hiện ra thành
    // dd/mm/yyyy, 0, —, — chen vào giữa bốn ô Order đang phải điền: cần điền 4 mà form hiện 10.
    expect(hasDesign3DResult({ hasAssignment: false, minutes: null })).toBe(false);
  });

  it("chưa giao việc thì dù có số nào lọt vào cũng vẫn ẩn", () => {
    // Không có lượt giao việc thì mọi con số ở đây đều là rác từ JSON cũ.
    expect(hasDesign3DResult({
      hasAssignment: false, minutes: 300, completedYmd: "2026-08-11", ketQuaLabel: "Đúng hạn",
    })).toBe(false);
  });

  it("đã giao nhưng NV chưa làm gì → vẫn ẩn", () => {
    expect(hasDesign3DResult({ hasAssignment: true, minutes: null })).toBe(false);
    expect(hasDesign3DResult({ hasAssignment: true, minutes: null, completedYmd: "", ketQuaLabel: "" })).toBe(false);
  });

  it("có ngày hoàn tất → hiện", () => {
    expect(hasDesign3DResult({ hasAssignment: true, minutes: null, completedYmd: "2026-08-11" })).toBe(true);
  });

  it("có kết quả KPI → hiện", () => {
    expect(hasDesign3DResult({ hasAssignment: true, minutes: null, ketQuaLabel: "Đúng hạn" })).toBe(true);
  });

  it("có giờ thực tế → hiện, kể cả khi chưa có ngày hoàn tất", () => {
    expect(hasDesign3DResult({ hasAssignment: true, minutes: 115 })).toBe(true);
  });

  it("chuỗi chỉ có khoảng trắng KHÔNG tính là có dữ liệu", () => {
    expect(hasDesign3DResult({ hasAssignment: true, minutes: null, completedYmd: "   ", ketQuaLabel: "  " })).toBe(false);
  });
});

describe("Chú thích nói rõ đang đọc số của ai", () => {
  it("số hệ thống → nêu rõ đo từ đâu tới đâu và chỉ tính giờ làm việc", () => {
    const hint = actualMinutesHint("SYSTEM");
    expect(hint).toContain("nhận việc");
    expect(hint).toContain("giờ làm việc");
  });

  it("số sửa tay → nói rõ đang KHÔNG dùng số hệ thống", () => {
    expect(actualMinutesHint("MANUAL")).toContain("sửa tay");
  });

  it("chưa có → không hứa hẹn gì về số đang hiện", () => {
    expect(actualMinutesHint("NONE")).not.toContain("sửa tay");
  });
});
