import { fromVnWall, toVnWall } from "@/app/lib/utils/vn-date";

// ─────────────────────────────────────────────────────────────────────────────
// Tính Deadline KPI theo khung giờ làm việc — NEO CỨNG vào giờ Việt Nam.
//
// LỖI ĐÃ SỬA: bản trước dùng getHours/setHours/getDay (đọc theo giờ MÁY CHỦ). Máy dev chạy
// giờ VN nên thử ở local thấy đúng, nhưng Vercel chạy UTC → hệ thống áp khung giờ làm việc
// 08:00–17:00 theo UTC, khiến mọi deadline lệch 7 tiếng và việc chấm Đúng/Trễ hạn sai theo.
//
// Nay mọi phép tính giờ-phút chạy trong không gian "giờ tường VN" (xem toVnWall ở
// app/lib/utils/vn-date.ts — nguồn duy nhất về ngày giờ VN), chỉ quy đổi ở hai đầu vào/ra.
// Kết quả giống hệt nhau bất kể máy chủ đặt múi giờ nào.
// ─────────────────────────────────────────────────────────────────────────────

export type WorkingSession = {
  dayOfWeek?: number;
  start: string;
  end: string;
};

export type WorkingCalendar = {
  weeklyDaysOff: number[];
  holidays: string[];
  sessions: WorkingSession[];
};

export type Kpi3DResultStatus = "ON_TIME" | "LATE";

export type Kpi3DEvaluation = {
  status: Kpi3DResultStatus;
  deltaMinutes: number;
  earlyMinutes: number;
  lateMinutes: number;
};

export const DEFAULT_3D_WORKING_CALENDAR: WorkingCalendar = {
  weeklyDaysOff: [0],
  holidays: [],
  sessions: [
    { start: "08:00", end: "12:00" },
    { start: "13:00", end: "15:00" },
    { start: "15:10", end: "17:00" },
  ],
};

function assertValidKpiMinutes(standardMinutes: number) {
  if (!Number.isFinite(standardMinutes) || standardMinutes < 0) {
    throw new Error("standardMinutes must be a non-negative finite number");
  }
}

// LƯU Ý: mọi hàm dưới đây nhận/trả Date ở KHÔNG GIAN GIỜ TƯỜNG VN (đã qua toVnWall), nên
// dùng getUTC*/setUTC* — không phụ thuộc múi giờ máy chủ.
function dateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseClock(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid working time: ${value}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error(`Invalid working time: ${value}`);
  return hour * 60 + minute;
}

