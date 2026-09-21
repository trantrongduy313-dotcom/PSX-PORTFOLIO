import { toVnYmd } from "@/app/lib/utils/vn-date";

// ─── Giờ công được ghi nhận vào THÁNG NÀO ─────────────────────────────────────
//
// LỖI ĐANG SỬA: giờ công chỉ được cộng MỘT LẦN, ở tháng đơn hoàn tất —
//
//     if (r.completedYmd?.startsWith(monthPrefix)) { donHT++; tongGio += hoursActual; }
//
// Nhân viên làm 20 giờ trong tháng 8, đơn bị Admin gác vô hạn, hoàn tất tháng 11 → tháng 8 của
// họ TRỐNG TRƠN và tháng 11 nhận cả 20 giờ. Với một chỉ số dùng để đánh giá theo tháng thì đó
// là sai ở cả hai đầu.
//
// ⚠️ CÁI BẪY TRUNG TÂM CỦA FILE NÀY LÀ CỘNG HAI LẦN.
// Nếu tháng 8 ghi nhận 20 giờ rồi tháng 11 lại cộng TOÀN BỘ tổng giờ một lần nữa, nhân viên
// được tính công gấp đôi. Và nó sai theo hướng khó thấy nhất: con số chỉ lớn hơn, không có gì
// đỏ, không ai đi đối chiếu một số liệu đang có lợi cho mình.
//
// Cách chống: mốc chốt là số CỘNG DỒN từ lúc nhận việc, không phải giờ của riêng đoạn vừa rồi.
// Phần ghi nhận cho mỗi tháng luôn là HIỆU giữa hai lần chốt liên tiếp, nên tổng mọi tháng
// bằng đúng lần chốt cuối — bất biến này có test riêng.
//
// File THUẦN: không prisma, không React.

/** Một lần chốt sổ. `confirmedMinutes` là số CỘNG DỒN tới thời điểm `pausedAt`. */
export type HoursCheckpoint = {
  pausedAt: Date;
  confirmedMinutes: number | null;
};

/** Giờ công ghi nhận cho một tháng ("YYYY-MM"). */
export type MonthlyAccrual = {
  month: string;
  minutes: number;
};

const monthOf = (d: Date) => toVnYmd(d).slice(0, 7);
const usable = (d: Date | null | undefined): d is Date =>
  d instanceof Date && Number.isFinite(d.getTime());

/**
 * Chia giờ công của MỘT lượt giao việc ra theo tháng.
 *
 * `totalMinutes` là con số cuối cùng của lượt (đã chốt lúc duyệt / lúc bị lấy đơn). Nó chỉ được
 * dùng khi lượt đã ĐÓNG — còn đang chạy thì phần chưa chốt vẫn đang thay đổi, ghi nhận sớm là
 * ghi một con số sẽ khác vào ngày mai.
 *
 * TRẢ MẢNG RỖNG khi không có lần chốt nào: đó là tín hiệu cho báo cáo giữ nguyên cách tính cũ.
 * Nhờ vậy các đơn không hề bị tạm dừng — tức gần như toàn bộ dữ liệu lịch sử — KHÔNG đổi số.
 */
export function accrueMinutesByMonth(params: {
  /** Các lần chốt sổ. Không cần sắp sẵn — hàm tự sắp theo thời gian.  */
  checkpoints: readonly HoursCheckpoint[];
  /** Tổng giờ cuối cùng của lượt (phút). null = chưa chốt. */
  totalMinutes: number | null;
  /** Mốc đóng lượt: hoàn tất, hoặc bị lấy đơn giao người khác. null = còn đang chạy. */
  closedAt: Date | null;
}): MonthlyAccrual[] {
  const points = params.checkpoints
    .filter((c) => usable(c.pausedAt) && typeof c.confirmedMinutes === "number" && c.confirmedMinutes >= 0)
    .slice()
    .sort((a, b) => a.pausedAt.getTime() - b.pausedAt.getTime());

  if (points.length === 0) return [];

  const byMonth = new Map<string, number>();
  const add = (month: string, minutes: number) => {
    if (minutes <= 0) return;
    byMonth.set(month, (byMonth.get(month) ?? 0) + minutes);
  };

  let credited = 0;
  for (const p of points) {
    const confirmed = p.confirmedMinutes as number;
    // KHÔNG BAO GIỜ ghi số âm, và không rút lại giờ đã ghi cho một tháng đã chốt.
    //
    // Admin sửa con số xuống thấp hơn lần trước (gõ nhầm 200 thành 20) thì phần chênh KHÔNG bị
    // trừ ngược vào tháng cũ: một tháng đã báo cáo mà tự nhỏ lại là thứ không ai đối chiếu
    // được. Đường sửa đúng cho ca đó là ô "Giờ thực tế" nhập tay ở sidebar — số nhập tay
    // THẮNG số hệ thống đo (xem actual-minutes.ts), nên vẫn có cách chữa.
    add(monthOf(p.pausedAt), confirmed - credited);
    credited = Math.max(credited, confirmed);
  }

  // Phần còn lại chỉ được ghi khi lượt đã ĐÓNG. Đang chạy thì tổng vẫn còn thay đổi.
  if (usable(params.closedAt) && typeof params.totalMinutes === "number" && params.totalMinutes > 0) {
    add(monthOf(params.closedAt), params.totalMinutes - credited);
  }

  return [...byMonth].map(([month, minutes]) => ({ month, minutes }));
}

