// Luật của form Lịch làm việc KPI 3D — lịch này quyết định mọi deadline 3D.
// Bẫy đã biết nằm ở tên test: __tests__/kpi-3d-calendar-form.test.ts

import { DAY_OPTIONS, minutesToHm } from "@/app/lib/business/kpi-3d/config-changes";

export type CalendarSessionDraft = {
  draftId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label: string;
  sortOrder: number;
};

export type CalendarHolidayDraft = { draftId: string; date: string; name: string };

export type CalendarFormState = {
  id: string;
  name: string;
  timezone: string;
  isDefault: boolean;
  isActive: boolean;
  sessions: CalendarSessionDraft[];
  holidays: CalendarHolidayDraft[];
  /** Ngày bị tắt mà CA VẪN ĐƯỢC GIỮ — bản trước tắt là xoá sạch, không lấy lại được. */
  disabledDays: number[];
};

type SourceCalendar = {
  id: string;
  name: string;
  timezone: string;
  isDefault: boolean;
  isActive: boolean;
  sessions: Array<{
    id: string; dayOfWeek: number; startMinute: number; endMinute: number;
    label: string | null; sortOrder: number;
  }>;
  holidays: Array<{ id: string; date: string; name: string }>;
};

/** Cắt phần giờ khỏi chuỗi ngày — ô ngày nghỉ chỉ nhận `yyyy-mm-dd`. */
export const dateOnly = (date: string): string => date.slice(0, 10);

/** `null` khi không đọc được. Giờ ngoài 00:00–23:59 cũng là không đọc được. */
export function timeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function createSessionDraft(
  dayOfWeek: number,
  sortOrder: number,
  draftId: string,
): CalendarSessionDraft {
  return { draftId, dayOfWeek, startTime: "08:00", endTime: "12:00", label: "", sortOrder };
}

export function calendarToForm(calendar: SourceCalendar): CalendarFormState {
  return {
    id: calendar.id,
    name: calendar.name,
    timezone: calendar.timezone,
    isDefault: calendar.isDefault,
    isActive: calendar.isActive,
    sessions: calendar.sessions.map((session) => ({
      draftId: session.id,
      dayOfWeek: session.dayOfWeek,
      startTime: minutesToHm(session.startMinute),
      endTime: minutesToHm(session.endMinute),
      label: session.label ?? "",
      sortOrder: session.sortOrder,
    })),
    holidays: calendar.holidays.map((holiday) => ({
      draftId: holiday.id,
      date: dateOnly(holiday.date),
      name: holiday.name,
    })),
    disabledDays: [],
  };
}

/** Ca thật sự có hiệu lực — đã loại ngày bị tắt. */
export function activeSessions(form: CalendarFormState): CalendarSessionDraft[] {
  return form.sessions.filter((session) => !form.disabledDays.includes(session.dayOfWeek));
}

/** Ca của ngày đang tắt KHÔNG được gửi lên. `sortOrder` đánh lại theo thứ tự đã sắp. */
export function buildCalendarPayload(form: CalendarFormState) {
  const sessions = activeSessions(form)
    .map((session) => ({
      dayOfWeek: session.dayOfWeek,
      startMinute: timeToMinutes(session.startTime) ?? 0,
      endMinute: timeToMinutes(session.endTime) ?? 0,
      label: session.label.trim() || null,
      sortOrder: session.sortOrder,
    }))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute)
    .map((session, index) => ({ ...session, sortOrder: index + 1 }));

  return {
    name: form.name.trim(),
    timezone: form.timezone.trim(),
    isDefault: form.isDefault,
    isActive: form.isActive,
    sessions,
    holidays: form.holidays
      .map((holiday) => ({ date: holiday.date, name: holiday.name.trim() }))
      .filter((holiday) => holiday.date && holiday.name),
  };
}

/** Câu lỗi ĐẦU TIÊN gặp phải, hoặc `null` khi hợp lệ. */
export function validateCalendarForm(form: CalendarFormState): string | null {
  if (!form.name.trim()) return "Vui lòng nhập tên lịch làm việc";
  if (!form.timezone.trim()) return "Vui lòng nhập múi giờ";
  // Lịch mặc định mà không dùng nữa thì hệ thống không còn lịch nào để tính deadline.
  if (form.isDefault && !form.isActive) return "Lịch mặc định phải ở trạng thái đang dùng";

  // Chỉ xét ca CÓ HIỆU LỰC: ca của ngày đang tắt không được gửi lên nên cũng không cần hợp lệ.
  const live = activeSessions(form);
  if (live.length === 0) return "Vui lòng cấu hình ít nhất một ca làm việc";

  const normalized = live.map((session) => ({
    dayOfWeek: session.dayOfWeek,
    startMinute: timeToMinutes(session.startTime),
    endMinute: timeToMinutes(session.endTime),
  }));

  for (const session of normalized) {
    if (session.startMinute === null || session.endMinute === null) return "Giờ làm việc không hợp lệ";
    if (session.endMinute <= session.startMinute) return "Giờ kết thúc phải lớn hơn giờ bắt đầu";
  }

  // Hai ca chồng giờ là một khoảng thời gian được đếm HAI LẦN vào ngân sách KPI.
  for (const day of DAY_OPTIONS) {
    const ofDay = normalized
      .filter((session) => session.dayOfWeek === day.value)
      .sort((a, b) => (a.startMinute ?? 0) - (b.startMinute ?? 0));
    for (let index = 1; index < ofDay.length; index++) {
      const previous = ofDay[index - 1];
      const current = ofDay[index];
      if (previous.endMinute !== null && current.startMinute !== null &&
          current.startMinute < previous.endMinute) {
        return `Ca làm việc ${day.label} đang bị trùng giờ`;
      }
    }
  }

  const seenDates = new Set<string>();
  for (const holiday of form.holidays) {
    if (!holiday.date || !holiday.name.trim()) return "Ngày nghỉ cần có ngày và tên";
    if (seenDates.has(holiday.date)) return "Ngày nghỉ không được trùng ngày";
    seenDates.add(holiday.date);
  }

  return null;
}
