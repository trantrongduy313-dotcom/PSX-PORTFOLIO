// ═══════════════════════════════════════════════════════════════════════════
// ĐIỀU KIỆN ĐẾM CHO DẢI THẺ MÀN "VIỆC THIẾT KẾ 3D"
//
// ⚠️ VÌ SAO PHẢI ĐẾM Ở SERVER, KHÔNG SUY TỪ DANH SÁCH ĐANG HIỆN:
//
// Bản trước đếm trên `rows` — tức 200 dòng client vừa tải (`orderBy: deadlineAt asc, limit 200`).
// Hôm nay xưởng có 4 việc nên không ai thấy gì. Khi tích lũy tới 300 việc đã xong thì:
//
//   · 200 dòng lấy về là 200 deadline SỚM NHẤT, tức toàn việc CŨ ĐÃ XONG;
//   · việc đang làm bị đẩy ra ngoài danh sách hoàn toàn;
//   · và mọi thẻ đếm báo thiếu mà không có một dấu hiệu nào.
//
// Thẻ "Hoàn thành" là con số CHỈ TĂNG, nên nó sẽ là cái chạm trần đầu tiên. Đếm bằng `count` ở
// server thì danh sách vẫn phân trang được mà con số vẫn đúng.
//
// ⚠️ HAI TRỤC THỜI GIAN, CỐ Ý KHÔNG GỘP:
//
//   · VIỆC PHẢI LÀM (đang làm / đang trễ / chờ kiểm) — LUÔN toàn thời gian.
//   · KẾT QUẢ (hoàn thành / nộp muộn) — theo tháng.
//
// Áp bộ lọc tháng lên nhóm đầu là GIẤU MẤT việc gấp nhất: một việc giao tháng 7, đang trễ tới
// hôm nay, sẽ biến mất khi người dùng chọn tháng 8. Đó là lỗi tệ hơn hẳn việc không có bộ lọc.
//
// ⚠️ ĐÂY LÀ BẢN THỨ HAI CỦA CÙNG MỘT LUẬT. Bản thứ nhất là các hàm chạy trên bộ nhớ
// (workload.ts, review-queue.ts) mà bảng đang dùng. Hai bản lệch nhau thì thẻ đếm và bảng nói
// hai điều khác nhau về cùng một dữ liệu — nên mọi khác biệt phải là CỐ Ý và có chú thích.
// Giữ chúng cạnh nhau trong file này, đừng rải vào route.
//
// File THUẦN: không prisma, không React — chỉ dựng object điều kiện.
// ═══════════════════════════════════════════════════════════════════════════

import { CLOSED_ASSIGNMENT_STATUSES } from "@/app/lib/business/kpi-3d/progress";
import { vnWallToInstant } from "@/app/lib/utils/vn-date";

/** Hình dạng lỏng — route sẽ ép về `Prisma.Design3DAssignmentWhereInput`. */
export type WhereFragment = Record<string, unknown>;

/** Khoảng nửa mở [đầu tháng, đầu tháng sau) theo GIỜ VIỆT NAM. */
export type MonthRange = { gte: Date; lt: Date };

/**
 * Mốc đầu và cuối của một tháng, tính theo giờ Việt Nam.
 *
 * PHẢI LÀ GIỜ VN, không phải UTC: một việc hoàn tất lúc 06:00 ngày 01/09 giờ VN là 23:00 ngày
 * 31/08 giờ UTC. Cắt tháng bằng UTC sẽ đẩy nó về tháng 8 — và con số "Hoàn thành tháng 9" của
 * xưởng lệch đúng những đơn làm sớm buổi sáng đầu tháng.
 *
 * NỬA MỞ `[gte, lt)`, không phải `[gte, lte]`: dùng `lte` với mốc cuối tháng thì phải chọn giữa
 * 23:59:59 (bỏ sót phần mili giây cuối) và 00:00:00 ngày hôm sau (đếm lấn sang tháng sau).
 */
