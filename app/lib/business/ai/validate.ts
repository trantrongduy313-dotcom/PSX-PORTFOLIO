// ─── Kiểm câu hỏi và cắt hội thoại ───────────────────────────────────────────
//
// Hàm thuần, dùng ở CẢ HAI phía: client gọi để báo sớm cho đỡ mất một vòng mạng, server gọi vì
// client không đáng tin. Cùng một hàm, không viết lại điều kiện hai lần — hai bản kiểm lệch
// nhau là cách chắc chắn nhất để có một nút Gửi từ chối đúng điều nó vừa hứa.

export const MIN_QUESTION_LENGTH = 5;

/**
 * Câu hỏi dài hơn mức này thì gần như chắc chắn là dán cả một đoạn log hay một email vào.
 *
 * Chặn CÓ HAI lý do, và lý do thứ hai mới là lý do chính:
 *   1. Chi phí — mỗi ký tự là token phải trả tiền.
 *   2. Câu hỏi dán nguyên một khối chữ thì trợ lý trả lời kém hẳn, vì câu hỏi thật bị chôn
 *      giữa nhiễu. Chặn ở đây là dẫn người dùng viết lại thành một câu — có lợi cho họ.
 */
export const MAX_QUESTION_LENGTH = 800;

/**
 * Số lượt hỏi tối đa trong MỘT phiên hội thoại.
 *
 * Cho hỏi tiếp, vì câu hỏi thật hay đi thành cặp ("vậy còn khi đơn đã bị tạm ngưng?"). Nhưng
 * cắt ở 3, và cả hai vế đều có lý do:
 *
 *   - Mỗi lượt gửi lại TOÀN BỘ hội thoại trước đó, nên chi phí tăng theo bình phương chứ không
 *     phải theo đường thẳng.
 *   - ⚠️ Và quan trọng hơn: hội thoại dài mang theo mọi câu trả lời TRƯỚC, kể cả câu đã lệch.
 *     Mô hình có xu hướng giữ lấy điều nó vừa nói. Cắt ngắn là bắt buộc phải hỏi lại từ đầu —
 *     và một lượt mới sạch thường đúng hơn lượt thứ tư của một mạch đã đi chệch.
 */
export const MAX_CONVERSATION_TURNS = 3;

export type ConversationTurn = { question: string; answer: string };

/** Trả về câu báo lỗi, hoặc null nếu câu hỏi dùng được. */
export function validateQuestion(question: string): string | null {
  const q = question.trim();
  if (q.length === 0) return "Bạn chưa nhập câu hỏi.";
  if (q.length < MIN_QUESTION_LENGTH) return "Câu hỏi quá ngắn — hãy viết rõ hơn một chút.";
  if (q.length > MAX_QUESTION_LENGTH) {
    return `Câu hỏi quá dài (tối đa ${MAX_QUESTION_LENGTH} ký tự). Hãy hỏi gọn lại một câu.`;
  }
  return null;
}

/**
 * Cắt hội thoại về đúng số lượt cho phép, giữ các lượt GẦN NHẤT.
 *
 * Giữ lượt gần nhất chứ không phải lượt đầu: ngữ cảnh gần câu hỏi mới mới là ngữ cảnh có ích.
 *
 * ⚠️ Cắt ở đây KHÔNG thay cho việc chặn ở route. Client có thể gửi 50 lượt; hàm này cắt xuống,
 * nhưng route vẫn phải TỪ CHỐI thay vì âm thầm cắt — âm thầm cắt là người dùng thấy trợ lý
 * "quên" mất điều họ vừa nói mà không có lời giải thích nào.
 */
export function trimConversation(turns: readonly ConversationTurn[]): ConversationTurn[] {
  if (turns.length <= MAX_CONVERSATION_TURNS - 1) return [...turns];
  return turns.slice(-(MAX_CONVERSATION_TURNS - 1));
}

/** Hội thoại đã đủ dài để phải mở lượt mới chưa. */
export function conversationIsFull(turns: readonly ConversationTurn[]): boolean {
  return turns.length >= MAX_CONVERSATION_TURNS;
}

/**
 * Gộp nhiều dòng thành một dòng.
 *
 * Câu hỏi được lưu vào log rồi hiện trong một bảng ở trang admin. Một câu hỏi có xuống dòng
 * làm hàng bảng cao vọt lên và bảng mất khả năng đọc theo cột.
 */
export function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
