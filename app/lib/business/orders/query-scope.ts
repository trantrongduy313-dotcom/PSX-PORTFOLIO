// ─── PHẠM VI DỮ LIỆU ĐƠN HÀNG THEO VAI — chặn ở SERVER ───────────────────────
//
// 🔴 VÌ SAO FILE NÀY TỒN TẠI, VÀ VÌ SAO NÓ KHÔNG PHẢI LÀ order-tabs.ts:
//
// `order-tabs.ts` ẩn tab. Ẩn tab KHÔNG chặn được gì — chính file đó đã tự cảnh báo hai lần.
// Người dùng gõ thẳng `/api/orders?zone=PRE_PRODUCTION` là qua sạch lớp giao diện, vì lớp đó
// chưa bao giờ là một cái khoá; nó chỉ là một tấm rèm.
//
// R&D là vai đầu tiên mà PHẠM VI DỮ LIỆU là một phần của quyền, không chỉ là chuyện vẽ gì:
// họ được xem MO đã sang Phòng Sản Xuất, và chỉ thế. Vậy nên câu "R&D chỉ thấy PSX" phải được
// phát biểu ở nơi dữ liệu thật sự được lấy ra.
//
// ⚠️ HAI CÁCH XỬ LÝ, VÀ CHÚNG KHÁC NHAU CÓ CHỦ Ý:
//
//   · `zone` sai  → ÉP về MASTER_HUB (clamp). Không phải lỗi của người dùng: giao diện mặc
//     định vẫn có thể gửi kèm zone khác lúc khởi tạo, và ném 403 vào mặt họ ở đây là biến một
//     chi tiết kỹ thuật thành một màn hình đỏ.
//   · `history` bật → TỪ CHỐI. Đây không phải chuyện mặc định lỡ gửi: tab Hoàn tất / Đã hủy
//     bị ẩn khỏi giao diện của họ, nên tham số này chỉ tới được bằng cách gõ tay. Ép âm thầm
//     thì kẻ dò tìm nhận về một danh sách trông như hợp lệ và không bao giờ biết mình bị chặn.
//     Đổi một lỗi im lặng thành một lỗi lên tiếng.
//
// File THUẦN: không prisma, không NextResponse. Chỗ gọi tự dịch `denied` thành mã lỗi HTTP.

/** Vai chỉ được xem MO thuộc Phòng Sản Xuất. Khai thành mảng để vai thứ hai chỉ tốn một dòng. */
const MASTER_HUB_ONLY_ROLES: readonly string[] = ["RND"];

export function isMasterHubOnlyRole(role: string | undefined | null): boolean {
  return !!role && MASTER_HUB_ONLY_ROLES.includes(role);
}

export type OrdersQueryScope =
  | { denied: true; reason: string }
  | { denied: false; zone: string | undefined; history: boolean };

/**
 * Siết `zone` / `history` của một truy vấn đơn hàng theo vai.
 *
 * Vai không bị hạn chế → trả lại NGUYÊN VẸN. Cùng quy ước "không khai = dùng chung" với
 * ORDER_FILTER_SCOPE và ROLE_WRITABLE_COLUMNS: bảng chỉ ghi ngoại lệ.
 */
export function scopeOrdersQueryForRole(
  role: string | undefined | null,
  query: { zone?: string | null; history?: boolean | null },
): OrdersQueryScope {
  const history = !!query.history;

  if (!isMasterHubOnlyRole(role)) {
    return { denied: false, zone: query.zone ?? undefined, history };
  }

  if (history) {
    return { denied: true, reason: "Vai này chỉ xem được đơn hàng đang ở Phòng Sản Xuất." };
  }

  // Ép, không phải "giữ nếu đúng": kể cả khi zone đã là MASTER_HUB thì kết quả vẫn thế, nên
  // viết thẳng một giá trị dễ đọc hơn là một nhánh if.
  return { denied: false, zone: "MASTER_HUB", history: false };
}
