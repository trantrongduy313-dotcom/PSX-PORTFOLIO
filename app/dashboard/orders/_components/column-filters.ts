// ─────────────────────────────────────────────────────────────────────────────
// Lọc nâng cao theo TỪNG TRƯỜNG (kiểu Google Sheet) — nguồn khai báo DUY NHẤT.
//
// Thêm/bớt một trường lọc = thêm/bớt 1 entry trong COLUMN_FILTER_DEFS. UI + logic tự
// suy ra theo `type`, KHÔNG cần sửa chỗ khác. Toàn bộ predicate là hàm THUẦN (dễ test).
//
// Áp trên `tableRows` (đã flatten per-MO) ở client — cộng dồn với quick-filter sẵn có.
// Ngày tháng đã có bộ lọc riêng ở toolbar nên KHÔNG lặp lại ở đây.
// ─────────────────────────────────────────────────────────────────────────────

export type ColumnFilterType = "text" | "select" | "number-range";

// Row truyền vào là dòng bảng (OrderSummary + firstItem) — dùng loose type cho accessor.
type Row = Record<string, unknown> & { firstItem?: Record<string, unknown> | null };

export interface ColumnFilterDef {
  id: string;
  label: string;
  type: ColumnFilterType;
  /** Lấy giá trị hiển thị/để lọc từ 1 dòng. Trả chuỗi (text/select) hoặc số dạng chuỗi. */
  accessor: (row: Row) => string;
  /**
   * Cột lưu TỔ HỢP nhiều giá trị trong 1 chuỗi (VD NVL "18KW/18KY", Xi mạ "14KY/24K").
   * Khi có `tokenize`, filter select hoạt động theo TỪNG token: danh sách chọn là các token
   * đơn, và tick "18KY" sẽ khớp cả "18KW/18KY" (trước đây khớp chính xác cả chuỗi nên bỏ sót).
   */
  tokenize?: (raw: string) => string[];
}

/** Tách chuỗi tổ hợp nối bằng "/" thành token đơn (dùng cho NVL & Xi mạ). */
const splitSlash = (raw: string): string[] => raw.split("/").map((t) => t.trim()).filter(Boolean);

const fi = (row: Row) => (row.firstItem ?? {}) as Record<string, unknown>;
const s = (v: unknown): string => (v == null ? "" : String(v));

export const COLUMN_FILTER_DEFS: ColumnFilterDef[] = [
  { id: "customerName", label: "Khách hàng",    type: "select", accessor: (r) => s(r.customerName) },
  { id: "phanLoaiKh",   label: "Phân loại KH",  type: "select", accessor: (r) => s(r.phanLoaiKh) },
  { id: "salesName",    label: "Sales",         type: "text",   accessor: (r) => s(r.salesName) },
  { id: "loaiSp",       label: "Loại SP",       type: "select", accessor: (r) => s(fi(r).loaiSp) },
  { id: "phanLoaiKt",   label: "Phân loại KT",  type: "select", accessor: (r) => (Array.isArray(fi(r).techClassification) ? (fi(r).techClassification as string[]).join(", ") : s(fi(r).techClassification)) },
  { id: "nvl",          label: "NVL",           type: "select", accessor: (r) => s(fi(r).nvl), tokenize: splitSlash },
  { id: "size",         label: "Size",          type: "text",   accessor: (r) => s(fi(r).size) },
  { id: "platingType",  label: "Xi mạ",         type: "select", accessor: (r) => s(fi(r).platingType), tokenize: splitSlash },
  { id: "mainStoneType",label: "Đá chủ",        type: "text",   accessor: (r) => s(fi(r).mainStoneType) },
  { id: "weightGram",   label: "TL 3D (g)",     type: "number-range", accessor: (r) => s(fi(r).weightGram) },
  { id: "priorityCode", label: "Ưu tiên",       type: "select", accessor: (r) => s(r.priorityCode ?? fi(r).priorityCode) },
  { id: "status",       label: "Trạng thái",    type: "select", accessor: (r) => s(r.status) },
  { id: "congDoan",     label: "Công đoạn",     type: "select", accessor: (r) => s((r.productionSummary as Record<string, unknown> | null)?.congDoan) },
  { id: "techNote",     label: "Diễn giải SP",  type: "text",   accessor: (r) => s(fi(r).techNote) },
  { id: "ghiChuSp",     label: "Ghi chú SP",    type: "text",   accessor: (r) => s(fi(r).ghiChuSp) },
  { id: "bomStatus",    label: "BOM",           type: "select", accessor: (r) => s(fi(r).bomStatus) },
];

export const COLUMN_FILTER_BY_ID = new Map(COLUMN_FILTER_DEFS.map((d) => [d.id, d]));

/** Một điều kiện lọc đang bật. `value` tuỳ type: text→string; select→string[]; number-range→{min,max}. */
export type ColumnFilterValue =
  | { type: "text"; value: string }
  | { type: "select"; value: string[] }
  | { type: "number-range"; value: { min: string; max: string } };

export type ActiveColumnFilters = Record<string, ColumnFilterValue>;

/**
 * Các giá trị distinct (đã sort) của 1 cột select — để dựng danh sách checkbox.
 * Cột có `tokenize` (NVL / Xi mạ) trả về các TOKEN ĐƠN, không phải cả chuỗi tổ hợp
 * → danh sách gọn (VD "18KY", "18KW"…) thay vì phình theo từng tổ hợp.
 */
export function distinctOptions(rows: Row[], def: ColumnFilterDef): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const v = def.accessor(r).trim();
    if (!v) continue;
    if (def.tokenize) for (const t of def.tokenize(v)) set.add(t);
    else set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "vi"));
}

function matchesOne(row: Row, def: ColumnFilterDef, f: ColumnFilterValue): boolean {
  const raw = def.accessor(row).trim();
  if (f.type === "text") {
    const q = f.value.trim().toLowerCase();
    return q === "" || raw.toLowerCase().includes(q);
  }
  if (f.type === "select") {
    if (f.value.length === 0) return true;
    // Cột tổ hợp: khớp nếu CÓ token nào của dòng nằm trong danh sách đã tick.
    if (def.tokenize) {
      const tokens = def.tokenize(raw);
      return f.value.some((v) => tokens.includes(v));
    }
    return f.value.includes(raw);
  }
  // number-range
  const min = f.value.min.trim() === "" ? null : Number(f.value.min);
  const max = f.value.max.trim() === "" ? null : Number(f.value.max);
  if (min === null && max === null) return true;
  const n = Number(raw);
  if (raw === "" || Number.isNaN(n)) return false;
  if (min !== null && n < min) return false;
  if (max !== null && n > max) return false;
  return true;
}

/** Áp toàn bộ điều kiện (AND giữa các cột) — pure. */
export function applyColumnFilters<T extends Row>(rows: T[], filters: ActiveColumnFilters): T[] {
  const active = Object.entries(filters).filter(([id]) => COLUMN_FILTER_BY_ID.has(id));
  if (active.length === 0) return rows;
  return rows.filter((row) =>
    active.every(([id, f]) => matchesOne(row, COLUMN_FILTER_BY_ID.get(id)!, f))
  );
}

/** Có điều kiện nào thực sự có tác dụng không (bỏ qua điều kiện rỗng). */
export function hasEffectiveFilter(f: ColumnFilterValue): boolean {
  if (f.type === "text") return f.value.trim() !== "";
  if (f.type === "select") return f.value.length > 0;
  return f.value.min.trim() !== "" || f.value.max.trim() !== "";
}
