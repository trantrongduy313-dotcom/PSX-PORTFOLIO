import { deniedReasonFor } from "@/app/lib/business/kpi-3d/permissions";
import {
  countWorkingMinutesBetween,
  DEFAULT_3D_WORKING_CALENDAR,
  type WorkingCalendar,
} from "@/app/lib/business/kpi-3d-deadline";

// ─── Tạm dừng lượt giao việc 3D — DỪNG ĐỒNG HỒ KPI ───────────────────────────
//
// Admin/Order bắt NV 3D gác đơn đang làm để nhảy sang đơn gấp hơn. Trước bản này hệ thống không
// biết chuyện đó, và sai theo HAI hướng ngược nhau cùng lúc:
//
//   GIỜ THỰC TẾ PHỒNG LÊN — actualMinutes đo MỘT khoảng liên tục từ lúc nhận việc tới lúc xong,
//   nên ba tuần bị gác cũng cộng vào công sức nhân viên. Con số đó hoá ra đo THỜI GIAN TRÔI QUA
//   chứ không đo công sức.
//
//   TỰ ĐỘNG THÀNH TRỄ — deadlineAt cố định từ lúc giao, không dời. Nhân viên lãnh án trễ hạn
//   cho một quyết định của admin.
//
// ⚠️ MỌI PHÉP TÍNH Ở ĐÂY ĐỀU ĐO BẰNG PHÚT LÀM VIỆC, KHÔNG PHẢI WALL-CLOCK.
// Đây là cái bẫy trung tâm của cả mảng KPI 3D và đã làm hỏng deadline một lần rồi: deadline
// tính bằng phút làm việc theo lịch ca, nên nếu trừ thời gian tạm dừng bằng giờ đồng hồ thì hai
// con số không bao giờ khớp. Dừng từ trưa thứ Bảy tới sáng thứ Hai là ~42 giờ đồng hồ nhưng chỉ
// vài chục phút làm việc — trừ bằng wall-clock sẽ ăn mất gần hết ngân sách của cả một đơn.
//
// File THUẦN: không prisma, không React. Test trực tiếp.

/**
 * Một khoảng tạm dừng. `resumedAt = null` nghĩa là ĐANG dừng.
 *
 * `confirmedMinutes` là số giờ CỘNG DỒN người duyệt chốt tại mốc dừng. Không hàm tính nào trong
 * file này dùng nó (mọi phép trừ ở đây chỉ cần hai mốc), nhưng nó đi kèm ở đây vì mọi chỗ nạp
 * khoảng dừng đều nạp cả ba trường — tách ra thành một kiểu thứ hai chỉ khiến mỗi chỗ gọi phải
 * tự map lại, và một chỗ nào đó sẽ map thiếu.
 */
export type PauseSpan = {
  pausedAt: Date;
  resumedAt: Date | null;
  confirmedMinutes?: number | null;
};

const ms = (d: Date) => d.getTime();
const valid = (d: Date | null | undefined): d is Date =>
  d instanceof Date && Number.isFinite(d.getTime());

/** Khoảng dừng đang mở (chưa mở lại). Nhiều khoảng mở là dữ liệu hỏng — lấy khoảng mới nhất. */
export function openPause(pauses: readonly PauseSpan[]): PauseSpan | null {
  let latest: PauseSpan | null = null;
  for (const p of pauses) {
    if (p.resumedAt != null || !valid(p.pausedAt)) continue;
    if (!latest || ms(p.pausedAt) > ms(latest.pausedAt)) latest = p;
  }
  return latest;
}

export function isPaused(pauses: readonly PauseSpan[]): boolean {
  return openPause(pauses) !== null;
}

/**
 * Tổng số PHÚT LÀM VIỆC đã bị tạm dừng, trong phạm vi [from, until].
 *
 * `until` là mốc chốt sổ — thường là completedAt, hoặc "bây giờ" khi đơn chưa xong. Khoảng dừng
 * còn mở được cắt tại `until`: để nó mở vô hạn thì phép trừ sẽ ăn hết mọi phút về sau.
 *
 * CẮT KHOẢNG DỪNG VÀO TRONG [from, until] trước khi cộng. Không cắt thì một khoảng dừng bắt đầu
 * TRƯỚC khi nhân viên nhận việc sẽ bị trừ khỏi thời gian họ chưa hề bắt đầu — ra số âm.
 *
 * Khoảng dừng CHỒNG NHAU được gộp lại trước khi cộng, nếu không phần giao bị trừ hai lần và
 * giờ thực tế tụt xuống thấp hơn sự thật. Dữ liệu đúng thì không bao giờ chồng (API chặn dừng
 * khi đang dừng), nhưng một hàm tính KPI không nên tin điều đó.
 */
