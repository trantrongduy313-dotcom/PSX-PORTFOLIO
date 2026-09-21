// ─── Mốc "đã đọc" của từng người ─────────────────────────────────────────────
//
// Trả lời đúng một câu: có hiện chấm đỏ trên mục "Có gì mới" hay không.
//
// ─── VÌ SAO localStorage, KHÔNG PHẢI MỘT CỘT TRONG BẢNG users ────────────────
//
// Vì nó đủ, và vì thêm một cột là thêm một migration + một route + một vòng mạng cho một việc
// không ai tra cứu. Tiền lệ đúng đã có trong dự án: `guide-state-v1` ở trang Hướng dẫn, và
// `stage-collapse.ts` đặt LOGIC khoá/giá trị ở tầng business thuần rồi để component chỉ đọc/ghi.
// File này theo đúng khuôn thứ hai.
//
// NÓI THẲNG CÁI GIÁ, không giấu:
//   · xoá cache trình duyệt → chấm đỏ quay lại (người dùng đọc lại một lần, không mất gì)
//   · mỗi máy/trình duyệt tính riêng
//   · KHÔNG biết được ai đã đọc
//
// Với khoảng 8 người thì ba điều đó không đáng một migration. Ngày nào cần biết ai đã đọc thì
// thêm `changelogSeenAt` vào `User` — nhưng đừng làm trước khi thật cần.
//
// ⚠️ KHÔNG gộp với `guide-state-v1`. Trạng thái của Hướng dẫn là {role, chapter, lang,
// maxReached}; của changelog là MỘT mốc thời gian. Gộp là dựng một thứ trừu tượng phục vụ hai
// nhu cầu không giống nhau — chờ người dùng thứ ba.
//
// File THUẦN: không React, không chạm `window`. Component đọc/ghi, module này quyết định.

/** Khoá localStorage. Có `-v1` để sau này đổi cấu trúc thì không phải đọc dữ liệu cũ sai cách. */
export const CHANGELOG_SEEN_KEY = "changelog-seen-v1";

/**
 * Có mục nào chưa đọc không.
 *
 * Nhận CHUỖI ISO chứ không nhận `Date`: `localStorage` chỉ lưu được chuỗi, và giá trị bên kia
 * đến từ Server Component cũng dưới dạng ISO (xem ghi chú ở feedback-query.ts về việc vì sao
 * không truyền `Date` qua ranh giới server→client).
 */
export function hasUnread(latestPublishedAt: string | null, seenAt: string | null): boolean {
  // Chưa có mục nào được đăng → không có gì để đọc. Đây là trạng thái NGÀY ĐẦU, và nó phải
  // không hiện chấm đỏ, không thì mọi người bấm vào một trang trống.
  if (!latestPublishedAt) return false;

  // ⚠️ KIỂM DỮ LIỆU VÀO TRƯỚC MỌI NHÁNH KHÁC. Bản đầu đặt phép kiểm này SAU nhánh
  // `if (!seenAt) return true`, nên một mốc hỏng vẫn bật được chấm đỏ — nhánh chạy trước khi
  // biết có gì đáng tin để so hay không. Thứ tự mới đọc thẳng theo ý định: không có mốc đáng
  // tin thì không kết luận gì.
  const latest = Date.parse(latestPublishedAt);
  if (!Number.isFinite(latest)) return false;

  // Chưa từng mở trang → mọi thứ đều mới.
  if (!seenAt) return true;

  // Mốc đã đọc hỏng (người dùng tự sửa localStorage, hoặc dữ liệu từ bản cũ) → coi như CHƯA
  // đọc. Thà hiện chấm đỏ thừa một lần còn hơn im lặng che mất một thay đổi thật.
  const seen = Date.parse(seenAt);
  if (!Number.isFinite(seen)) return true;

  return latest > seen;
}

/**
 * Mốc để ghi lại khi người dùng MỞ trang.
 *
 * ⚠️ Ghi mốc của MỤC MỚI NHẤT, KHÔNG ghi `new Date()`.
 *
 * Khác biệt này quan trọng: nếu ghi thời điểm hiện tại thì một mục được đăng trong CÙNG GIÂY
 * người dùng đang mở trang sẽ bị đánh dấu là đã đọc trong khi họ chưa hề thấy nó. Ghi theo mốc
 * của mục mới nhất mà họ THẬT SỰ đã được hiển thị thì không có khe hở nào.
 */
export function seenMarkFor(latestPublishedAt: string | null): string | null {
  return latestPublishedAt;
}

/** Mục mới nhất trong danh sách đã đăng. Danh sách rỗng → null. */
export function latestPublishedAt(entries: readonly { publishedAt: string | null }[]): string | null {
  let best: string | null = null;
  for (const e of entries) {
    if (!e.publishedAt) continue;
    if (best === null || Date.parse(e.publishedAt) > Date.parse(best)) best = e.publishedAt;
  }
  return best;
}
