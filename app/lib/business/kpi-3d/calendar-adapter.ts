import type { WorkingCalendar } from "@/app/lib/business/kpi-3d-deadline";
import { toVnHm, toVnYmd, vnWallToInstant } from "@/app/lib/utils/vn-date";

export type ConfiguredWorkingCalendar = {
  sessions: Array<{
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
    isActive?: boolean;
  }>;
  holidays?: Array<{
    date: string | Date;
  }>;
};

function minuteToClock(minute: number) {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// Đọc ngày/giờ theo GIỜ VIỆT NAM, không theo giờ máy chủ — nếu không, giá trị ghi ngược về
// extraData (deadline, gioGiao3D) sẽ khác nhau giữa máy dev và Vercel.
export function formatDateOnly(date: Date) {
  return toVnYmd(date);
}

export function formatTimeOnly(date: Date) {
  return toVnHm(date);
}

function holidayDateKey(value: string | Date) {
  return value instanceof Date ? formatDateOnly(value) : value.slice(0, 10);
}

/**
 * "Ngày giao 3D" + "Giờ giao 3D" do người dùng nhập → mốc thời gian thật.
 *
 * LỖI ĐÃ SỬA: trước đây dùng `new Date("2026-08-03T09:00:00")` — chuỗi KHÔNG có ký hiệu múi
 * giờ nên JavaScript hiểu theo giờ MÁY CHỦ. Trên Vercel (UTC), "09:00" người dùng nhập bị
 * hiểu thành 09:00 UTC (tức 16:00 giờ VN), kéo theo toàn bộ deadline lệch 7 tiếng.
 * Nay quy đổi tường minh: giờ nhập vào LUÔN là giờ Việt Nam.
 */
export function parseWallDateTime(date: string, time: string) {
  const parsed = vnWallToInstant(date, time || "08:00");

  if (!parsed) {
    throw new Error("Invalid assignment datetime.");
  }

  return parsed;
}

export function configuredCalendarToWorkingCalendar(calendar: ConfiguredWorkingCalendar): WorkingCalendar {
  const activeSessions = calendar.sessions.filter((session) => session.isActive !== false);
  const workingDays = new Set(activeSessions.map((session) => session.dayOfWeek));

  return {
    sessions: activeSessions.map((session) => ({
      dayOfWeek: session.dayOfWeek,
      start: minuteToClock(session.startMinute),
      end: minuteToClock(session.endMinute),
    })),
    weeklyDaysOff: [0, 1, 2, 3, 4, 5, 6].filter((day) => !workingDays.has(day)),
    holidays: (calendar.holidays ?? []).map((holiday) => holidayDateKey(holiday.date)),
  };
}
