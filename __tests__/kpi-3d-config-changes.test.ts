import { describe, expect, it } from "vitest";

import {
  diffKpi3DGroups,
  diffWorkingCalendar,
  minutesToHm,
  minutesToHoursText,
  type CalendarSessionSnapshot,
  type Kpi3DGroupSnapshot,
  type WorkingCalendarSnapshot,
} from "@/app/lib/business/kpi-3d/config-changes";

// Danh sách thay đổi là thứ DUY NHẤT chặn admin lưu nhầm cấu hình KPI. Nếu nó bỏ sót một
// dòng thì hộp xác nhận trở thành lời trấn an sai — người dùng đọc thấy "chỉ đổi 1 thứ" rồi
// bấm Đồng ý, trong khi thực tế có thêm một ngày bị xoá sạch ca. Sót ở đây IM LẶNG.

describe("Định dạng số", () => {
  it("phút → HH:mm, có đệm 0", () => {
    expect(minutesToHm(480)).toBe("08:00");
    expect(minutesToHm(545)).toBe("09:05");
    expect(minutesToHm(0)).toBe("00:00");
  });

  it("số giờ nguyên không có '.0' — '3 giờ' dễ đọc hơn '3.0 giờ'", () => {
    expect(minutesToHoursText(180)).toBe("3 giờ");
    expect(minutesToHoursText(90)).toBe("1.5 giờ");
  });
});

describe("Thay đổi Nhóm KPI 3D", () => {
  const g = (o: Partial<Kpi3DGroupSnapshot> = {}): Kpi3DGroupSnapshot => ({
    code: "GROUP_3", name: "Nhóm 3", standardMinutes: 360, isActive: true, ...o,
  });

  it("không đổi gì → danh sách rỗng (nút Lưu phải mờ)", () => {
    expect(diffKpi3DGroups([g()], [g()])).toEqual([]);
  });

  it("đổi số giờ → nói rõ từ mấy sang mấy", () => {
    expect(diffKpi3DGroups([g()], [g({ standardMinutes: 480 })]))
      .toEqual(["Nhóm 3: 6 giờ → 8 giờ"]);
  });

  it("đổi trạng thái dùng/ẩn", () => {
    expect(diffKpi3DGroups([g()], [g({ isActive: false })]))
      .toEqual(["Nhóm 3: Đang dùng → Tạm ẩn"]);
  });

  it("đổi cả hai → hai dòng riêng, không gộp thành một câu mơ hồ", () => {
    expect(diffKpi3DGroups([g()], [g({ standardMinutes: 480, isActive: false })])).toHaveLength(2);
  });

  it("GHÉP THEO CODE, không theo vị trí: đảo chỗ hai dòng KHÔNG phải là thay đổi", () => {
    // Thứ tự do API sắp và có thể đổi. Ghép theo vị trí sẽ báo "Nhóm 1 đổi thành 8 giờ" khi
    // thực ra chỉ là hai dòng đảo chỗ — một lời cảnh báo sai làm người dùng mất tin vào hộp.
    const a = g({ code: "GROUP_1", name: "Nhóm 1", standardMinutes: 180 });
    const b = g({ code: "GROUP_4", name: "Nhóm 4", standardMinutes: 480 });
    expect(diffKpi3DGroups([a, b], [b, a])).toEqual([]);
  });

  it("nhóm lạ không có ở bản cũ thì bỏ qua, không nổ", () => {
    expect(diffKpi3DGroups([], [g()])).toEqual([]);
  });
});

