import "server-only";

import { AI_KEY_ENV, resolveProvider } from "@/app/lib/business/ai/provider";
import { askAnthropic } from "./providers/anthropic";
import { askGoogle } from "./providers/google";
import { FALLBACK_MESSAGE, type AiResult, type AskParams } from "./providers/types";

export type { AiResult, AiUsage } from "./providers/types";

// ─── Cửa duy nhất để gọi mô hình ─────────────────────────────────────────────
//
// `server-only`: khoá biên dịch, không phải quy ước. Một `import` vô tình từ Client Component
// sẽ làm build ĐỎ thay vì gói API key vào bundle gửi cho trình duyệt.
//
// File này CHỈ điều phối: chọn nhà cung cấp theo biến môi trường rồi chuyển việc. Mọi thứ khác
// biệt giữa hai nhà cung cấp nằm gọn trong providers/*, và route không biết đang gọi ai.

/**
 * Không có key thì TÍNH NĂNG TỰ ẨN, không phải báo lỗi.
 *
 * Kiêm ba việc bằng một điều kiện:
 *   1. Máy dev không cần key vẫn chạy được cả ứng dụng.
 *   2. Là CÔNG TẮC TẮT: xoá biến môi trường là nút "Hỏi trợ lý" biến mất, không cần sửa code.
 *   3. Không bao giờ có nút bấm vào rồi báo "chưa cấu hình" — đó là một lỗi lộ ra với người
 *      dùng vì một chuyện thuộc về vận hành.
 */
export function isAiConfigured(): boolean {
  return resolveProvider(process.env) !== null;
}

export async function askModel(params: AskParams): Promise<AiResult> {
  const provider = resolveProvider(process.env);
  if (!provider) return { ok: false, message: FALLBACK_MESSAGE };

  const apiKey = process.env[AI_KEY_ENV[provider]];
  // `resolveProvider` đã kiểm key có mặt, nên nhánh này không tới được. Vẫn kiểm vì nó là điều
  // kiện để TypeScript thu hẹp `string | undefined` — và vì một ngày nào đó hai hàm có thể lệch.
  if (!apiKey) return { ok: false, message: FALLBACK_MESSAGE };

  // Switch VÉT CẠN. Thêm nhà cung cấp thứ ba mà quên nối vào đây thì BUILD ĐỎ, không phải trợ lý
  // im lặng trả về câu dự phòng cho mọi câu hỏi.
  switch (provider) {
    case "anthropic":
      return askAnthropic({ ...params, apiKey });
    case "google":
      return askGoogle({ ...params, apiKey });
  }
}
