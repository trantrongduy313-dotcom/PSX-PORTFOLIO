import { describe, expect, it } from "vitest";

import {
  KPI_USAGE_REVIEW_THRESHOLD,
  formatKpiUsage,
  formatKpiUsagePercent,
  kpiUsageLevel,
  kpiUsageNotice,
  kpiUsageRatio,
} from "@/app/lib/business/kpi-3d/kpi-usage";

// Lượt thật đã sinh ra yêu cầu này: 26.37669_1 — KPI Nhóm 2 = 4 giờ, giờ thực tế 39 phút.
const REAL = { actualMinutes: 39, standardMinutes: 240 };

describe("kpiUsageRatio", () => {
  it("lượt thật 26.37669_1 → 16%", () => {
    expect(formatKpiUsagePercent(kpiUsageRatio(REAL))).toBe("16%");
  });

  it("độc lập với độ dài KPI — đó là toàn bộ lý do dùng tỉ lệ", () => {
    // "Sớm 3 giờ" trên việc 4 giờ và trên việc 40 giờ là hai chuyện khác hẳn nhau. Tỉ lệ thì
    // so được: cùng một mức nhanh cho ra cùng một con số.
    expect(kpiUsageRatio({ actualMinutes: 39, standardMinutes: 240 })).toBeCloseTo(
      kpiUsageRatio({ actualMinutes: 78, standardMinutes: 480 })!,
    );
  });

  it.each([
    ["actualMinutes null", { actualMinutes: null, standardMinutes: 240 }],
    ["actualMinutes 0 — ô nhập cũ để trống lưu thành 0", { actualMinutes: 0, standardMinutes: 240 }],
    ["actualMinutes âm", { actualMinutes: -5, standardMinutes: 240 }],
    ["standardMinutes 0 — chia 0 ra Infinity", { actualMinutes: 39, standardMinutes: 0 }],
    ["standardMinutes null", { actualMinutes: 39, standardMinutes: null }],
    ["NaN", { actualMinutes: Number.NaN, standardMinutes: 240 }],
  ])("trả null khi %s", (_l, input) => {
    // 🔴 null CHỨ KHÔNG PHẢI 0. "Chưa có số đo" và "làm xong trong 0 phút" là hai chuyện khác
    // hẳn nhau — gộp lại là mọi lượt cũ chưa có actualMinutes bị gắn cờ VERY_FAST, đúng loại
    // báo động giả làm người ta bỏ qua cả cảnh báo thật.
    expect(kpiUsageRatio(input)).toBeNull();
  });
});

describe("kpiUsageLevel", () => {
  it("lượt thật là VERY_FAST", () => {
    expect(kpiUsageLevel(kpiUsageRatio(REAL))).toBe("VERY_FAST");
  });

  it("biên ngưỡng: ĐÚNG ngưỡng là bình thường, chỉ DƯỚI mới gắn cờ", () => {
    // Kiểm biên vì `<` hay `<=` sai một bậc ở đây là gắn cờ cho một lượt vừa đúng mức chấp nhận.
    expect(kpiUsageLevel(KPI_USAGE_REVIEW_THRESHOLD)).toBe("NORMAL");
    expect(kpiUsageLevel(KPI_USAGE_REVIEW_THRESHOLD - 0.001)).toBe("VERY_FAST");
  });

  it("dùng đúng 100% giờ KPI vẫn là bình thường, không phải OVER", () => {
    expect(kpiUsageLevel(1)).toBe("NORMAL");
    expect(kpiUsageLevel(1.01)).toBe("OVER");
  });

  it("không có số đo thì không có mức", () => {
    expect(kpiUsageLevel(null)).toBeNull();
  });
});

describe("formatKpiUsage — phải TỰ CHỨNG MINH ĐƯỢC", () => {
  it("kèm cả hai con số, không chỉ tỉ lệ", () => {
    // Một mình "16%" buộc người đọc đi tìm hai con số kia ở hai dòng khác để tự kiểm. Đây là dữ
    // liệu ảnh hưởng tới đánh giá công việc của một người.
    expect(formatKpiUsage(REAL)).toBe("16% (39 phút / 4 giờ)");
  });

  it("giờ lẻ phút vẫn đọc được", () => {
    expect(formatKpiUsage({ actualMinutes: 90, standardMinutes: 270 })).toBe("33% (1 giờ 30 phút / 4 giờ 30 phút)");
  });

  it("thiếu số đo thì gạch ngang, không phải 0%", () => {
    expect(formatKpiUsage({ actualMinutes: null, standardMinutes: 240 })).toBe("—");
  });
});

describe("kpiUsageNotice — LỜI NHẮC, KHÔNG PHẢI LỜI CÁO BUỘC", () => {
  it("có nhắc với lượt thật", () => {
    expect(kpiUsageNotice(REAL)).toContain("16%");
    expect(kpiUsageNotice(REAL)).toContain("xem kỹ bản thiết kế");
  });

  it("🔴 KHÔNG mang giọng buộc tội", () => {
    // Ràng buộc quan trọng nhất của module này. Nộp nhanh THƯỜNG LÀ CHUYỆN TỐT — mẫu quen, đơn
    // giống đơn cũ, thợ giỏi. Một dòng chữ mang giọng buộc tội sẽ dạy cả phòng cách GIỮ VIỆC LẠI
    // CHO ĐỦ GIỜ MỚI NỘP: chậm hơn, và không ai nói ra vì sao.
    const text = kpiUsageNotice(REAL)!;
    for (const word of ["đáng ngờ", "quá nhanh", "vi phạm", "gian", "sai", "cảnh báo"]) {
      expect(text.toLowerCase(), `không được chứa "${word}"`).not.toContain(word);
    }
  });

  it("lượt bình thường và lượt quá giờ đều KHÔNG bị nhắc", () => {
    // Yêu cầu chỉ nói về "nộp sớm quá nhiều". Nhắc thêm ca dùng quá giờ ở đây là trộn hai vấn đề
    // vào một dòng chữ, và người đọc mất khả năng biết dấu này nghĩa là gì.
    expect(kpiUsageNotice({ actualMinutes: 200, standardMinutes: 240 })).toBeNull();
    expect(kpiUsageNotice({ actualMinutes: 300, standardMinutes: 240 })).toBeNull();
  });

  it("không có số đo thì im lặng", () => {
    expect(kpiUsageNotice({ actualMinutes: 0, standardMinutes: 240 })).toBeNull();
  });
});
