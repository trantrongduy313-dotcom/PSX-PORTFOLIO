// ─── NV 3D xác nhận đã nhận việc ─────────────────────────────────────────────
//
// VẤN ĐỀ NGHIỆP VỤ: deadlineAt được tính từ `assignedAt` — một giá trị Order GÕ TAY và có
// thể đặt ở tương lai. Ví dụ thật trong dữ liệu: MO 26.42432_1 có "Giao lúc 09:27 10/08" mà
// "Hoàn tất lúc 09:20 04/08", nên hệ thống ghi "Sớm 149 giờ" — việc xong TRƯỚC khi được giao.
// Con số đó vô nghĩa vì "đã giao" chỉ là ý định Order gõ vào, chưa phải sự kiện có hai bên.
//
// Mốc nhận việc biến nó thành sự kiện có bằng chứng, và đo được độ trễ bàn giao.
//
// QUYẾT ĐỊNH VỀ KPI — phương án (c): deadline GIỮ NGUYÊN tính từ assignedAt, độ trễ giao–nhận
// đo RIÊNG. Lý do:
//   - (b) tính lại deadline từ acknowledgedAt cho phép NV trì hoãn bấm để kéo dài deadline.
//   - (a) chỉ giữ deadline thì che mất vấn đề vận hành thật (Order giao cuối giờ, NV không mở app).
//   - (c) đo được cả hai mà không trộn: KPI đo TIẾN ĐỘ GIAO HÀNG, độ trễ đo KỶ LUẬT BÀN GIAO.
// Cùng lối đã chọn cho "yêu cầu làm lại": giữ KPI, đếm số lần trả về như chỉ số riêng.
// Đổi sang (a) hoặc (b) về sau chỉ là thay hàm thuần này, không đụng dữ liệu.
//
// File thuần (không prisma) để test trực tiếp.

/** Ảnh chụp assignment cần cho việc xác nhận nhận việc. */
export type AcknowledgeableAssignment = {
  id: string;
  designer3DId: string;
  status: string;
  assignedAt: Date;
  acknowledgedAt: Date | null;
};

/** Trạng thái assignment đã đóng — không xác nhận nhận việc được nữa. */
const CLOSED_STATUSES = ["REASSIGNED", "CANCELLED"] as const;

/**
 * Vì sao KHÔNG xác nhận nhận việc được — null nếu hợp lệ.
 *
 * Phân quyền KHÔNG kiểm ở đây: đã gom về kpi-3d/permissions.ts (năng lực ACKNOWLEDGE).
 * Hàm này chỉ lo các ràng buộc riêng của trục nhận việc.
 */
export function blockedReasonForAcknowledge(assignment: AcknowledgeableAssignment): string | null {
  if ((CLOSED_STATUSES as readonly string[]).includes(assignment.status)) {
    return "Lượt giao việc này đã đóng — không thể xác nhận nhận việc.";
  }
  if (assignment.acknowledgedAt) {
    return "Lượt giao việc này đã được xác nhận nhận việc trước đó.";
  }
  return null;
}

/**
 * Độ trễ bàn giao, tính bằng phút: từ lúc Order định giao đến lúc NV thật sự nhận.
 *
 * `assignedAt` có thể ở TƯƠNG LAI (Order lên kế hoạch trước). Khi NV nhận trước hạn giao,
 * độ trễ sẽ âm — trả về 0 thay vì để số âm chạy vào báo cáo và làm sai số bình quân.
 */
export function handoverDelayMinutes(assignedAt: Date, acknowledgedAt: Date): number {
  const diffMs = acknowledgedAt.getTime() - assignedAt.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;
  return Math.round(diffMs / 60_000);
}

/** NV nhận việc trước cả thời điểm Order định giao — không phải trễ, cần phân biệt với 0 phút. */
export function isAcknowledgedEarly(assignedAt: Date, acknowledgedAt: Date): boolean {
  return acknowledgedAt.getTime() < assignedAt.getTime();
}

/**
 * SUY RA mốc nhận việc cho dữ liệu cũ, thay vì cần script backfill.
 *
 * Lượt giao việc đã có dòng tiến độ thì hiển nhiên NV đã biết có việc — lấy mốc dòng tiến độ
 * ĐẦU TIÊN. Cùng nguyên tắc "suy ra từ dữ liệu" đã dùng cho `scopedItemId` và
 * `deriveReviewStatus`: cái gì suy được thì không bắt dữ liệu phải có sẵn.
 */
export function deriveAcknowledgedAt(
  acknowledgedAt: Date | string | null | undefined,
  firstProgressAt: Date | string | null | undefined,
): Date | null {
  const explicit = toDate(acknowledgedAt);
  if (explicit) return explicit;
  return toDate(firstProgressAt);
}

// ĐÃ GỠ autoAcknowledgeOnProgress: trước đây ghi tiến độ mà chưa nhận việc thì hệ thống tự
// đóng dấu nhận hộ, để tránh cảnh "NV đang thiết kế mà vẫn báo chưa nhận việc".
//
// Nay nhận việc là CỬA VÀO: chưa nhận thì không ghi được tiến độ (blockedReasonForProgress).
// Nên tình huống vô lý đó không còn xảy ra được nữa, và việc tự đóng dấu hộ trở thành code
// chết. Giữ lại một hàm không bao giờ chạy chỉ khiến người đọc sau tưởng luồng vẫn có nhánh
// tự động.
//
// deriveAcknowledgedAt ở trên VẪN GIỮ — nó phục vụ dữ liệu CŨ (assignment có tiến độ nhưng
// acknowledgedAt null vì tạo trước khi có tính năng), chỉ dùng để hiển thị, không ghi DB.

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
