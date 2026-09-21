// ─── Trạng thái phản hồi — HAI vòng đời, không phải một ──────────────────────
//
// ⚠️ MODULE ĐÁNG ĐỌC KỸ NHẤT CỦA TÍNH NĂNG NÀY.
//
// BUG và IDEA dùng chung một bảng, nhưng vòng đời KHÔNG giống nhau — và để trạng thái đi lẫn
// nhau là loại lỗi KHÔNG AI BÁO:
//
//     một đề xuất cải tiến hiện chữ "Đã sửa"
//
// Không ai mở ticket cho chuyện đó. Nó chỉ âm thầm làm người gửi thấy hệ thống không hiểu
// mình đang nói gì, và họ quay về Zalo. Vì vậy ràng buộc nằm ở đây, ở tầng thuần, có test,
// và dùng switch vét cạn để TRÌNH BIÊN DỊCH bắt thay vì chờ một test bắt.
//
//   BUG   NEW → TRIAGED → RESOLVED | DECLINED
//   IDEA  NEW → ACKNOWLEDGED → IN_PROGRESS → RESOLVED | DECLINED
//
// 🎯 ACKNOWLEDGED ("Đã ghi nhận, chưa làm") là trạng thái quan trọng nhất trong cả danh sách.
// Một đề xuất nằm ở NEW suốt ba tháng trông y như bị phớt lờ; đúng cái đó ở "đã ghi nhận,
// chưa làm" là MỘT CÂU TRẢ LỜI THẬT. Nó tồn tại để admin nói được sự thật — "tôi thấy rồi,
// tôi chưa làm" — mà không phải chọn giữa nói dối và im lặng.
//
// File THUẦN: không prisma, không React.

import type { FeedbackKind } from "@/app/lib/business/feedback/kind";

/** Khớp enum `FeedbackStatus` trong schema.prisma. */
export type FeedbackStatus =
  | "NEW"
  | "TRIAGED"
  | "ACKNOWLEDGED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "DECLINED";

export const ALL_FEEDBACK_STATUSES: readonly FeedbackStatus[] = [
  "NEW",
  "TRIAGED",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "RESOLVED",
  "DECLINED",
] as const;

/**
 * Trạng thái nào THUỘC vòng đời nào.
 *
 * `NEW` dùng chung — mọi phản hồi đều bắt đầu ở đó. Phần còn lại tách đôi, và `RESOLVED` /
 * `DECLINED` là hai kết cục dùng chung NHƯNG MANG NGHĨA KHÁC (xem `statusLabel`).
 */
const BUG_STATUSES: readonly FeedbackStatus[] = ["NEW", "TRIAGED", "RESOLVED", "DECLINED"];
const IDEA_STATUSES: readonly FeedbackStatus[] = [
  "NEW",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "RESOLVED",
  "DECLINED",
];

export function statusesFor(kind: FeedbackKind): readonly FeedbackStatus[] {
  return kind === "BUG" ? BUG_STATUSES : IDEA_STATUSES;
}

/** Trạng thái này có hợp lệ cho loại đó không. Đây là chốt chặn ở API `PATCH`. */
export function isStatusAllowedForKind(kind: FeedbackKind, status: FeedbackStatus): boolean {
  return statusesFor(kind).includes(status);
}

/**
 * Nhãn — PHỤ THUỘC LOẠI. Cùng một `RESOLVED` mà hai loại đọc ra hai câu khác nhau.
 *
 * Đây là chỗ mà "một bảng, hai vòng đời" phải trả giá, và trả ở đây là đúng chỗ: một hàm
 * thuần, có test. Nếu để UI tự đoán bằng cách so chuỗi thì mỗi màn hình sẽ đoán một kiểu —
 * cùng lớp lỗi mà mo-image.ts:resolveMoImageSource đã phải dựng riêng một hàm để tránh.
 *
 * Switch vét cạn: thêm một trạng thái vào union mà quên ở đây thì BUILD ĐỎ, không phải chờ
 * một người dùng nhìn thấy ô trống.
 */
