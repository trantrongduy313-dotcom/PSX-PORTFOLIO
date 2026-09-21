import type { Prisma } from "@/app/generated/prisma/client";

// ═══════════════════════════════════════════════════════════════════════════
// TĂNG `Order.version` SAU KHI GHI `productionDetail.extraData`
//
// ⚠️ FILE NÀY TỒN TẠI VÌ MỘT ĐƯỜNG MẤT DỮ LIỆU IM LẶNG, KHÔNG PHẢI VÌ TIỆN TAY.
//
// `productionDetail.extraData` là MỘT cột JSON chứa toàn bộ tiến độ của đơn. Nhiều route
// đọc–sửa–ghi lại NGUYÊN CẢ KHỐI. Thứ duy nhất giữ cho chúng không giẫm lên nhau là khoá
// lạc quan `Order.version`: client gửi kèm số nó đọc được, route so, lệch thì trả CONFLICT.
//
// Khoá đó chỉ đúng khi MỌI người ghi cùng TĂNG số. Người nào ghi mà không tăng thì khoá
// KHÔNG hỏng — nó IM LẶNG CHO QUA, và đó mới là điều nguy hiểm:
//
//   1. Anh sản xuất mở tab Tiến độ đơn X → client giữ version = 5.
//   2. Admin duyệt một khâu → extraData bị ghi đè, version VẪN = 5.
//   3. Anh sản xuất bấm Lưu với version = 5 → số vẫn khớp → khoá cho qua.
//   4. Cả khối bị ghi đè bằng bản đọc từ bước 1 → PHÊ DUYỆT CỦA ADMIN BIẾN MẤT.
//
// Không có lỗi, không có cảnh báo, không ai biết. Bước 3 là chỗ đau: người dùng làm đúng
// mọi thứ, hệ thống bảo "Đã lưu", và một người khác mất việc vừa làm.
//
// ─── VÌ SAO CHỈ TĂNG, KHÔNG KIỂM ────────────────────────────────────────────
//
// Hai người gọi hàm này (duyệt khâu, đồng bộ Google Sheet) ghi vào những Ô KHÁC HẲN với
// người sửa tiến độ — chúng không thật sự tranh chấp với nhau. Bắt chúng kiểm version rồi
// trả CONFLICT sẽ chặn oan một thao tác vốn an toàn, và với `sheet-sync` (chạy hàng loạt,
// không có người ngồi bấm lại) thì CONFLICT còn không có ai để báo.
//
// TĂNG là đủ, vì tăng bảo vệ đúng thứ cần bảo vệ: nó làm hết hiệu lực bản sao đang nằm
// trong tab của người khác, buộc họ tải lại thay vì ghi đè. Ghi thì cho qua, ghi ĐÈ thì
// không.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Vô hiệu hoá mọi bản sao đơn đang mở ở client, sau khi vừa ghi `extraData`.
 *
 * GỌI TRONG CÙNG TRANSACTION với lệnh ghi. Tách ra ngoài thì có một khoảng thời gian
 * `extraData` đã mới còn `version` còn cũ — đúng cái cửa sổ mà hàm này sinh ra để đóng.
 *
 * Đơn đã bị xoá giữa chừng thì bỏ qua: lệnh ghi `extraData` ngay trước đó đã đánh sập
 * transaction rồi, nên tới được đây nghĩa là đơn còn sống.
 */
export async function bumpOrderVersion(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  await tx.order.update({
    where: { id: orderId },
    data: { version: { increment: 1 } },
  });
}
