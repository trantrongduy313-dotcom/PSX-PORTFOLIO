import "server-only";

import type { FeedbackKind } from "@/app/lib/business/feedback/kind";
import type { FeedbackStatus } from "@/app/lib/business/feedback/status";
import type { FeedbackRow } from "./feedback-card";

// ─── Hình dạng truy vấn + chuyển sang dữ liệu cho client ─────────────────────
//
// MỘT chỗ, dùng cho CẢ HAI trang ("Góp ý của tôi" và trang admin). Hai trang hiện cùng một thẻ
// nên phải lấy cùng một tập cột; viết `select` hai lần là ngày nào đó một trang thiếu cột và
// thẻ hiện ô trống mà không có lỗi nào.

export const FEEDBACK_SELECT = {
  id: true,
  kind: true,
  status: true,
  summary: true,
  detail: true,
  imageUrls: true,
  reporterName: true,
  reporterEmail: true,
  reporterRole: true,
  pageUrl: true,
  orderNumber: true,
  moNumber: true,
  orderVersion: true,
  commitSha: true,
  adminReply: true,
  repliedAt: true,
  createdAt: true,
} as const;

/** Hàng lấy từ Prisma — Date thật, enum thật. */
type DbRow = {
  id: string;
  kind: string;
  status: string;
  summary: string;
  detail: string;
  imageUrls: string[];
  reporterName: string;
  reporterEmail: string;
  reporterRole: string;
  pageUrl: string | null;
  orderNumber: string | null;
  moNumber: string | null;
  orderVersion: number | null;
  commitSha: string | null;
  adminReply: string | null;
  repliedAt: Date | null;
  createdAt: Date;
};

/**
 * Date → chuỗi ISO.
 *
 * Bắt buộc: Server Component truyền props sang Client Component thì `Date` đi qua được, nhưng
 * làm mốc thời gian phụ thuộc múi giờ của MÁY CHỦ. Dự án này đã trả giá một lần cho đúng lớp
 * lỗi đó (xem ghi chú `TZ=UTC` ở vitest.config.ts): thuật toán deadline dùng `getHours()` nên
 * chạy local thấy đúng, lên Vercel lệch 7 tiếng. Truyền ISO và định dạng theo
 * `Asia/Ho_Chi_Minh` ở client là chỉ có một cách đọc duy nhất.
 */
export function toFeedbackRow(row: DbRow): FeedbackRow {
  return {
    ...row,
    kind: row.kind as FeedbackKind,
    status: row.status as FeedbackStatus,
    repliedAt: row.repliedAt ? row.repliedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
