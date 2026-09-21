// ─── Lùi MO về Thiết kế: lịch sử KPI phải ĐI THEO, không được biến mất ───────
//
// ⚠️ MODULE NÀY TỒN TẠI VÌ MỘT ĐƯỜNG MẤT DỮ LIỆU VĨNH VIỄN.
//
// `rollback` tách một MO khỏi đơn PSX, tạo một đơn PTK mới cho nó, rồi XOÁ CỨNG dòng
// `OrderItem` cũ. Trong schema, quan hệ duy nhất trỏ tới `OrderItem` là:
//
//   Design3DAssignment.orderItem   onDelete: Cascade      (schema.prisma:741)
//     └─ Design3DProgressLog       onDelete: Cascade
//     └─ Design3DPause             onDelete: Cascade
//     └─ Design3DOvertime          onDelete: Cascade
//
// Nên MỘT lần lùi khâu thổi bay TOÀN BỘ chuỗi KPI của MO đó. Đây là dữ liệu NUÔI BẢNG LƯƠNG:
// một tháng đã chốt sổ có thể đổi số, và không có đường phục hồi. Postgres không hỏi lại, và
// giao diện cũng không báo gì — người bấm "Lùi về Thiết kế" không hề biết mình vừa xoá công
// của thợ.
//
// CÁCH SỬA LÀ CHUYỂN, KHÔNG PHẢI GIỮ LẠI. Lùi khâu không huỷ công việc — MO vẫn sống tiếp ở
// đơn PTK mới. Nên lịch sử KPI của nó thuộc về chỗ mới, y như bản thân MO. Trỏ lại các lượt
// giao việc sang (đơn mới, item mới) là cách duy nhất vừa giữ được dữ liệu vừa giữ đúng nghĩa.
//
// NÓ CÒN SỬA MỘT LỖI THỨ HAI, sẵn có: khối thiết kế trong `extraData` được COPY nguyên sang đơn
// mới, mang theo `kpi3DAssignmentId`. Với đường cũ, id đó trỏ tới một dòng VỪA BỊ XOÁ — đơn mới
// ra đời đã mang sẵn một liên kết chết. Trỏ lại khiến id đó khớp trở lại, không cần đụng JSON.
//
// File THUẦN: không prisma, không React.

/**
 * Các bảng sẽ bị cuốn theo nếu `OrderItem` bị xoá khi còn lượt giao việc.
 * Giữ ở đây để lần sau ai thêm quan hệ mới vào `OrderItem` đọc được cái giá của việc xoá cứng.
 */
export const KPI_TABLES_LOST_ON_ITEM_DELETE = [
  "design_3d_assignments",
  "design_3d_progress_logs",
  "design_3d_pauses",
  "design_3d_overtimes",
] as const;

export class RollbackKpiCarryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RollbackKpiCarryError";
  }
}

/**
 * Đơn mới BẮT BUỘC phải có item để nhận lịch sử KPI.
 *
 * Không có chỗ nhận mà vẫn xoá item cũ thì chuỗi KPI bốc hơi — đúng thứ module này sinh ra để
 * chặn. Thà dừng cả lần lùi khâu (giao dịch rollback, không mất gì) còn hơn đi tiếp và mất dữ
 * liệu lương không lấy lại được.
 */
export function requireCarryTarget(newItemId: string | undefined | null, moNumber: string | null): string {
  if (!newItemId) {
    throw new RollbackKpiCarryError(
      `Không lùi khâu được cho MO ${moNumber ?? "(không rõ)"}: đơn Thiết kế mới không có dòng hàng để nhận lịch sử KPI. ` +
        `Đã dừng trước khi xoá để không mất dữ liệu chấm công.`,
    );
  }
  return newItemId;
}

/**
 * Chốt chặn CUỐI, chạy NGAY TRƯỚC lệnh xoá.
 *
 * ĐỔI MỘT LỖI ÂM THẦM LẤY MỘT LỖI ỒN ÀO. Nếu vì lý do nào đó vẫn còn lượt bám vào item cũ
 * (thêm đường ghi mới, chuyển thiếu, chạy song song), đường cũ sẽ lặng lẽ cascade và không ai
 * biết cho tới kỳ lương. Ở đây nó dừng hẳn giao dịch và nói rõ còn bao nhiêu dòng.
 */
export function assertNoKpiLeftBehind(remaining: number, moNumber: string | null): void {
  if (remaining > 0) {
    throw new RollbackKpiCarryError(
      `Không lùi khâu được cho MO ${moNumber ?? "(không rõ)"}: còn ${remaining} lượt giao việc 3D bám vào dòng hàng cũ. ` +
        `Xoá tiếp sẽ mất vĩnh viễn lịch sử KPI (${KPI_TABLES_LOST_ON_ITEM_DELETE.join(", ")}). Đã dừng an toàn.`,
    );
  }
}
