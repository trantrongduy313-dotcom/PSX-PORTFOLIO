import type { StatusTone } from "@/app/lib/business/kpi-3d/display";

// ─── Tông ngữ nghĩa → biểu diễn thị giác ─────────────────────────────────────
//
// Định nghĩa MỘT LẦN cho cả app. Trước đây mỗi màn tự hardcode: `#15803d` bốn lần trong
// design-3d-client, `text-green-700` rải khắp order-detail-panel — nên cùng một ý nghĩa
// hiện ra bằng hai sắc xanh khác nhau ở hai màn.
//
// Có HAI bảng vì hai màn dùng hai hệ style khác nhau (inline style vs Tailwind). Đó là thực
// tế của codebase hiện tại, không phải trùng lặp: cùng một nguồn ý nghĩa, hai cách biểu diễn.
// Đổi bảng màu thương hiệu về sau chỉ cần sửa file này.

/** Cho các màn dùng inline style (design-3d-client). */
export const TONE_HEX: Record<StatusTone, string> = {
  positive: "#15803d",
  warning: "#b45309",
  critical: "#b91c1c",
  info: "#1d4ed8",
  neutral: "#6b7280",
};

/**
 * Chip NỀN ĐẦY — cho cột trạng thái trong bảng.
 *
 * VÌ SAO KHÔNG DÙNG TONE_HEX Ở ĐÓ: chữ màu trên nền kem có cùng khối lượng thị giác với mọi
 * chữ khác trong hàng, nên khi quét dọc một bảng mười cột thì trạng thái không nổi hơn tên
 * sản phẩm hay tên khách. Chip có nền tạo ra một hình khối mắt bắt được trước khi đọc chữ.
 *
 * Nền nhạt + chữ đậm cùng hệ màu, không phải nền đậm chữ trắng: bảng có sọc ngựa vằn và
 * nhiều dòng, chip đậm đặc sẽ biến bảng thành một dải đèn nhấp nháy.
 */
export const TONE_CHIP: Record<StatusTone, { bg: string; fg: string; border: string }> = {
  positive: { bg: "#f0fdf4", fg: "#15803d", border: "#bbf7d0" },
  warning:  { bg: "#fffbeb", fg: "#b45309", border: "#fde68a" },
  critical: { bg: "#fef2f2", fg: "#b91c1c", border: "#fecaca" },
  info:     { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe" },
  neutral:  { bg: "#f9fafb", fg: "#6b7280", border: "#e5e7eb" },
};

/** Cho các màn dùng Tailwind (order-detail-panel). */
export const TONE_TEXT_CLASS: Record<StatusTone, string> = {
  positive: "text-green-700",
  warning: "text-amber-600",
  critical: "text-red-600",
  info: "text-blue-700",
  neutral: "text-gray-400",
};

/**
 * Chip NỀN NHẠT bằng Tailwind — cho dòng tóm tắt khi thu gọn khối.
 *
 * VÌ SAO CHIP CHỨ KHÔNG PHẢI CHỮ MÀU: dòng tóm tắt là một dãy chữ xám ngăn nhau bằng dấu `·`.
 * Một chữ đổi màu trong dãy đó vẫn có cùng khối lượng thị giác với phần còn lại, nên khi quét
 * dọc nhiều khối thì trạng thái không nổi hơn tên người. Chip tạo ra một HÌNH KHỐI mắt bắt
 * được trước khi đọc chữ — cùng lý do TONE_CHIP tồn tại cho bảng.
 *
 * Cùng bộ màu với TONE_CHIP, viết bằng Tailwind vì panel dùng hệ đó (xem chú thích đầu file).
 */
export const TONE_CHIP_CLASS: Record<StatusTone, string> = {
  positive: "bg-green-50 text-green-700 border-green-200",
  warning:  "bg-amber-50 text-amber-700 border-amber-200",
  critical: "bg-red-50 text-red-700 border-red-200",
  info:     "bg-blue-50 text-blue-700 border-blue-200",
  neutral:  "bg-gray-50 text-gray-500 border-gray-200",
};
