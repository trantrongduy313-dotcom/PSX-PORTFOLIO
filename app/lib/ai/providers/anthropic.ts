import "server-only";

import { MAX_ANSWER_TOKENS } from "@/app/lib/business/ai/budget";
import { AI_MODELS } from "@/app/lib/business/ai/provider";
import {
  FALLBACK_MESSAGE,
  TIMEOUT_MS,
  flattenHistory,
  type AiResult,
  type AskParams,
} from "./types";

// ─── Adapter Anthropic ───────────────────────────────────────────────────────
//
// VÌ SAO `fetch` TAY THAY VÌ SDK: cần đúng một lệnh gọi, và cần điều khiển chính xác chỗ đặt
// `cache_control`. Một phụ thuộc phải theo dõi mãi để tiết kiệm hai chục dòng là đổi sai chiều.

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export async function askAnthropic(params: AskParams & { apiKey: string }): Promise<AiResult> {
  const messages = flattenHistory(params.history, params.question, {
    user: "user",
    assistant: "assistant",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": params.apiKey,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify({
        model: AI_MODELS.anthropic,
        max_tokens: MAX_ANSWER_TOKENS,
        // `system` dạng MẢNG KHỐI, không phải chuỗi — đó là điều kiện để đặt được
        // `cache_control`. Cache ở đây là TƯỜNG MINH: khối nào được cache do prompt.ts quyết
        // định, và luật ở đó là khối được cache đi TRƯỚC và không chứa gì thay đổi theo người hỏi.
        system: params.system.map((b) => ({
          type: "text",
          text: b.text,
          ...(b.cache ? { cache_control: { type: "ephemeral" } } : {}),
        })),
        messages: messages.map((m) => ({ role: m.role, content: m.text })),
      }),
    });

    if (!res.ok) {
      // Đọc body để ghi log — nhưng KHÔNG bao giờ đưa cho người dùng: nó có thể chứa chi tiết
      // về cấu hình, và người dùng cũng không làm gì được với nó.
      const detail = await res.text().catch(() => "");
      console.error(`[ai:anthropic] HTTP ${res.status}`, detail.slice(0, 500));
      return { ok: false, message: FALLBACK_MESSAGE };
    }

    const body = (await res.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
    };

    // Chỉ lấy khối `text`, lọc theo LOẠI chứ không lấy `content[0]`: phản hồi có thể mang thêm
    // khối loại khác, và `content[0].text` khi đó là `undefined` — biểu hiện sẽ là một câu trả
    // lời trắng, không phải một lỗi.
    const text = (body.content ?? [])
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string)
      .join("\n")
      .trim();

    if (!text) {
      console.error("[ai:anthropic] phản hồi không có nội dung text");
      return { ok: false, message: FALLBACK_MESSAGE };
    }

    return {
      ok: true,
      text,
      usage: {
        inputTokens: body.usage?.input_tokens ?? 0,
        outputTokens: body.usage?.output_tokens ?? 0,
        cacheReadTokens: body.usage?.cache_read_input_tokens ?? 0,
      },
    };
  } catch (err) {
    // Gộp mọi thất bại hạ tầng vào một kết cục: hết giờ, mạng đứt, JSON hỏng. Người dùng cần
    // biết ĐI ĐÂU tiếp, không cần biết cái nào trong ba cái vừa xảy ra — cái đó nằm ở log.
    console.error("[ai:anthropic] gọi mô hình thất bại:", err);
    return { ok: false, message: FALLBACK_MESSAGE };
  } finally {
    // `finally` chứ không đặt sau `await`: nhánh lỗi cũng phải xoá hẹn giờ, nếu không thì mỗi
    // lần lỗi để lại một timer treo cho tới khi nó tự nổ.
    clearTimeout(timer);
  }
}
