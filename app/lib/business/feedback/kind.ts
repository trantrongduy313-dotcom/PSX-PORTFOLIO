// ─── Hai loại phản hồi, và điều gì khác nhau giữa chúng ──────────────────────
//
// Nhân viên gửi hai thứ rất khác nhau qua CÙNG một nút:
//
//   BUG  — "chỗ này chạy sai / không dùng được"   → có thể ĐANG CHẶN việc, cần biết NGAY
//   IDEA — "muốn hệ thống làm thêm được việc này" → không bao giờ gấp
//
// VÌ SAO MỘT NÚT CHỨ KHÔNG HAI: người dùng phải tự phân loại TRƯỚC khi biết mình đang gặp
// gì, và họ sẽ chọn sai — mọi thứ dồn vào "Lỗi" vì nghe gấp hơn. Một nút, và câu hỏi đầu
// tiên trong hộp thoại là chọn loại. Chọn xong thì NHÃN các ô nhập đổi theo, nên người dùng
// được dẫn đúng vào thông tin cần cho loại đó.
//
// File THUẦN: không prisma, không React.

/** Khớp enum `FeedbackKind` trong schema.prisma. */
export type FeedbackKind = "BUG" | "IDEA";

export const FEEDBACK_KINDS: readonly FeedbackKind[] = ["BUG", "IDEA"] as const;

export function isFeedbackKind(value: unknown): value is FeedbackKind {
  return value === "BUG" || value === "IDEA";
}

/**
 * ⚠️ CHỐT CHẶN QUAN TRỌNG NHẤT CỦA CẢ TÍNH NĂNG: chỉ BUG được ping Google Chat.
 *
 * Nếu IDEA cũng ping, admin sẽ tắt thông báo sau khoảng hai tuần — và mất luôn cảnh báo lỗi
 * thật. Đó không phải bất tiện, đó là cách tính năng này tự vô hiệu hoá chính mình: cái
 * kênh còn lại (Zalo) vẫn kêu, nên mọi người quay về Zalo.
 *
 * IDEA không cần chuông vì đã có huy hiệu đỏ đếm số ở Sidebar admin — admin nhìn thấy nó cả
 * ngày mà không bị gián đoạn. Đúng độ ồn cho đúng mức gấp.
 *
 * Hàm này là NGUỒN QUYẾT ĐỊNH DUY NHẤT. Không route nào, không component nào được tự viết
 * lại điều kiện `kind === "BUG"` — viết lại là ngày nào đó hai chỗ lệch nhau.
 */
export function shouldNotifyChat(kind: FeedbackKind): boolean {
  return kind === "BUG";
}

/** Nhãn loại — dùng ở nút chọn, danh sách, và tin nhắn Chat. */
export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  BUG: "Báo lỗi",
  IDEA: "Đề xuất cải tiến",
};

/**
 * Câu mô tả trên nút chọn loại.
 *
 * CỐ Ý viết bằng lời của người dùng, không bằng từ của hệ thống. "Báo lỗi" là phân loại của
 * ta; "Có chỗ chạy sai, tôi không làm tiếp được" là điều họ đang thấy. Người đang bực vì
 * không làm được việc sẽ nhận ra câu thứ hai nhanh hơn.
 */
export const FEEDBACK_KIND_HINTS: Record<FeedbackKind, string> = {
  BUG: "Có chỗ chạy sai, hiện số không đúng, hoặc tôi không làm tiếp được",
  IDEA: "Hệ thống chạy đúng, nhưng tôi muốn nó làm thêm được việc này",
};

/**
 * Nhãn HAI Ô NHẬP, đổi theo loại.
 *
 * Ô thứ hai (`detail`) là ô đáng giá nhất, cho CẢ HAI loại:
 *
 *   - Với BUG, nó tách "máy chạy sai" khỏi "tôi hiểu khác". Trong hệ thống này phần lớn là
 *     loại thứ hai, và hai loại đó cần hai cách xử lý hoàn toàn khác nhau.
 *   - Với IDEA, "để làm gì" là thứ giúp xếp được thứ tự. Thiếu nó thì admin chỉ nhận được
 *     một danh sách mong muốn phẳng, không có cơ sở nào để quyết làm cái nào trước.
 */
export type FeedbackFieldLabels = {
  summaryLabel: string;
  summaryPlaceholder: string;
  detailLabel: string;
  detailPlaceholder: string;
};

export function feedbackFieldLabels(kind: FeedbackKind): FeedbackFieldLabels {
  if (kind === "BUG") {
    return {
      summaryLabel: "Bạn đang làm gì và thấy gì?",
      summaryPlaceholder:
        "VD: Bấm Chuyển xưởng ở MO 25.32658_4 thì hiện thông báo trùng MO và không chuyển được.",
      detailLabel: "Bạn mong nó phải thế nào?",
      detailPlaceholder: "VD: Phải chuyển được, vì bản 25.32658.5 đã huỷ rồi.",
    };
  }
  return {
    summaryLabel: "Bạn muốn hệ thống làm được việc gì?",
    summaryPlaceholder: "VD: Ở màn Việc thiết kế 3D, cho lọc theo tháng đang xem.",
    detailLabel: "Việc đó giúp gì cho công việc của bạn?",
    detailPlaceholder:
      "VD: Mỗi sáng phải kéo qua hết đơn cũ mới thấy việc tháng này, mất khoảng 5 phút.",
  };
}
