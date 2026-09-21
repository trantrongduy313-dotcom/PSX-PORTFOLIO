// ─── Tên NV thiết kế 3D của một MO — MỘT nguồn cho MỌI màn ───────────────────
//
// LỖI ĐÃ XẢY RA THẬT: cùng một MO, tab Thiết kế bên PTK hiện "989 - N8n" còn bên PSX
// hiện "—". Không mất dữ liệu — hai màn ĐỌC HAI CHỖ KHÁC NHAU:
//
//   PTK  : lượt giao việc (quan hệ) → perItem[itemId].tho3d → extraData.tho3d
//   PSX  : extraData.tho3d          ← CHỈ mỗi chỗ này
//
// `extraData.tho3d` ở GỐC là chỗ lưu CŨ, hồi thợ 3D còn dùng chung cho cả SO. Từ khi tách
// riêng theo từng MO/phiên bản, dữ liệu mới KHÔNG còn ghi vào đó nữa — nó chỉ còn giá trị
// với đơn cũ. Nên bên PSX đọc trúng ô vĩnh viễn rỗng, và mọi đơn mới đều hiện "—".
//
// Đây đúng là điều dự án vẫn nhắc: hai nơi ĐỌC cùng một sự thật thì sớm muộn lệch. Vá riêng
// bên PSX sẽ hết lỗi hôm nay nhưng dựng lại y nguyên cái bẫy — màn thứ ba sẽ lại tự chọn
// một trong ba chỗ. Nên luật thứ tự ưu tiên nằm ở ĐÂY, có test, và hai màn cùng gọi.

/** Ba nguồn có thể chứa tên NV 3D, xếp theo mức độ đáng tin. */
export type DesignerNameSources = {
  /** Tên trên lượt giao việc đang mở (quan hệ Design3DAssignment) — nguồn CHÍNH. */
  assignmentDesignerName?: string | null;
  /** perItem[itemId].tho3d — nơi lưu theo từng MO/phiên bản. */
  perItemTho3d?: unknown;
  /** extraData.tho3d ở gốc — chỗ lưu CŨ, dùng chung cả SO. Chỉ còn cho đơn cũ. */
  rootTho3d?: unknown;
};

/** Ép về chuỗi đã trim; mọi thứ không phải chuỗi có nội dung đều thành "". */
const asText = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Tên NV thiết kế 3D của MO đang xem, theo đúng một thứ tự ưu tiên cho mọi màn.
 * Không tìm được thì trả "" — chỗ gọi tự quyết hiện "—" hay để trống.
 *
 * Dùng "chuỗi rỗng thì đi tiếp" chứ KHÔNG dùng `??`: chỗ huỷ giao việc có ghi
 * `perItem[id].tho3d = ""` (xem assignment-targets.ts). Với `??` thì chuỗi rỗng đó được
 * coi là một giá trị hợp lệ và chặn mất fallback về gốc — đơn cũ sẽ mất tên vô cớ.
 */
export function resolveDesignerName(src: DesignerNameSources): string {
  return (
    asText(src.assignmentDesignerName) ||
    asText(src.perItemTho3d) ||
    asText(src.rootTho3d)
  );
}
