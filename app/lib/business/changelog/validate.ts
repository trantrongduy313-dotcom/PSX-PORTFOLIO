// ─── Kiểm nội dung một mục changelog ─────────────────────────────────────────
//
// NGUY CƠ LỚN NHẤT CỦA TÍNH NĂNG NÀY KHÔNG PHẢI CODE — LÀ NGƯỜI VIẾT NGỪNG VIẾT.
//
// Vì vậy mọi ràng buộc ở đây phải trả lời được câu: "nó có làm việc ghi một mục lâu hơn 30 giây
// không?" Nếu có thì bỏ. Một changelog có lỗ hổng còn tệ hơn không có — người dùng thấy trang
// im lặng rồi kết luận hệ thống không đổi gì, và thôi vào xem.
//
// File THUẦN: không prisma, không React.

import { isChangelogArea } from "@/app/lib/business/changelog/area";

const MIN_TITLE = 5;
const MAX_TITLE = 120;
const MAX_BODY = 2000;

export type ChangelogDraft = {
  title: string;
  body: string;
  area: string;
  isImportant: boolean;
};

/** Vì sao KHÔNG lưu được — trả null nếu hợp lệ. Cùng khuôn `validateFeedbackDraft`. */
export function validateChangelogDraft(draft: ChangelogDraft): string | null {
  const title = draft.title.trim();

  if (title.length < MIN_TITLE) {
    return `Tiêu đề quá ngắn (tối thiểu ${MIN_TITLE} ký tự).`;
  }
  if (title.length > MAX_TITLE) {
    // Tiêu đề là thứ hiện trong tin Chat và trong danh sách. Dài quá thì nó không còn là tiêu
    // đề — phần chi tiết đã có ô riêng ở dưới.
    return `Tiêu đề quá dài (tối đa ${MAX_TITLE} ký tự) — phần chi tiết hãy viết ở ô nội dung.`;
  }
  if (draft.body.trim().length > MAX_BODY) {
    return `Nội dung quá dài (tối đa ${MAX_BODY} ký tự).`;
  }
  if (!isChangelogArea(draft.area)) {
    return "Khu vực không hợp lệ.";
  }
  return null;
}

/**
 * ⚠️ Ô NỘI DUNG CỐ Ý KHÔNG BẮT BUỘC.
 *
 * Rất nhiều thay đổi nói trọn trong một dòng tiêu đề: "Duyên 3D giờ là THÙY DUYÊN". Bắt buộc
 * viết thêm một đoạn giải thích cho những mục như vậy là buộc người ta bịa ra chữ — và người
 * bịa chữ hai lần thì lần thứ ba sẽ không ghi mục nào cả.
 */
export function bodyIsOptional(): true {
  return true;
}

/**
 * Cảnh báo — KHÔNG chặn — khi tiêu đề nghe như dòng git log.
 *
 * 🔴 ĐÂY LÀ CÁI BẪY LỚN NHẤT CỦA CẢ TÍNH NĂNG: viết cho lập trình viên chứ không cho người dùng.
 * Nhìn lại `git log` của dự án này:
 *
 *     "fix(psx): mot ban DA HUY dang chan ban dung chuyen xuong"   ← người thợ CẦN biết
 *     "chore(data): bo BEGIN/COMMIT — Supabase SQL Editor tu chot" ← vô nghĩa với họ
 *
 * Changelog KHÔNG phải git log. Biến nó thành git log là biến nó thành nhiễu, và ba tuần sau
 * không ai mở nữa.
 *
 * Vì sao CẢNH BÁO mà không CHẶN: phép dò này chỉ nhìn được hình thức, không nhìn được ý nghĩa —
 * nó sẽ bắt oan. Chặn oan một mục đúng thì tệ hơn nhắc nhẹ một mục sai, vì cái giá là người
 * viết bỏ luôn.
 */
const DEV_SPEAK = [
  /^(feat|fix|chore|refactor|test|docs|style|perf|build|ci)\s*(\([^)]*\))?\s*:/i,
  /\.tsx?\b/,
  /\bprisma\b/i,
  /\bmigration\b/i,
  /\bcommit\b/i,
  /\brefactor\b/i,
  /\bAPI\b/,
  /\bendpoint\b/i,
];

export function devSpeakWarning(title: string): string | null {
  if (!DEV_SPEAK.some((re) => re.test(title.trim()))) return null;
  return (
    "Tiêu đề nghe giống ghi chú kỹ thuật. Hãy viết theo góc người dùng — " +
    'ví dụ "Chuyển xưởng: bản đã huỷ không còn chặn bản đúng" thay vì tên file hay tên hàm.'
  );
}

/** Cắt gọn một dòng — cho tin Chat và danh sách. */
export function oneLine(text: string, max = 90): string {
  const flat = text.trim().replace(/\s+/g, " ");
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}
