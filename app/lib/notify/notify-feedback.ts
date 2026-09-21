import "server-only";

import { prisma } from "@/app/lib/prisma";
import {
  buildFeedbackChatMessage,
  feedbackNotifySkipReason,
} from "@/app/lib/business/feedback/chat-message";
import { normalizeFeedbackContext } from "@/app/lib/business/feedback/context";
import { isFeedbackKind, shouldNotifyChat } from "@/app/lib/business/feedback/kind";
import { appUrl } from "@/app/lib/notify/app-url";
import { redactWebhookUrl, sendChatMessage, teamChatWebhookUrl } from "@/app/lib/notify/google-chat";

// ─── Bắn chuông cho admin khi có BÁO LỖI mới ─────────────────────────────────
//
// Gọi SAU KHI đã ghi DB và SAU KHI response đã trả về, qua `after()` của next/server. Ba lý
// do (giống hệt notify-design-3d.ts, và đều là bài học đã trả giá):
//
//   1. Gọi HTTP trong transaction sẽ giữ lock DB suốt thời gian gọi mạng ngoài.
//   2. Google Chat chậm/chết thì lệnh gửi phản hồi treo theo.
//   3. Thông báo thất bại KHÔNG được làm mất phản hồi — phản hồi đã ghi là thật.
//
// Trên Vercel, promise "gửi rồi quên" có thể bị cắt khi hàm kết thúc; `after()` mới bảo đảm
// chạy sau response nhưng vẫn trong vòng đời hàm.
//
// ⚠️ CHỈ BÁO LỖI ĐƯỢC BẮN CHUÔNG, và quyết định đó KHÔNG nằm ở đây — nó thuộc
// `shouldNotifyChat` ở business/feedback/kind.ts. Đề xuất cải tiến chỉ tăng huy hiệu đỏ ở
// Sidebar. Nếu đề xuất cũng bắn chuông, admin tắt thông báo sau khoảng hai tuần và mất luôn
// cảnh báo lỗi thật — đó là cách tính năng này tự vô hiệu hoá chính nó.

/**
 * Gửi thông báo cho MỘT phản hồi vừa tạo.
 *
 * KHÔNG BAO GIỜ ném lỗi. Người gọi ở trong `after()`, tức là response đã đi rồi — một
 * exception ở đây không giúp được ai, chỉ làm bẩn log Vercel bằng một unhandled rejection
 * không có ngữ cảnh.
 */
export async function notifyNewFeedback(feedbackId: string): Promise<void> {
  try {
    const row = await prisma.feedbackReport.findUnique({
      where: { id: feedbackId },
      select: {
        id: true,
        kind: true,
        summary: true,
        reporterName: true,
        reporterEmail: true,
        imageUrls: true,
        pageUrl: true,
        orderId: true,
        orderNumber: true,
        moNumber: true,
        orderVersion: true,
        commitSha: true,
      },
    });

    if (!row) {
      console.error("[feedback-notify] Không tìm thấy phản hồi:", feedbackId);
      return;
    }

    // `kind` từ DB là enum Prisma; đi qua type guard để tầng business không phải nhận `string`.
    if (!isFeedbackKind(row.kind)) {
      console.error("[feedback-notify] Loại phản hồi lạ:", row.kind);
      return;
    }

    const webhookUrl = teamChatWebhookUrl();
    const skip = feedbackNotifySkipReason({ kind: row.kind, webhookConfigured: Boolean(webhookUrl) });
    if (skip) {
      // Log ở mức `log`, không phải `error`: "đề xuất thì không bắn chuông" là hành vi ĐÚNG,
      // và ghi nó thành error là dạy người đọc log bỏ qua error.
      console.log("[feedback-notify] Bỏ qua:", skip);
      return;
    }

    if (!shouldNotifyChat(row.kind)) return; // lưới an toàn thứ hai, không bao giờ nên chạm tới

    const payload = buildFeedbackChatMessage({
      id: row.id,
      kind: row.kind,
      summary: row.summary,
      reporterName: row.reporterName,
      reporterEmail: row.reporterEmail,
      imageCount: row.imageUrls.length,
      context: normalizeFeedbackContext({
        pageUrl: row.pageUrl,
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        moNumber: row.moNumber,
        orderVersion: row.orderVersion,
      }),
      commitSha: row.commitSha,
      url: appUrl(`/dashboard/admin/feedback?id=${row.id}`),
    });

    const result = await sendChatMessage(payload, webhookUrl);
    if (result.status === "FAILED") {
      console.error(
        "[feedback-notify] Gửi Chat thất bại:",
        result.reason,
        webhookUrl ? redactWebhookUrl(webhookUrl) : "",
      );
    }
  } catch (error) {
    console.error("[feedback-notify] Lỗi không lường trước:", error);
  }
}
