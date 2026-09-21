import { describe, it, expect } from "vitest";
import {
  HOURS_PER_UNIT, QUOTA_PER_WORKDAY,
  daysInMonth, countSundays, workingDays, monthlyQuota,
  resolveWorkDays, standardUnits, resultPercent, buildNguoiKpiSummary,
  type NguoiKpiInput, type NguoiQuotaConfig,
} from "@/app/lib/business/kpi-nguoi";
import { normalizeKpiConfig, toQuotaConfig } from "@/app/lib/api/kpi-report-client";
import { NGUOI_KPI_COLUMNS, nguoiKpiPrintRow } from "@/app/lib/business/kpi-nguoi-display";
import { formatHours } from "@/app/lib/utils";

// Module này chứa công thức KPI dùng để ĐÁNH GIÁ NHÂN SỰ nhưng trước đây không có test nào.
// Sắp có màn thứ hai (bản in Đánh giá Khâu) đọc cùng công thức — chốt hành vi lại trước.

describe("A. Hằng số nghiệp vụ", () => {
  // ⚠️ Hai hằng này là TOÀN BỘ phần "chính sách" của module. Đổi chúng là đổi mọi con số trên
  // bảng đánh giá nhân sự — nên chúng bị chốt tường minh ở đây, không suy ra từ đâu khác.
  it("1 đơn vị chuẩn = 4 giờ, 1 ngày công = 2 đơn vị (ĐM = ngày công × 2)", () => {
    expect(HOURS_PER_UNIT).toBe(4);
    expect(QUOTA_PER_WORKDAY).toBe(2);
  });
});

describe("B. Lịch — số ngày công trong tháng", () => {
  it("daysInMonth đúng cả tháng 30/31 ngày và tháng 2 năm nhuận", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29); // năm nhuận
  });

  it("countSundays đếm đúng số Chủ Nhật", () => {
    // 8/2026 bắt đầu vào Thứ Bảy → CN rơi vào 2, 9, 16, 23, 30 = 5 ngày
    expect(countSundays(2026, 8)).toBe(5);
    expect(countSundays(2026, 2)).toBe(4);
  });

  it("workingDays trừ cả Chủ Nhật lẫn ngày lễ", () => {
    const total = daysInMonth(2026, 8);      // 31
    const sundays = countSundays(2026, 8);   // 5
    expect(workingDays(2026, 8, 0)).toBe(total - sundays);
    expect(workingDays(2026, 8, 3)).toBe(total - sundays - 3);
  });

  it("workingDays không trả số âm khi số ngày lễ vô lý", () => {
    expect(workingDays(2026, 8, 999)).toBe(0);
  });

  it("workingDays bỏ qua số ngày lễ âm (dữ liệu bẩn) thay vì CỘNG thêm ngày", () => {
    expect(workingDays(2026, 8, -5)).toBe(workingDays(2026, 8, 0));
  });

  // 🔴 BẤT BIẾN CỦA NÚM VẶN — và nó đã CHỨNG MINH GIÁ TRỊ. Hệ số từng bị đổi thành 0.5 rồi trả
  // về 2 ngay trong ngày; test này xanh suốt cả hai lần vì nó bám vào HẰNG SỐ, không vào con số
  // 50. Chỉ vài ca chốt con số cụ thể phải sửa — đúng chỗ cần một con người đọc lại.
  it("monthlyQuota = ngày công × QUOTA_PER_WORKDAY, ở mọi giá trị", () => {
    for (const d of [0, 1, 2, 7, 24, 25, 26, 31, 100]) {
      expect(monthlyQuota(d), `${d} ngày công`).toBe(d * QUOTA_PER_WORKDAY);
    }
  });

  it("ngày công âm bị kẹp về 0 — ĐM không bao giờ âm", () => {
    expect(monthlyQuota(-5)).toBe(0);
  });

  // Hệ số hiện là số nguyên nên ra số tròn; phép làm tròn vẫn giữ để hệ số lẻ (đã từng là 0.5)
  // không sinh nhiễu số thực trước khi đem chia ở resultPercent.
  it("ĐM của tháng 25 ngày công = 50 — khớp con số thật trên màn Thống kê", () => {
    expect(monthlyQuota(25)).toBe(50);
    expect(monthlyQuota(7)).toBe(14);
  });
});