/**
 * Đề xuất số phút để điền sẵn vào ô "Giờ đã làm" của hộp Tạm dừng.
 *
 * Hệ thống đo, người xác nhận — Admin biết những điều hệ thống không biết (nhân viên nghỉ nửa
 * ngày, việc làm hộ), nên con số này là ĐỀ XUẤT chứ không phải phán quyết.
 *
 * Trừ đi phần đã chốt ở các lần dừng trước để ô hiện ra không phải một con số cộng dồn khó
 * hiểu — nhưng giá trị LƯU LẠI vẫn là cộng dồn (xem accrueMinutesByMonth).
 */
/**
 * Vì sao con số người dùng GÕ TAY vào ô "Giờ đã làm" không hợp lệ — null nghĩa là hợp lệ.
 *
 * VÌ SAO CẦN: ô đó mang số CỘNG DỒN từ lúc nhận việc. Ở lần dừng thứ hai nó hiện 3.0 trong khi
 * nhân viên chỉ làm 1.0 ở đoạn vừa rồi — người gác đơn rất dễ "sửa lại cho đúng" thành 1.0.
 * `accrueMinutesByMonth` lấy `max` nên con số đó bị BỎ QUA HOÀN TOÀN mà không báo gì: giao diện
 * hiện 1.0, KPI dùng 3.0. Đó là hai nguồn sự thật, và cái sai lại là cái người dùng nhìn thấy.
 *
 * Luật `max` vẫn giữ nguyên (không rút giờ khỏi một tháng đã báo cáo — xem chú thích trong
 * accrueMinutesByMonth). Chỗ này chỉ để người đang gõ ĐƯỢC BIẾT, thay vì bị nuốt im lặng.
 *
 * ⚠️ CHỈ ÁP CHO SỐ GÕ TAY. Số hệ thống tự đo có thể thấp hơn phần đã chốt một cách hợp lệ (lần
 * trước Admin gõ quá cao), và chặn ở đó nghĩa là không gác được đơn nữa — biến một số liệu lệch
 * thành một ngõ cụt.
 */
export function deniedReasonForConfirmedMinutes(params: {
  /** Số người dùng gõ, đã quy ra phút. */
  confirmedMinutes: number;
  /** Phần đã chốt ở các lần dừng trước (cộng dồn). */
  alreadyCredited: number;
}): string | null {
  if (params.confirmedMinutes >= params.alreadyCredited) return null;
  const h = (m: number) => Math.round((m / 60) * 100) / 100;
  return `Số giờ này phải là TỔNG CỘNG DỒN từ lúc nhận việc, nên không được nhỏ hơn ${h(params.alreadyCredited)} giờ đã chốt ở lần tạm dừng trước. Nếu bạn muốn ghi ${h(params.confirmedMinutes)} giờ cho riêng đoạn vừa rồi thì cộng thêm vào: ${h(params.alreadyCredited + params.confirmedMinutes)} giờ.`;
}

export function alreadyCreditedMinutes(checkpoints: readonly HoursCheckpoint[]): number {
  let max = 0;
  for (const c of checkpoints) {
    if (typeof c.confirmedMinutes === "number" && c.confirmedMinutes > max) max = c.confirmedMinutes;
  }
  return max;
}
