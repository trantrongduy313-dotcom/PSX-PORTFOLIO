import { describe, expect, it } from "vitest";

import {
  activeSessions,
  buildCalendarPayload,
  calendarToForm,
  createSessionDraft,
  dateOnly,
  timeToMinutes,
  validateCalendarForm,
  type CalendarFormState,
} from "@/app/lib/business/kpi-3d/calendar-form";

// Lịch làm việc quyết định MỌI deadline KPI 3D. Luật này từng nằm thẳng trong file UI
// (kpi-3d-config-client.tsx, 1.355 dòng) và không có test nào — sai ở đây là lệch deadline
// im lặng cho toàn bộ đơn, và không có gì lên tiếng.

const session = (over: Partial<CalendarFormState["sessions"][number]> = {}) => ({
  draftId: "s1", dayOfWeek: 1, startTime: "08:00", endTime: "12:00", label: "", sortOrder: 1,
  ...over,
});

const form = (over: Partial<CalendarFormState> = {}): CalendarFormState => ({
  id: "cal-1",
  name: "Lịch chuẩn",
  timezone: "Asia/Ho_Chi_Minh",
  isDefault: true,
  isActive: true,
  sessions: [session()],
  holidays: [],
  disabledDays: [],
  ...over,
});

describe("timeToMinutes", () => {
  it("đọc được giờ hợp lệ", () => {
    expect(timeToMinutes("08:30")).toBe(510);
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("23:59")).toBe(1439);
  });

  // 🔴 Trả 0 thay vì null cho giờ hỏng là im lặng biến "8h" thành "nửa đêm".
  it("giờ ngoài khoảng hoặc sai định dạng → null, KHÔNG phải 0", () => {
    for (const bad of ["24:00", "08:60", "8:00", "0800", "", "aa:bb"]) {
      expect(timeToMinutes(bad)).toBeNull();
    }
  });
});

describe("dateOnly", () => {
  it("cắt phần giờ khỏi chuỗi ISO", () => {
    expect(dateOnly("2026-09-02T00:00:00.000Z")).toBe("2026-09-02");
  });
});

describe("ngày bị tắt", () => {
  const twoDays = form({
    sessions: [session({ draftId: "a", dayOfWeek: 1 }), session({ draftId: "b", dayOfWeek: 2 })],
    disabledDays: [2],
  });

  // 🔴 Bài học đã trả giá, ghi trong chính kiểu dữ liệu: bản trước TẮT một ngày là XOÁ SẠCH ca
  // của ngày đó, và tick lại chỉ tạo một ca mặc định — một cú click làm mất cả
  // "Sáng / Chiều 1 / Chiều 2" và không có đường lấy lại.
  it("tắt một ngày → ca của ngày đó VẪN nằm trong nháp", () => {
    expect(twoDays.sessions).toHaveLength(2);
    expect(activeSessions(twoDays)).toHaveLength(1);
  });

  it("ca của ngày bị tắt KHÔNG được gửi lên server", () => {
    expect(buildCalendarPayload(twoDays).sessions.map((s) => s.dayOfWeek)).toEqual([1]);
  });

  // Ca của ngày đang tắt không gửi lên nên cũng không cần hợp lệ — bắt nó là khoá người dùng
  // lại vì một ô họ đã tắt đi.
  it("ca HỎNG của ngày đang tắt → vẫn cho lưu", () => {
    const withBrokenDisabled = form({
      sessions: [session({ dayOfWeek: 1 }), session({ draftId: "x", dayOfWeek: 3, startTime: "99:99" })],
      disabledDays: [3],
    });
    expect(validateCalendarForm(withBrokenDisabled)).toBeNull();
  });
});

describe("validateCalendarForm", () => {
  it("form hợp lệ → null", () => {
    expect(validateCalendarForm(form())).toBeNull();
  });

  it("thiếu tên hoặc múi giờ → báo lỗi", () => {
    expect(validateCalendarForm(form({ name: "  " }))).toContain("tên lịch");
    expect(validateCalendarForm(form({ timezone: "" }))).toContain("múi giờ");
  });

  // Lịch mặc định mà không dùng nữa thì hệ thống không còn lịch nào để tính deadline.
  it("lịch mặc định nhưng ngừng dùng → chặn", () => {
    expect(validateCalendarForm(form({ isDefault: true, isActive: false }))).toContain("mặc định");
  });

  it("không còn ca nào có hiệu lực → chặn", () => {
    expect(validateCalendarForm(form({ disabledDays: [1] }))).toContain("ít nhất một ca");
  });

  it("giờ sai định dạng → chặn", () => {
    expect(validateCalendarForm(form({ sessions: [session({ startTime: "8:00" })] })))
      .toBe("Giờ làm việc không hợp lệ");
  });

  it("kết thúc không sau bắt đầu → chặn, kể cả khi bằng nhau", () => {
    for (const endTime of ["08:00", "07:00"]) {
      expect(validateCalendarForm(form({ sessions: [session({ endTime })] })))
        .toBe("Giờ kết thúc phải lớn hơn giờ bắt đầu");
    }
  });

  // 🔴 Hai ca chồng giờ là một khoảng thời gian được đếm HAI LẦN vào ngân sách KPI — mọi
  // deadline của ngày đó dài ra mà không ai thấy.
  it("hai ca cùng ngày chồng giờ → chặn, nêu đúng thứ", () => {
    const overlapping = form({
      sessions: [
        session({ draftId: "a", dayOfWeek: 1, startTime: "08:00", endTime: "12:00" }),
        session({ draftId: "b", dayOfWeek: 1, startTime: "11:00", endTime: "17:00" }),
      ],
    });
    expect(validateCalendarForm(overlapping)).toContain("trùng giờ");
  });

  it("hai ca liền kề, không chồng → cho qua", () => {
    const backToBack = form({
      sessions: [
        session({ draftId: "a", dayOfWeek: 1, startTime: "08:00", endTime: "12:00" }),
        session({ draftId: "b", dayOfWeek: 1, startTime: "12:00", endTime: "17:00" }),
      ],
    });
    expect(validateCalendarForm(backToBack)).toBeNull();
  });

  // Chồng giờ chỉ tính TRONG cùng một ngày.
  it("hai ca chồng giờ nhưng KHÁC ngày → cho qua", () => {
    const differentDays = form({
      sessions: [
        session({ draftId: "a", dayOfWeek: 1, startTime: "08:00", endTime: "12:00" }),
        session({ draftId: "b", dayOfWeek: 2, startTime: "08:00", endTime: "12:00" }),
      ],
    });
    expect(validateCalendarForm(differentDays)).toBeNull();
  });

  it("ngày nghỉ thiếu ngày hoặc tên → chặn", () => {
    expect(validateCalendarForm(form({ holidays: [{ draftId: "h", date: "", name: "Tết" }] })))
      .toContain("cần có ngày và tên");
    expect(validateCalendarForm(form({ holidays: [{ draftId: "h", date: "2026-01-01", name: " " }] })))
      .toContain("cần có ngày và tên");
  });

  // Trùng ngày nghỉ khiến cùng một ngày bị trừ hai lần khỏi lịch.
  it("hai ngày nghỉ trùng ngày → chặn", () => {
    const duplicated = form({
      holidays: [
        { draftId: "h1", date: "2026-01-01", name: "Tết" },
        { draftId: "h2", date: "2026-01-01", name: "Tết dương" },
      ],
    });
    expect(validateCalendarForm(duplicated)).toContain("trùng ngày");
  });
});

