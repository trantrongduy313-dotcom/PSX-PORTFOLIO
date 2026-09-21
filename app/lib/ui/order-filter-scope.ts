// ─── PHẠM VI CỦA TỪNG BỘ LỌC ĐƠN HÀNG — nguồn khai báo duy nhất ──────────────
//
// 🔴 VÌ SAO FILE NÀY TỒN TẠI:
//
// Đổi tab KHÔNG đụng gì tới bộ lọc (orders-client.tsx `updateUrl` chỉ xoá `limit` và `_w`),
// nhưng Ô ĐIỀU KHIỂN của một số bộ lọc lại BIẾN MẤT theo tab. Hai điều đó cộng lại tạo ra
// trạng thái tệ nhất:
//
//   Lọc TIẾN ĐỘ ở Phòng Sản Xuất → chuyển sang Phòng Thiết Kế →
//   bộ lọc VẪN ĐANG LỌC, nhưng không còn ô nào để tắt nó.
//
// Bộ lọc đang bật · vô hình · không tắt được riêng. Người dùng thấy một danh sách thiếu và
// không có cách nào biết vì sao.
//
// Và huy hiệu "LỌC" còn nói dối theo kiểu tinh vi hơn: `activeFilterCount` CÓ đếm stageFilter
// và bomFilter, nhưng hai ô đó nằm NGOÀI panel mà nút LỌC mở ra. Người dùng thấy "LỌC 2", mở
// panel ra, và không tìm thấy gì để tắt.
//
// ─── VÌ SAO MỘT BẢNG, KHÔNG PHẢI VÀI CÂU `if` ───────────────────────────────
//
// Trước đây phạm vi được khai ở HAI NƠI, và chúng ĐANG LỆCH NHAU:
//
//   1. Ba câu `filters.tab === "..."` rải trong JSX của orders-toolbar.tsx  → quyết định VẼ
//   2. `isVisibleForTab` của từng trục ngày trong date-filter-fields.ts     → quyết định VẼ
//   … và KHÔNG nơi nào quyết định RỬA. Đó là chỗ hỏng.
//
// Nay cả ba câu hỏi — vẽ ô này không · đếm vào huy hiệu không · rửa khi đổi tab không — đọc
// CÙNG một bảng. Chúng không thể lệch nhau nữa.
//
// Thêm một bộ lọc về sau = THÊM MỘT DÒNG ở đây, không phải nhớ sửa bốn chỗ.

/** Bốn tab của màn Đơn hàng. Trùng `const TABS` trong orders-client.tsx. */
export type OrderTabKey = "pre-production" | "master-hub" | "completed" | "cancelled";

export const ORDER_TAB_KEYS: readonly OrderTabKey[] = [
  "pre-production", "master-hub", "completed", "cancelled",
];

/**
 * Tham số URL của bộ lọc → những tab mà nó CÓ NGHĨA.
 *
 * ⚠️ CHỈ LIỆT KÊ BỘ LỌC BỊ GIỚI HẠN THEO TAB. Bộ lọc dùng chung (search, storeId, isPriority,
 * isRush, phanLoaiKh, status, datePreset, dateFrom/To) KHÔNG có mặt ở đây — không liệt kê
 * nghĩa là "mọi tab", và rửa nhầm chúng còn khó chịu hơn không rửa gì.
 *
 * 🔴 VÀ ĐÂY KHÔNG PHẢI NƠI KHAI `orderId` · `activeItemId` · `page` · `limit` · `sortBy` ·
 * `sortDir`. Chúng là panel, phân trang và sắp xếp — KHÔNG phải bộ lọc. Nhét chúng vào đây
 * là panel đang mở tự đóng mỗi lần đổi tab, và không ai hiểu vì sao.
 *
 * ⚠️ KHAI BẰNG DANH SÁCH TƯỜNG MINH, không dùng kiểu "mọi tab trừ X". Thêm tab thứ năm về sau
 * thì bảng này BUỘC phải được đọc lại từng dòng — đó chính là điều mong muốn.
 */