export function vnMonthRange(year: number, month: number): MonthRange | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  const mm = String(month).padStart(2, "0");
  const gte = vnWallToInstant(`${year}-${mm}-01`, "00:00");
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const lt = vnWallToInstant(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01`, "00:00");
  return gte && lt ? { gte, lt } : null;
}

/**
 * "Đang mở" — bản SQL của `isOpenAssignment`.
 *
 * Chưa hoàn tất VÀ chưa bị đóng (huỷ / giao lại người khác).
 */
export function openWhere(): WhereFragment {
  return { completedAt: null, status: { notIn: [...CLOSED_ASSIGNMENT_STATUSES] } };
}

/**
 * "Đang trễ" — bản SQL của `isOverdueAssignment`. Tên thẻ cũ là "Quá hạn".
 *
 * Đang mở VÀ đã qua deadline. `now` truyền vào chứ không gọi trong hàm: cùng một mốc phải dùng
 * cho mọi phép đếm của một lần trả về, nếu không hai con số cạnh nhau được tính ở hai thời điểm.
 */
export function overdueWhere(now: Date): WhereFragment {
  return { ...openWhere(), deadlineAt: { lt: now } };
}

/**
 * "Chờ kiểm" — bản SQL của `isPendingReview`.
 *
 * ⚠️ CHỖ DỄ SAI NHẤT FILE. `deriveReviewStatus` suy ra PENDING_REVIEW theo HAI đường:
 *   1. `reviewStatus` đã ghi thẳng là "PENDING_REVIEW";
 *   2. HOẶC `reviewStatus` chưa có giá trị nào trong ba giá trị hợp lệ, mà đã có `completedAt`
 *      (dữ liệu cũ: nộp xong nhưng cột reviewStatus chưa từng được ghi).
 *
 * Nhánh 2 PHẢI liệt kê `reviewStatus: null` riêng. `notIn` của Prisma sinh ra `NOT IN (...)` của
 * SQL, mà `NULL NOT IN (...)` cho ra NULL — tức KHÔNG khớp. Thiếu nhánh null thì toàn bộ dữ liệu
 * cũ biến mất khỏi thẻ "Chờ kiểm", và Order tưởng đã duyệt hết.
 */
export function pendingReviewWhere(): WhereFragment {
  return {
    status: { notIn: [...CLOSED_ASSIGNMENT_STATUSES] },
    OR: [
      { reviewStatus: "PENDING_REVIEW" },
      {
        completedAt: { not: null },
        OR: [
          { reviewStatus: null },
          { reviewStatus: { notIn: ["ACCEPTED", "REWORK", "PENDING_REVIEW"] } },
        ],
      },
    ],
  };
}

/** Khoảng nửa mở của CẢ MỘT NĂM, theo giờ Việt Nam. */
export function vnYearRange(year: number): MonthRange | null {
  const jan = vnMonthRange(year, 1);
  const dec = vnMonthRange(year, 12);
  return jan && dec ? { gte: jan.gte, lt: dec.lt } : null;
}

/**
 * Khoảng thời gian ứng với lựa chọn Năm / Tháng của người dùng.
 *
 * BA TRẠNG THÁI, và trạng thái đầu là MẶC ĐỊNH:
 *
 *   · chưa chọn năm            → `null` = TOÀN THỜI GIAN, không cắt gì;
 *   · chọn năm, chưa chọn tháng → cả năm đó;
 *   · chọn cả hai              → đúng tháng đó.
 *
 * ⚠️ "CHỌN THÁNG MÀ KHÔNG CHỌN NĂM" KHÔNG PHẢI MỘT TRẠNG THÁI HỢP LỆ. Nó sẽ có nghĩa là "tháng 8
 * của mọi năm" — thứ gần như không ai muốn mà lại rất dễ chọn nhầm.
 *
 * Giao diện chặn bằng cách TỰ ĐIỀN năm hiện tại khi người dùng chọn tháng, chứ KHÔNG khoá ô
 * Tháng lại. Bản trước khoá, và nó chặn đúng nhưng sai cách: một ô mờ không nói lý do thì người
 * dùng đọc là "hỏng rồi" chứ không đọc ra được luật ngầm phía sau.
 *
 * Hàm này vẫn xử lý an toàn (bỏ qua tháng) phòng khi có ai gọi thẳng qua URL.
 */
export function rangeFromSelection(
  year: number | null | undefined,
  month: number | null | undefined,
): MonthRange | null {
  if (!year) return null;
  return month ? vnMonthRange(year, month) : vnYearRange(year);
}

/**
 * Lượt được GIAO trong khoảng — trục thời gian của cả màn hình.
 *
 * ⚠️ TRỤC LÀ `assignedAt`, KHÔNG PHẢI `completedAt`. Đây là thay đổi có chủ ý và cần hiểu rõ:
 *
 * Khi người dùng ở xưởng nói "việc của tháng 8", họ nói về những MO ĐƯỢC GIAO trong tháng 8 —
 * kể cả cái chưa xong. Lọc theo ngày hoàn thành thì một tháng toàn việc đang chạy sẽ ra bảng
 * rỗng, và người dùng kết luận bộ lọc hỏng. Đó chính là chuyện đã xảy ra.
 *
 * ⚠️ HỆ QUẢ PHẢI BIẾT: "Hoàn thành tháng 8" ở màn này nghĩa là "GIAO tháng 8 và đã xong", KHÔNG
 * phải "hoàn tất trong tháng 8" như cột Đơn hoàn thành của báo cáo KPI. Hai câu hỏi khác nhau:
 * đây là hỏi về một LỨA việc, báo cáo KPI hỏi về sản lượng của một tháng. Một việc giao tháng 7
 * xong tháng 8 sẽ đếm vào tháng 7 ở đây, tháng 8 ở báo cáo. Muốn con số chấm công thì xem màn
 * KPI NV 3D — đó mới là nơi chốt lương.
 *
 * `range = null` → TOÀN THỜI GIAN: không thêm điều kiện nào.
 */
export function assignedInRangeWhere(range: MonthRange | null): WhereFragment {
  return range ? { assignedAt: { gte: range.gte, lt: range.lt } } : {};
}

/**
 * "Hoàn thành" — trong LỨA việc giao ở khoảng này, bao nhiêu cái đã xong.
 *
 * Loại lượt đã đóng: một lượt bị huỷ không thể là "hoàn thành". Lượt bị giao lại người khác cũng
 * vậy — công của nó được ghi nhận ở báo cáo KPI, không phải ở thẻ đếm sản lượng này.
 */
export function completedWhere(range: MonthRange | null): WhereFragment {
  return {
    ...assignedInRangeWhere(range),
    status: { notIn: [...CLOSED_ASSIGNMENT_STATUSES] },
    // `not: null` chứ không phải một khoảng: điều kiện thời gian đã nằm ở `assignedAt`. Ở đây chỉ
    // cần biết "đã xong hay chưa".
    completedAt: { not: null },
  };
}

/**
 * "Nộp muộn" — tên thẻ cũ là "Trễ hạn".
 *
 * TẬP CON của `completedWhere`, không phải một trục riêng — cùng lứa việc, chỉ thêm phán quyết
 * trễ. Đếm theo khoảng khác thì "Nộp muộn" có thể lớn hơn "Hoàn thành" và bảng số đọc như hỏng.
 */
export function lateWhere(range: MonthRange | null): WhereFragment {
  return { ...completedWhere(range), kpiStatus: "LATE" };
}

/**
 * Một mốc có nằm trong khoảng không — dùng ở CLIENT để lọc bảng cho khớp với thẻ đếm.
 *
 * Cùng khoảng, cùng phép so (`gte`/`lt`) với bản SQL ở trên. Viết lại phép so ở component là
 * cách chắc chắn để bảng và thẻ lệch nhau đúng ở ranh giới tháng.
 */
export function isWithinRange(value: string | Date | null | undefined, range: MonthRange | null): boolean {
  if (!value) return false;
  if (!range) return true;
  const t = (value instanceof Date ? value : new Date(value)).getTime();
  return Number.isFinite(t) && t >= range.gte.getTime() && t < range.lt.getTime();
}

/**
 * Các năm có thể chọn — từ năm sớm nhất CÓ DỮ LIỆU tới năm hiện tại, mới nhất trước.
 *
 * VÌ SAO KHÔNG SINH CỨNG "5 NĂM GẦN NHẤT": nó sẽ chào mời 2022, 2023 trong khi hệ thống chưa có
 * dữ liệu nào ở đó — người dùng chọn rồi thấy toàn số 0 và tưởng mất dữ liệu. Năm sớm nhất do
 * server trả về cùng chuyến với các con số đếm.
 */
export function yearOptions(earliestYear: number | null | undefined, currentYear: number): number[] {
  if (!Number.isInteger(currentYear)) return [];
  const from = Number.isInteger(earliestYear) && (earliestYear as number) <= currentYear
    ? (earliestYear as number)
    : currentYear;
  const out: number[] = [];
  for (let y = currentYear; y >= from; y--) out.push(y);
  return out;
}

/**
 * Nhãn phạm vi cho tiêu đề nhóm thẻ.
 *
 * MỘT CHỖ DUY NHẤT dựng câu này. Tiêu đề nhóm là nơi DUY NHẤT nói ra mấy con số đang tính trên
 * khoảng nào — nó mà nói sai thì cả dải thẻ nói sai, và không có chỗ nào khác để đối chiếu.
 */
/** 1..12 — cho ô chọn Tháng. Khai ở đây để không có mảng viết tay trong component. */
export const MONTH_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export function scopeLabel(year: number | null | undefined, month: number | null | undefined): string {
  if (!year) return "toàn thời gian";
  return month ? `tháng ${month}/${year}` : `năm ${year}`;
}
