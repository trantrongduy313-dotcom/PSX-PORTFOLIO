import { CLOSED_ASSIGNMENT_STATUSES } from "@/app/lib/business/kpi-3d/progress";

// ─── Tải công việc của Nhân viên Thiết kế 3D ─────────────────────────────────
//
// VÌ SAO CÓ FILE NÀY: lúc giao việc, Order chỉ thấy một danh sách tên. Không có tín hiệu nào
// về việc người đó đang gánh bao nhiêu, nên rất dễ dồn nhiều việc vào một người trong khi
// người khác đang rảnh. Muốn biết phải mở màn "Việc thiết kế 3D", lọc theo từng người, đếm tay.
//
// VÌ SAO Ở MODULE THUẦN CHỨ KHÔNG VIẾT TRONG ROUTE: hai định nghĩa "đang làm" và "quá hạn"
// trước đây là hằng RIÊNG TƯ bên trong design-3d-client.tsx:
//
//     const isOverdue = (a) => !a.completedAt && new Date(a.deadlineAt) < Date.now();
//     const isClosed  = (a) => a.status === "REASSIGNED" || a.status === "CANCELLED";
//
// Component không export chúng, nên API tính tải buộc phải viết lại lần thứ hai. Rồi một ngày
// ai đó sửa một bên, hai màn báo hai con số khác nhau cho cùng một người, và không ai biết
// bên nào đúng. Đây đúng loại lỗi đã phải dọn ở khâu Nguội và ở khối NV 3D.
//
// Nay khai một lần ở đây, cả API lẫn màn hình cùng dùng.

/** Phần thông tin của một lượt giao việc cần để tính tải — chỉ những gì thật sự dùng tới. */
export type WorkloadAssignment = {
  status: string;
  completedAt: Date | null;
  deadlineAt: Date;
  acknowledgedAt: Date | null;
  /** Giờ KPI chuẩn của lượt này, tính bằng phút. Nguồn của con số "tải thật". */
  standardMinutesSnapshot: number;
};

/** Lượt đã đóng — giao lại cho người khác, hoặc đã huỷ. Không còn là việc của ai. */
export function isClosedAssignment(status: string): boolean {
  return (CLOSED_ASSIGNMENT_STATUSES as readonly string[]).includes(status);
}

/**
 * Còn là việc đang gánh trên vai NV 3D hay không.
 *
 * CỐ Ý KHÔNG tính lượt đã hoàn tất mà đang "chờ kiểm": NV đã nộp xong, việc còn lại là của
 * Order/Admin. Tính vào tải của NV là đổ oan — và nghịch lý là Order càng chậm duyệt thì người
 * đó trông càng bận, càng ít được giao việc mới.
 */
export function isOpenAssignment(a: Pick<WorkloadAssignment, "status" | "completedAt">): boolean {
  return !a.completedAt && !isClosedAssignment(a.status);
}

/**
 * Quá hạn = ĐANG MỞ và đã qua deadline.
 *
 * SỬA LUÔN MỘT LỖI CŨ: bản trong design-3d-client chỉ xét `!completedAt && deadline < now`,
 * KHÔNG loại lượt đã đóng — nên một lượt đã HUỶ mà quá ngày vẫn bị đếm là "quá hạn". Việc đã
 * huỷ thì không thể trễ được. Gộp về một định nghĩa cũng là dịp sửa chỗ đó.
 */
export function isOverdueAssignment(
  a: Pick<WorkloadAssignment, "status" | "completedAt" | "deadlineAt">,
  now: Date,
): boolean {
  return isOpenAssignment(a) && a.deadlineAt.getTime() < now.getTime();
}

/** Tải hiện tại của MỘT nhân viên, gọn về bốn con số. */
export type DesignerWorkload = {
  /** Số lượt đang mở. Đếm theo LƯỢT GIAO VIỆC, không theo MO — xem chú thích hàm bên dưới. */
  openCount: number;
  /**
   * Tổng giờ KPI còn lại, tính bằng phút.
   *
   * ĐÂY MỚI LÀ CHỈ SỐ TẢI THẬT, không phải openCount: một người ôm 1 việc 8 giờ nặng hơn người
   * ôm 3 việc 1 giờ. Đếm đầu việc sẽ xếp hạng ngược.
   */
  openMinutes: number;
  /** Trong số đang mở, bao nhiêu đã quá deadline. Dấu hiệu người này đang đuối. */
  overdueCount: number;
  /** Đã giao nhưng chưa bấm nhận việc — có thể họ còn chưa biết là có việc. */
  unackedCount: number;
};

export const EMPTY_WORKLOAD: DesignerWorkload = {
  openCount: 0, openMinutes: 0, overdueCount: 0, unackedCount: 0,
};

/**
 * Cộng tải từ danh sách lượt giao việc của MỘT người.
 *
 * ĐẾM THEO LƯỢT, KHÔNG THEO MO: một MO có thể có nhiều NV 3D cùng làm (mỗi người một lượt).
 * Nếu gom theo MO thì cả hai người đều bị tính đủ một việc, trong khi mỗi người chỉ gánh phần
 * của mình — và tổng giờ sẽ bị nhân đôi.
 */
export function summarizeDesignerWorkload(
  assignments: readonly WorkloadAssignment[],
  now: Date,
): DesignerWorkload {
  const out: DesignerWorkload = { ...EMPTY_WORKLOAD };

  for (const a of assignments) {
    if (!isOpenAssignment(a)) continue;
    out.openCount += 1;
    // Số giờ chuẩn có thể âm/rác nếu cấu hình sai — chặn ở đây để một dòng hỏng không kéo
    // tổng của cả người xuống dưới 0 rồi hiện ra một con số vô nghĩa.
    out.openMinutes += Math.max(0, a.standardMinutesSnapshot || 0);
    if (isOverdueAssignment(a, now)) out.overdueCount += 1;
    if (!a.acknowledgedAt) out.unackedCount += 1;
  }

  return out;
}

/** Số giờ KPI còn lại, làm tròn tới 0.1 để không ra chuỗi dài dằng dặc. */
export function workloadHours(w: DesignerWorkload): number {
  return Math.round((w.openMinutes / 60) * 10) / 10;
}

/**
 * Phần TẢI của một người, dạng chữ ngắn để đặt bên phải tên trong ô chọn.
 *
 * CỐ Ý KHÔNG kèm số việc quá hạn: đó là cảnh báo, phải hiện bằng MÀU ĐỎ tách riêng chứ không
 * lẫn vào cùng một dòng chữ xám. Bản trước gộp tất cả vào một chuỗi ngăn bằng dấu chấm và
 * nhét vào <option> — thẻ đó không nhận màu nên mọi thứ buộc phải phẳng, trông như dữ liệu
 * thô. Nay ô chọn là component tự dựng nên tô màu được, và hàm này chỉ lo phần trung tính.
 */
export function formatWorkloadLoad(w: DesignerWorkload): string {
  if (w.openCount === 0) return "Sẵn sàng";
  const hours = workloadHours(w);
  return hours > 0 ? `${w.openCount} việc · ${hours}h` : `${w.openCount} việc`;
}
