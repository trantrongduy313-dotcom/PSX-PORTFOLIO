// ─── ĐÃ DUYỆT LÀ CHỐT: không giao thêm KPI cho lượt/MO đó nữa ────────────────
//
// LỖ HỔNG ĐANG BỊT. Ba cửa tạo lượt giao việc trên màn Việc thiết kế 3D đều đã chặn ACCEPTED
// (`reassign.ts`, `continuation.ts`, `pause.ts`). Nhưng CỬA CŨ NHẤT — đồng bộ từ form đơn hàng
// (`syncDesign3DAssignmentBlock`, chạy ở MỌI lần lưu tab Thiết kế) — thì không có luật nào cả.
//
// ⚠️ VÀ NÓ KHÔNG TỰ THẤY ĐƯỢC: duyệt KHÔNG đổi `status`. `assignmentStatusAfterReviewDecision`
// chỉ trả giá trị khi REWORK; ACCEPT để nguyên. Nên lượt đã duyệt vẫn mang status SENT_RESULT,
// vẫn nằm trong ACTIVE_ASSIGNMENT_STATUSES, và với đường đồng bộ đó nó trông y như một lượt
// đang chạy bình thường.
//
// Hai hậu quả thật, cả hai đều tạo KPI cho một bản thiết kế đã được chốt:
//
//   THÊM MỘT KHỐI NV 3D trên MO đã duyệt → không khớp lượt nào → tạo lượt MỚI với NGUYÊN suất
//   giờ chuẩn. Một suất KPI nữa cho việc đã xong.
//
//   ĐỔI TÊN người ở khối gốc của MO đã duyệt → matchAssignment mức 3 vơ lấy chính lượt đã duyệt
//   và coi đây là BÀN GIAO: đóng lượt đã duyệt rồi mở lượt mới. Nặng hơn ca trên — nó còn HUỶ
//   một phán quyết KPI đã đóng dấu.
//
// ─── ĐƯỜNG ĐÚNG KHI THẬT SỰ CẦN LÀM THÊM ────────────────────────────────────
//
// TẠO PHIÊN BẢN MỚI của đơn. Duyệt xong là chốt cho ĐÚNG PHIÊN BẢN MO đó; muốn thiết kế lại thì
// đó là một phiên bản khác, và nó có ngân sách giờ riêng một cách minh bạch.
//
// ⚠️ TRƯỚC ĐÂY LỜI CHẶN NÀY CHỈ TỚI NÚT "Yêu cầu làm lại" — nút đó ĐÃ BỎ khỏi lượt đã duyệt, vì
// nó chính là đường lách chính cái luật ở file này: mở lại một lượt đã chốt rồi đổi người. Một
// câu chỉ đường tới cái nút không còn tồn tại thì tệ hơn không chỉ đường: người dùng đi tìm và
// không thấy, rồi kết luận là hệ thống hỏng.
//
// File THUẦN: không prisma, không React.

/** Phần trạng thái cần để xét lượt đã bị khoá chưa. */
export type ReviewLockRow = {
  reviewStatus: string | null;
  /**
   * Lượt này đang có một lần tạm dừng CHƯA đóng.
   *
   * TẠM DỪNG = ĐÃ CHỐT SỐ. Lúc bấm dừng, số giờ được đóng băng vào `confirmedMinutes` và nhân
   * viên không gửi kết quả được nữa — nghiệp vụ coi nó ngang một lượt đã xong. Nhưng đường đồng
   * bộ từ form đơn hàng KHÔNG TỰ THẤY ĐƯỢC điều đó: tạm dừng không đổi `status`, nên lượt đang
   * dừng vẫn nằm trong ACTIVE_ASSIGNMENT_STATUSES và trông y hệt một lượt đang chạy.
   *
   * Không có cờ này thì đổi tên nhân viên ở form đơn hàng sẽ bị hiểu là BÀN GIAO: đóng lượt cũ
   * thành REASSIGNED mà KHÔNG hề ghi `actualMinutes`, và bỏ luôn lần tạm dừng đang mở. Báo cáo
   * KPI lấy tổng giờ từ `actualMinutes`, nên toàn bộ công của người bị dừng BIẾN MẤT — âm thầm,
   * đúng con số mà thao tác tạm dừng sinh ra để bảo vệ. Lượt mới còn được cấp NGUYÊN suất giờ
   * của nhóm thay vì phần còn lại.
   */
  hasOpenPause?: boolean;
};

