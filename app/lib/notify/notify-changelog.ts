import "server-only";

import { prisma } from "@/app/lib/prisma";
import { isChangelogArea } from "@/app/lib/business/changelog/area";
import {
  buildChangelogChatMessage,
  changelogNotifySkipReason,
  type ChangelogNotice,
} from "@/app/lib/business/changelog/chat-message";
import { appUrl } from "@/app/lib/notify/app-url";
import { redactWebhookUrl, sendChatMessage, teamChatWebhookUrl } from "@/app/lib/notify/google-chat";

// ─── Loan báo cho CẢ NHÓM khi có cập nhật mới ─────────────────────────────────
//
// Gọi trong `after()`, SAU khi transaction đã commit và response đã trả về — cùng ba lý do đã
// ghi ở notify-design-3d.ts.
//
// ⚠️ MỘT TIN CHO CẢ LƯỢT. Nhận cả MẢNG id, không nhận một id — ký hiệu hàm là chỗ ép hành vi
// đúng. Nhận một id thì sớm muộn có người gọi trong vòng lặp, và đăng 5 mục là Chat kêu 5 lần.
//
// KHÁC tin của Góp ý: tin này gửi cho CẢ NHÓM (một lời loan báo), không phải cho admin (một
// tiếng chuông). Nên nó nêu đủ để người đọc biết có cần vào xem hay không.

/**
 * @param notifyIds Các mục CHƯA TỪNG thông báo, đã được `entriesToNotify` lọc ở route.
 *
 * ⚠️ Hàm này KHÔNG tự lọc lại theo `notifiedAt`: lúc nó chạy thì transaction đã ghi xong nên
 * mọi mục đều đã có `notifiedAt`, và lọc ở đây sẽ ra rỗng. Việc lọc BẮT BUỘC phải xảy ra trước
 * khi ghi — xem ghi chú ở api/changelog/publish/route.ts.
 */
export async function notifyChangelogPublished(notifyIds: readonly string[]): Promise<void> {
  try {
    if (notifyIds.length === 0) return;

    const rows = await prisma.changelogEntry.findMany({
      where: { id: { in: [...notifyIds] } },
      select: { title: true, area: true, isImportant: true },
    });

    const notices: ChangelogNotice[] = [];
    for (const row of rows) {
      if (!isChangelogArea(row.area)) {
        console.error("[changelog-notify] Khu vực lạ, bỏ mục:", row.area);
        continue;
      }
      notices.push({ title: row.title, area: row.area, isImportant: row.isImportant });
    }

    const webhookUrl = teamChatWebhookUrl();
    const skip = changelogNotifySkipReason({
      noticeCount: notices.length,
      webhookConfigured: Boolean(webhookUrl),
    });
    if (skip) {
      // Mức `log`, không phải `error`: "không có mục nào chưa thông báo" là hành vi ĐÚNG, và ghi
      // nó thành error là dạy người đọc log bỏ qua error.
      console.log("[changelog-notify] Bỏ qua:", skip);
      return;
    }

    const payload = buildChangelogChatMessage(notices, appUrl("/dashboard/whats-new"));
    if (!payload) return; // không thể xảy ra sau `skip`, nhưng không đoán thay cho kiểu dữ liệu

    const result = await sendChatMessage(payload, webhookUrl);
    if (result.status === "FAILED") {
      console.error(
        "[changelog-notify] Gửi Chat thất bại:",
        result.reason,
        webhookUrl ? redactWebhookUrl(webhookUrl) : "",
      );
    }
  } catch (error) {
    // KHÔNG BAO GIỜ ném: người gọi ở trong `after()`, response đã đi rồi. Một exception ở đây
    // không giúp được ai, chỉ để lại một unhandled rejection không có ngữ cảnh trong log Vercel.
    console.error("[changelog-notify] Lỗi không lường trước:", error);
  }
}
