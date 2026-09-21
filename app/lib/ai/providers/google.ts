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

// ─── Adapter Google (Gemini) ─────────────────────────────────────────────────
//
// ⚠️ HAI KHÁC BIỆT VỚI ANTHROPIC ĐÁNG BIẾT TRƯỚC, VÌ CHÚNG ĐỔI CÁCH ĐỌC LỖI:
//
// 1. CACHE LÀ NGẦM ĐỊNH, KHÔNG TƯỜNG MINH. Không có `cache_control` để đặt. Gemini tự nhận ra
//    tiền tố lặp lại giữa các lệnh gọi và tự tính rẻ. Nên cờ `cache` của SystemBlock ở đây
//    KHÔNG được dùng để đặt gì — nhưng THỨ TỰ KHỐI VẪN QUAN TRỌNG NGUYÊN VẸN, vì cache ngầm
//    cũng ăn theo tiền tố. Nói cách khác: luật "khối kiến thức đi trước, không chứa gì thay đổi
//    theo người hỏi" vẫn là luật, chỉ khác là ở đây nó không được khai ra trong request.
//
//    Hệ quả: bộ nội dung hiện ~2.400 token, và cache ngầm có ngưỡng tối thiểu. Nên `cachedContent
//    TokenCount` có thể là 0 một cách BÌNH THƯỜNG cho tới khi bộ nội dung lớn hơn — đừng đọc số
//    0 đó thành "cache hỏng".
//
// 2. CÓ THỂ TRẢ VỀ KHÔNG CÓ CÂU NÀO. Gemini có bộ lọc an toàn riêng và nó chặn ở tầng phản hồi:
//    HTTP vẫn 200, `candidates` rỗng hoặc `finishReason` là SAFETY. Với nội dung hướng dẫn sản
//    xuất trang sức thì gần như không xảy ra, nhưng xử lý sai ca này là một câu trả lời TRẮNG
//    thay vì một thông báo — nên nó được bắt riêng, không rơi vào nhánh chung.

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export async function askGoogle(params: AskParams & { apiKey: string }): Promise<AiResult> {
  // Google gọi lượt của mô hình là `model`, Anthropic gọi là `assistant`. Đó là toàn bộ khác
  // biệt về hình dạng hội thoại.
  const contents = flattenHistory(params.history, params.question, {
    user: "user",
    assistant: "model",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}/${AI_MODELS.google}:generateContent`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        // Key đi ở HEADER, không phải `?key=` trên URL. URL bị ghi vào log truy cập của mọi
        // proxy trên đường đi; header thì không.
        "x-goog-api-key": params.apiKey,
      },
      body: JSON.stringify({
        // Nhiều `parts` giữ nguyên thứ tự khối do prompt.ts quyết định — xem ghi chú đầu file:
        // thứ tự vẫn là thứ tự, dù ở đây không khai được cờ cache.
        systemInstruction: { parts: params.system.map((b) => ({ text: b.text })) },
        contents: contents.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
        generationConfig: {
          maxOutputTokens: MAX_ANSWER_TOKENS,
          // 0 — việc ở đây là đọc một khối văn bản đã được cấp rồi trả lời bám sát nó. Sáng tạo
          // ở đây không phải phẩm chất, nó là chệch nguồn.
          temperature: 0,
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[ai:google] HTTP ${res.status}`, detail.slice(0, 500));
      return { ok: false, message: FALLBACK_MESSAGE };
    }

    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        cachedContentTokenCount?: number;
      };
    };

    // Bị bộ lọc chặn ngay ở đầu vào — không có candidate nào. HTTP vẫn 200.
    if (body.promptFeedback?.blockReason) {
      console.error(`[ai:google] câu hỏi bị chặn: ${body.promptFeedback.blockReason}`);
      return { ok: false, message: FALLBACK_MESSAGE };
    }

    const candidate = body.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .map((p) => p.text)
      .filter((t): t is string => typeof t === "string")
      .join("")
      .trim();

    if (!text) {
      // Ghi cả `finishReason` — đây là thứ phân biệt "bị chặn vì an toàn" với "hết token ngay
      // từ đầu". Không có nó thì một câu trả lời trắng là một bí ẩn.
      console.error(`[ai:google] phản hồi rỗng (finishReason=${candidate?.finishReason ?? "?"})`);
      return { ok: false, message: FALLBACK_MESSAGE };
    }

    // ⚠️ HẾT TOKEN GIỮA CÂU: vẫn CÓ chữ, nhưng câu bị cắt ngang — và cắt ngang nghĩa là DÒNG
    // DẪN NGUỒN Ở CUỐI BỊ MẤT. Không trả về câu cụt: người dùng nhận một câu trả lời trông hoàn
    // chỉnh, không có nguồn, và không có dấu hiệu nào cho biết nó thiếu phần cuối.
    if (candidate?.finishReason === "MAX_TOKENS") {
      console.error("[ai:google] câu trả lời bị cắt vì hết token");
      return {
        ok: false,
        message:
          "Câu trả lời dài quá mức cho phép nên bị cắt. Bạn thử hỏi hẹp lại một chút — hoặc xem trực tiếp ở Hướng dẫn sử dụng.",
      };
    }

    return {
      ok: true,
      text,
      usage: {
        inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
        // 0 là BÌNH THƯỜNG với bộ nội dung nhỏ — xem ghi chú (1) đầu file. Đừng đọc thành lỗi.
        cacheReadTokens: body.usageMetadata?.cachedContentTokenCount ?? 0,
      },
    };
  } catch (err) {
    console.error("[ai:google] gọi mô hình thất bại:", err);
    return { ok: false, message: FALLBACK_MESSAGE };
  } finally {
    clearTimeout(timer);
  }
}
