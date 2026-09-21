// ─── Thứ tự dòng ở tab Hoàn tất ──────────────────────────────────────────────
//
// VẤN ĐỀ ĐÃ CÓ TỪ TRƯỚC: API sắp tab Hoàn tất theo Order.completedDate giảm dần
// (app/api/orders/route.ts — `history && sortBy === "orderDate"` → completedDate desc), NHƯNG
// client sau đó SẮP LẠI theo orderDate trong `sortedTableRows` — vì sortBy mặc định luôn là
// "orderDate" nên nhánh gom-phiên-bản của tab thường vẫn chạy ở tab Hoàn tất và XOÁ thứ tự
// server vừa làm. Kết quả: bảng xếp theo NGÀY LÊN ĐƠN trong khi cột duy nhất người dùng nhìn
// là NGÀY HT.
//
// VÀ SỐ SERVER SẮP KHÔNG PHẢI SỐ BẢNG HIỆN: server sắp theo `Order.completedDate` (cấp SO),
// còn cột NGÀY HT hiện `firstItem.completedDate` (PER-MO, từ extraData.perItem). Một SO nhiều
// MO hoàn tất lệch ngày thì hai con số này khác nhau — nên kể cả bỏ hẳn phần sắp lại ở client,
// thứ tự vẫn không khớp cột đang hiện. Phải sắp ở client, theo đúng trường bảng đọc.
//
// NGUYÊN TẮC: sắp theo ĐÚNG TRƯỜNG NGƯỜI DÙNG ĐANG NHÌN. Sắp theo một trường không có trên
// bảng thì thứ tự trông như ngẫu nhiên, và người dùng mất niềm tin vào cả bảng.

/** Chỉ phần dòng dùng để so sánh — cố ý hẹp để test được mà không dựng cả OrderSummary. */
export type CompletedSortRow = {
  firstItem?: {
    completedDate?: string | null;
    /** Ngày HỦY — tab Đã hủy. Đọc ngược từ workflowHistory; xem app/api/orders/route.ts. */
    cancelledAt?: string | null;
    moNumber?: string | null;
  } | null;
  orderNumber?: string | null;
};

/** Trường ngày dùng làm khoá sắp — tab Hoàn tất dùng NGÀY HT, tab Đã hủy dùng NGÀY HỦY. */
export type TerminalDateField = "completedDate" | "cancelledAt";

function dateMs(row: CompletedSortRow, field: TerminalDateField): number | null {
  const raw = row.firstItem?.[field];
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * So sánh hai dòng theo MỐC KẾT THÚC: MO gần đây nhất lên trên.
 *
 * `field` chọn mốc nào — Hoàn tất dùng NGÀY HT, Đã hủy dùng NGÀY HỦY. Hai tab dùng CHUNG hàm
 * này thay vì mỗi tab một bản: quy tắc "rỗng xuống cuối" và "trùng ngày xếp theo MO" phải
 * giống nhau ở cả hai, tách bản là mở đường cho hai tab lệch hành vi khi sau này sửa một bên.
 *
 * MO CHƯA CÓ MỐC ĐÓ LUÔN XUỐNG CUỐI, không phụ thuộc chiều sắp. Nếu coi rỗng là 0 thì ở chiều
 * giảm dần chúng nằm cuối (đúng), nhưng ở chiều tăng dần chúng chiếm trọn phần đầu bảng — người
 * mở tab để tra đơn xong sớm nhất lại thấy toàn dòng gạch ngang. Rỗng ở đây nghĩa là "không có
 * dữ liệu để so", không phải "sớm nhất".
 *
 * Cùng ngày thì xếp theo mã MO để thứ tự ỔN ĐỊNH: rất nhiều MO hoàn tất cùng một ngày (trường
 * này là ngày, không có giờ), thiếu tiêu chí phụ thì mỗi lần render lại có thể ra một thứ tự
 * khác và người dùng tưởng bảng đang tự nhảy.
 */
export function compareByCompletedDate(
  a: CompletedSortRow,
  b: CompletedSortRow,
  dir: "asc" | "desc" = "desc",
  field: TerminalDateField = "completedDate",
): number {
  const msA = dateMs(a, field);
  const msB = dateMs(b, field);

  if (msA === null && msB === null) return moKey(a).localeCompare(moKey(b));
  if (msA === null) return 1;
  if (msB === null) return -1;

  if (msA !== msB) return dir === "asc" ? msA - msB : msB - msA;
  return moKey(a).localeCompare(moKey(b));
}

function moKey(row: CompletedSortRow): string {
  return row.firstItem?.moNumber ?? row.orderNumber ?? "";
}

/** Bản sao đã sắp — KHÔNG sửa mảng gốc (nó là dữ liệu cache của React Query). */
export function sortByCompletedDate<T extends CompletedSortRow>(
  rows: readonly T[],
  dir: "asc" | "desc" = "desc",
  field: TerminalDateField = "completedDate",
): T[] {
  return [...rows].sort((a, b) => compareByCompletedDate(a, b, dir, field));
}
