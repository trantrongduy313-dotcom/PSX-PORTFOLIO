import { isClosedAssignment } from "@/app/lib/business/kpi-3d/workload";

// ─── Thứ tự hàng đợi việc 3D ──────────────────────────────────────────────────
//
// Danh sách này CHÍNH LÀ hàng đợi công việc của NV 3D, nên thứ tự mặc định phải là thứ tự nên
// làm: hạn gần nhất lên trước.
//
// ⚠️ VÌ SAO KHÔNG SẮP THEO "MỚI GIAO NHẤT" như yêu cầu ban đầu: làm vậy thì một đơn hạn còn 2
// giờ sẽ tụt xuống dưới một đơn vừa giao mà hạn tuần sau. Đó là làm hỏng đúng thứ tự mà nhân
// viên cần để không trễ hạn.
//
// Nhu cầu thật đằng sau yêu cầu đó là "nhân viên phải NHẬN RA có đơn mới". Hệ thống đã có sẵn
// đúng tín hiệu: acknowledgedAt = null, tức chưa bấm nhận việc. Một đơn vừa giao chính xác là
// đơn họ chưa nhận. Nên nhóm đó được GHIM LÊN ĐẦU — chúng cần một hành động thật — còn phần
// còn lại giữ nguyên thứ tự deadline.
//
// Và "mới" được định nghĩa bằng CHƯA NHẬN VIỆC, không bằng "giao trong 24 giờ": mốc thời gian
// tự hết hạn dù nhân viên chưa hề thấy, nên ai nghỉ hai ngày quay lại là dấu đã biến mất.
// Chưa nhận việc thì tự tắt đúng lúc nó hết việc phải làm.
//
// File THUẦN: không React, không prisma.

import { designPriorityRank } from "@/app/lib/business/kpi-3d/design-priority";

/** Phần dữ liệu cần để xếp thứ tự — chỉ các trường thật sự dùng tới. */
export type QueueRow = {
  status: string;
  assignedAt: string | Date;
  deadlineAt: string | Date;
  completedAt: string | Date | null;
  acknowledgedAt: string | Date | null;
  /**
   * Ưu tiên của VIỆC THIẾT KẾ (OrderItem.design3DPriorityCode) — trục riêng, KHÔNG phải ưu tiên
   * của đơn hàng. Bỏ trống = Normal, nên dữ liệu cũ xếp y như trước.
   */
  designPriorityCode?: string | null;
};

const ms = (v: string | Date | null | undefined): number => {
  if (!v) return 0;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
};

/**
 * Đơn cần nhân viên để ý NGAY — đã giao mà chưa bấm nhận việc.
 *
 * Loại lượt đã hoàn tất và lượt đã đóng (huỷ / bị lấy đơn): dán nhãn "Mới" lên một lượt không
 * còn là của họ thì nhãn đó nói sai.
 */
export function isNewlyAssigned(row: QueueRow): boolean {
  if (row.completedAt) return false;
  if (isClosedAssignment(row.status)) return false;
  return !row.acknowledgedAt;
}

/**
 * So sánh hai dòng trong hàng đợi. BỐN tầng, đúng thứ tự:
 *
 *   1. Đã hoàn tất dồn xuống cuối — giữ nguyên hành vi cũ.
 *   2. Chưa nhận việc lên đầu; trong nhóm đó, MỚI GIAO NHẤT trước.
 *   3. ƯU TIÊN THIẾT KẾ: UT1 → UT2 → Normal.
 *   4. Còn lại: hạn gần nhất trước.
 *
 * ⚠️ VÌ SAO ƯU TIÊN ĐỨNG SAU "CHƯA NHẬN VIỆC", KHÔNG PHẢI TRƯỚC:
 *
 * "Chưa nhận việc" không phải công việc — nó là một cái bấm 5 giây để xác nhận đã biết có việc.
 * Đẩy nó xuống dưới một đơn UT1 nghĩa là một đơn vừa giao có thể nằm ngoài tầm mắt cả ngày, và
 * người giao việc không biết nhân viên đã thấy hay chưa. Ưu tiên chi phối THỨ TỰ LÀM THẬT, nên nó
 * nằm ở tầng của việc đang làm.
 *
 * ⚠️ VÀ ĐÂY LÀ CÁI GIÁ, PHẢI BIẾT TRƯỚC: một đơn UT1 hạn tuần sau sẽ đứng TRÊN một đơn Normal đã
 * QUÁ HẠN hôm nay. Đó là đúng định nghĩa của ưu tiên tay — nếu không muốn thế thì đừng đặt UT1.
 * Muốn đổi thứ tự hai tầng 2–3 thì đổi ở đúng hàm này, và test dưới sẽ chỉ ra ngay mọi hệ quả.
 *
 * Tầng 4 chốt bằng mốc giao để thứ tự ỔN ĐỊNH: hai đơn cùng deadline mà không có tiêu chí
 * cuối thì mỗi lần tải trang lại đổi chỗ nhau, và người dùng tưởng danh sách nhảy ngẫu nhiên.
 */
export function compareAssignmentsForQueue(a: QueueRow, b: QueueRow): number {
  const doneA = !!a.completedAt;
  const doneB = !!b.completedAt;
  if (doneA !== doneB) return doneA ? 1 : -1;

  const newA = isNewlyAssigned(a);
  const newB = isNewlyAssigned(b);
  if (newA !== newB) return newA ? -1 : 1;
  if (newA && newB) {
    const diff = ms(b.assignedAt) - ms(a.assignedAt); // mới giao nhất trước
    if (diff !== 0) return diff;
  }

  const byPriority = designPriorityRank(a.designPriorityCode) - designPriorityRank(b.designPriorityCode);
  if (byPriority !== 0) return byPriority;

  const byDeadline = ms(a.deadlineAt) - ms(b.deadlineAt);
  if (byDeadline !== 0) return byDeadline;
  return ms(b.assignedAt) - ms(a.assignedAt);
}
