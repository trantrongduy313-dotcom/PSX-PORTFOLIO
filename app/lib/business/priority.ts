// ═══════════════════════════════════════════════════════════════════════════
// Phân loại ƯU TIÊN của MO — nguồn chân lý DUY NHẤT (single source of truth).
//
// Trước đây việc phân loại ưu tiên nằm rải rác (order.isPriority SO-level, item.isRush,
// so chuỗi "UT1" tại chỗ…) gây bug lọc: nút "Ưu tiên" lọc theo SO-level nên MO Normal
// anh em trong cùng SO vẫn lọt. Gom về một module thuần + typed để mọi nơi (lọc, badge,
// server, client) phân loại NHẤT QUÁN theo priorityCode PER-MO.
// ═══════════════════════════════════════════════════════════════════════════

/** Các mã ưu tiên hợp lệ của một MO (OrderItem.priorityCode). */
export const PRIORITY_CODES = ["UT1", "UT2", "Normal", "SR"] as const;
export type PriorityCode = (typeof PRIORITY_CODES)[number];

/** Mã ưu tiên cao nhất — nút lọc "Ưu tiên" chỉ khớp mã này (quyết định nghiệp vụ: option B). */
export const TOP_PRIORITY_CODE: PriorityCode = "UT1";

/** Chuẩn hoá giá trị thô (string bất kỳ / null) về PriorityCode — không khớp → "Normal". */
export function toPriorityCode(raw: string | null | undefined): PriorityCode {
  return (PRIORITY_CODES as readonly string[]).includes(raw ?? "")
    ? (raw as PriorityCode)
    : "Normal";
}

/**
 * MO này có phải ƯU TIÊN (UT1) không — dùng cho bộ lọc "Ưu tiên" (option B: CHỈ UT1).
 * Nhận priorityCode PER-MO (không phải cờ isPriority cấp SO) để lọc đúng từng MO.
 */
export function isTopPriority(rawCode: string | null | undefined): boolean {
  return toPriorityCode(rawCode) === TOP_PRIORITY_CODE;
}
