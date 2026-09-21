import { deriveReviewStatus } from "@/app/lib/business/kpi-3d/review";
import { isClosedAssignment } from "@/app/lib/business/kpi-3d/workload";

// ─── Hàng đợi duyệt kết quả 3D (Order/Admin) ─────────────────────────────────
//
// VÌ SAO CÓ FILE NÀY: dấu hiệu "Chờ kiểm / Đã nhận" đã hiện ở bảng, nhưng Order vẫn phải
// tự dò từng dòng mới biết mình đang nợ bao nhiêu lượt duyệt. Muốn đếm và lọc được thì
// định nghĩa "đang chờ tôi duyệt" phải viết ra thành một chỗ dùng chung — nếu để mỗi màn
// tự lọc lấy thì thẻ đếm và bộ lọc sẽ có ngày ra hai con số khác nhau, và người dùng không
// biết tin bên nào.
//
// CÁI BẪY LỚN NHẤT — KHÔNG ĐƯỢC ĐỌC THẲNG CỘT reviewStatus:
// mọi lượt hoàn tất TRƯỚC khi có tính năng kiểm đều mang reviewStatus = NULL. Nhưng "đã có
// kết quả mà chưa ai phán quyết" CHÍNH LÀ đang chờ duyệt. Lọc theo cột thô thì đúng những
// việc tồn đọng lâu nhất lại vô hình — hỏng đúng mục đích của tính năng. Nên mọi thứ ở đây
// đều đi qua deriveReviewStatus().

/** Phần thông tin cần để xếp một lượt vào hàng đợi duyệt — chỉ những gì thật sự dùng tới. */
export type ReviewQueueRow = {
  status: string;
  completedAt: string | Date | null;
  reviewStatus: string | null;
};

/**
 * Đang chờ Order/Admin duyệt hay không.
 *
 * LOẠI LƯỢT ĐÃ ĐÓNG: một lượt đã huỷ / đã giao lại cho người khác thì không ai còn phải
 * duyệt nó nữa, dù nó có completedAt. Để lọt vào thì thẻ đếm sẽ nhắc một việc không tồn tại.
 */
export function isPendingReview(row: ReviewQueueRow): boolean {
  if (isClosedAssignment(row.status)) return false;
  return deriveReviewStatus(row.reviewStatus, row.completedAt) === "PENDING_REVIEW";
}

/** Đã được duyệt và chấp nhận. */
export function isReviewAccepted(row: ReviewQueueRow): boolean {
  return deriveReviewStatus(row.reviewStatus, row.completedAt) === "ACCEPTED";
}

/**
 * Bị trả về cho NV 3D làm lại.
 *
 * CỐ Ý TÁCH KHỎI isPendingReview: việc này đang chờ NV 3D, KHÔNG chờ Order. Gộp vào thẻ đếm
 * "chờ duyệt" sẽ khiến Order thấy một con số không bao giờ về 0 bằng thao tác của chính họ —
 * và một lời nhắc không thể xử lý hết thì người ta sẽ học cách phớt lờ nó.
 */
export function isReworkRequested(row: ReviewQueueRow): boolean {
  if (isClosedAssignment(row.status)) return false;
  return deriveReviewStatus(row.reviewStatus, row.completedAt) === "REWORK";
}

/** Số lượt đang chờ duyệt trong một danh sách. Dùng cho thẻ đếm ở đầu màn. */
export function countPendingReview(rows: readonly ReviewQueueRow[]): number {
  return rows.reduce((n, r) => n + (isPendingReview(r) ? 1 : 0), 0);
}

// ─── Khối nào hiện trong panel chi tiết ──────────────────────────────────────
//
// BỐN TRẠNG THÁI LOẠI TRỪ NHAU, quyết định ở MỘT chỗ. Trước đây là ba điều kiện rời rạc
// viết thẳng trong JSX, và chúng đã sót đúng một trường hợp: lượt ĐÃ NỘP KẾT QUẢ mà chưa
// từng bấm nhận việc thì vẫn hiện nút "Xác nhận đã nhận việc" — mời người dùng nhận một
// việc họ đã làm xong rồi.
//
// Trường hợp đó KHÔNG hiếm và cũng không phải dữ liệu rác: bước "xác nhận nhận việc" mới
// thêm về sau, nên mọi lượt hoàn tất trước đó đều mang acknowledgedAt = NULL vĩnh viễn.
// Ngoài ra PRODUCTION được phép ghi tiến độ hộ khi NV vắng mặt, nên vẫn sinh thêm lượt kiểu này.

export type PanelActionRow = ReviewQueueRow & { acknowledgedAt: string | Date | null };

export type Design3DPanelAction =
  /** Lượt đã huỷ / đã giao lại — không làm gì được nữa. */
  | "CLOSED"
  /** Đã nộp kết quả, đang chờ Order/Admin phán quyết. NV 3D không còn việc gì để bấm. */
  | "AWAITING_REVIEW"
  /** Đã được duyệt và chấp nhận — xong hẳn. Muốn sửa thêm thì Order phải "Yêu cầu làm lại". */
  | "DONE"
  /** Chưa nhận việc — phải xác nhận trước khi được ghi tiến độ. */
  | "ACKNOWLEDGE"
  /** Đang làm — hiện form cập nhật tiến độ. */
  | "PROGRESS";

/**
 * Việc TIẾP THEO cần làm với một lượt giao việc, nhìn từ panel chi tiết.
 *
 * THỨ TỰ CÁC NHÁNH LÀ CÓ CHỦ Ý:
 *
 *   AWAITING_REVIEW phải đứng TRƯỚC ACKNOWLEDGE — đó chính là lỗi đang sửa. Nhưng nó chỉ
 *   xét đúng PENDING_REVIEW chứ KHÔNG xét completedAt: khi Order yêu cầu làm lại, quy tắc
 *   "đóng dấu một lần" GIỮ NGUYÊN completedAt của lần nộp đầu. Nếu chặn theo completedAt
 *   thì lượt bị trả về sẽ không bao giờ hiện lại form, và NV 3D không có đường nộp bản sửa.
 *
 *   DONE cũng đứng trước ACKNOWLEDGE, vì đúng CÙNG MỘT lý do: một lượt đã được duyệt xong
 *   thì mời người ta "nhận việc" lại càng vô nghĩa. Nó cũng khoá form cập nhật — sau khi
 *   Order đã nhận kết quả và File Render đã thành File 3D chính thức của MO, sửa tiếp mà
 *   không ai duyệt lại là âm thầm đổi thứ đã được chấp nhận. Đường sửa đúng là Order bấm
 *   "Yêu cầu làm lại", lúc đó trạng thái về REWORK và form mở lại.
 *
 *   ACKNOWLEDGE vẫn đứng trước PROGRESS kể cả khi đã bị trả về làm lại: server chặn ghi
 *   tiến độ khi chưa nhận việc (blockedReasonForProgress), nên hiện form ở đó là mời người
 *   dùng làm một việc hệ thống sẽ từ chối.
 */
export function design3DPanelAction(row: PanelActionRow): Design3DPanelAction {
  if (isClosedAssignment(row.status)) return "CLOSED";
  if (isPendingReview(row)) return "AWAITING_REVIEW";
  if (isReviewAccepted(row)) return "DONE";
  if (!row.acknowledgedAt) return "ACKNOWLEDGE";
  return "PROGRESS";
}
