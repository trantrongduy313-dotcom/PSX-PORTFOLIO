// ─── Chọn nhà cung cấp mô hình ───────────────────────────────────────────────
//
// Hàm thuần, nhận `env` làm tham số chứ không đọc `process.env` trực tiếp — nên test được mà
// không phải sửa biến môi trường toàn cục.
//
// ⚠️ VÌ SAO CÓ HAI NHÀ CUNG CẤP: bộ khung ban đầu viết cho Anthropic, rồi key thật được cấp là
// key Google (Gemini). Giữ CẢ HAI thay vì thay thế, vì phần đắt nhất của tính năng này —
// bộ nội dung, chỉ thị, cách đọc câu trả lời, hạn mức — KHÔNG phụ thuộc nhà cung cấp nào. Chỉ
// đúng một hàm gọi HTTP là khác.
//
// Và giữ hai đường là còn đường lùi: một nhà cung cấp trả lời kém hoặc chặn nhầm nội dung thì
// đổi bằng cách đặt biến môi trường khác, không phải viết lại.

export type AiProvider = "anthropic" | "google";

export const AI_PROVIDERS: readonly AiProvider[] = ["anthropic", "google"];

/**
 * Mô hình dùng cho từng nhà cung cấp.
 *
 * 🎯 CẢ HAI ĐỀU CHỌN BẬC NHANH-VÀ-RẺ, VÀ ĐÓ LÀ LỰA CHỌN ĐÚNG CHỨ KHÔNG PHẢI LỰA CHỌN TIẾT KIỆM.
 *
 * Việc phải làm ở đây là: đọc một khối văn bản ĐÃ ĐƯỢC CẤP rồi trả lời bám sát nó, và nói
 * "không có" khi không có. Đó không phải việc cần suy luận sâu.
 *
 * Và một mô hình mạnh hơn còn TỆ HƠN cho đúng việc này: nó có nhiều kiến thức chung hơn về
 * "hệ thống ERP nói chung", nên xu hướng "giúp thêm" bằng kiến thức ngoài mạnh hơn — đúng thứ
 * luật số 1 của chỉ thị cấm. Ở đây bám nguồn quan trọng hơn thông minh.
 */
export const AI_MODELS: Record<AiProvider, string> = {
  anthropic: "claude-haiku-4-5-20251001",
  google: "gemini-2.5-flash",
};

/** Tên biến môi trường chứa key của từng nhà cung cấp. */
export const AI_KEY_ENV: Record<AiProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_AI_API_KEY",
};

/**
 * Nhà cung cấp đang dùng, suy từ biến môi trường nào có mặt.
 *
 * KHÔNG có biến "chọn nhà cung cấp" riêng, và đó là chủ ý: hai biến (một chọn, một chứa key) là
 * hai thứ có thể lệch nhau — chọn `google` mà chỉ có key Anthropic thì tính năng chết với một
 * thông báo không liên quan gì đến nguyên nhân. Có key nào thì dùng key đó; không suy diễn.
 *
 * `AI_PROVIDER` vẫn được tôn trọng khi có CẢ HAI key, vì lúc đó mới thật sự cần chọn.
 */
export function resolveProvider(env: Record<string, string | undefined>): AiProvider | null {
  const available = AI_PROVIDERS.filter((p) => Boolean(env[AI_KEY_ENV[p]]));
  if (available.length === 0) return null;
  if (available.length === 1) return available[0];

  // Có cả hai key. Giá trị lạ trong AI_PROVIDER thì BỎ QUA thay vì nổ — tính năng vẫn chạy bằng
  // nhà cung cấp đầu tiên, và một lỗi gõ sai biến môi trường không nên làm tắt trợ lý.
  const wanted = env.AI_PROVIDER as AiProvider | undefined;
  return wanted && available.includes(wanted) ? wanted : available[0];
}
