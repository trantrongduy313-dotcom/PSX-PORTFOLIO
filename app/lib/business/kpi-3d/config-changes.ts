// ─── Liệt kê thay đổi cấu hình KPI 3D trước khi lưu ──────────────────────────
//
// VÌ SAO CÓ FILE NÀY: hai màn cấu hình (Nhóm KPI 3D, Working Calendar) trước đây cho sửa
// trực tiếp rồi bấm Lưu, không nói gì thêm. Cấu hình này quyết định Deadline KPI của MỌI
// lượt giao việc về sau, nên sửa nhầm một ô là lệch cả hệ thống mà không ai biết.
//
// Một hộp "Bạn có chắc?" chung chung KHÔNG giải quyết được: câu hỏi không mang thông tin thì
// ai cũng bấm Đồng ý theo phản xạ. Phải liệt kê ĐÍCH XÁC những gì sắp đổi — lúc đó người
// dùng mới có cơ hội nhận ra "ủa, sao lại có dòng xoá 3 ca Thứ 4 ở đây".
//
// File thuần (không React, không prisma) để test trực tiếp — cùng pattern với progress.ts.

/** Thứ tự hiển thị bắt đầu từ Thứ 2, KHÔNG phải Chủ nhật như getDay() của JS. */
export const DAY_OPTIONS = [
  { value: 1, label: "Thứ 2" },
  { value: 2, label: "Thứ 3" },
  { value: 3, label: "Thứ 4" },
  { value: 4, label: "Thứ 5" },
  { value: 5, label: "Thứ 6" },
  { value: 6, label: "Thứ 7" },
  { value: 0, label: "Chủ nhật" },
] as const;