describe("buildCalendarPayload", () => {
  it("sắp theo ngày rồi theo giờ, và đánh lại sortOrder liên tục từ 1", () => {
    const unsorted = form({
      sessions: [
        session({ draftId: "c", dayOfWeek: 2, startTime: "08:00", endTime: "12:00", sortOrder: 9 }),
        session({ draftId: "b", dayOfWeek: 1, startTime: "13:00", endTime: "17:00", sortOrder: 5 }),
        session({ draftId: "a", dayOfWeek: 1, startTime: "08:00", endTime: "12:00", sortOrder: 7 }),
      ],
    });

    const payload = buildCalendarPayload(unsorted);

    expect(payload.sessions.map((s) => [s.dayOfWeek, s.startMinute])).toEqual([[1, 480], [1, 780], [2, 480]]);
    expect(payload.sessions.map((s) => s.sortOrder)).toEqual([1, 2, 3]);
  });

  it("nhãn rỗng hoặc toàn khoảng trắng → gửi null, không gửi chuỗi rỗng", () => {
    expect(buildCalendarPayload(form({ sessions: [session({ label: "   " })] })).sessions[0].label)
      .toBeNull();
  });

  it("cắt khoảng trắng thừa ở tên và múi giờ", () => {
    const payload = buildCalendarPayload(form({ name: "  Lịch A  ", timezone: " Asia/Ho_Chi_Minh " }));
    expect(payload.name).toBe("Lịch A");
    expect(payload.timezone).toBe("Asia/Ho_Chi_Minh");
  });

  // Dòng ngày nghỉ điền dở là rác người dùng chưa xoá, không phải dữ liệu.
  it("bỏ dòng ngày nghỉ điền dở", () => {
    const partial = form({
      holidays: [
        { draftId: "h1", date: "2026-01-01", name: "Tết" },
        { draftId: "h2", date: "", name: "chưa xong" },
        { draftId: "h3", date: "2026-05-01", name: "  " },
      ],
    });
    expect(buildCalendarPayload(partial).holidays).toEqual([{ date: "2026-01-01", name: "Tết" }]);
  });
});

describe("calendarToForm", () => {
  it("đổi số phút của server thành ô giờ, và cắt giờ khỏi ngày nghỉ", () => {
    const result = calendarToForm({
      id: "cal-1", name: "Lịch", timezone: "Asia/Ho_Chi_Minh", isDefault: true, isActive: true,
      sessions: [{ id: "s1", dayOfWeek: 1, startMinute: 510, endMinute: 1020, label: null, sortOrder: 1 }],
      holidays: [{ id: "h1", date: "2026-01-01T00:00:00.000Z", name: "Tết" }],
    });

    expect(result.sessions[0].startTime).toBe("08:30");
    expect(result.sessions[0].endTime).toBe("17:00");
    // `label: null` phải thành chuỗi rỗng — ô input không nhận null.
    expect(result.sessions[0].label).toBe("");
    expect(result.holidays[0].date).toBe("2026-01-01");
  });

  // Mở lại form là bắt đầu từ trạng thái server: không ngày nào đang tắt.
  it("mở lại form → không có ngày nào bị tắt sẵn", () => {
    const result = calendarToForm({
      id: "c", name: "n", timezone: "t", isDefault: false, isActive: true, sessions: [], holidays: [],
    });
    expect(result.disabledDays).toEqual([]);
  });
});

describe("createSessionDraft", () => {
  it("nhận draftId từ ngoài — hàm không tự sinh id", () => {
    expect(createSessionDraft(3, 2, "draft-x")).toEqual({
      draftId: "draft-x", dayOfWeek: 3, startTime: "08:00", endTime: "12:00", label: "", sortOrder: 2,
    });
  });
});
