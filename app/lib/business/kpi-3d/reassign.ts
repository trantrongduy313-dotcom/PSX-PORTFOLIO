import { z } from "zod";

import { deniedReasonFor } from "@/app/lib/business/kpi-3d/permissions";

// ─── Không duyệt → chuyển sang NV 3D khác ────────────────────────────────────
//
// Trước bản này màn kiểm chỉ có HAI lối ra: Nhận, hoặc Trả về cho CHÍNH người đó làm lại.
// Muốn đổi người, Admin phải thoát ra Danh sách đơn hàng, mở form sửa đơn, gõ tên khác —
// và đường đó KHÔNG hề biết vừa có một lần từ chối, nên lý do không tới tay người mới.
//
// Cơ chế bàn giao thì đã có sẵn từ lâu (assignment.ts: đóng lượt cũ thành REASSIGNED, mở lượt
// mới, ghi reassignedFromId). Việc của bản này là NỐI nó vào màn kiểm và trả lời một câu hỏi
// mà đường cũ không hỏi: người cũ có được tính KPI không.
//
// ⚠️ CÂU ĐÓ HỆ THỐNG KHÔNG ĐƯỢC TỰ ĐOÁN.
// Cùng là "không duyệt" nhưng hai kết cục khác nhau tuỳ nguyên nhân: nhân viên làm ẩu thì
// không tính công, còn khách đổi ý hoặc yêu cầu ban đầu mơ hồ thì vẫn phải tính. Đây là quyết
// định của người duyệt, và nó đụng tới lương — nên schema BẮT truyền, không có giá trị mặc
// định. Một giá trị mặc định ở đây nghĩa là hệ thống âm thầm quyết định thu nhập của một nhân
// viên khi người duyệt bấm nhanh cho xong.
//
// File THUẦN: không prisma, không React. Test trực tiếp.

export const reassignInputSchema = z.object({
  /** Hồ sơ NV 3D sẽ nhận việc. */
  designer3DId: z.string().trim().min(1, "Phải chọn nhân viên 3D mới."),
  /**
   * Lý do không duyệt. BẮT BUỘC và được chuyển sang lượt mới — người mới phải biết vì sao bản
   * trước bị bác, nếu không họ sẽ sai lại đúng chỗ cũ.
   */
  reason: z.string().trim().min(1, "Phải nêu lý do không duyệt.").max(2000),
  /**
   * Có tính KPI cho người CŨ không. Cố ý KHÔNG có `.default()` — xem chú thích đầu file.
   */
  countKpiForPrevious: z.boolean(),
  /**
   * Nhóm KPI cho lượt MỚI. Bỏ trống = giữ nguyên ngân sách giờ của lượt cũ.
   *
   * Cho chọn vì đổi người đôi khi đi kèm đổi phạm vi việc: bản trước bị bác vì hiểu sai yêu
   * cầu, và việc giao lại có thể nặng hơn hoặc nhẹ hơn hẳn. Ép dùng lại nhóm cũ là buộc người
   * mới vào một ngân sách giờ tính cho một đầu bài khác.
   */
  kpiGroupId: z.string().trim().min(1).optional(),
  /**
   * Mốc giao cho lượt mới. Bỏ trống = ngay bây giờ.
   *
   * Deadline tính TỪ mốc này, nên nó là con số quyết định người mới đúng hay trễ hạn. Cho sửa
   * để khớp đúng khối Giao việc ở Danh sách đơn hàng — ở đó Order vẫn gõ tay mốc giao.
   */
  assignedAt: z.coerce.date().optional(),
});

export type ReassignInput = z.infer<typeof reassignInputSchema>;

/** Phần trạng thái của lượt giao việc cần để xét có đổi người được hay không. */
export type ReassignableAssignment = {
  status: string;
  reviewStatus: string | null;
  designer3DId: string;
};

/** Vì sao KHÔNG được đổi người — null nghĩa là hợp lệ. */
export function deniedReasonForReassign(
  role: string | undefined,
  assignment: ReassignableAssignment,
  newDesigner3DId: string,
): string | null {
  const denied = deniedReasonFor("REASSIGN_ASSIGNMENT", { role, designer3DId: null });
  if (denied) return denied;

  if (assignment.status === "REASSIGNED" || assignment.status === "CANCELLED") {
    return "Lượt giao việc đã đóng — không chuyển được nữa.";
  }

  // ĐÃ DUYỆT thì giờ đã chốt và File Render đã thành file chính thức của MO. Muốn làm thêm
  // thì đó là một vòng việc MỚI, không phải phủ nhận vòng cũ — đi qua đường này sẽ đóng một
  // lượt đã được công nhận và làm số liệu đã chốt đổi nghĩa.
  if (assignment.reviewStatus === "ACCEPTED") {
    return "Lượt giao việc đã được duyệt — muốn giao thêm cho người khác thì tạo lượt mới, không chuyển lượt này.";
  }

  // Chuyển cho chính người đang làm thì chỉ tạo ra một lượt trùng và xoá lịch sử của lượt cũ.
  // Muốn họ sửa lại thì đó là "Yêu cầu làm lại", không phải đổi người.
  if (assignment.designer3DId === newDesigner3DId) {
    return "Nhân viên mới trùng với người đang làm — nếu chỉ cần sửa lại thì dùng Yêu cầu làm lại.";
  }

  return null;
}

/**
 * Câu ghi vào Lịch sử thay đổi.
 *
 * NÓI RÕ CẢ HAI VẾ trong một dòng: đổi người, và người cũ có được tính công hay không. Người
 * đọc lịch sử ba tháng sau không mở lại được hộp thoại để biết ai đã quyết gì; nếu dòng này
 * chỉ ghi "đã chuyển sang X" thì nửa quan trọng hơn của quyết định biến mất.
 */
export function reassignHistoryComment(params: {
  fromDesignerName: string;
  toDesignerName: string;
  countKpiForPrevious: boolean;
}): string {
  const kpi = params.countKpiForPrevious
    ? "vẫn tính KPI cho người cũ"
    : "KHÔNG tính KPI cho người cũ";
  return `Không duyệt kết quả 3D — chuyển từ ${params.fromDesignerName} sang ${params.toDesignerName} (${kpi})`;
}

/**
 * Lý do bàn giao cho người mới đọc.
 *
 * Ghi thẳng vào reviewNote của lượt MỚI chứ không bắt họ đi tìm lượt cũ: màn Việc thiết kế 3D
 * chỉ hiện lượt đang hiệu lực, nên lượt cũ đã biến mất khỏi tầm mắt họ ngay khi bàn giao xong.
 */
export function handoverNote(params: { fromDesignerName: string; reason: string }): string {
  return `Nhận bàn giao từ ${params.fromDesignerName}. Lý do bản trước không được duyệt: ${params.reason}`;
}
