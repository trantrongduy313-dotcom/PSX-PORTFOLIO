// ─── Kiểm nội dung phản hồi ──────────────────────────────────────────────────
//
// NGUYÊN TẮC XUYÊN SUỐT FILE NÀY: cửa vào phải RỘNG. Đây là công cụ để người dùng nói rằng có
// gì đó sai; một cái form khó tính sẽ chặn đúng những người đang bực và đang gấp, và họ mở
// Zalo. Mọi hạn mức dưới đây tồn tại để chặn dữ liệu RÁC hoặc PHÌNH BẢNG, không phải để bắt
// người dùng viết cho hay.
//
// File THUẦN: không prisma, không React.

import type { FeedbackKind } from "@/app/lib/business/feedback/kind";

/** Bắt buộc phải có gì đó — nhưng ngưỡng cực thấp. */
const MIN_SUMMARY = 5;
const MAX_SUMMARY = 2000;
const MAX_DETAIL = 2000;

/**
 * Tối đa 4 ảnh.
 *
 * Không phải một ảnh: một ảnh ít khi kể hết chuyện — màn hình TRƯỚC và SAU khi bấm là hai
 * ảnh, và đó là ca thường gặp nhất. Không phải vô hạn: mỗi ảnh là một object vĩnh viễn trong
 * bucket, và một cú dán liên tục 50 lần là 50 file không ai xoá.
 */
export const MAX_FEEDBACK_IMAGES = 4;

export type FeedbackDraft = {
  kind: FeedbackKind;
  summary: string;
  detail: string;
  imagePaths: readonly string[];
};

/** Vì sao KHÔNG gửi được — trả null nếu hợp lệ. Cùng khuôn `validateImageUpload` ở mo-image.ts. */
export function validateFeedbackDraft(draft: FeedbackDraft): string | null {
  const summary = draft.summary.trim();

  if (summary.length < MIN_SUMMARY) {
    // Nêu ĐANG thiếu bao nhiêu chứ không chỉ nói "quá ngắn" — người dùng không phải đoán.
    return `Hãy viết thêm một chút (tối thiểu ${MIN_SUMMARY} ký tự) để admin hiểu bạn đang gặp gì.`;
  }
  if (summary.length > MAX_SUMMARY) {
    return `Nội dung quá dài (tối đa ${MAX_SUMMARY} ký tự) — hãy tách thành nhiều phản hồi.`;
  }
  if (draft.detail.trim().length > MAX_DETAIL) {
    return `Phần giải thích quá dài (tối đa ${MAX_DETAIL} ký tự).`;
  }
  if (draft.imagePaths.length > MAX_FEEDBACK_IMAGES) {
    return `Tối đa ${MAX_FEEDBACK_IMAGES} ảnh cho mỗi phản hồi.`;
  }
  // Ảnh trùng đường dẫn = client gửi lỗi. Lưu vào thì danh sách hiện cùng một ảnh hai lần.
  if (new Set(draft.imagePaths).size !== draft.imagePaths.length) {
    return "Có ảnh bị trùng — hãy thử gửi lại.";
  }
  return null;
}

/**
 * ⚠️ Ô `detail` CỐ Ý KHÔNG BẮT BUỘC, dù nó là ô đáng giá nhất (xem kind.ts).
 *
 * Bắt buộc nó nghĩa là người đang bực vì không làm được việc phải trả lời thêm một câu hỏi
 * trước khi được nói ra vấn đề. Một số người sẽ gõ "." để đi qua — và lúc đó ta có ô bắt buộc
 * đã được điền, không có thông tin, và một người vừa học được rằng cái form này lằng nhằng.
 *
 * Cách đúng: KHUYẾN KHÍCH ở giao diện (nhãn rõ, ví dụ cụ thể), không CHẶN ở tầng dữ liệu.
 */
export function detailIsOptional(): true {
  return true;
}

/**
 * Chống gửi trùng: phản hồi mới có phải bản lặp của phản hồi vừa gửi không.
 *
 * VÌ SAO CẦN: nút Gửi bị bấm hai lần (mạng chậm, không thấy phản hồi) là chuyện rất thường.
 * Không chặn thì admin nhận hai chuông Chat cho cùng một việc — và chuông trùng là bước đầu
 * của việc admin thôi để ý tới chuông.
 *
 * ⚠️ CỬA SỔ HẸP (2 phút) VÀ SO KHỚP CHẶT (cùng loại + cùng nội dung). Chống trùng quá tay là
 * ĐÁNH MẤT phản hồi thật: hai nhân viên gặp cùng một lỗi và mô tả giống nhau là chuyện có
 * thật, và cả hai đều cần được ghi lại. Nên hàm này chỉ so với phản hồi CỦA CHÍNH NGƯỜI ĐÓ.
 */
export const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

export function isDuplicateSubmission(params: {
  draft: Pick<FeedbackDraft, "kind" | "summary">;
  previous: { kind: FeedbackKind; summary: string; createdAt: Date } | null;
  now: Date;
}): boolean {
  const { draft, previous, now } = params;
  if (!previous) return false;
  if (previous.kind !== draft.kind) return false;
  if (normalizeForCompare(previous.summary) !== normalizeForCompare(draft.summary)) return false;
  return now.getTime() - previous.createdAt.getTime() < DUPLICATE_WINDOW_MS;
}

/** Gộp khoảng trắng + bỏ phân biệt hoa thường — bấm hai lần thì chuỗi giống nhau y nguyên. */
function normalizeForCompare(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Cắt gọn nội dung thành MỘT DÒNG — cho danh sách và cho tin nhắn Chat. */
export function oneLine(text: string, max = 90): string {
  const flat = text.trim().replace(/\s+/g, " ");
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}
