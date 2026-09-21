// ─── Khu vực của một mục changelog ───────────────────────────────────────────
//
// Để người đọc QUÉT nhanh: một thợ 3D nhìn thấy nhãn "Đặt đơn" thì biết bỏ qua, thấy "Thiết kế
// 3D" thì đọc kỹ.
//
// ⚠️ LÀ NHÃN, KHÔNG PHẢI BỘ LỌC. Cố ý không lọc mục theo role: với khoảng 8 người thì thấy một
// thay đổi không liên quan tới mình là VÔ HẠI, còn BỎ SÓT một thay đổi liên quan thì KHÔNG.
// Lọc theo role nghe hợp lý nhưng nó chuyển rủi ro sang phía tệ hơn — và nó đòi ta phải đoán
// đúng ai cần biết cái gì, việc mà chính người viết mục cũng không chắc.
//
// File THUẦN: không prisma, không React.

/** Khớp enum `ChangelogArea` trong schema.prisma. */
export type ChangelogArea = "ORDERS" | "DESIGN_3D" | "PSX" | "STATISTICS" | "GENERAL";

export const CHANGELOG_AREAS: readonly ChangelogArea[] = [
  "ORDERS",
  "DESIGN_3D",
  "PSX",
  "STATISTICS",
  "GENERAL",
] as const;

export function isChangelogArea(value: unknown): value is ChangelogArea {
  return typeof value === "string" && (CHANGELOG_AREAS as readonly string[]).includes(value);
}

/**
 * Nhãn hiển thị.
 *
 * Dùng ĐÚNG từ đang có trên Sidebar, không tự đặt từ mới: "Đặt đơn" chứ không phải "Đơn hàng",
 * "Thiết kế 3D" chứ không phải "3D". Một mục changelog nói về một chỗ mà người đọc phải tìm
 * thấy được — gọi nó bằng cái tên khác với cái tên trên nút là bắt họ tự dịch.
 */
export const CHANGELOG_AREA_LABELS: Record<ChangelogArea, string> = {
  ORDERS: "Đặt đơn",
  DESIGN_3D: "Thiết kế 3D",
  PSX: "Phòng Sản Xuất",
  STATISTICS: "Thống kê",
  GENERAL: "Chung",
};

/** Mặc định khi người viết không chọn — "Chung" là câu trả lời trung thực nhất, không phải đoán. */
export const DEFAULT_CHANGELOG_AREA: ChangelogArea = "GENERAL";
