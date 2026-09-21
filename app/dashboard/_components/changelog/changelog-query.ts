import "server-only";

import type { ChangelogArea } from "@/app/lib/business/changelog/area";
import type { ChangelogRow } from "./changelog-entry-card";

// ─── Hình dạng truy vấn + chuyển sang dữ liệu cho client ─────────────────────
//
// MỘT chỗ, dùng cho CẢ trang "Có gì mới", trang admin, VÀ Sidebar. Cả ba hiện cùng một thẻ nên
// phải lấy cùng tập cột; viết `select` ba lần là ngày nào đó một chỗ thiếu cột và thẻ hiện ô
// trống mà không có lỗi nào. Cùng khuôn `feedback-query.ts`.

export const CHANGELOG_SELECT = {
  id: true,
  title: true,
  body: true,
  area: true,
  isImportant: true,
  publishedAt: true,
  authorName: true,
} as const;

export const CHANGELOG_ADMIN_SELECT = {
  ...CHANGELOG_SELECT,
  isPublished: true,
  notifiedAt: true,
  createdAt: true,
} as const;

type DbRow = {
  id: string;
  title: string;
  body: string;
  area: string;
  isImportant: boolean;
  publishedAt: Date | null;
  authorName: string;
};

/**
 * Date → chuỗi ISO.
 *
 * Bắt buộc: `Date` đi qua ranh giới Server→Client Component được, nhưng rồi mọi phép định dạng
 * sẽ ăn theo múi giờ của MÁY CHỦ. Dự án này đã trả giá một lần cho đúng lớp lỗi đó (xem ghi chú
 * `TZ=UTC` ở vitest.config.ts): thuật toán deadline dùng `getHours()` nên chạy local thấy đúng,
 * lên Vercel lệch 7 tiếng.
 *
 * Và ở đây còn một lý do thứ hai: mốc "đã đọc" ở localStorage là CHUỖI ISO. So một `Date` với
 * một chuỗi là chỗ sinh ra phép so sai mà không ai thấy.
 */
export function toChangelogRow(row: DbRow): ChangelogRow {
  return {
    ...row,
    area: row.area as ChangelogArea,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
  };
}
