// ─────────────────────────────────────────────────────────────────────────────
// Nguồn DUY NHẤT cho các lựa chọn NVL (nguyên vật liệu) và Xi mạ (platingType).
//
// Trước đây XI_MA_OPTIONS bị khai báo trùng ở create-order-form.tsx và
// order-detail-panel.tsx → dễ lệch (đã từng phải có commit "sync"). Gom về đây để
// thêm/bớt loại xi mạ chỉ sửa 1 chỗ.
//
// Xi mạ có thể KẾT HỢP nhiều loại cùng lúc (VD 14KY + 24K). Cách lưu: MỘT chuỗi nối
// bằng dấu "/" — đồng nhất với cách trường NVL đang biểu diễn tổ hợp ("18KW/KY",
// "24K/18KY"…), nên KHÔNG cần đổi schema (platingType vẫn là string).
// ─────────────────────────────────────────────────────────────────────────────

export const XI_MA_OPTIONS = ["18KW", "18KY", "18KR", "14KY", "10KY", "24K", "20K"] as const;

/** Ký tự nối các loại xi mạ khi kết hợp. */
export const XI_MA_SEP = "/";

/** Tách chuỗi platingType đã lưu thành danh sách token (đã trim, bỏ rỗng). */
export function parseXiMa(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(XI_MA_SEP).map((s) => s.trim()).filter(Boolean);
}

/**
 * Nối danh sách lựa chọn thành MỘT chuỗi chuẩn hoá:
 *  - loại đã biết (trong XI_MA_OPTIONS) xếp theo ĐÚNG thứ tự chuẩn → tránh
 *    "14KY/24K" và "24K/14KY" bị coi là 2 giá trị khác nhau (loạn báo cáo);
 *  - giá trị lạ (dữ liệu cũ ngoài danh sách) được giữ lại, xếp sau;
 *  - tự khử trùng lặp.
 */
export function joinXiMa(selected: string[]): string {
  const cleaned = Array.from(new Set(selected.map((s) => s.trim()).filter(Boolean)));
  const known = XI_MA_OPTIONS.filter((o) => cleaned.includes(o));
  const unknown = cleaned.filter((s) => !XI_MA_OPTIONS.includes(s as (typeof XI_MA_OPTIONS)[number]));
  return [...known, ...unknown].join(XI_MA_SEP);
}

// ─────────────────────────────────────────────────────────────────────────────
// NVL (nguyên vật liệu) — nguồn DUY NHẤT.
//
// Trước đây NVL_OPTIONS khai báo trùng ở 2 file với 2 QUY ƯỚC KHÁC NHAU
// (panel: "18KW/KY" | form tạo đơn: "18KW-Y") → không thể bảo trì. Gom về đây,
// chuẩn hoá dấu nối "/" (8/9 giá trị kết hợp trong DB đang dùng "/").
//
// Danh sách CHỈ chứa loại ĐƠN — các tổ hợp cũ ("18KW/KY", "24K/18KY", "PT/18KY"…)
// đã bỏ khỏi danh sách chọn, user tự tick nhiều loại để kết hợp. Dữ liệu cũ mang
// tổ hợp vẫn hiển thị & sửa được (NvlSelect giữ giá trị lạ), KHÔNG cần migration.
//
// QUAN TRỌNG — quan hệ với công thức quy đổi: calcAutoProduction đọc karat/PT/BAC
// bằng regex trên chuỗi này và lấy giá trị LỚN NHẤT (không phải "match đầu tiên"),
// nên kết quả quy đổi ĐỘC LẬP với thứ tự tick. Đã kiểm chứng: 42 giá trị NVL hiện
// có (option 2 file + DB thật) cho kết quả y hệt rule cũ.
// ─────────────────────────────────────────────────────────────────────────────

export const NVL_OPTIONS = [
  // Vàng 18K
  "18KY", "18KW", "18KR",
  // Vàng 14K
  "14KY", "14KW", "14KR",
  // Vàng 10K
  "10KY", "10KW",
  // Vàng cao tuổi
  "24K", "22K", "20K",
  // Platinum
  "PT950", "PT900",
  // Bạc
  "BAC", "BAC925",
] as const;

/** Ký tự nối các loại NVL khi kết hợp (đồng nhất với Xi mạ). */
export const NVL_SEP = "/";

/** Tách chuỗi nvl đã lưu thành danh sách token (đã trim, bỏ rỗng). */
export function parseNvl(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(NVL_SEP).map((s) => s.trim()).filter(Boolean);
}

/**
 * Nối danh sách NVL thành MỘT chuỗi chuẩn hoá (cùng nguyên tắc joinXiMa):
 * loại đã biết xếp theo thứ tự chuẩn, giá trị lạ (dữ liệu cũ) giữ lại xếp sau,
 * tự khử trùng lặp. Thứ tự KHÔNG ảnh hưởng kết quả quy đổi (xem rule MAX ở trên)
 * — chuẩn hoá ở đây chỉ để 1 tổ hợp luôn hiển thị/lọc/báo cáo dưới 1 dạng duy nhất.
 */
export function joinNvl(selected: string[]): string {
  const cleaned = Array.from(new Set(selected.map((s) => s.trim()).filter(Boolean)));
  const known = NVL_OPTIONS.filter((o) => cleaned.includes(o));
  const unknown = cleaned.filter((s) => !NVL_OPTIONS.includes(s as (typeof NVL_OPTIONS)[number]));
  return [...known, ...unknown].join(NVL_SEP);
}

/**
 * Họ kim loại của 1 token NVL — dùng để cảnh báo khi user tick từ 2 họ khác nhau
 * (sản phẩm 2 chất liệu → tổng quy đổi sẽ tính CẢ 2 loại cho cùng trọng lượng).
 */
export type MetalFamily = "GOLD" | "PT" | "SILVER" | "OTHER";

export function metalFamilyOf(token: string): MetalFamily {
  const t = token.trim().toUpperCase();
  if (/BAC/.test(t)) return "SILVER";
  if (/PT/.test(t)) return "PT";
  if (/\d+K/.test(t)) return "GOLD";
  return "OTHER";
}

/** Các họ kim loại có mặt trong 1 chuỗi nvl (đã khử trùng). */
export function metalFamiliesIn(value: string | null | undefined): MetalFamily[] {
  const fams = new Set<MetalFamily>();
  for (const t of parseNvl(value)) {
    const f = metalFamilyOf(t);
    if (f !== "OTHER") fams.add(f);
  }
  return [...fams];
}
