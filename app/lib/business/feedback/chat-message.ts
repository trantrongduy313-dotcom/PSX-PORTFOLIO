// ─── Tin nhắn Google Chat cho phản hồi mới ───────────────────────────────────
//
// CHAT KHÔNG BỊ BỎ — NÓ ĐỔI VAI: từ TỦ HỒ SƠ thành CHUÔNG CỬA.
//
// Điều làm Zalo/Chat hiệu quả không phải là chat, mà là ADMIN BIẾT NGAY. Một cái form mà admin
// phải tự nhớ vào xem thì báo cáo nằm đó ba ngày, nhân viên không thấy hồi âm, và họ quay về
// Zalo — nơi có người trả lời. Vì vậy: dữ liệu ở webapp (tra được, có bối cảnh, có trạng
// thái), tiếng chuông ở Chat (nhanh).
//
// ⚠️ TIN NHẮN CHỈ CHỨA: ai · loại · MỘT DÒNG · bối cảnh · link mở. KHÔNG chứa toàn văn, và
// TUYỆT ĐỐI KHÔNG chứa link ảnh. Hai lý do khác nhau:
//
//   1. Toàn văn — tin nhắn Chat là bản ghi VĨNH VIỄN và không sửa được. Nội dung ở webapp còn
//      sửa/xoá được; đẩy nó sang Chat là tạo bản sao thứ hai không quản được. Lại đúng cái
//      "hai nơi giữ cùng một sự thật".
//   2. Link ảnh — bucket là CÔNG KHAI, chỉ dựa vào đường dẫn khó đoán, và ảnh chụp màn hình
//      sẽ chứa TÊN VÀ SỐ ĐIỆN THOẠI KHÁCH HÀNG. Một link dán vào Chat là link tồn tại mãi,
//      trong một không gian có thể rộng hơn nhóm admin. Ảnh chỉ xem trong webapp, sau đăng
//      nhập.
//
// File THUẦN: không I/O. Gửi thật là việc của notify/notify-feedback.ts.

import type { ChatPayload } from "@/app/lib/business/notify/chat-message";
import { FEEDBACK_KIND_LABELS, type FeedbackKind } from "@/app/lib/business/feedback/kind";
import { contextSummary, type FeedbackContext } from "@/app/lib/business/feedback/context";
import { oneLine } from "@/app/lib/business/feedback/validate";

export type FeedbackNotice = {
  id: string;
  kind: FeedbackKind;
  summary: string;
  reporterName: string | null;
  reporterEmail: string | null;
  imageCount: number;
  context: FeedbackContext;
  commitSha: string | null;
  /** Link mở đúng phản hồi này ở trang admin. null nếu chưa cấu hình được URL app. */
  url: string | null;
};

/**
 * Dựng tin nhắn.
 *
 * ⚠️ CHỈ GỌI CHO `kind === "BUG"` — quyết định đó thuộc `shouldNotifyChat` ở kind.ts, không
 * lặp lại ở đây. Hàm này chỉ biết cách VIẾT tin, không quyết định có gửi hay không; trộn hai
 * việc lại là chỗ mà một lần "sửa cho gọn" sẽ làm IDEA cũng bắn chuông.
 */
export function buildFeedbackChatMessage(notice: FeedbackNotice): ChatPayload {
  const who = notice.reporterName?.trim() || notice.reporterEmail?.trim() || "Người dùng";
  const ctx = contextSummary(notice.context);

  const lines: string[] = [`🐞 *${FEEDBACK_KIND_LABELS[notice.kind]}* — ${who}`, oneLine(notice.summary)];

  if (ctx) lines.push(`📍 ${ctx}`);

  // Số lượng ảnh, KHÔNG phải link ảnh. Nó trả lời đúng câu admin cần trước khi mở: "có bằng
  // chứng chưa, hay lại phải đi hỏi lại".
  if (notice.imageCount > 0) {
    lines.push(`📎 ${notice.imageCount} ảnh (xem trong webapp)`);
  }

  // Bản build đứng cuối: quan trọng khi đi sửa, nhưng không phải thứ đọc trước.
  if (notice.commitSha) lines.push(`🔖 bản ${notice.commitSha}`);

  if (notice.url) lines.push(notice.url);

  const text = lines.join("\n");

  // Gửi dạng CHỮ THUẦN, không dùng cardsV2. Thẻ đẹp hơn nhưng có thể bị Google Chat từ chối
  // (google-chat.ts đã phải dựng cả đường dự phòng cho việc đó), và một cái chuông thì giá
  // trị nằm ở chỗ nó ĐẾN, không ở chỗ nó trông thế nào.
  return { text };
}

/**
 * Có gửi được tin không — kiểm TRƯỚC khi gọi mạng.
 *
 * Trả về lý do bỏ qua thay vì boolean, để log nói được vì sao im lặng. Một thông báo không
 * gửi mà không ai biết vì sao là loại lỗi tệ nhất: chạy local thấy tốt, production phập phù.
 */
export function feedbackNotifySkipReason(params: {
  kind: FeedbackKind;
  webhookConfigured: boolean;
}): string | null {
  if (params.kind !== "BUG") return "Đề xuất cải tiến không bắn chuông Chat (chỉ đếm ở Sidebar).";
  if (!params.webhookConfigured) return "Chưa cấu hình GOOGLE_CHAT_WEBHOOK_URL.";
  return null;
}