/** Số phút → "HH:mm". Dùng chung để bảng và hộp xác nhận không hiện hai định dạng giờ. */
export function minutesToHm(minutes: number): string {
  const hh = Math.floor(minutes / 60).toString().padStart(2, "0");
  const mm = (minutes % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Số phút → số giờ đọc được. Bỏ ".0" vì "3 giờ" dễ đọc hơn "3.0 giờ". */
export function minutesToHoursText(minutes: number): string {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : Math.round(hours * 100) / 100} giờ`;
}

const activeText = (isActive: boolean) => (isActive ? "Đang dùng" : "Tạm ẩn");

// ─── Nhóm KPI 3D ──────────────────────────────────────────────────────────────

export type Kpi3DGroupSnapshot = {
  code: string;
  name: string;
  standardMinutes: number;
  isActive: boolean;
};

/**
 * So hai bản cấu hình nhóm, trả về từng dòng thay đổi.
 *
 * GHÉP THEO `code`, KHÔNG theo vị trí trong danh sách: thứ tự do API sắp và có thể đổi, ghép
 * theo vị trí sẽ báo "Nhóm 1 đổi thành 8 giờ" khi thực ra chỉ là hai dòng đảo chỗ.
 */
export function diffKpi3DGroups(
  before: readonly Kpi3DGroupSnapshot[],
  after: readonly Kpi3DGroupSnapshot[],
): string[] {
  const byCode = new Map(before.map((g) => [g.code, g]));
  const lines: string[] = [];

  for (const next of after) {
    const prev = byCode.get(next.code);
    if (!prev) continue; // màn này chỉ sửa nhóm có sẵn, không tạo nhóm mới

    if (prev.standardMinutes !== next.standardMinutes) {
      lines.push(`${next.name}: ${minutesToHoursText(prev.standardMinutes)} → ${minutesToHoursText(next.standardMinutes)}`);
    }
    if (prev.isActive !== next.isActive) {
      lines.push(`${next.name}: ${activeText(prev.isActive)} → ${activeText(next.isActive)}`);
    }
  }

  return lines;
}

// ─── Working Calendar ─────────────────────────────────────────────────────────

export type CalendarSessionSnapshot = {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  label: string | null;
};

export type CalendarHolidaySnapshot = {
  date: string;
  name: string;
};

export type WorkingCalendarSnapshot = {
  name: string;
  timezone: string;
  isActive: boolean;
  isDefault: boolean;
  sessions: readonly CalendarSessionSnapshot[];
  holidays: readonly CalendarHolidaySnapshot[];
};

const sessionText = (s: CalendarSessionSnapshot) =>
  `${minutesToHm(s.startMinute)}–${minutesToHm(s.endMinute)}`;

function sessionsOfDay(
  sessions: readonly CalendarSessionSnapshot[],
  day: number,
): CalendarSessionSnapshot[] {
  return sessions
    .filter((s) => s.dayOfWeek === day)
    .sort((a, b) => a.startMinute - b.startMinute);
}

/** Ca của một ngày có giống nhau hoàn toàn không — giờ VÀ tên ca. */
function sameSessions(a: CalendarSessionSnapshot[], b: CalendarSessionSnapshot[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) =>
    s.startMinute === b[i].startMinute &&
    s.endMinute === b[i].endMinute &&
    (s.label ?? "") === (b[i].label ?? ""),
  );
}

/**
 * So hai bản lịch làm việc, trả về từng dòng thay đổi.
 *
 * NGÀY BỊ TẮT ĐƯỢC NÓI RÕ LÀ MẤT MẤY CA và mất những ca nào. Đây là thay đổi nguy hiểm nhất
 * trên màn đó — trước đây nó chỉ là một cú tick vào checkbox trông vô hại, mà hệ quả là toàn
 * bộ ca của ngày biến mất và tick lại KHÔNG lấy lại được.
 */
export function diffWorkingCalendar(
  before: WorkingCalendarSnapshot,
  after: WorkingCalendarSnapshot,
): string[] {
  const lines: string[] = [];

  if (before.name !== after.name) lines.push(`Tên lịch: “${before.name}” → “${after.name}”`);
  if (before.timezone !== after.timezone) lines.push(`Timezone: ${before.timezone} → ${after.timezone}`);
  if (before.isActive !== after.isActive) {
    lines.push(`Trạng thái lịch: ${activeText(before.isActive)} → ${activeText(after.isActive)}`);
  }
  if (before.isDefault !== after.isDefault) {
    lines.push(`Lịch mặc định: ${before.isDefault ? "có" : "không"} → ${after.isDefault ? "có" : "không"}`);
  }

  for (const day of DAY_OPTIONS) {
    const prev = sessionsOfDay(before.sessions, day.value);
    const next = sessionsOfDay(after.sessions, day.value);
    if (sameSessions(prev, next)) continue;

    if (next.length === 0) {
      // Nêu TÊN từng ca sắp mất, không chỉ số lượng: "xoá 3 ca" không cho người đọc cơ hội
      // nhận ra đó đúng là ba ca họ vừa dày công nhập.
      lines.push(`${day.label}: xoá ${prev.length} ca — ${prev.map(sessionText).join(", ")} → nghỉ cả ngày`);
    } else if (prev.length === 0) {
      lines.push(`${day.label}: nghỉ → ${next.length} ca (${next.map(sessionText).join(", ")})`);
    } else if (prev.length !== next.length) {
      lines.push(`${day.label}: ${prev.length} ca → ${next.length} ca (${next.map(sessionText).join(", ")})`);
    } else {
      lines.push(`${day.label}: đổi giờ ca → ${next.map(sessionText).join(", ")}`);
    }
  }

  const prevHolidays = new Map(before.holidays.map((h) => [h.date, h.name]));
  const nextHolidays = new Map(after.holidays.map((h) => [h.date, h.name]));

  for (const [date, name] of nextHolidays) {
    const prevName = prevHolidays.get(date);
    if (prevName === undefined) lines.push(`Ngày nghỉ: thêm ${date} (${name})`);
    else if (prevName !== name) lines.push(`Ngày nghỉ ${date}: “${prevName}” → “${name}”`);
  }
  for (const [date, name] of prevHolidays) {
    if (!nextHolidays.has(date)) lines.push(`Ngày nghỉ: bỏ ${date} (${name})`);
  }

  return lines;
}

/**
 * Câu nhắc kèm theo hộp xác nhận khi số giờ chuẩn thay đổi.
 *
 * Đây là điều hiện nay KHÔNG ai nói với admin, mà lại là điều họ cần biết nhất: đổi số giờ
 * KHÔNG hồi tố. Lượt đã giao giữ nguyên snapshot số phút lúc giao, nên KPI cũ không bị tính
 * lại. Không nói ra thì admin dễ tưởng mình vừa làm sai lệch toàn bộ báo cáo quá khứ — hoặc
 * ngược lại, tưởng đã sửa được KPI của một việc đã giao rồi.
 */
export const STANDARD_MINUTES_NOTE =
  "Số giờ chuẩn mới chỉ áp dụng cho việc giao MỚI. Lượt đã giao giữ nguyên snapshot số phút tại thời điểm giao việc.";

/** Câu nhắc khi lịch làm việc đổi — deadline được tính lại theo lịch mới. */
export const CALENDAR_NOTE =
  "Deadline KPI của các lượt giao việc SAU khi lưu sẽ tính theo lịch mới. Deadline đã chốt không đổi.";