function minutesOfDay(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function atMinutes(date: Date, minutes: number): Date {
  const next = new Date(date);
  next.setUTCHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function sortedSessions(calendar: WorkingCalendar, date?: Date): Array<{ start: number; end: number }> {
  const dayOfWeek = date?.getUTCDay();

  return calendar.sessions
    .filter((session) => dayOfWeek === undefined || session.dayOfWeek === undefined || session.dayOfWeek === dayOfWeek)
    .map((session) => ({ start: parseClock(session.start), end: parseClock(session.end) }))
    .filter((session) => session.end > session.start)
    .sort((a, b) => a.start - b.start);
}

function isWorkingDate(date: Date, calendar: WorkingCalendar): boolean {
  return (
    !calendar.weeklyDaysOff.includes(date.getUTCDay()) &&
    !calendar.holidays.includes(dateKey(date)) &&
    sortedSessions(calendar, date).length > 0
  );
}

function firstWorkingInstantOnOrAfter(date: Date, calendar: WorkingCalendar): Date {
  const allSessions = sortedSessions(calendar);
  if (allSessions.length === 0) throw new Error("Working calendar must contain at least one valid session");

  let cursor = new Date(date);
  cursor.setSeconds(0, 0);

  for (let guard = 0; guard < 370; guard += 1) {
    if (!isWorkingDate(cursor, calendar)) {
      cursor = atMinutes(addDays(cursor, 1), allSessions[0].start);
      continue;
    }

    const sessions = sortedSessions(calendar, cursor);
    const currentMinute = minutesOfDay(cursor);
    for (const session of sessions) {
      if (currentMinute < session.start) return atMinutes(cursor, session.start);
      if (currentMinute >= session.start && currentMinute < session.end) return cursor;
    }

    cursor = atMinutes(addDays(cursor, 1), allSessions[0].start);
  }

  throw new Error("Unable to find a working instant within one year");
}

export function calculate3DKpiDeadline(
  assignedAt: Date,
  standardMinutes: number,
  calendar: WorkingCalendar = DEFAULT_3D_WORKING_CALENDAR,
): Date {
  assertValidKpiMinutes(standardMinutes);
  let remaining = Math.round(standardMinutes);
  // Vào không gian giờ tường VN; mọi phép tính bên dưới đọc/ghi bằng getUTC*/setUTC*.
  let cursor = firstWorkingInstantOnOrAfter(toVnWall(assignedAt), calendar);
  if (remaining === 0) return fromVnWall(cursor);

  const allSessions = sortedSessions(calendar);
  if (allSessions.length === 0) throw new Error("Working calendar must contain at least one valid session");

  for (let guard = 0; guard < 20000; guard += 1) {
    if (!isWorkingDate(cursor, calendar)) {
      cursor = firstWorkingInstantOnOrAfter(addDays(cursor, 1), calendar);
      continue;
    }

    const sessions = sortedSessions(calendar, cursor);
    const currentMinute = minutesOfDay(cursor);
    const activeSession = sessions.find(
      (session) => currentMinute >= session.start && currentMinute < session.end,
    );

    if (!activeSession) {
      cursor = firstWorkingInstantOnOrAfter(cursor, calendar);
      continue;
    }

    const available = activeSession.end - currentMinute;
    if (remaining <= available) return fromVnWall(new Date(cursor.getTime() + remaining * 60_000));

    remaining -= available;
    cursor = firstWorkingInstantOnOrAfter(atMinutes(cursor, activeSession.end), calendar);
  }

  throw new Error("Unable to calculate KPI deadline");
}

/**
 * Đếm số PHÚT LÀM VIỆC giữa hai mốc — hàm đi NGƯỢC của calculate3DKpiDeadline.
 *
 * VÌ SAO KHÔNG LẤY HIỆU SỐ GIỜ TƯỜNG: "Số giờ KPI" và Deadline đều đo bằng giờ làm việc theo
 * lịch — calculate3DKpiDeadline bước qua từng ca, bỏ ngày nghỉ, bỏ giờ nghỉ giữa ca. Lấy
 * `to - from` thô thì:
 *
 *     Giao 16:00 thứ Sáu, xong 09:00 thứ Hai → giờ tường 65 giờ, giờ làm việc thật ~2 giờ.
 *
 * Và đem 65 giờ đó so với "3 giờ KPI" là so hai đơn vị khác nhau. Đúng lỗi đang có ở ô
 * "Sớm / Trễ": nó hiện "Trễ 142 giờ 11 phút" trong khi phần lớn là đêm và Chủ nhật.
 *
 * DÙNG LẠI ĐÚNG bộ đi qua ca/ngày nghỉ của calculate3DKpiDeadline (sortedSessions,
 * isWorkingDate). Viết một bộ đi riêng là chắc chắn có ngày Deadline và Giờ thực tế nói hai
 * điều khác nhau về cùng một lịch — loại lỗi tách-đôi-định-nghĩa đã phải dọn nhiều lần ở dự án này.
 *
 * Trả 0 khi `to <= from`: dữ liệu thật CÓ trường hợp mốc nhận việc nằm sau mốc hoàn tất (lượt
 * giao lại làm assignedAt dời về sau). Một con số âm sẽ lặng lẽ chảy vào báo cáo KPI.
 */
export function countWorkingMinutesBetween(
  from: Date,
  to: Date,
  calendar: WorkingCalendar = DEFAULT_3D_WORKING_CALENDAR,
): number {
  const start = toVnWall(from);
  const end = toVnWall(to);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 0;
  if (end.getTime() <= start.getTime()) return 0;

  let total = 0;
  let cursor = atMinutes(start, 0);
  const lastDay = atMinutes(end, 0).getTime();

  // Chặn vòng lặp vô hạn nếu ngày tháng bị hỏng. 4000 ngày ≈ 11 năm — xa hơn mọi lượt giao
  // việc có thật, nên tới hạn này nghĩa là dữ liệu sai chứ không phải khoảng đo hợp lệ.
  for (let guard = 0; guard < 4000 && cursor.getTime() <= lastDay; guard += 1) {
    if (isWorkingDate(cursor, calendar)) {
      for (const session of sortedSessions(calendar, cursor)) {
        const lo = Math.max(atMinutes(cursor, session.start).getTime(), start.getTime());
        const hi = Math.min(atMinutes(cursor, session.end).getTime(), end.getTime());
        if (hi > lo) total += Math.round((hi - lo) / 60_000);
      }
    }
    cursor = addDays(cursor, 1);
  }

  return total;
}

/**
 * Một "ngày làm việc" của lịch này là bao nhiêu phút.
 *
 * THAY CHO HẰNG SỐ 8 GIỜ hardcode trong trình duyệt (calcSoNgayHT chia cứng cho 8). Lịch đang
 * cấu hình có Thứ 2 gồm 3 ca: 08:00–12:00 + 13:00–15:00 + 15:10–17:00 = 470 phút ≈ 7,83 giờ,
 * KHÔNG phải 480. Nên "một ngày làm việc" từng có hai định nghĩa: một do admin cấu hình, một
 * hardcode — và sẽ lệch nhiều hơn nữa mỗi lần admin sửa ca.
 *
 * Lấy trung bình theo các ngày CÓ LÀM: lịch có thể xếp số ca khác nhau giữa các ngày, nên chia
 * tổng phút trong tuần cho số ngày làm mới ra con số đại diện đúng.
 */
export function minutesPerWorkingDay(
  calendar: WorkingCalendar = DEFAULT_3D_WORKING_CALENDAR,
): number {
  let totalMinutes = 0;
  let workingDays = 0;

  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    if (calendar.weeklyDaysOff.includes(dayOfWeek)) continue;
    // Ngày trong tuần ISO bất kỳ có đúng dayOfWeek cần xét; chỉ dùng để lọc ca theo thứ.
    const probe = new Date(Date.UTC(2024, 0, 7 + dayOfWeek));
    const sessions = sortedSessions(calendar, probe);
    if (sessions.length === 0) continue;

    workingDays += 1;
    for (const session of sessions) totalMinutes += session.end - session.start;
  }

  if (workingDays === 0) return 0;
  return Math.round(totalMinutes / workingDays);
}

/**
 * Chấm một lượt đã hoàn tất: đúng hạn hay trễ, và cách hạn bao nhiêu.
 *
 * 🔴 KHOẢNG CÁCH ĐO BẰNG GIỜ LÀM VIỆC, KHÔNG PHẢI GIỜ TƯỜNG.
 *
 * Bản trước lấy `completedAt.getTime() - deadlineAt.getTime()` — hiệu số giờ tường. Nhưng
 * `deadlineAt` được sinh ra bằng cách BƯỚC QUA LỊCH LÀM VIỆC (calculate3DKpiDeadline: bỏ đêm,
 * bỏ giờ nghỉ giữa ca, bỏ ngày nghỉ). Trừ thẳng hai mốc là ĐEM MỘT SỐ ĐO BẰNG GIỜ TƯỜNG SO VỚI
 * MỘT MỐC ĐO BẰNG GIỜ LÀM VIỆC — hai đơn vị khác nhau.
 *
 * Chú thích ở countWorkingMinutesBetween (phía trên) đã nêu đúng lỗi này từ trước, và hàm sửa
 * lỗi đã có sẵn, có test, đang được dùng ở pause.ts / progress.ts / review.ts. Chỉ riêng chỗ
 * này là chưa dùng.
 *
 * Bằng chứng thật, lượt 26.37669_1:
 *   Giao 15:10 20/08, KPI 240 phút → deadline 10:10 21/08 (đúng). Hoàn tất 16:03 20/08.
 *   Giờ tường:     18 giờ 6 phút   ← con số cũ, phần lớn là buổi đêm
 *   Giờ làm việc:   3 giờ 7 phút   ← 57 phút còn lại của chiều 20/08 + 130 phút sáng 21/08
 *
 * 🎯 VÀ CON SỐ ĐÚNG ẤY BẰNG ĐÚNG "240 phút KPI − 53 phút thực làm". Không phải trùng hợp: vì
 * `deadline = giao + KPI (giờ làm việc)`, nên "giờ làm việc còn lại tới deadline" và "KPI trừ
 * giờ đã dùng" LÀ CÙNG MỘT ĐẠI LƯỢNG. Nghĩa là hàm này tự động neo vào MỐC GIAO, không cần
 * tham số thêm.
 *
 * ⚠️ `status` VẪN so bằng mốc thời gian thật, không bằng số phút làm việc. Nộp lúc 18:00 khi
 * deadline là 17:00 thì có 0 phút làm việc ở giữa — nhưng đó vẫn là TRỄ. Trộn hai thứ này lại
 * là biến một lượt trễ thành đúng hạn. Xem thêm `formatKpiDelta` ở kpi-3d/progress.ts, nơi ca
 * "trễ nhưng 0 phút làm việc" phải được nói ra cho đúng.
 *
 * `calendar` mặc định bằng lịch mặc định — cùng quy ước với mọi hàm khác trong file này. Chỗ
 * gọi thật (resolveAssignmentStateAfterProgress) LUÔN truyền lịch đã sinh ra deadline của chính
 * lượt đó.
 */
export function evaluate3DKpiCompletion(
  deadlineAt: Date,
  completedAt: Date,
  calendar: WorkingCalendar = DEFAULT_3D_WORKING_CALENDAR,
): Kpi3DEvaluation {
  const late = completedAt.getTime() > deadlineAt.getTime();

  // countWorkingMinutesBetween trả 0 khi `to <= from`, nên gọi đúng chiều là đủ — không cần
  // Math.abs, và cũng không có cách nào ra số âm.
  const magnitude = late
    ? countWorkingMinutesBetween(deadlineAt, completedAt, calendar)
    : countWorkingMinutesBetween(completedAt, deadlineAt, calendar);

  return {
    status: late ? "LATE" : "ON_TIME",
    // Giữ nguyên quy ước dấu của cột `kpiDeltaMinutes` đang có trong DB: âm = sớm, dương = trễ.
    // Đổi quy ước dấu là làm sai mọi hàng đã ghi, và không có gì báo.
    //
    // ⚠️ `magnitude === 0 ? 0` chứ không để `-magnitude` chạy: `-0` trong JavaScript KHÔNG bằng
    // `0` theo `Object.is`, nên nó lọt qua mọi so sánh `=== 0` nhưng lại làm `toEqual` và các
    // phép so cấu trúc khác báo lệch. Một `-0` chảy vào cột KPI là thứ chỉ lộ ra ở chỗ khó đoán
    // nhất — test "nộp đúng khoảnh khắc deadline" đã bắt được đúng ca này.
    deltaMinutes: magnitude === 0 ? 0 : late ? magnitude : -magnitude,
    earlyMinutes: late ? 0 : magnitude,
    lateMinutes: late ? magnitude : 0,
  };
}
