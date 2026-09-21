// ─── Tin Google Chat khi đăng changelog ──────────────────────────────────────
//
// 🎯 HÀM NHẬN CẢ MẢNG, KHÔNG NHẬN MỘT MỤC — và đó là quyết định thiết kế quan trọng nhất ở đây.
//
// Ký hiệu hàm là chỗ ÉP hành vi đúng, không phải một dòng chú thích nhắc nhở. Nếu nó nhận một
// mục thì sớm muộn có người gọi nó trong vòng lặp, và đăng 5 mục cuối ngày là Chat kêu 5 lần.
// Nhận cả mảng thì không có cách nào gọi sai.
//
// Đây là bài học đã trả giá ở tính năng Góp ý: ĐỘ ỒN SAI LÀ CÁCH NGƯỜI TA TẮT THÔNG BÁO. Và ở
// đây rủi ro nặng hơn — cùng một webhook `GOOGLE_CHAT_WEBHOOK_URL` đang chở cảnh báo lỗi của
// Góp ý. Làm ồn kênh này là làm mất luôn kênh kia.
//
// KHÁC hẳn tin của Góp ý ở một điểm: tin này gửi cho CẢ NHÓM, không phải cho admin. Nó là một
// lời loan báo, nên nó nêu đủ để người đọc biết có cần vào xem hay không — và không nêu gì
// khiến họ không cần vào xem nữa.
//
// File THUẦN: không I/O. Gửi thật là việc của notify/notify-changelog.ts.

import type { ChatPayload } from "@/app/lib/business/notify/chat-message";
import { CHANGELOG_AREA_LABELS, type ChangelogArea } from "@/app/lib/business/changelog/area";
import { oneLine } from "@/app/lib/business/changelog/validate";

export type ChangelogNotice = {
  title: string;
  area: ChangelogArea;
  isImportant: boolean;
};

/**
 * Dựng MỘT tin cho CẢ LƯỢT đăng.
 *
 * Trả về null khi không có mục nào cần loan báo — người gọi không phải tự kiểm "mảng có rỗng
 * không" rồi mới quyết định gửi. Một hàm dựng tin trả về tin rỗng là cách gửi ra một tin trống.
 */
export function buildChangelogChatMessage(
  entries: readonly ChangelogNotice[],
  url: string | null,
): ChatPayload | null {
  if (entries.length === 0) return null;

  const lines: string[] = [
    entries.length === 1 ? "✨ *Hệ thống vừa cập nhật*" : `✨ *Hệ thống vừa cập nhật ${entries.length} thay đổi*`,
  ];

  // Mục QUAN TRỌNG lên trước. Người ta đọc hai dòng đầu của một tin nhắn rồi quyết định có mở
  // hay không — thứ đáng biết nhất phải nằm trong hai dòng đó.
  const sorted = [...entries].sort((a, b) => Number(b.isImportant) - Number(a.isImportant));

  for (const e of sorted) {
    const mark = e.isImportant ? "⚠️ " : "• ";
    lines.push(`${mark}[${CHANGELOG_AREA_LABELS[e.area]}] ${oneLine(e.title, 100)}`);
  }

  // Link đứng cuối, và là thứ duy nhất cần bấm. Tin nhắn CỐ Ý không chở phần nội dung chi tiết:
  // tin Chat là bản ghi vĩnh viễn không sửa được, còn mục trên webapp thì còn sửa được. Đẩy toàn
  // văn sang Chat là tạo bản sao thứ hai không quản được — cùng lý do đã ghi ở feedback.
  if (url) lines.push(url);

  // Chữ thuần, không dùng cardsV2. Thẻ đẹp hơn nhưng có thể bị Google Chat từ chối
  // (google-chat.ts đã phải dựng cả đường dự phòng cho việc đó), và giá trị của một lời loan
  // báo nằm ở chỗ nó ĐẾN.
  return { text: lines.join("\n") };
}

/**
 * Vì sao KHÔNG gửi — kiểm TRƯỚC khi gọi mạng.
 *
 * Trả về lý do thay vì boolean, để log nói được vì sao im lặng. Một thông báo không gửi mà không
 * ai biết vì sao là loại lỗi tệ nhất: chạy local thấy tốt, production phập phù.
 */
export function changelogNotifySkipReason(params: {
  noticeCount: number;
  webhookConfigured: boolean;
}): string | null {
  if (params.noticeCount === 0) {
    return "Không có mục nào chưa từng thông báo — đăng lại không bắn tin lần hai.";
  }
  if (!params.webhookConfigured) return "Chưa cấu hình GOOGLE_CHAT_WEBHOOK_URL.";
  return null;
}
