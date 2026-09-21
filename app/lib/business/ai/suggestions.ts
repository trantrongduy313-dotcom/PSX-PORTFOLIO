// ─── Câu hỏi gợi ý theo trang đang mở ────────────────────────────────────────
//
// 🎯 KHÔNG TỐN MỘT ĐỒNG API NÀO. Đây chỉ là một bảng tra: đường dẫn → vài câu hỏi hay gặp ở
// màn đó. Nhưng nó giải một vấn đề thật và lớn hơn vẻ ngoài của nó:
//
//   NGƯỜI DÙNG ĐỨNG TRƯỚC MỘT HỘP CHAT TRỐNG THƯỜNG KHÔNG BIẾT HỎI GÌ, RỒI BỎ ĐI.
//
// Họ có một thắc mắc rất cụ thể trong đầu, nhưng không biết trợ lý này biết được đến đâu, nên
// không dám hỏi. Ba câu gợi ý làm hai việc cùng lúc: cho họ một cú bấm thay vì một ô trống, và
// DẠY họ phạm vi của trợ lý — sau vài lần họ tự hỏi được câu của mình.
//
// ⚠️ LUẬT: chỉ gợi ý câu mà bộ nội dung TRẢ LỜI ĐƯỢC. Một câu gợi ý dẫn tới "nội dung chưa nói
// về việc này" là tệ hơn không gợi ý gì — chính hệ thống mời người dùng vào một cánh cửa đóng,
// và họ sẽ không bấm lần thứ hai.

export type PageSuggestions = {
  /** Tiền tố đường dẫn. So khớp theo tiền tố DÀI NHẤT — xem `suggestionsForPath`. */
  prefix: string;
  questions: readonly string[];
};

/**
 * Bảng gợi ý, xếp từ chung đến riêng.
 *
 * Thứ tự trong mảng KHÔNG quyết định kết quả (hàm tra chọn tiền tố dài nhất), nhưng xếp theo
 * thứ tự này để người đọc thấy được cấu trúc.
 */
export const PAGE_SUGGESTIONS: readonly PageSuggestions[] = [
  {
    prefix: "/dashboard",
    questions: [
      "SO và MO khác nhau thế nào?",
      "Số phiên bản sau dấu gạch dưới nghĩa là gì?",
      "Tôi báo lỗi hệ thống ở đâu?",
    ],
  },
  {
    prefix: "/dashboard/orders",
    questions: [
      "Các trạng thái của một đơn nghĩa là gì?",
      "Vì sao tôi không chuyển được đơn sang giai đoạn sau?",
      "Đơn đang Tạm ngưng thì làm gì để chạy lại?",
    ],
  },
  {
    prefix: "/dashboard/alerts",
    questions: [
      "Cảnh báo CRITICAL khác cảnh báo thường ở đâu?",
      "Xử lý xong cảnh báo thì đơn có tự chạy lại không?",
      "Vì sao đơn của tôi bị tự động tạm ngưng?",
    ],
  },
  {
    prefix: "/dashboard/design-3d",
    questions: [
      "Deadline KPI của tôi được tính thế nào?",
      "Vì sao tôi không ghi được tiến độ?",
      "Tôi có tự tạm dừng việc của mình được không?",
    ],
  },
];

/**
 * Gợi ý cho một đường dẫn, theo TIỀN TỐ DÀI NHẤT khớp được.
 *
 * Tiền tố dài nhất, không phải khớp đầu tiên: `/dashboard/orders/abc` phải nhận gợi ý của màn
 * đơn hàng, không phải gợi ý chung của `/dashboard` — dù cả hai đều khớp. Khớp-đầu-tiên là chỗ
 * bảng này sẽ âm thầm sai ngay khi có người thêm một dòng vào giữa.
 */
export function suggestionsForPath(pathname: string | null | undefined): readonly string[] {
  if (!pathname) return [];

  // Bỏ query string nếu chỗ gọi truyền cả vào — `?orderId=...` làm mọi phép so khớp tiền tố
  // vẫn đúng, nhưng chuẩn hoá ở đây để hàm không phụ thuộc vào việc chỗ gọi có nhớ cắt hay không.
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";

  let best: PageSuggestions | null = null;
  for (const entry of PAGE_SUGGESTIONS) {
    // Kiểm biên `/`: `/dashboard/ordersomething` KHÔNG được khớp `/dashboard/orders`.
    const matches = path === entry.prefix || path.startsWith(`${entry.prefix}/`);
    if (matches && (best === null || entry.prefix.length > best.prefix.length)) best = entry;
  }
  return best?.questions ?? [];
}