describe("C. Ngày công hiệu lực của từng thợ", () => {
  it("chưa nhập → dùng ngày công theo lịch", () => {
    expect(resolveWorkDays(25, undefined)).toBe(25);
    expect(resolveWorkDays(25, null)).toBe(25);
  });

  it("đã nhập → ưu tiên số thực tế (thợ mới / nghỉ dài / bán thời gian)", () => {
    expect(resolveWorkDays(25, 18)).toBe(18);
  });

  it("nhập 0 VẪN được tôn trọng — 0 là giá trị hợp lệ, không phải 'chưa nhập'", () => {
    // Đây là chỗ dễ sai nếu ai đó viết `entered || defaultWorkDays`. Thợ nghỉ cả tháng có 0
    // ngày công thật, và ĐM của họ phải là 0 chứ không phải ĐM cả tháng.
    expect(resolveWorkDays(25, 0)).toBe(0);
  });

  it("số âm bị bỏ qua → về ngày công theo lịch", () => {
    expect(resolveWorkDays(25, -1)).toBe(25);
  });
});

describe("D. Quy đổi đơn vị chuẩn", () => {
  it("tổng giờ ÷ 4", () => {
    expect(standardUnits(24)).toBe(6);
    expect(standardUnits(22)).toBe(5.5);
    expect(standardUnits(0)).toBe(0);
  });

  it("làm tròn 2 chữ số thập phân", () => {
    expect(standardUnits(30.5)).toBe(7.63);  // 7.625 → 7.63
    expect(standardUnits(11)).toBe(2.75);
  });
});

describe("E. Kết quả phần trăm", () => {
  it("SL quy chuẩn ÷ ĐM × 100, làm tròn số nguyên", () => {
    expect(resultPercent(6, 52)).toBe(12);
    expect(resultPercent(2.75, 52)).toBe(5);
    expect(resultPercent(52, 52)).toBe(100);
  });

  it("trả null khi ĐM = 0 — KHÔNG trả 0 hay Infinity", () => {
    // Phân biệt 'không tính được' với 'đạt 0%' là quan trọng: UI hiện "—" thay vì "0%".
    expect(resultPercent(6, 0)).toBeNull();
    expect(resultPercent(0, 0)).toBeNull();
    expect(resultPercent(6, -1)).toBeNull();
  });
});

describe("F. Lắp ráp dòng tổng", () => {
  const cfg: NguoiQuotaConfig = { defaultWorkDays: 26, workDays: { "Thợ Nghỉ Dài": 10 } };
  const base: NguoiKpiInput = {
    crafter: "Huỳnh Nguyên Bảo", code: "", level: "Bậc 3",
    totalHours: 22, moCount: 5, qualityFail: 0, timeFail: 0,
  };

  it("thợ chưa nhập ngày công → dùng lịch, ĐM suy ra từ đó", () => {
    // 22h → 5.5 quy chuẩn. Ngày công lịch 26 → ĐM 52. 5.5/52 = 11%.
    const s = buildNguoiKpiSummary(base, cfg);
    expect(s.units).toBe(5.5);
    expect(s.workDays).toBe(26);
    expect(s.quota).toBe(52);
    expect(s.resultPct).toBe(11);
  });

  it("ÁP DỤNG ngày công riêng của thợ — không dùng thẳng ngày công lịch", () => {
    // Đây chính là lỗi mà việc gom hàm này nhằm ngăn: nơi nào tự ghép mà quên resolveWorkDays
    // sẽ ra 12% thay vì 30%, và chỉ sai ở những thợ CÓ số riêng nên rất khó phát hiện.
    const s = buildNguoiKpiSummary({ ...base, crafter: "Thợ Nghỉ Dài", totalHours: 24 }, cfg);
    expect(s.workDays).toBe(10);
    expect(s.quota).toBe(20);
    expect(s.resultPct).toBe(30); // 6 / 20
  });

  it("giữ nguyên các trường đếm, không tự suy diễn", () => {
    const s = buildNguoiKpiSummary({ ...base, qualityFail: 2, timeFail: 3 }, cfg);
    expect(s.qualityFail).toBe(2);
    expect(s.timeFail).toBe(3);
    expect(s.moCount).toBe(5);
    expect(s.level).toBe("Bậc 3");
  });
});

