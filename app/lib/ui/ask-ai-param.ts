// ─── Mở hộp thoại "Hỏi trợ lý" bằng URL ──────────────────────────────────────
//
// 🔴 VÌ SAO CẦN: Trung tâm trợ giúp có bốn thẻ, ba thẻ là liên kết thật và thẻ "Hỏi trợ lý" là
// một `<div>` KHÔNG BẤM ĐƯỢC. Lý do ban đầu đúng — trợ lý là hộp thoại trong thanh hành động,
// không phải một trang, và dựng một đường dẫn giả là cách nhanh nhất để người dùng thôi tin cả
// trang đó.
//
// Nhưng kết quả còn tệ hơn thứ nó tránh: một cái thẻ TRÔNG Y HỆT ba thẻ bấm được, nằm đầu tiên,
// và không làm gì cả. Người dùng không nhìn thấy `cursor: "default"` — họ nhìn thấy một cái hộp
// giống ba cái hộp kia. Và họ đã bấm.
//
// ─── VÌ SAO LÀ URL, KHÔNG PHẢI SỰ KIỆN HAY CONTEXT ───────────────────────────
//
// Thanh hành động ĐÃ dùng URL làm hợp đồng: nó đọc `?orderId` để biết panel đơn hàng có mở
// không, và action-dock.tsx ghi rõ đó là bài học đã trả giá — "không props, không context,
// không state chung", vì OrderDetailPanel là file 8.000+ dòng và mọi cách nối khác đều vỡ theo
// nó. Thêm `?ask=1` là đi đúng con đường đó thay vì phát minh kênh liên lạc thứ hai.
//
// ✅ VÀ NÓ MỞ RA THỨ CHƯA CÓ: một đường dẫn CHIA SẺ ĐƯỢC. Admin trả lời góp ý có thể gửi "bấm
// vào đây để hỏi trợ lý"; mục "Có gì mới" gắn được link. Không chỗ nào cần biết thanh hành
// động được dựng thế nào — chúng chỉ cần biết một tham số.

/** Tên tham số. Ngắn vì nó sẽ nằm trong link người ta gửi cho nhau. */
export const ASK_AI_PARAM = "ask";

/** Giá trị duy nhất được chấp nhận. */
export const ASK_AI_VALUE = "1";

/**
 * URL này có đang yêu cầu mở trợ lý không.
 *
 * KHẮT KHE CÓ CHỦ Ý — chỉ đúng chuỗi `"1"`. Nhận bừa mọi giá trị "truthy" nghĩa là một link
 * gãy (`?ask=undefined`, `?ask=` từ một bộ dựng URL nào đó) cũng bật hộp thoại lên giữa màn
 * hình. Cùng lớp phòng vệ mà orders-client đang dùng cho `?orderId=null`.
 */
export function isAskAiRequested(raw: string | null | undefined): boolean {
  return raw === ASK_AI_VALUE;
}

/**
 * Đường dẫn hiện tại sau khi BỎ tham số `ask`.
 *
 * 🔴 PHẢI DỌN KHI ĐÓNG HỘP THOẠI. Không dọn thì:
 *   · F5 là hộp thoại bật lại — người dùng đóng nó rồi, hệ thống không nhớ.
 *   · Nút Back của trình duyệt cư xử lạ.
 *   · Và với cách dock dựng trạng thái (mở = URL yêu cầu HOẶC người dùng bấm), tham số còn lại
 *     nghĩa là hộp thoại KHÔNG ĐÓNG ĐƯỢC. Việc dọn không phải phép lịch sự, nó là điều kiện.
 *
 * Giữ lại MỌI tham số khác: người dùng có thể đang mở panel đơn hàng (`?orderId=…`) và hỏi trợ
 * lý cùng lúc. Đóng hộp thoại mà đóng luôn panel của họ là một bất ngờ khó chịu.
 */
export function urlWithoutAskAi(pathname: string, search: string): string {
  const p = new URLSearchParams(search);
  p.delete(ASK_AI_PARAM);
  const rest = p.toString();
  return rest ? `${pathname}?${rest}` : pathname;
}

/** Đường dẫn mở trợ lý ngay tại trang đang đứng. */
export function askAiHref(pathname: string): string {
  return `${pathname}?${ASK_AI_PARAM}=${ASK_AI_VALUE}`;
}
