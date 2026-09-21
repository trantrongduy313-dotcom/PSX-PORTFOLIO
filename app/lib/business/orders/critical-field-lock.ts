// Khoá Khách hàng / Sales khi MO đã vào sản xuất.
//
// Luật có test: __tests__/critical-field-lock.test.ts
// Hai lỗi chặn oan mà nó sửa: docs/04_ENGINEERING_GUIDELINES.md § Khoá field quan trọng theo MO
//
// 🔴 KHOÁ NÀY CHỈ Ở TRÌNH DUYỆT. Route PATCH items/[itemId] không có luật nào chặn ghi
// customerName/salesName khi MO đã vào sản xuất — đây là "ô bị làm mờ", chưa bao giờ là bảo đảm.

/** Trạng thái coi là "đã vào sản xuất" — sau các mốc này giấy tờ đã ra khỏi phòng. */
export const CRITICAL_LOCK_STATUSES = ["IN_PRODUCTION", "COMPLETED"] as const;

/**
 * Field quan trọng (Khách hàng / Sales) của MO này có bị khoá không?
 *
 * Khoá khi CẢ HAI đúng:
 *   1. TRẠNG THÁI HIỆU DỤNG CỦA MO này đã vào sản xuất — không phải trạng thái của SO;
 *   2. field ĐÃ CÓ giá trị — chỗ còn trống thì luôn điền được.
 */
export function isCriticalFieldLocked(params: {
  /** Trạng thái riêng của MO đang xem. null/undefined = MO ăn theo trạng thái SO. */
  itemStatus: string | null | undefined;
  /** Trạng thái của SO — chỉ dùng khi MO không có trạng thái riêng. */
  orderStatus: string | null | undefined;
  /** Giá trị HIỆN CÓ của field. Rỗng/khoảng trắng = chưa có. */
  currentValue: string | null | undefined;
}): boolean {
  const effective = params.itemStatus ?? params.orderStatus ?? "";
  if (!(CRITICAL_LOCK_STATUSES as readonly string[]).includes(effective)) return false;
  return !!(params.currentValue ?? "").trim();
}

/**
 * MO này có đang ở giai đoạn sản xuất không — dùng cho banner cảnh báo.
 *
 * TÁCH RIÊNG khỏi `isCriticalFieldLocked` vì banner trả lời câu khác: "đơn này đã vào sản xuất"
 * là sự thật về MO, không phụ thuộc field nào đang trống. Gộp hai câu vào một cờ thì banner sẽ
 * biến mất chỉ vì tên khách còn trống — trong khi đó là đúng lúc người dùng cần biết nhất.
 */
export function isMoInProduction(params: {
  itemStatus: string | null | undefined;
  orderStatus: string | null | undefined;
}): boolean {
  const effective = params.itemStatus ?? params.orderStatus ?? "";
  return (CRITICAL_LOCK_STATUSES as readonly string[]).includes(effective);
}