export const ORDER_FILTER_SCOPE: Readonly<Record<string, readonly OrderTabKey[]>> = {
  // Công đoạn sản xuất — chỉ có nghĩa khi hàng đã ở xưởng.
  stageFilter: ["master-hub"],

  // Trạng thái BOM — theo dõi per-MO ở giai đoạn thiết kế (business/bom.ts).
  bomFilter: ["pre-production"],

  // Ngày DK HT (requiredDate) và Ngày chốt SX (estimatedDate) — trục ngày của đơn đang chạy ở
  // xưởng; date-filter-fields.ts vốn đã giới hạn chúng ở master-hub.
  requiredDateFrom: ["master-hub"],
  requiredDateTo: ["master-hub"],
  estimatedDateFrom: ["master-hub"],
  estimatedDateTo: ["master-hub"],

  // Ngày hoàn tất — chỉ tab Hoàn tất mới có cột này.
  completedDateFrom: ["completed"],
  completedDateTo: ["completed"],

  // 🔴 DEADLINE RỘNG HƠN requiredDate*, VÀ ĐÂY LÀ CHỖ DỄ KHAI SAI NHẤT.
  //
  // Nút nhanh Deadline (7 ngày tới / Tuần này / Quá hạn) gác bằng `filters.tab !== "completed"`
  // — tức hiện ở BA tab. Trong khi khoảng ngày requiredDateFrom/To, tuy cũng nói về deadline,
  // lại CHỈ hiện ở master-hub.
  //
  // Hai tham số, hai phạm vi khác nhau. Gom chúng thành một "cụm deadline" là rửa mất bộ lọc
  // Deadline của người đang ở tab Thiết kế — một lỗi mới thay cho lỗi cũ.
  deadlinePreset: ["pre-production", "master-hub", "cancelled"],
};

/** Bộ lọc này có ý nghĩa (và có ô điều khiển) ở tab đang mở không. */
export function isFilterOnTab(param: string, tab: string | undefined): boolean {
  const scope = ORDER_FILTER_SCOPE[param];
  if (!scope) return true; // không khai = dùng chung mọi tab
  return scope.includes((tab ?? "master-hub") as OrderTabKey);
}

/**
 * Những tham số phải XOÁ khỏi URL khi chuyển sang `tab`.
 *
 * Trả về mảng đã sắp xếp để kết quả TIỀN ĐỊNH — test so mảng, và một thứ tự nhảy theo thứ tự
 * khai báo object là thứ khiến test đỏ vì lý do không liên quan tới hành vi.
 */
export function filterParamsToDropOn(tab: string | undefined): readonly string[] {
  return Object.keys(ORDER_FILTER_SCOPE)
    .filter((param) => !isFilterOnTab(param, tab))
    .sort();
}

/**
 * Bản sao của `filters` đã BỎ những bộ lọc không thuộc `tab`.
 *
 * 🔴 NGƯỜI THỨ BA DÙNG CHUNG BẢNG NÀY, và đây là lý do nó tồn tại:
 *
 * Màn Đơn hàng có một lớp "lạc quan" — bấm tab là `pendingTab` đổi NGAY, trong khi URL còn
 * đang catch-up. Trước đây lớp đó chỉ ghi đè `tab` và `page`, KHÔNG rửa giá trị. Hệ quả là
 * trong cửa sổ chờ, khoá truy vấn là "tab Sản Xuất KÈM bomFilter" — một tổ hợp vô nghĩa. URL
 * bắt kịp → `buildNextParams` rửa → KHOÁ ĐỔI → React Query fetch LẦN HAI.
 *
 * Hai lần gọi mạng cho một cú bấm tab, và lần đầu trả về sai. Người dùng thấy "vài giây sau
 * mới đúng".
 *
 * Rửa ngay trong bộ nhớ thì khoá lúc chờ TRÙNG khoá lúc xong → một lần fetch, đúng ngay.
 *
 * ⚠️ ĐẶT `undefined` CHỨ KHÔNG `delete`: `delete` đổi hình dạng object nên hai object "cùng nội
 * dung" lại khác nhau khi so khoá — mà so khoá chính là thứ đang cần cho trùng.
 */
export function scrubFiltersForTab<T extends Record<string, unknown>>(
  filters: T,
  tab: string | undefined,
): T {
  const drop = filterParamsToDropOn(tab);
  if (drop.length === 0) return filters;
  const out = { ...filters };
  for (const param of drop) {
    if (param in out) (out as Record<string, unknown>)[param] = undefined;
  }
  return out;
}
