// ─── Ảnh kèm phản hồi ────────────────────────────────────────────────────────
//
// Ảnh là phần QUAN TRỌNG NHẤT của một báo cáo lỗi ở dự án này — trên thực tế mỗi lần báo lỗi
// đều kèm ảnh chụp màn hình. Một nút Report không nhận được ảnh thì người dùng sẽ mở Zalo để
// gửi ảnh, và ta có HAI kênh song song: tệ hơn một.
//
// ⚠️ CỐ Ý DÙNG LẠI `validateImageUpload` VÀ `publicImageUrl` CỦA mo-image.ts, không chép lại.
// Hạn mức 8MB và danh sách jpeg/png/webp là MỘT sự thật của cả ứng dụng ("Supabase Storage
// của dự án này nhận ảnh thế nào"), không phải sự thật riêng của ảnh MO. Chép sang đây là
// ngày nào đó ai nâng hạn mức ở một chỗ và một nửa ứng dụng vẫn chặn ở mức cũ — đúng lớp lỗi
// mà promote/route.ts đã phải sửa vì hỏi cùng một câu ở hai nơi và nhận hai câu trả lời.
//
// Tên file `mo-image.ts` đọc lệch với chỗ dùng ở đây, và đó là cái giá đáng trả so với việc
// nhân đôi luật. Nếu về sau có chỗ thứ ba dùng, hãy đổi tên module đó thành `storage-image.ts`
// — nhưng đó là việc dọn riêng, không gộp vào tính năng này.
//
// File THUẦN: không I/O.

import { publicImageUrl, validateImageUpload } from "@/app/lib/business/mo-image";

export { validateImageUpload };

/** Bucket riêng cho ảnh phản hồi — KHÔNG dùng chung `mo-images`. */
//
// Tách bucket vì hai loại ảnh có vòng đời và mức nhạy cảm khác nhau: ảnh MO là dữ liệu sản
// xuất cần giữ lâu; ảnh phản hồi là bằng chứng tạm, và là thứ sẽ muốn dọn hàng loạt sau này.
// Trộn chung thì không dọn được cái nào mà không sợ xoá lẫn.
export const FEEDBACK_BUCKET = "feedback-images";

function extensionFor(contentType: string): string {
  return contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
}

/**
 * Đường dẫn trong bucket.
 *
 * ⚠️ KHÔNG chứa id của phản hồi, và KHÔNG THỂ chứa: ảnh được tải lên TRƯỚC khi bản ghi tồn
 * tại (người dùng dán ảnh rồi mới bấm Gửi). Vì vậy định danh là một mã ngẫu nhiên — cũng
 * chính là thứ bảo vệ bucket công khai khỏi bị dò URL, cùng lý do đã ghi ở mo-image.ts.
 *
 * Chia theo tháng (`YYYY-MM`) để về sau dọn được theo mốc thời gian mà không phải liệt kê
 * toàn bucket.
 */
export function buildFeedbackImagePath(params: {
  contentType: string;
  now: Date;
  random?: string;
}): string {
  const y = params.now.getUTCFullYear();
  const m = String(params.now.getUTCMonth() + 1).padStart(2, "0");
  const random = params.random ?? cryptoRandom();
  return `feedback/${y}-${m}/${random}.${extensionFor(params.contentType)}`;
}

function cryptoRandom(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

/** URL công khai đầy đủ từ đường dẫn trong bucket. */
export function feedbackImageUrl(params: { supabaseUrl: string; path: string }): string {
  return publicImageUrl({ supabaseUrl: params.supabaseUrl, bucket: FEEDBACK_BUCKET, path: params.path });
}

/**
 * Chốt chặn: đường dẫn client gửi lên có ĐÚNG là đường dẫn trong bucket phản hồi không.
 *
 * ⚠️ BẮT BUỘC PHẢI CÓ. Client gửi lên một chuỗi `path` mà server sẽ ghép thành URL công khai
 * và lưu vào DB. Không kiểm thì một chuỗi như `../mo/<id>/...` hay một đường dẫn tuỳ ý sẽ
 * biến ô ảnh phản hồi thành nơi trỏ tới object bất kỳ trong project — server tự tay dựng URL
 * cho dữ liệu nó chưa từng kiểm.
 *
 * Chỉ nhận đúng khuôn do `buildFeedbackImagePath` sinh ra.
 */
export function isValidFeedbackImagePath(path: string): boolean {
  return /^feedback\/\d{4}-\d{2}\/[A-Za-z0-9-]{8,64}\.(jpg|png|webp)$/.test(path);
}

/** Bóc lại path từ URL công khai — để xoá đúng object khi dọn. */
export function pathFromFeedbackUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${FEEDBACK_BUCKET}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : url.slice(idx + marker.length);
}