export function pausedWorkingMinutes(
  pauses: readonly PauseSpan[],
  from: Date,
  until: Date,
  calendar: WorkingCalendar = DEFAULT_3D_WORKING_CALENDAR,
): number {
  if (!valid(from) || !valid(until) || ms(until) <= ms(from)) return 0;

  const lo = ms(from);
  const hi = ms(until);

  // Cắt vào phạm vi + bỏ khoảng rỗng
  const spans: Array<[number, number]> = [];
  for (const p of pauses) {
    if (!valid(p.pausedAt)) continue;
    const end = valid(p.resumedAt) ? ms(p.resumedAt) : hi; // đang dừng → chốt tại `until`
    const a = Math.max(ms(p.pausedAt), lo);
    const b = Math.min(end, hi);
    if (b > a) spans.push([a, b]);
  }
  if (spans.length === 0) return 0;

  // Gộp khoảng chồng nhau
  spans.sort((x, y) => x[0] - y[0]);
  const merged: Array<[number, number]> = [spans[0]];
  for (const [a, b] of spans.slice(1)) {
    const last = merged[merged.length - 1];
    if (a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }

  let total = 0;
  for (const [a, b] of merged) {
    total += countWorkingMinutesBetween(new Date(a), new Date(b), calendar);
  }
  return total;
}

/**
 * Số phút làm việc THỰC SỰ bỏ ra: tổng quãng trừ đi phần bị tạm dừng.
 *
 * `Math.max(0, …)` là CHỐT CHẶN KHÔNG THỂ VỚI TỚI theo thiết kế hiện tại, và cố ý giữ lại.
 * pausedWorkingMinutes đã cắt mọi khoảng dừng vào trong [from, to] rồi mới cộng, nên
 * `paused ≤ gross` luôn đúng — bất biến này có test riêng. Chốt chặn ở đây chỉ để nếu sau này
 * ai bỏ bước cắt thì cột "Giờ thực tế" ra 0 (nhìn là biết thiếu dữ liệu) chứ không ra số âm
 * (nhìn như lỗi hệ thống). Đừng dựa vào nó thay cho bước cắt.
 *
 * Trả 0 là HỢP LỆ, khác hẳn null: "đo được và bằng 0" (làm xong trong cùng một phút, hoặc bị gác
 * gần trọn quãng) khác với "không đo được". Nhầm hai thứ này từng là gốc của một bug sống sót
 * qua ba lần sửa — xem actual-minutes.ts.
 */
export function netWorkingMinutes(
  from: Date,
  to: Date,
  pauses: readonly PauseSpan[],
  calendar: WorkingCalendar = DEFAULT_3D_WORKING_CALENDAR,
): number {
  const gross = countWorkingMinutesBetween(from, to, calendar);
  const paused = pausedWorkingMinutes(pauses, from, to, calendar);
  return Math.max(0, gross - paused);
}

/**
 * Số phút làm việc đã bỏ ra tính tới một mốc — dùng làm ĐỀ XUẤT cho ô "Giờ đã làm" của hộp
 * Tạm dừng.
 *
 * Khác netWorkingMinutes ở chỗ nó tự chọn mốc bắt đầu theo cùng quy tắc mà phép chốt giờ dùng:
 * ưu tiên lúc NV xác nhận nhận việc, không có thì lấy lúc giao. Viết ở đây để hộp Tạm dừng và
 * phép chốt lúc duyệt không đếm từ hai mốc khác nhau.
 *
 * Trả 0 là hợp lệ — "đo được và bằng 0" khác "không đo được", xem netWorkingMinutes.
 */
export function workedMinutesUntil(params: {
  assignedAt: Date;
  acknowledgedAt: Date | null;
  until: Date;
  pauses: readonly PauseSpan[];
  calendar?: WorkingCalendar;
}): number {
  const from = params.acknowledgedAt ?? params.assignedAt;
  if (!valid(from) || !valid(params.until)) return 0;
  return netWorkingMinutes(from, params.until, params.pauses, params.calendar);
}

/**
 * Deadline sau khi dời theo thời gian bị tạm dừng.
 *
 * Dời đúng bằng số PHÚT LÀM VIỆC đã dừng — tức tiêu thụ thêm ngần ấy phút làm việc kể từ
 * deadline cũ, đi qua chính bộ đi lịch đã dựng ra deadline ban đầu. Cộng thẳng mili-giây là sai:
 * deadline sẽ rơi vào Chủ nhật hoặc giữa đêm.
 *
 * `until` giới hạn phạm vi tính (xem pausedWorkingMinutes) — với đơn đang dừng thì truyền "bây
 * giờ", nên deadline bò theo đúng thời gian đang bị gác.
 */
export function shiftDeadlineByPauses(
  deadlineAt: Date,
  pauses: readonly PauseSpan[],
  from: Date,
  until: Date,
  calendar: WorkingCalendar = DEFAULT_3D_WORKING_CALENDAR,
): Date {
  if (!valid(deadlineAt)) return deadlineAt;
  const paused = pausedWorkingMinutes(pauses, from, until, calendar);
  if (paused <= 0) return deadlineAt;
  return addWorkingMinutes(deadlineAt, paused, calendar);
}

/**
 * Cộng N phút LÀM VIỆC vào một mốc, nhảy qua ngày nghỉ và giờ ngoài ca.
 *
 * Dùng chính countWorkingMinutesBetween làm thước để dò, thay vì viết bộ đi lịch thứ hai. Hai bộ
 * đi lịch cho cùng một bài toán chắc chắn sẽ lệch nhau khi ai đó sửa lịch — dự án đã dựng
 * countWorkingMinutesBetween làm hàm ngược của calculate3DKpiDeadline đúng vì lý do này.
 *
 * Dò nhị phân theo mốc thời gian: tìm thời điểm sớm nhất T sao cho số phút làm việc từ
 * `start` tới T đạt đúng `minutes`. Chặn trên nới dần để không giả định ngày nghỉ dài bao nhiêu.
 */
export function addWorkingMinutes(
  start: Date,
  minutes: number,
  calendar: WorkingCalendar = DEFAULT_3D_WORKING_CALENDAR,
): Date {
  if (!valid(start) || minutes <= 0) return start;

  const MINUTE = 60_000;
  let hi = ms(start) + minutes * MINUTE;
  // Nới chặn trên tới khi đủ phút làm việc. Nhân đôi khoảng nới (không cộng cố định) để nghỉ
  // Tết vài tuần cũng chỉ tốn vài vòng.
  let step = Math.max(minutes, 1) * MINUTE;
  for (let guard = 0; guard < 40; guard += 1) {
    if (countWorkingMinutesBetween(start, new Date(hi), calendar) >= minutes) break;
    hi += step;
    step *= 2;
  }

  let lo = ms(start);
  // Dò tới độ chính xác 1 phút — deadline vốn chỉ hiện tới phút.
  while (hi - lo > MINUTE) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (countWorkingMinutesBetween(start, new Date(mid), calendar) >= minutes) hi = mid;
    else lo = mid;
  }
  return new Date(hi);
}

