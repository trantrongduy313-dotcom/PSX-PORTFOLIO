import "server-only";

import type { ChatPayload } from "@/app/lib/business/notify/chat-message";

// ─── Gửi tin nhắn tới Google Chat qua Incoming Webhook ───────────────────────
//
// VÌ SAO DÙNG WEBHOOK: Google Workspace của công ty (CTYHP) đã CHẶN hai cách tích hợp Google
// khác của dự án này — chia sẻ file cho service account (bị chính sách domain allowlist chặn)
// và OAuth (app còn ở chế độ Testing, chưa qua verification). Xem
// YEU_CAU_HO_TRO_IT_GOOGLE_OAUTH.md. Chat API + Domain-Wide Delegation sẽ vướng đúng bức tường
// đó. Incoming Webhook không cần bật API, không cần service account, không cần quyền admin.
//
// URL webhook có dạng:
//     https://chat.googleapis.com/v1/spaces/AAAA…/messages?key=…&token=…
// tức là HAI BÍ MẬT nằm ngay trong query string. Vì vậy file này có ba rào:
//   1. Chỉ nhận URL thuộc chat.googleapis.com
//   2. Che URL trước khi ghi log
//   3. Không bao giờ ném lỗi lên trên

/** Chỉ cho phép đúng host của Google Chat. */
const ALLOWED_HOST = "chat.googleapis.com";

export type ChatSendResult =
  | { status: "SENT"; /** true = thẻ bị từ chối, đã gửi lại bằng bản chữ. */ usedFallback?: boolean }
  | { status: "SKIPPED"; reason: string }
  | { status: "FAILED"; reason: string };

/**
 * Body thật gửi lên — CẮT `fallbackText` ra.
 *
 * Trường đó là bản dự phòng của riêng ta, không thuộc schema của Google Chat. Gửi kèm thì API
 * có thể từ chối cả tin vì một trường lạ.
 */
function toRequestBody(payload: ChatPayload): Record<string, unknown> {
  const body: Record<string, unknown> = { text: payload.text };
  if (payload.cardsV2) body.cardsV2 = payload.cardsV2;
  return body;
}

/**
 * Kiểm tra URL trước khi gửi.
 *
 * KHÔNG có rào này thì một URL dán sai (hoặc cố ý) sẽ khiến dữ liệu đơn hàng bị POST sang máy
 * chủ của người khác — một đường rò rỉ đi qua đúng một ô cấu hình trông hợp lệ.
 */
export function isAllowedChatWebhook(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    // Bắt buộc https: URL này chứa key + token trong query string, gửi qua http là để lộ cả
    // hai trên đường truyền. Bản đầu của hàm này chỉ kiểm host và bị test bắt đúng chỗ đó.
    return parsed.protocol === "https:" && parsed.host === ALLOWED_HOST;
  } catch {
    return false;
  }
}

/**
 * Che bí mật trong URL, chỉ giữ phần định danh Space để còn lần ra được Space nào lỗi.
 *
 * Ghi thẳng URL vào log là đưa `key` và `token` vào Vercel Logs vĩnh viễn. Cùng lớp lỗi mà
 * classifyDbError đã phải xử lý (không để connection string lọt ra ngoài).
 */
export function redactWebhookUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}?key=***&token=***`;
  } catch {
    return "(URL không đọc được)";
  }
}

/**
 * Gửi tin nhắn. TUYỆT ĐỐI không ném lỗi lên trên.
 *
 * Hàm này được gọi SAU khi transaction đã commit và sau khi response đã trả về. Việc giao đã
 * là sự thật rồi; thông báo chỉ là phép lịch sự. Một lỗi ở đây không được phép làm hỏng bất
 * cứ thứ gì — nên mọi nhánh đều trả về một kết quả, không throw.
 */
export async function sendChatMessage(
  payload: ChatPayload,
  webhookUrl: string | undefined | null,
): Promise<ChatSendResult> {
  if (!webhookUrl) {
    return { status: "SKIPPED", reason: "Chưa cấu hình GOOGLE_CHAT_WEBHOOK_URL." };
  }
  if (!isAllowedChatWebhook(webhookUrl)) {
    // Không log URL: nếu ai đó dán sai vào một endpoint lạ, URL đó cũng có thể là bí mật của họ.
    return { status: "FAILED", reason: `URL webhook không thuộc ${ALLOWED_HOST} — đã từ chối gửi.` };
  }

  const first = await post(webhookUrl, toRequestBody(payload));
  if (first.status === "SENT" || !payload.cardsV2 || !payload.fallbackText) return first;

  // ─── THẺ BỊ TỪ CHỐI → GỬI LẠI BẢN CHỮ ─────────────────────────────────────
  //
  // Thẻ (cardsV2) làm tin nhắn trông chuyên nghiệp hơn nhiều, nhưng schema của nó là của
  // Google và có thể đổi hoặc từ chối một icon lạ — mà ở đây KHÔNG test được với API thật.
  //
  // Không có đường lùi này thì một payload sai khiến nhân viên MẤT HẲN thông báo: đổi một lỗi
  // thẩm mỹ thành một lỗi chức năng. Có nó thì trường hợp xấu nhất bằng đúng hiện trạng cũ.
  console.error("[google-chat] Thẻ bị từ chối, gửi lại bản chữ:", first.reason);
  const retry = await post(webhookUrl, { text: payload.fallbackText });
  return retry.status === "SENT" ? { status: "SENT", usedFallback: true } : retry;
}

async function post(webhookUrl: string, body: Record<string, unknown>): Promise<ChatSendResult> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(body),
      // Chặn treo vô hạn: đây là việc chạy sau response, kéo dài chỉ tốn thời gian hàm serverless.
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        status: "FAILED",
        reason: `Google Chat trả HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`,
      };
    }
    return { status: "SENT" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { status: "FAILED", reason };
  }
}

/** URL webhook của Space chung, đọc từ biến môi trường (đánh dấu Sensitive trên Vercel). */
export function teamChatWebhookUrl(): string | undefined {
  return process.env.GOOGLE_CHAT_WEBHOOK_URL || undefined;
}