describe("F3. Chuẩn hoá cấu hình từ API", () => {
  it("thiếu trường / null → về mặc định an toàn, không NaN", () => {
    expect(normalizeKpiConfig(undefined)).toEqual({ holidayDays: 0, workDays: {} });
    expect(normalizeKpiConfig({})).toEqual({ holidayDays: 0, workDays: {} });
    expect(normalizeKpiConfig({ holidayDays: "3" })).toEqual({ holidayDays: 0, workDays: {} });
  });

  it("số ngày lễ âm bị kẹp về 0 — tránh ngày công phồng lên", () => {
    expect(normalizeKpiConfig({ holidayDays: -4 }).holidayDays).toBe(0);
  });

  it("toQuotaConfig ra ngày công lịch ĐÚNG BẰNG công thức, giữ nguyên số đã nhập", () => {
    const cfg = { holidayDays: 3, workDays: { A: 20 } };
    const q = toQuotaConfig(cfg, 2026, 8);
    expect(q.defaultWorkDays).toBe(workingDays(2026, 8, 3));
    expect(q.workDays).toEqual({ A: 20 });
  });
});

describe("G. Định dạng giờ", () => {
  it("số nguyên giờ / có phút lẻ / dưới 1 giờ / bằng 0", () => {
    expect(formatHours(22)).toBe("22h");
    expect(formatHours(30.5)).toBe("30h 30p");
    expect(formatHours(0.5)).toBe("30p");
    expect(formatHours(0)).toBe("—");
  });

  it("làm tròn về phút, không để lộ số thập phân", () => {
    expect(formatHours(4.508)).toBe("4h 30p");
  });
});

describe("H. Dòng bảng in", () => {
  const cfg: NguoiQuotaConfig = { defaultWorkDays: 26, workDays: {} };

  it("MỌI cột khai báo đều có ô tương ứng — chống lỗi thêm cột mà quên thêm ô", () => {
    const row = nguoiKpiPrintRow(buildNguoiKpiSummary({
      crafter: "A", code: "", level: "Bậc 5", totalHours: 24, moCount: 5, qualityFail: 0, timeFail: 0,
    }, cfg));
    for (const col of NGUOI_KPI_COLUMNS) {
      expect(row.cells, `thiếu ô cho cột "${col.key}"`).toHaveProperty(col.key);
    }
  });

  it("giá trị rỗng hiện gạch ngang thay vì số 0 trần", () => {
    const row = nguoiKpiPrintRow(buildNguoiKpiSummary({
      crafter: "B", code: "", level: "", totalHours: 0, moCount: 0, qualityFail: 0, timeFail: 0,
    }, cfg));
    expect(row.cells.totalHrs).toBe("—");
    expect(row.cells.units).toBe("—");
    // Nhưng cột đếm vẫn hiện "0" — 0 công việc là thông tin, không phải thiếu dữ liệu.
    expect(row.cells.clKd).toBe("0");
    expect(row.cells.late).toBe("0");
  });

  it("ĐM = 0 → Kết quả hiện '—', không phải '0%'", () => {
    const row = nguoiKpiPrintRow(buildNguoiKpiSummary({
      crafter: "C", code: "", level: "", totalHours: 24, moCount: 5, qualityFail: 0, timeFail: 0,
    }, { defaultWorkDays: 0, workDays: {} }));
    expect(row.cells.result).toBe("—");
  });
});
