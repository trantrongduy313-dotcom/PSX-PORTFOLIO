import { describe, expect, it } from "vitest";

import {
  DEFAULT_3D_WORKING_CALENDAR,
  calculate3DKpiDeadline,
  countWorkingMinutesBetween,
  minutesPerWorkingDay,
  type WorkingCalendar,
} from "@/app/lib/business/kpi-3d-deadline";

// "Giờ thực tế" sai KHÔNG ném lỗi — nó chỉ hiện một con số trông hợp lệ rồi chảy vào báo cáo
// KPI và vào đánh giá nhân viên. Nên từng quy tắc đếm phải có test.
//
// Mọi mốc dưới đây viết bằng giờ VN (+07:00) cho đọc được; hàm nhận Date tuyệt đối.
const vn = (iso: string) => new Date(`${iso}+07:00`);

// Lịch mặc định: nghỉ Chủ nhật, 3 ca — 08:00–12:00 (240p), 13:00–15:00 (120p), 15:10–17:00 (110p)
// = 470 phút/ngày.

describe("Đếm giờ làm việc giữa hai mốc", () => {
  it("trong cùng một ca → đúng số phút giữa hai mốc", () => {
    expect(countWorkingMinutesBetween(vn("2026-08-10T09:00"), vn("2026-08-10T11:30"))).toBe(150);
  });

  it("BỎ GIỜ NGHỈ TRƯA: 11:00 → 14:00 chỉ tính 60p sáng + 60p chiều", () => {
    // Nếu lấy hiệu số giờ tường thì ra 180p — tính công cho một giờ không ai làm việc.
    expect(countWorkingMinutesBetween(vn("2026-08-10T11:00"), vn("2026-08-10T14:00"))).toBe(120);
  });

  it("bỏ cả khoảng nghỉ 15:00–15:10 giữa hai ca chiều", () => {
    expect(countWorkingMinutesBetween(vn("2026-08-10T14:30"), vn("2026-08-10T15:30"))).toBe(50);
  });

  it("mốc bắt đầu NGOÀI giờ làm → chỉ tính từ lúc ca mở", () => {
    // Giao việc 06:00 thì không ai làm lúc 06:00; tính từ 08:00.
    expect(countWorkingMinutesBetween(vn("2026-08-10T06:00"), vn("2026-08-10T09:00"))).toBe(60);
  });

  it("mốc kết thúc sau giờ tan làm → dừng ở lúc ca đóng", () => {
    expect(countWorkingMinutesBetween(vn("2026-08-10T16:00"), vn("2026-08-10T22:00"))).toBe(60);
  });

  it("cả khoảng nằm ngoài giờ làm → 0, không phải số âm hay NaN", () => {
    expect(countWorkingMinutesBetween(vn("2026-08-10T20:00"), vn("2026-08-10T23:00"))).toBe(0);
  });

  it("TRỌN MỘT NGÀY LÀM = 470 phút, không phải 1440", () => {
    expect(countWorkingMinutesBetween(vn("2026-08-10T00:00"), vn("2026-08-11T00:00"))).toBe(470);
  });

  it("BỎ CHỦ NHẬT: chiều thứ Bảy → sáng thứ Hai", () => {
    // 2026-08-15 là thứ Bảy, 16 là Chủ nhật, 17 là thứ Hai.
    // Thứ Bảy 16:00→17:00 = 60p, Chủ nhật = 0, thứ Hai 08:00→09:00 = 60p.
    const minutes = countWorkingMinutesBetween(vn("2026-08-15T16:00"), vn("2026-08-17T09:00"));
    expect(minutes).toBe(120);
  });

  it("giờ tường 65 tiếng qua cuối tuần chỉ còn 2 giờ làm việc — đúng cái bẫy phải tránh", () => {
    const wallHours = (vn("2026-08-17T09:00").getTime() - vn("2026-08-14T16:00").getTime()) / 3_600_000;
    expect(Math.round(wallHours)).toBe(65);
    // Thứ Sáu 16:00→17:00 = 60p; thứ Bảy cả ngày 470p; Chủ nhật 0; thứ Hai 08:00→09:00 = 60p.
    expect(countWorkingMinutesBetween(vn("2026-08-14T16:00"), vn("2026-08-17T09:00"))).toBe(590);
  });

  it("BỎ NGÀY LỄ đã cấu hình", () => {
    const withHoliday: WorkingCalendar = {
      ...DEFAULT_3D_WORKING_CALENDAR,
      holidays: ["2026-08-11"],
    };
    // 10/08 09:00→17:00 = 240+120+110 - 60 (từ 08:00 tới 09:00 không tính) = 410p; 11/08 nghỉ lễ.
    expect(countWorkingMinutesBetween(vn("2026-08-10T09:00"), vn("2026-08-11T17:00"), withHoliday)).toBe(410);
  });

  it("to <= from → 0. Dữ liệu thật CÓ ca này (lượt giao lại dời assignedAt về sau)", () => {
    // Một con số âm sẽ lặng lẽ chảy vào báo cáo KPI mà không ai thấy.
    expect(countWorkingMinutesBetween(vn("2026-08-10T11:00"), vn("2026-08-10T09:00"))).toBe(0);
    expect(countWorkingMinutesBetween(vn("2026-08-10T09:00"), vn("2026-08-10T09:00"))).toBe(0);
  });

  it("ngày tháng hỏng → 0, không NaN", () => {
    expect(countWorkingMinutesBetween(new Date("x"), vn("2026-08-10T09:00"))).toBe(0);
    expect(countWorkingMinutesBetween(vn("2026-08-10T09:00"), new Date("x"))).toBe(0);
  });

  it("KHỚP với hàm đi xuôi: deadline của N phút cách mốc giao đúng N phút làm việc", () => {
    // Đây là bài kiểm tra quan trọng nhất — hai hàm phải nói cùng một điều về cùng một lịch.
    // Nếu lệch thì "Số giờ KPI" và "Giờ thực tế" đo bằng hai thước khác nhau.
    for (const standardMinutes of [30, 180, 470, 940, 1500]) {
      const assignedAt = vn("2026-08-13T14:20");
      const deadline = calculate3DKpiDeadline(assignedAt, standardMinutes);
      expect(countWorkingMinutesBetween(assignedAt, deadline)).toBe(standardMinutes);
    }
  });

  it("khớp cả khi mốc giao nằm ngoài giờ làm (đêm, Chủ nhật)", () => {
    for (const iso of ["2026-08-16T10:00", "2026-08-14T22:30", "2026-08-13T12:15"]) {
      const assignedAt = vn(iso);
      const deadline = calculate3DKpiDeadline(assignedAt, 300);
      expect(countWorkingMinutesBetween(assignedAt, deadline)).toBe(300);
    }
  });
});

describe("Số phút một ngày làm việc", () => {
  it("lịch mặc định ra 470 phút, KHÔNG phải 480", () => {
    // calcSoNgayHT cũ chia cứng cho 8 giờ = 480 phút. Lệch ~2%, và lệch nhiều hơn khi sửa ca.
    expect(minutesPerWorkingDay()).toBe(470);
  });

  it("lấy trung bình khi các ngày có số ca khác nhau", () => {
    const calendar: WorkingCalendar = {
      weeklyDaysOff: [0],
      holidays: [],
      sessions: [
        { dayOfWeek: 1, start: "08:00", end: "12:00" }, // thứ 2: 240p
        { dayOfWeek: 2, start: "08:00", end: "10:00" }, // thứ 3: 120p
      ],
    };
    // Chỉ thứ 2 và thứ 3 có ca → (240 + 120) / 2 = 180.
    expect(minutesPerWorkingDay(calendar)).toBe(180);
  });

  it("lịch không có ca nào → 0, không chia cho 0", () => {
    expect(minutesPerWorkingDay({ weeklyDaysOff: [], holidays: [], sessions: [] })).toBe(0);
  });
});
