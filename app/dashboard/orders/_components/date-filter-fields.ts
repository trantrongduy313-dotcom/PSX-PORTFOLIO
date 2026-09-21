import type { Labels } from "@/app/lib/i18n/labels";

// ─────────────────────────────────────────────────────────────────────────────
// Cấu hình các trục ngày dùng cho bộ lọc gộp "Lọc theo ngày" (dropdown + Từ...Đến).
//
// Mỗi trục ngày TỰ khai báo: tên param trong OrderFilters, cách encode/decode giá trị
// (do 4 loại ngày lưu khác định dạng), side-effect khi set, và tab nào được hiển thị.
// Nhờ vậy thêm một trục ngày mới trong tương lai = thêm 1 entry ở đây, KHÔNG đụng UI.
//
// Định dạng lưu (giữ nguyên như hệ thống hiện tại để không phá logic filter/URL):
//   - orderDate / completedDate : chuỗi "YYYY-MM-DD" (raw)
//   - requiredDate / estimatedDate : ISO string (chuyển từ ngày VN 00:00 UTC)
// ─────────────────────────────────────────────────────────────────────────────

export type DateFilterKey = "orderDate" | "requiredDate" | "estimatedDate" | "completedDate";

export type DateFilterFromParam =
  | "dateFrom" | "requiredDateFrom" | "estimatedDateFrom" | "completedDateFrom";
export type DateFilterToParam =
  | "dateTo" | "requiredDateTo" | "estimatedDateTo" | "completedDateTo";

export interface DateFilterFieldDef {
  key: DateFilterKey;
  /** Nhãn hiển thị trong dropdown — lấy từ i18n theo ngôn ngữ hiện tại. */
  getLabel: (L: Labels) => string;
  fromParam: DateFilterFromParam;
  toParam: DateFilterToParam;
  /** Chuyển giá trị "YYYY-MM-DD" từ ô nhập → dạng lưu trong filter. */
  encode: (ymd: string) => string;
  /** Chuyển dạng lưu → "YYYY-MM-DD" để hiển thị lại trên ô nhập. */
  decode: (stored: string) => string;
  /** Patch phụ đi kèm khi set trục ngày này (vd huỷ preset đối lập). */
  sideEffectPatch?: Record<string, unknown>;
}

// ⚠️ TRƯỚC ĐÂY MỖI TRỤC NGÀY TỰ KHAI `isVisibleForTab` Ở ĐÂY. Đã bỏ: nó là NƠI THỨ HAI khai
// phạm vi theo tab, bên cạnh mấy câu `filters.tab === "..."` trong orders-toolbar.tsx — và hai
// nơi đó ĐÃ LỆCH NHAU. Không nơi nào quyết định RỬA giá trị khi đổi tab, nên một bộ lọc theo tab
// vẫn lọc sau khi ô điều khiển của nó biến mất.
//
// Nay phạm vi khai một chỗ: app/lib/ui/order-filter-scope.ts, khoá theo TÊN THAM SỐ URL. Chỗ nào
// cần biết trục ngày này có hiện không thì hỏi `isFilterOnTab(def.fromParam, tab)`.

const ymdToIsoUtc = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`).toISOString();
const isoToYmd = (stored: string) => stored.slice(0, 10);
const identity = (v: string) => v;

export const DATE_FILTER_FIELDS: DateFilterFieldDef[] = [
  {
    key: "orderDate",
    getLabel: (L) => L.ui.table.orderDate,
    fromParam: "dateFrom",
    toParam: "dateTo",
    encode: identity, // orderDate lưu raw "YYYY-MM-DD"
    decode: identity,
    sideEffectPatch: { datePreset: -1 }, // chọn range → tắt preset nhanh Ngày tạo
  },
  {
    key: "requiredDate",
    getLabel: (L) => L.ui.table.requiredDate,
    fromParam: "requiredDateFrom",
    toParam: "requiredDateTo",
    encode: ymdToIsoUtc,
    decode: isoToYmd,
    sideEffectPatch: { deadlinePreset: null }, // chọn range → tắt preset nhanh Deadline
  },
  {
    key: "estimatedDate",
    getLabel: (L) => L.ui.table.estimatedDate,
    fromParam: "estimatedDateFrom",
    toParam: "estimatedDateTo",
    encode: ymdToIsoUtc,
    decode: isoToYmd,
  },
  {
    key: "completedDate",
    getLabel: (L) => L.ui.table.completedDate,
    fromParam: "completedDateFrom",
    toParam: "completedDateTo",
    encode: identity, // completedDate lưu raw "YYYY-MM-DD"
    decode: identity,
  },
];

/** Trục ngày mặc định của tab khi chưa có range nào được set. */
export function defaultDateFilterKey(tab: string | undefined): DateFilterKey {
  if (tab === "completed") return "completedDate";
  if (tab === "master-hub") return "requiredDate";
  return "orderDate";
}