export function statusLabel(kind: FeedbackKind, status: FeedbackStatus): string {
  switch (status) {
    case "NEW":
      return "Mới";
    case "TRIAGED":
      return "Đang xem";
    case "ACKNOWLEDGED":
      return "Đã ghi nhận, chưa làm";
    case "IN_PROGRESS":
      return "Đang làm";
    case "RESOLVED":
      return kind === "BUG" ? "Đã sửa" : "Đã làm xong";
    case "DECLINED":
      return kind === "BUG" ? "Không phải lỗi" : "Không làm";
    default:
      return assertNever(status);
  }
}

/**
 * Còn đang mở (chưa có kết cục) — dùng cho huy hiệu đếm ở Sidebar và cho bộ lọc mặc định.
 *
 * ⚠️ Định nghĩa theo "CHƯA phải kết cục", không phải liệt kê các trạng thái mở. Thêm một
 * bước giữa mới về sau (VD "Chờ nhân viên xác nhận lại") thì nó TỰ ĐỘNG tính là đang mở —
 * đúng, và không cần ai nhớ quay lại sửa hàm này.
 */
export function isOpenStatus(status: FeedbackStatus): boolean {
  return status !== "RESOLVED" && status !== "DECLINED";
}

/** Màu huy hiệu. Trả về tên biến CSS đã có trong globals.css, không phải mã màu rời. */
export function statusTone(status: FeedbackStatus): "new" | "active" | "done" | "muted" {
  switch (status) {
    case "NEW":
      return "new";
    case "TRIAGED":
    case "IN_PROGRESS":
      return "active";
    case "ACKNOWLEDGED":
      return "muted";
    case "RESOLVED":
      return "done";
    case "DECLINED":
      return "muted";
    default:
      return assertNever(status);
  }
}

/**
 * Chuyển trạng thái này có được phép không.
 *
 * KHÔNG dựng máy trạng thái chặt chẽ (chỉ đi tiến, không lùi): admin ở đây là MỘT người, và
 * bấm nhầm rồi phải sửa lại là chuyện thường ngày. Máy trạng thái một chiều sẽ tạo ra những
 * phản hồi kẹt cứng ở trạng thái sai mà không có đường ra — tệ hơn hẳn cái nó ngăn được.
 *
 * Ràng buộc DUY NHẤT, và là ràng buộc thật sự quan trọng: trạng thái phải THUỘC ĐÚNG LOẠI.
 */
export type TransitionCheck = { ok: true } | { ok: false; reason: string };

export function checkTransition(params: {
  kind: FeedbackKind;
  from: FeedbackStatus;
  to: FeedbackStatus;
}): TransitionCheck {
  if (params.from === params.to) {
    return { ok: false, reason: "Trạng thái không thay đổi." };
  }
  if (!isStatusAllowedForKind(params.kind, params.to)) {
    // Nêu ĐÍCH DANH cả hai vế. "Trạng thái không hợp lệ" là câu buộc người đọc log phải đi
    // tra bảng mới hiểu; câu dưới đây tự nói ra vấn đề.
    return {
      ok: false,
      reason:
        `Trạng thái "${params.to}" không thuộc vòng đời của ${params.kind === "BUG" ? "báo lỗi" : "đề xuất"}. ` +
        `Chỉ nhận: ${statusesFor(params.kind).join(", ")}.`,
    };
  }
  return { ok: true };
}

/**
 * Kết cục nào BẮT BUỘC phải kèm lời giải thích.
 *
 * "Không phải lỗi" / "Không làm" mà không nói vì sao thì với người gửi nó không khác gì bị
 * phớt lờ — mà lại còn có dấu hiệu rõ ràng là đã bị đọc và bị bỏ. Đó là cách nhanh nhất làm
 * người ta thôi gửi. Người ta chịu được câu "không"; người ta không chịu được sự im lặng.
 *
 * RESOLVED thì không bắt buộc: kết quả tự nói lên rồi — lỗi hết, hoặc tính năng đã có.
 */
export function requiresReply(status: FeedbackStatus): boolean {
  return status === "DECLINED";
}

function assertNever(value: never): never {
  throw new Error(`Trạng thái phản hồi chưa được xử lý: ${String(value)}`);
}
