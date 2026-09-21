import type { SystemBlock } from "@/app/lib/business/ai/prompt";
import type { ConversationTurn } from "@/app/lib/business/ai/validate";

// ─── Hợp đồng chung của một nhà cung cấp mô hình ─────────────────────────────
//
// Hai adapter (Anthropic, Google) cùng nhận đúng một đầu vào và trả đúng một đầu ra. Nhờ vậy
// route KHÔNG biết đang gọi ai — và mọi luật đắt giá của tính năng (bộ nội dung, chỉ thị, cách
// đọc câu trả lời, hạn mức) nằm ngoài, dùng chung, có test.

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  /**
   * Token đọc được TỪ cache.
   *
   * Con số chứng minh việc chia khối có tác dụng thật. Hai nhà cung cấp làm cache khác nhau
   * (xem từng adapter), nhưng cả hai đều báo lại con số này — nên cách kiểm là một.
   */
  cacheReadTokens: number;
};

export type AiResult =
  | { ok: true; text: string; usage: AiUsage }
  | { ok: false; message: string };

export type AskParams = {
  system: SystemBlock[];
  question: string;
  history: readonly ConversationTurn[];
};

/** Câu trả lời khi hạ tầng lỗi. Nói cho người dùng biết ĐI ĐÂU, không kể lỗi kỹ thuật. */
export const FALLBACK_MESSAGE =
  "Trợ lý đang không trả lời được. Bạn xem trực tiếp ở Hướng dẫn sử dụng, hoặc gửi Góp ý để được trả lời.";

/**
 * Cắt liên lạc sau mốc này.
 *
 * Vercel có giới hạn thời gian riêng cho mỗi hàm; hết giờ ở đó thì client nhận một lỗi mạng
 * trống rỗng. Tự cắt sớm hơn là còn kịp trả về MỘT CÂU CÓ NGHĨA.
 */
export const TIMEOUT_MS = 45_000;

/**
 * Trải lịch sử hội thoại thành các lượt riêng.
 *
 * Quan trọng: mô hình phân biệt được "điều tôi đã nói" với "điều người dùng đã nói" CHỈ KHI vai
 * trò được khai đúng. Gộp cả hội thoại thành một khối chữ trong lượt user là mời nó coi câu trả
 * lời cũ của chính nó như lời của người dùng.
 *
 * `assistantRole` khác nhau giữa hai nhà cung cấp: Anthropic gọi là `assistant`, Google gọi là
 * `model`. Đó là toàn bộ khác biệt, nên tham số hoá thay vì viết vòng lặp này hai lần.
 */
export function flattenHistory<R extends string>(
  history: readonly ConversationTurn[],
  question: string,
  roles: { user: R; assistant: R },
): { role: R; text: string }[] {
  const out: { role: R; text: string }[] = [];
  for (const turn of history) {
    out.push({ role: roles.user, text: turn.question });
    out.push({ role: roles.assistant, text: turn.answer });
  }
  out.push({ role: roles.user, text: question });
  return out;
}
