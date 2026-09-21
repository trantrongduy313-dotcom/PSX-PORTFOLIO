// ─── MO ĐÃ CHỐT (Hoàn tất / Đã hủy) thì không sửa dữ liệu ────────────────────
//
// ⚠️ FILE NÀY TỒN TẠI VÌ KHOÁ ĐÓ ĐANG ĐO Ở CẤP SAI TRÊN ĐƯỜNG LƯU TAB THIẾT KẾ.
//
// Route production có SẴN hai nhánh, và chỉ MỘT nhánh đo đúng:
//
//   có `scopedItemId` → `scopedItem.itemStatus ?? order.status`   ✅ cấp MO
//   không có          → `order.status`                            ❌ cấp SO
//
// Lệnh lưu từ tab Thiết kế chỉ gửi `{ version, extraData }` — KHÔNG có `scopedItemId` — nên nó
// rơi vào nhánh sai. Hệ quả thật:
//
//   SO có 3 MO. MO#1 đã COMPLETED (itemStatus riêng), còn `order.status` vẫn IN_PRODUCTION vì
//   hai MO kia chưa xong. User vào tab Thiết kế sửa thông số của MO#1 ĐÃ CHỐT, và khoá không
//   bắt — trong khi cùng thao tác đó qua route items/[itemId] thì bị chặn.
//
// Đây là lớp lỗi codebase đã ghi lại là "đã sửa hai lần ở chỗ khác, riêng dòng này bị bỏ quên"
// (xem critical-field-lock.ts). Dữ liệu là PER-MO; khoá đo ở cấp SO thì vừa BỎ LỌT (MO xong mà
// SO chưa) vừa CHẶN OAN (SO xong mà MO này chưa).
//
// ─── VÌ SAO TÁCH RA MODULE THUẦN ────────────────────────────────────────────
//
// Luật này đang được viết lại ở BA chỗ: hai nhánh trong production/route.ts và một lần nữa trong
// items/[itemId]/route.ts. Ba bản chép tay của một luật thì không có cách nào biết chúng còn khớp
// nhau — và lần lệch đầu tiên chính là cái đang phải sửa ở đây.
//
// File THUẦN: không prisma, không React — test được mà không cần DB.

/** Trạng thái CHỐT: dữ liệu đã đi ra khỏi hệ thống (đã giao hàng / đã bỏ). */
export const TERMINAL_STATUSES = ["COMPLETED", "CANCELLED"] as const;

/**
 * MO này có đang bị khoá vì đã chốt không.
 *
 * ĐO TRẠNG THÁI HIỆU DỤNG CỦA MO: `itemStatus ?? orderStatus`. MO không có trạng thái riêng thì
 * mới ăn theo SO — đó là ý nghĩa của `null`, không phải "luôn dùng trạng thái SO".
 *
 * `adminOverride` mở khoá: route đã bắt ADMIN + bắt buộc lý do TRƯỚC transaction, nên tới đây thì
 * quyền đã xét xong. Cố ý nhận cờ này ở đây thay vì để nơi gọi tự `&& !adminOverride`: viết ở
 * ngoài thì mỗi chỗ gọi phải tự nhớ, và chỗ nào quên là chỗ đó khoá cả Admin.
 */
export function isTerminalLocked(params: {
  /** Trạng thái riêng của MO đang thao tác. null/undefined = ăn theo SO. */
  itemStatus: string | null | undefined;
  orderStatus: string | null | undefined;
  adminOverride?: boolean;
}): boolean {
  if (params.adminOverride) return false;
  const effective = params.itemStatus ?? params.orderStatus ?? "";
  return (TERMINAL_STATUSES as readonly string[]).includes(effective);
}

/**
 * Câu từ chối — NÊU TÊN MO và CHỈ ĐƯỜNG ĐI TIẾP.
 *
 * Bản cũ chỉ nói "Đơn hàng đã hoàn tất hoặc hủy — không thể chỉnh sửa." Hai chỗ thiếu, và cả hai
 * đều đáng kể sau khi khoá này đo đúng cấp MO:
 *
 *   · Nó nói "ĐƠN HÀNG" trong khi thứ bị khoá là MỘT MO. Trên một SO nhiều MO, người dùng sẽ
 *     tưởng cả đơn bị khoá và không thử MO khác.
 *   · Nó không nói còn đường nào. Đường có thật: "Sửa dữ liệu (Admin)" — nhưng người dùng không
 *     đoán ra được, nên họ kết luận là hệ thống hỏng.
 */
export function terminalLockReason(params: {
  moNumber?: string | null;
  itemStatus: string | null | undefined;
  orderStatus: string | null | undefined;
}): string {
  const effective = params.itemStatus ?? params.orderStatus ?? "";
  const what = effective === "CANCELLED" ? "ĐÃ HỦY" : "ĐÃ HOÀN TẤT";
  const who = params.moNumber ? `MO ${params.moNumber}` : "MO này";
  return `${who} ${what} — dữ liệu đã chốt nên không sửa trực tiếp được. `
    + `Nếu cần sửa lại thông tin nhập sai, dùng "Sửa dữ liệu (Admin)"; nếu cần làm tiếp thì "Mở lại đơn".`;
}