// ─── Luật chặn ────────────────────────────────────────────────────────────────

/** Phần trạng thái của lượt giao việc cần để xét được dừng hay không. */
export type PausableAssignment = {
  status: string;
  reviewStatus: string | null;
  /**
   * Mốc NV 3D đã gửi kết quả. Việc đã xong thì không còn đồng hồ nào để dừng.
   *
   * Không suy từ `status` được: lượt đã hoàn tất mang SENT_RESULT, cùng giá trị với lượt vừa nộp
   * và đang chờ kiểm — nên `status` không phân biệt được hai thứ đó.
   */
  completedAt: Date | null;
  pauses: readonly PauseSpan[];
};

/** Vì sao KHÔNG được tạm dừng — null nghĩa là hợp lệ. */
export function deniedReasonForPause(
  role: string | undefined,
  a: PausableAssignment,
): string | null {
  const denied = deniedReasonFor("PAUSE_ASSIGNMENT", { role, designer3DId: null });
  if (denied) return denied;

  // ĐÃ DUYỆT thì số giờ đã được ĐÓNG BĂNG (resolveActualMinutesFreeze). Cho dừng tiếp là tạo ra
  // khoảng dừng không bao giờ được trừ vào đâu — một bản ghi nói dối.
  if (a.reviewStatus === "ACCEPTED") {
    return "Lượt giao việc đã được duyệt — số giờ đã chốt, không tạm dừng được nữa.";
  }
  if (a.status === "CANCELLED" || a.status === "REASSIGNED") {
    return "Lượt giao việc đã đóng — không tạm dừng được.";
  }
  // ĐÃ NỘP KẾT QUẢ thì không còn gì để dừng. Ca có thật: NV 3D bấm gửi kết quả đúng lúc Admin bấm
  // gác đơn. Route progress tự đóng các khoảng dừng đang mở TẠI mốc hoàn tất, nhưng một khoảng
  // được tạo SAU đó thì không ai đóng nữa — nó nằm mở vĩnh viễn trên một việc đã xong, và mọi màn
  // hình đọc theo resumedAt = null sẽ hiện "Tạm dừng" cho một MO đã hoàn thành.
  if (a.completedAt != null) {
    return "Lượt giao việc đã gửi kết quả — không còn đồng hồ nào để tạm dừng.";
  }
  if (isPaused(a.pauses)) {
    // Dừng chồng dừng làm phép trừ nhập nhằng và không ai đọc được lịch sử.
    return "Lượt giao việc đang tạm dừng rồi.";
  }
  return null;
}