/** Lượt này đã được duyệt và chốt KPI chưa. */
export function isApproved(row: ReviewLockRow): boolean {
  return row.reviewStatus === "ACCEPTED";
}

/** Lượt này đang tạm dừng — số đã chốt, coi như đã xong. */
export function isPausedLocked(row: ReviewLockRow): boolean {
  return row.hasOpenPause === true;
}

/**
 * Vì sao KHÔNG được tạo/đổi lượt giao việc 3D từ form đơn hàng — null nghĩa là hợp lệ.
 *
 * `matched` là lượt mà khối này đang ứng với (null = sắp TẠO MỚI). `active` là toàn bộ lượt còn
 * hiệu lực của MO.
 *
 * HAI LUẬT, cố ý tách rời vì lý do khác nhau:
 *
 *   1. Khối đang ứng với một lượt ĐÃ DUYỆT → không được sửa nó thành người khác. Đây là ca bàn
 *      giao ngầm, và nó huỷ một phán quyết đã đóng dấu.
 *
 *   2. Sắp TẠO MỚI trong khi MO đã có một lượt được duyệt → không được. Bản thiết kế của MO đã
 *      được chấp nhận; thêm người là thêm một suất KPI cho việc đã xong.
 *
 * ⚠️ KHÔNG chặn khi khối chỉ đang khớp lại đúng lượt đã duyệt của ĐÚNG người đó (Order lưu đơn
 * vì sửa tên khách, không đụng gì tới thiết kế). Chặn ca đó sẽ khiến mọi lần lưu đơn của một MO
 * đã duyệt đều nổ cảnh báo — và người dùng sẽ học cách bỏ qua cảnh báo.
 */
export function deniedReasonForOrderFormAssign(params: {
  matched: (ReviewLockRow & { designer3DId: string }) | null;
  designerId: string;
  designerName: string;
  active: readonly ReviewLockRow[];
}): string | null {
  const { matched, designerId, designerName } = params;

  // ─── ĐANG TẠM DỪNG: KHOÁ NHƯ MỘT LƯỢT ĐÃ XONG ─────────────────────────────
  //
  // Chỉ chặn ca ĐỔI SANG NGƯỜI KHÁC. Cùng người thì đây chỉ là một lần lưu đơn bình thường
  // (Order sửa tên khách chẳng hạn) — các trường của lượt đang dừng đã được đóng băng ở
  // syncDesign3DAssignmentBlock, y như cách lượt đã hoàn tất được đóng băng. Chặn cả ca đó
  // sẽ khiến MỌI lần lưu đơn của một MO đang dừng đều nổ cảnh báo, và người dùng sẽ học cách
  // bỏ qua cảnh báo — mất luôn tác dụng của chính chốt chặn này.
  //
  // KHÔNG chặn việc thêm một NV 3D SONG SONG khi MO có lượt đang dừng: người đó là một lượt
  // khác, có ngân sách riêng. Cái bị khoá là LƯỢT đang dừng, không phải cả MO.
  if (matched && isPausedLocked(matched) && matched.designer3DId !== designerId) {
    return `Lượt thiết kế 3D này ĐANG TẠM DỪNG — số giờ KPI đã chốt tại thời điểm dừng, không sửa được nữa. Muốn giao tiếp cho "${designerName}", hãy dùng "+ Giao lượt tiếp theo" ngay trong khối này.`;
  }

  if (matched && isApproved(matched)) {
    // Cùng người → chỉ là lưu lại, không phải bàn giao. Cho đi tiếp (các trường của lượt đã duyệt
    // được đóng băng ở chỗ khác, xem syncDesign3DAssignmentBlock).
    if (matched.designer3DId === designerId) return null;
    return `Lượt thiết kế 3D của MO này ĐÃ ĐƯỢC DUYỆT — không đổi sang nhân viên khác được. Nếu cần thiết kế lại, hãy tạo PHIÊN BẢN MỚI của đơn.`;
  }

  if (!matched && params.active.some(isApproved)) {
    return `MO này đã có bản thiết kế 3D ĐƯỢC DUYỆT — không giao thêm cho "${designerName}" được nữa. Nếu cần thiết kế lại, hãy tạo PHIÊN BẢN MỚI của đơn.`;
  }

  return null;
}
