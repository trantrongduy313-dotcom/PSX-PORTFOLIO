// ═══════════════════════════════════════════════════════════════════════════
// Theo dõi BOM của MO ở Phòng Thiết Kế — nguồn chân lý DUY NHẤT (option A: thủ công).
//
// Mô hình: MỖI TRẠNG THÁI CÓ MỘT Ô NGÀY RIÊNG, không bắt buộc, KHÔNG BAO GIỜ bị xoá khi
// chuyển trạng thái — 3 ô ngày chính là "lịch sử" (user luôn xem lại được ngày đã ghi).
//
// Lưu PER-MO trong OrderItem.specifications (không cột DB riêng, không migration):
//   specifications.bom = {
//     status:   BomStatus | null,                     // trạng thái hiện tại
//     dates:    { CHO_BOM, CHO_THONG_TIN, DA_GUI },   // "YYYY-MM-DD" | "" (trống)
//     dienGiai: string,                                // mô tả khi Chờ thông tin BOM (field riêng)
//   }
// Ý nghĩa ngày theo trạng thái (chỉ khác NHÃN hiển thị, dữ liệu vẫn 1 ô/trạng thái):
//   CHO_BOM, CHO_THONG_TIN → "Deadline" (hạn chót cần có BOM/thông tin)
//   DA_GUI                → "Ngày gửi" (ngày thực tế đã gửi BOM)
// (Định dạng phẳng cũ bomStatus/bomSentDate của bản đầu được đọc fallback — xem readBomState.)
//
// Mọi nơi (form sidebar, badge bảng, filter toolbar, report) import từ module này —
// thêm/đổi trạng thái chỉ sửa MỘT file. Cùng pattern với business/priority.ts.
// ═══════════════════════════════════════════════════════════════════════════

/** Các trạng thái BOM hợp lệ — thứ tự cũng là thứ tự hiển thị trong dropdown/filter. */
export const BOM_STATUSES = ["CHO_BOM", "CHO_THONG_TIN", "DA_GUI"] as const;
export type BomStatus = (typeof BOM_STATUSES)[number];

/** Nhãn hiển thị (dropdown + filter + dòng ngày) — wording ngắn user chốt. */
export const BOM_STATUS_LABELS: Record<BomStatus, string> = {
  CHO_BOM:       "Chờ BOM",
  CHO_THONG_TIN: "Chờ thông tin BOM",
  DA_GUI:        "Đã gửi BOM",
};

/**
 * Nhãn Ô NGÀY theo trạng thái — làm rõ ý nghĩa (deadline vs ngày thực gửi) để user không
 * nhầm 3 ô ngày là cùng một loại. CHO_BOM/CHO_THONG_TIN dùng chung "Deadline"; DA_GUI riêng.
 */
export const BOM_DATE_LABELS: Record<BomStatus, string> = {
  CHO_BOM:       "Deadline",
  CHO_THONG_TIN: "Deadline",
  DA_GUI:        "Ngày gửi",
};

/** Nhãn NGẮN cho badge trên bảng (bảng chật). */
export const BOM_STATUS_BADGE: Record<BomStatus, string> = {
  CHO_BOM:       "Chờ BOM",
  CHO_THONG_TIN: "Chờ thông tin",
  DA_GUI:        "Đã gửi",
};

/** Màu badge theo trạng thái — cam (chờ BOM) / vàng đất (chờ thông tin) / xanh (đã gửi). */
export const BOM_STATUS_COLORS: Record<BomStatus, { bg: string; fg: string }> = {
  CHO_BOM:       { bg: "rgba(234,88,12,0.12)",  fg: "#c2410c" },
  CHO_THONG_TIN: { bg: "rgba(202,138,4,0.12)",  fg: "#a16207" },
  DA_GUI:        { bg: "rgba(22,163,74,0.12)",  fg: "#15803d" },
};

/** Chuẩn hoá giá trị thô — không hợp lệ/absent → null (chưa phân loại). */
export function toBomStatus(raw: unknown): BomStatus | null {
  return (BOM_STATUSES as readonly string[]).includes(raw as string) ? (raw as BomStatus) : null;
}

/** Ngày ghi nhận theo TỪNG trạng thái — "" = user chưa điền (không bắt buộc). */
export type BomDates = Record<BomStatus, string>;

export const EMPTY_BOM_DATES: BomDates = { CHO_BOM: "", CHO_THONG_TIN: "", DA_GUI: "" };

/** Trạng thái BOM đầy đủ của một MO — status hiện tại + ngày của cả 3 trạng thái + diễn giải. */
export type BomState = { status: BomStatus | null; dates: BomDates; dienGiai: string };

/**
 * Đọc BomState từ OrderItem.specifications — nơi DUY NHẤT hiểu cả 2 định dạng:
 *   1. Mới: specs.bom = { status, dates, dienGiai } (ưu tiên).
 *   2. Phẳng cũ (bản đầu tính năng): specs.bomStatus + specs.bomSentDate
 *      → map bomSentDate vào dates.DA_GUI để không mất ngày đã nhập (dienGiai chưa tồn tại → "").
 */
export function readBomState(specs: Record<string, unknown> | null | undefined): BomState {
  const s = specs ?? {};
  const bom = s.bom as { status?: unknown; dates?: Record<string, unknown>; dienGiai?: unknown } | null | undefined;
  if (bom && typeof bom === "object") {
    const d = (bom.dates ?? {}) as Record<string, unknown>;
    return {
      status: toBomStatus(bom.status),
      dates: {
        CHO_BOM:       (d.CHO_BOM       as string) ?? "",
        CHO_THONG_TIN: (d.CHO_THONG_TIN as string) ?? "",
        DA_GUI:        (d.DA_GUI        as string) ?? "",
      },
      dienGiai: (bom.dienGiai as string) ?? "",
    };
  }
  // Fallback định dạng phẳng cũ
  return {
    status: toBomStatus(s.bomStatus),
    dates: { ...EMPTY_BOM_DATES, DA_GUI: (s.bomSentDate as string) ?? "" },
    dienGiai: "",
  };
}

/** Ngày của trạng thái HIỆN TẠI (hiện dưới badge trên bảng/report) — null nếu trống. */
export function currentBomDate(state: BomState): string | null {
  return state.status ? (state.dates[state.status] || null) : null;
}