/**
 * Vì sao MỐC DỪNG không hợp lệ — null nghĩa là hợp lệ.
 *
 * VÌ SAO PHẢI CHO SỬA MỐC NÀY, và vì sao nó cần luật riêng: `pausedAt` quyết định giờ công
 * được chốt vào KPI THÁNG NÀO (xem hours-ledger.ts). Quản lý quên gác đơn ngày 31/8 rồi bấm
 * ngày 02/9 thì 20 giờ của tháng 8 chạy sang tháng 9 — sai ở cả hai tháng, và không có cách
 * nào sửa nếu mốc bị chốt cứng bằng "bây giờ".
 *
 * Nhưng cho sửa tự do thì mốc thành thứ bịa được, nên bốn chặn dưới đây.
 */
export function deniedReasonForPauseAt(params: {
  pausedAt: Date;
  assignedAt: Date;
  acknowledgedAt: Date | null;
  now: Date;
  pauses: readonly PauseSpan[];
}): string | null {
  if (!valid(params.pausedAt)) return "Mốc tạm dừng không đọc được.";

  // Tương lai: không chốt được giờ cho việc chưa xảy ra. Nới 2 phút cho lệch đồng hồ máy —
  // chặn chặt tới từng giây thì người bấm đúng lúc cũng có thể bị từ chối.
  if (ms(params.pausedAt) > ms(params.now) + 2 * 60_000) {
    return "Mốc tạm dừng ở tương lai — không chốt được giờ cho việc chưa xảy ra.";
  }

  const start = params.acknowledgedAt ?? params.assignedAt;
  if (valid(start) && ms(params.pausedAt) < ms(start)) {
    return "Mốc tạm dừng sớm hơn lúc bắt đầu việc — số giờ đã làm sẽ ra âm.";
  }

  // Không được lùi trước lần mở lại gần nhất: các khoảng dừng phải nối tiếp nhau. Chồng nhau
  // thì hours-ledger đọc ra hai lần chốt ngược thứ tự và phần chênh bị bỏ.
  let lastResume = 0;
  for (const p of params.pauses) {
    if (valid(p.resumedAt) && ms(p.resumedAt) > lastResume) lastResume = ms(p.resumedAt);
  }
  if (lastResume > 0 && ms(params.pausedAt) < lastResume) {
    return "Mốc tạm dừng sớm hơn lần mở lại gần nhất — các khoảng dừng phải nối tiếp nhau.";
  }

  return null;
}

/** Vì sao MỐC MỞ LẠI không hợp lệ — null nghĩa là hợp lệ. */
export function deniedReasonForResumeAt(params: {
  resumedAt: Date;
  pausedAt: Date;
  now: Date;
}): string | null {
  if (!valid(params.resumedAt)) return "Mốc mở lại không đọc được.";
  if (ms(params.resumedAt) > ms(params.now) + 2 * 60_000) {
    return "Mốc mở lại ở tương lai — deadline sẽ bị dời theo một khoảng chưa xảy ra.";
  }
  // Bằng nhau cũng chặn: một khoảng dừng dài 0 phút không dời deadline và không trừ giờ, nó chỉ
  // là một dòng lịch sử rỗng nghĩa.
  if (ms(params.resumedAt) <= ms(params.pausedAt)) {
    return "Mốc mở lại phải sau mốc tạm dừng.";
  }
  return null;
}

/** Vì sao KHÔNG được mở lại — null nghĩa là hợp lệ. */
export function deniedReasonForResume(
  role: string | undefined,
  a: Pick<PausableAssignment, "pauses">,
): string | null {
  const denied = deniedReasonFor("PAUSE_ASSIGNMENT", { role, designer3DId: null });
  if (denied) return denied;
  if (!isPaused(a.pauses)) return "Lượt giao việc này không đang tạm dừng.";
  return null;
}
