// Map nhãn cho màn hình "Lịch sử thay đổi" — field kỹ thuật → tiếng Việt, action → tiếng Việt.
// Fallback về key gốc nếu chưa có trong map (không chặn hiển thị field mới).

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  CREATED:         "Tạo mới",
  STATUS_CHANGED:  "Đổi trạng thái",
  ZONE_MOVED:      "Chuyển xưởng",
  VERSION_CREATED: "Tạo phiên bản",
  ALERT_RAISED:    "Cảnh báo",
  ALERT_RESOLVED:  "Gỡ cảnh báo",
  SUSPENDED:       "Tạm ngưng",
  RESUMED:         "Tiếp tục",
  FIELD_UPDATED:   "Sửa thông tin",
  COMMENT_ADDED:   "Ghi chú",
  ADMIN_OVERRIDE:  "Sửa dữ liệu MO đã chốt (Admin)",
};

// Field kỹ thuật → nhãn tiếng Việt. Bao gồm cả field Order-level, per-MO, sản xuất, và spec.*
const FIELD_LABEL: Record<string, string> = {
  // Đơn hàng
  customerName:  "Khách hàng",
  salesName:     "Sales",
  nguon:         "Nguồn",
  phanLoaiKh:    "Phân loại KH",
  linkChat:      "Link chat",
  donHang3Sao:   "Đơn hàng 3 Sao",
  priorityCode:  "Ưu tiên",
  saleNote:      "Ghi chú Sales",
  requiredDate:  "Ngày DK hoàn thành",
  estimatedDate: "Ngày chốt SX",
  completedDate: "Ngày HT",
  status:        "Trạng thái",
  // Sản phẩm / kỹ thuật
  productName:   "Tên sản phẩm",
  nvl:           "NVL",
  platingType:   "Xi mạ",
  size:          "Size",
  weightGram:    "TL yêu cầu (g)",
  mainStoneType: "Loại đá chủ",
  mainStoneSize: "Đá chủ",
  designFileUrl: "Ảnh / File 3D",
  techNote:      "Diễn giải SP",
  techClassification: "Phân loại KT",
  // Sản xuất (extraData)
  tl3d:          "TL 3D (g)",
  tlXuong:       "TL Xưởng (g)",
  qd24k:         "QĐ 24K",
  qdPt:          "QĐ PT",
  tlThucTeHt:    "TL HT (g)",
  danhGiaTl:     "Đánh giá TL",
  pctChenLech:   "% chênh lệch",
  thongTinHt:    "Thông tin HT",
  tho3d:         "Nhân viên Thiết kế 3D",
  internalNote:  "Ghi chú nội bộ",
  sku:           "SKU",
  chiTietKt:     "Chi tiết KT",
  canhBaoDacBiet: "Cảnh báo đặc biệt",
  // specifications.* (ghi đè per-MO)
  "spec.ghiChuSp":     "Ghi chú SP",
  "spec.chiTietDaTam": "Chi tiết đá tấm",
  "spec.customerName": "Khách hàng (riêng MO)",
  "spec.salesName":    "Sales (riêng MO)",
  "spec.loaiHang":     "Loại hàng",
  "spec.hinhDangHot":  "Hình dạng hột",
  "spec.isShowroom":   "Showroom",
  // stages (khi tách nhỏ, hiện tại thường gộp)
  stages:        "Công đoạn sản xuất",
  // Vòng đời đơn — soft-delete/restore (order-lifecycle). "" → có ngày = ẩn; ngược lại = phục hồi.
  deletedAt:     "Ẩn/Phục hồi đơn",
};

export function auditFieldLabel(field: string): string {
  return FIELD_LABEL[field] ?? field;
}

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? action;
}

// Hiển thị giá trị rỗng thân thiện
export function auditDisplayValue(v: string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "(trống)";
  return v;
}