describe("Thay đổi Working Calendar", () => {
  const s = (day: number, start: number, end: number, label: string | null = null): CalendarSessionSnapshot =>
    ({ dayOfWeek: day, startMinute: start, endMinute: end, label });

  const cal = (o: Partial<WorkingCalendarSnapshot> = {}): WorkingCalendarSnapshot => ({
    name: "Lịch chuẩn",
    timezone: "Asia/Ho_Chi_Minh",
    isActive: true,
    isDefault: true,
    sessions: [s(1, 480, 720, "Sáng"), s(1, 780, 900, "Chiều 1"), s(1, 910, 1020, "Chiều 2")],
    holidays: [],
    ...o,
  });

  it("không đổi gì → rỗng", () => {
    expect(diffWorkingCalendar(cal(), cal())).toEqual([]);
  });

  it("TẮT MỘT NGÀY: nêu rõ mất MẤY ca và NHỮNG ca nào", () => {
    // Đây là thay đổi nguy hiểm nhất trên màn đó — chỉ một cú tick vào checkbox trông vô hại,
    // mà hệ quả là toàn bộ ca của ngày biến mất và tick lại không lấy lại được.
    const [line] = diffWorkingCalendar(cal(), cal({ sessions: [] }));
    expect(line).toContain("Thứ 2");
    expect(line).toContain("xoá 3 ca");
    expect(line).toContain("08:00–12:00");
    expect(line).toContain("nghỉ cả ngày");
  });

  it("bật một ngày đang nghỉ", () => {
    expect(diffWorkingCalendar(cal({ sessions: [] }), cal({ sessions: [s(3, 480, 720)] })))
      .toEqual(["Thứ 4: nghỉ → 1 ca (08:00–12:00)"]);
  });

  it("thêm một ca vào ngày đang làm → nói số ca trước và sau", () => {
    const next = cal({ sessions: [...cal().sessions, s(1, 1030, 1100, "Tối")] });
    expect(diffWorkingCalendar(cal(), next)[0]).toBe(
      "Thứ 2: 3 ca → 4 ca (08:00–12:00, 13:00–15:00, 15:10–17:00, 17:10–18:20)",
    );
  });

  it("cùng số ca nhưng đổi giờ → vẫn phải báo", () => {
    const next = cal({ sessions: [s(1, 480, 720, "Sáng"), s(1, 780, 900, "Chiều 1"), s(1, 910, 1080, "Chiều 2")] });
    expect(diffWorkingCalendar(cal(), next)[0]).toContain("đổi giờ ca");
  });

  it("chỉ đổi TÊN ca cũng phải báo — tên ca là dữ liệu, không phải ghi chú", () => {
    const next = cal({ sessions: [s(1, 480, 720, "Ca sáng"), s(1, 780, 900, "Chiều 1"), s(1, 910, 1020, "Chiều 2")] });
    expect(diffWorkingCalendar(cal(), next)).toHaveLength(1);
  });

  it("đổi tên lịch / timezone / trạng thái / mặc định", () => {
    expect(diffWorkingCalendar(cal(), cal({ name: "Lịch mới" }))[0]).toContain("Tên lịch");
    expect(diffWorkingCalendar(cal(), cal({ timezone: "UTC" }))[0]).toContain("Timezone");
    expect(diffWorkingCalendar(cal(), cal({ isActive: false }))[0]).toBe("Trạng thái lịch: Đang dùng → Tạm ẩn");
    expect(diffWorkingCalendar(cal(), cal({ isDefault: false }))[0]).toBe("Lịch mặc định: có → không");
  });

  it("ngày nghỉ: thêm / bỏ / đổi tên", () => {
    const withHoliday = cal({ holidays: [{ date: "2026-09-02", name: "Quốc khánh" }] });
    expect(diffWorkingCalendar(cal(), withHoliday)).toEqual(["Ngày nghỉ: thêm 2026-09-02 (Quốc khánh)"]);
    expect(diffWorkingCalendar(withHoliday, cal())).toEqual(["Ngày nghỉ: bỏ 2026-09-02 (Quốc khánh)"]);
    expect(diffWorkingCalendar(withHoliday, cal({ holidays: [{ date: "2026-09-02", name: "Lễ 2/9" }] })))
      .toEqual(['Ngày nghỉ 2026-09-02: “Quốc khánh” → “Lễ 2/9”']);
  });

  it("nhiều thay đổi cùng lúc → liệt kê ĐỦ, không dừng ở dòng đầu", () => {
    // Nếu chỉ báo dòng đầu thì hộp xác nhận thành lời trấn an sai: người dùng thấy "chỉ đổi
    // tên lịch" rồi bấm Đồng ý, trong khi Thứ 2 đang bị xoá sạch ca.
    const lines = diffWorkingCalendar(cal(), cal({
      name: "Lịch mới",
      sessions: [],
      holidays: [{ date: "2026-09-02", name: "Quốc khánh" }],
    }));
    expect(lines).toHaveLength(3);
    expect(lines.some((l) => l.includes("xoá 3 ca"))).toBe(true);
  });

  it("ca của ngày KHÁC không lẫn vào nhau", () => {
    const next = cal({ sessions: [...cal().sessions, s(2, 480, 720)] });
    const lines = diffWorkingCalendar(cal(), next);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Thứ 3");
  });
});
