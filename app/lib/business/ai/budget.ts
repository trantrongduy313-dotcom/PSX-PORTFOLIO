// ─── Hạn mức ─────────────────────────────────────────────────────────────────
//
// ⚠️ MỘT TÍNH NĂNG GỌI API TRẢ TIỀN THÌ HẠN MỨC LÀ PHẦN CỦA TÍNH NĂNG, KHÔNG PHẢI PHẦN THÊM
// SAU. Không có nó thì một vòng lặp trong giao diện, một người bấm gửi liên tục vì tưởng bị
// treo, hay một tab để mở tự gọi lại — bất kỳ cái nào cũng thành một hoá đơn không ai thấy cho
// đến cuối tháng.
//
// HAI TẦNG, và chúng bảo vệ hai thứ khác nhau:
//   - Theo NGƯỜI: chặn một người dùng lệch, giữ cho những người khác vẫn dùng được.
//   - TOÀN HỆ THỐNG: đây mới là trần chi phí thật. Không có nó thì mười người cùng chạm hạn
//     mức cá nhân vẫn cộng thành một con số không ai định trước.
//
// Cả hai đếm bằng cách đếm dòng trong bảng ai_question_logs — đúng khuôn rate-limit.ts đang
// dùng cho hủy đơn / rollback. KHÔNG dùng bộ đếm trong bộ nhớ: mỗi phiên serverless trên Vercel
// có bộ nhớ riêng, nên một bộ đếm trong RAM chỉ giới hạn được từng phiên và về thực chất là
// không giới hạn gì.

export const MAX_QUESTIONS_PER_USER_PER_DAY = 30;

/**
 * Trần toàn hệ thống mỗi ngày.
 *
 * Con số này là một QUYẾT ĐỊNH KINH DOANH, không phải một hằng số kỹ thuật — nó nói "mỗi ngày
 * tôi chấp nhận trả tối đa chừng này". Đặt ở đây, có tên, để đổi nó là một hành động có chủ ý.
 */
export const MAX_QUESTIONS_GLOBAL_PER_DAY = 300;

/** Cửa sổ tính hạn mức: 24 giờ trượt, không phải "từ nửa đêm". */
export const BUDGET_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Số token tối đa cho MỘT câu trả lời.
 *
 * Vừa là chặn chi phí, vừa là một quyết định về sản phẩm: câu trả lời hướng dẫn dài quá thì
 * không ai đọc, và người dùng quay lại đi hỏi người. Cắt ngắn là ép trợ lý trả lời vào việc.
 */
export const MAX_ANSWER_TOKENS = 1024;

export type BudgetCheck =
  | { allowed: true }
  | { allowed: false; reason: "USER" | "GLOBAL"; message: string };

export function checkBudget(counts: { user: number; global: number }): BudgetCheck {
  // Kiểm trần TOÀN HỆ THỐNG trước: khi đã chạm trần đó thì hạn mức cá nhân không còn nghĩa gì,
  // và người dùng cần biết đúng lý do — "hệ thống hết lượt hôm nay" dẫn tới hành động khác hẳn
  // với "bạn hết lượt hôm nay".
  if (counts.global >= MAX_QUESTIONS_GLOBAL_PER_DAY) {
    return {
      allowed: false,
      reason: "GLOBAL",
      message:
        "Trợ lý đã dùng hết lượt hỏi của hôm nay cho toàn hệ thống. Bạn xem trực tiếp ở Hướng dẫn sử dụng, hoặc gửi Góp ý để được trả lời.",
    };
  }
  if (counts.user >= MAX_QUESTIONS_PER_USER_PER_DAY) {
    return {
      allowed: false,
      reason: "USER",
      message: `Bạn đã hỏi ${MAX_QUESTIONS_PER_USER_PER_DAY} câu trong 24 giờ qua — hết lượt. Hãy thử tìm ở Hướng dẫn sử dụng, hoặc gửi Góp ý.`,
    };
  }
  return { allowed: true };
}
