import type { OrderStatus } from "@/app/generated/prisma/client";

// Danh muc tuy chon va nhan hien thi cua OrderDetailPanel. Du lieu thuan, khong logic.
// Dung chung boi panel va panel-tabs.tsx.

export const STONE_TYPE_OPTIONS = ["XOÀN TN", "LAB", "CZ", "ĐÁ MÀU", "NGỌC TRAI"];

export const LOAI_HANG_OPTIONS = [
  "Natural diamond setting", "Lab diamond setting", "Figurine/Animal",
  "Natural diamond", "Lab diamond", "Plain <10g", "Plain >10g",
  "Stone", "CZ", "Natural diamond + Pearl",
];

export const HOT_STONE_TYPE_OPTIONS = ["XOÀN", "XOÀN LAB", "CZ", "KHÁC", "ĐÁ MÀU", "ĐÁ", "PEARL"] as const;

export const HINH_DANG_HOT_OPTIONS = [
  "Tròn/RD", "Vuông/PR", "Ống đầu bằng/BG", "Ống đầu nhọn/TD",
  "Vuông chặt góc/CU", "Hình trái xoan/OV", "Ngọc lục bảo/EMR",
  "Giọt nước/PS", "Trái tim/HS", "Hạt dưa/MQ", "Tám góc/AS",
  "Chữ nhật chặt góc/RAD", "Tam giác/TR", "Bán nguyệt/HM", "Ngọc trai/RD-P",
];

export const TEN_SP_OPTIONS = [
  "Vỏ nhẫn",
  "Vỏ nhẫn xoàn", "Vỏ nhẫn trơn", "Nhẫn band xoàn", "Nhẫn band trơn",
  "Vỏ mặt xoàn", "Vỏ mặt trơn", "Mặt dây xoàn", "Mặt dây trơn",
  "Vỏ vòng xoàn", "Vỏ vòng trơn", "Vòng tay xoàn", "Vỏ bông tai xoàn",
  "Vỏ bông tai trơn", "Bông tai xoàn", "Bông tai trơn", "Vỏ lắc xoàn",
  "Vỏ lắc trơn", "Lắc tay xoàn", "Lắc tay trơn", "Dây chuyền",
  "Vỏ vòng cổ xoàn", "Vỏ vòng cổ trơn", "Vòng cổ xoàn", "Vòng cổ trơn",
  "Phụ kiện", "Charm",
  "Dây chuyền tay", "Khoen mũi",
];

export const LOAI_SP_OPTIONS = ["RI", "PD", "ER", "BL", "BG", "NL", "CH", "CH-TAY", "BL-TAY", "BG-TAY", "ACC", "H", "O"];

export const ACTION_LABEL: Record<string, string> = {
  CREATED:        "Tạo đơn",
  STATUS_CHANGED: "Cập nhật trạng thái",
  FIELD_UPDATED:  "Cập nhật thông tin",
  SUSPENDED:      "Tạm ngưng",
  RESUMED:        "Tiếp tục sản xuất",
  ZONE_MOVED:     "Chốt 3D — Chuyển sang Xưởng",
  PROMOTED:       "Chốt 3D — Chuyển sang Xưởng",
  ALERT_RAISED:   "Phát sinh cảnh báo",
  ALERT_RESOLVED: "Giải quyết cảnh báo",
  COMMENT_ADDED:  "Ghi chú",
};

export const STATUS_LABEL_VI: Partial<Record<OrderStatus, string>> = {
  DRAFT:              "Chưa thiết kế",
  PENDING_DESIGN:     "Làm INFO",
  IN_DESIGN:          "Đang thiết kế",
  DESIGN_REVIEW:      "Chờ khách duyệt",
  DESIGN_APPROVED:    "Chốt 3D",
  PENDING_PRODUCTION: "Chờ sản xuất",
  IN_PRODUCTION:      "Đang sản xuất",
  QUALITY_CHECK:      "Kiểm tra CL",
  COMPLETED:          "Hoàn thành",
  SUSPENDED:          "Tạm ngưng",
  CANCELLED:          "Đã hủy",
};
