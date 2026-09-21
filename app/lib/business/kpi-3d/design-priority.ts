// ═══════════════════════════════════════════════════════════════════════════
// ƯU TIÊN CỦA VIỆC THIẾT KẾ 3D — trục RIÊNG, không phải ưu tiên của đơn hàng.
//
// ⚠️ ĐÂY KHÔNG PHẢI BẢN SAO CỦA OrderItem.priorityCode.
//
// Hai con số trả lời hai câu khác nhau, do hai người khác nhau đặt:
//   · `priorityCode`          — đơn này gấp cỡ nào với KHÁCH (Sale/Đặt đơn đặt).
//   · `design3DPriorityCode`  — trong hàng việc của NV 3D, cái nào làm trước (Quản lý/Đặt đơn đặt).
//
// Một đơn UT1 với khách có thể chỉ cần thiết kế bình thường (mẫu cũ, sửa nhẹ), và ngược lại một
// đơn thường có thể cần dựng 3D trước vì còn phải chờ duyệt mẫu. Nên chúng ĐỘC LẬP, và cố ý KHÔNG
// đồng bộ với nhau: đồng bộ một chiều thì lần đổi tay sau bị ghi đè, đồng bộ hai chiều thì đổi ưu
// tiên thiết kế lại làm đơn hàng thành siêu gấp với khách.
//
// THANG CHỈ CÓ BA BẬC, KHÔNG CÓ "SR". Đơn hàng có SR ("Đặc biệt") vì đó là một loại đơn, không
// phải một mức gấp. Với hàng việc thiết kế thì "đặc biệt" không trả lời được câu "làm cái nào
// trước", nên đưa vào là thêm một lựa chọn mà người dùng phải tự đoán nghĩa.
//
// File THUẦN: không prisma, không React.
// ═══════════════════════════════════════════════════════════════════════════

export const DESIGN_PRIORITY_CODES = ["UT1", "UT2", "Normal"] as const;
export type DesignPriorityCode = (typeof DESIGN_PRIORITY_CODES)[number];

export const DEFAULT_DESIGN_PRIORITY: DesignPriorityCode = "Normal";

/** Nhãn cho người đọc. Luôn kèm chữ "3D" ở chỗ hiển thị — xem chú thích ở designPriorityChipLabel. */
export const DESIGN_PRIORITY_LABELS: Record<DesignPriorityCode, string> = {
  UT1: "UT1 — Siêu gấp",
  UT2: "UT2 — Gấp",
  Normal: "Bình thường",
};

/**
 * Chuẩn hoá giá trị thô về một bậc hợp lệ — không khớp thì về `Normal`.
 *
 * Nhận cả `null`/rỗng vì dữ liệu cũ (MO tạo trước khi có cột này) và cả "SR" của thang đơn hàng:
 * nếu ai đó chép giá trị từ trục đơn hàng sang thì nó rơi về Normal chứ không làm vỡ giao diện.
 */
export function toDesignPriority(raw: string | null | undefined): DesignPriorityCode {
  return (DESIGN_PRIORITY_CODES as readonly string[]).includes(raw ?? "")
    ? (raw as DesignPriorityCode)
    : DEFAULT_DESIGN_PRIORITY;
}

/** Bậc để so sánh — số NHỎ hơn là gấp hơn, nên sort tăng dần là đúng thứ tự cần làm. */
const RANK: Record<DesignPriorityCode, number> = { UT1: 0, UT2: 1, Normal: 2 };

export function designPriorityRank(raw: string | null | undefined): number {
  return RANK[toDesignPriority(raw)];
}

/** Có phải một mức GẤP (UT1/UT2) — dùng để quyết định có hiện chip hay không. */
export function isUrgentDesign(raw: string | null | undefined): boolean {
  return toDesignPriority(raw) !== DEFAULT_DESIGN_PRIORITY;
}

/**
 * Nhãn ngắn cho chip trên bảng: "3D · UT1".
 *
 * ⚠️ CHỮ "3D" LÀ BẮT BUỘC, không phải trang trí. Trên cùng một dòng còn có chip ưu tiên của ĐƠN
 * HÀNG, cũng mang chữ "UT1". Hai chip trơ cùng ghi "UT1" thì không ai biết cái nào nói về cái gì,
 * và người dùng sẽ đọc sai đúng lúc cần đọc đúng.
 *
 * Trả về null khi là `Normal`: một chip "Bình thường" trên mọi dòng là nhiễu, và nhiễu ở cột này
 * làm mất luôn tác dụng của hai chip kia.
 */
export function designPriorityChipLabel(raw: string | null | undefined): string | null {
  const code = toDesignPriority(raw);
  return code === DEFAULT_DESIGN_PRIORITY ? null : `3D · ${code}`;
}

/**
 * Ưu tiên thiết kế có ĐANG BỎ SÓT một đơn gấp không?
 *
 * CÁI BẪY CỦA CẢ TÍNH NĂNG NÀY: ưu tiên 3D là trục riêng nên PHẢI CÓ NGƯỜI ĐẶT. Một MO gấp với
 * khách (UT1) mà chưa ai xếp ưu tiên thiết kế sẽ nằm giữa danh sách như đơn thường — và không có
 * gì trên màn hình nói ra điều đó.
 *
 * Hàm này để giao diện gắn một dấu hiệu nhẹ: "đơn UT1 mà thiết kế chưa được xếp ưu tiên". KHÔNG
 * tự nâng ưu tiên hộ — nâng hộ là đồng bộ ngầm, đúng thứ đã loại ở đầu file.
 */
export function designPriorityNeedsAttention(params: {
  /** Ưu tiên của ĐƠN HÀNG (OrderItem.priorityCode) — thang có cả "SR". */
  orderPriorityCode: string | null | undefined;
  /** Ưu tiên của việc thiết kế. */
  designPriorityCode: string | null | undefined;
}): boolean {
  const order = params.orderPriorityCode ?? "";
  const orderIsUrgent = order === "UT1" || order === "UT2";
  return orderIsUrgent && !isUrgentDesign(params.designPriorityCode);
}
