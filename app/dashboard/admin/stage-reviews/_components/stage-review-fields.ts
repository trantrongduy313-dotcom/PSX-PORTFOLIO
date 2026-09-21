import { formatDate, formatDurationDisplay } from "@/app/lib/utils";
import { formatMoVersionedDisplay, stripVersionSuffix } from "@/app/lib/business/order-helpers";
import type { ReviewRow } from "@/app/lib/business/stage-review-rows";

// Registry cột cho In/Xuất PDF Đánh giá Khâu — cùng cấu trúc với report-fields.ts (đơn hàng)
// để đồng bộ trải nghiệm giữa 2 tính năng in trong hệ thống.
export type StageReviewGroup = "info" | "assessment";

export interface StageReviewFieldDef {
  key: string;
  label: string;
  group: StageReviewGroup;
  accessor: (r: ReviewRow) => string;
  align?: "left" | "right";
  // Field chỉ có dữ liệu ở khâu Nguội/Khóa (coldwork*) — ẩn khỏi danh sách chọn ở khâu khác
  nguoiKhoaOnly?: boolean;
  // Cột bắt buộc — luôn có mặt trong bản in, checkbox khóa (không cho bỏ chọn)
  locked?: boolean;
}

const s = (v: string | null | undefined) => (v == null || v === "" ? "—" : v);

export const STAGE_REVIEW_GROUPS: { key: StageReviewGroup; label: string }[] = [
  { key: "info",       label: "Thông tin MO" },
  { key: "assessment", label: "Đánh giá (Nguội/Khóa)" },
];

// Không đưa "Đánh giá" (đã/chưa đánh giá — trạng thái nội bộ trên web) vào danh sách chọn,
// theo đúng yêu cầu: bản in không cần cột này.
export const STAGE_REVIEW_FIELDS: StageReviewFieldDef[] = [
  // ── Thông tin MO ──────────────────────────────────────────────────────────
  // SO bắt buộc, luôn đứng TRƯỚC MO# — bản in phải xác định được đơn hàng gốc.
  { key: "so",       label: "SO",              group: "info", locked: true, accessor: (r) => s(r.orderNumber ? stripVersionSuffix(r.orderNumber) : null) },
  { key: "mo",       label: "MO#",             group: "info", accessor: (r) => s(formatMoVersionedDisplay(r.moNumber, r.isFromWebapp)) },
  { key: "product",  label: "Sản phẩm",        group: "info", accessor: (r) => s(r.productName) },
  { key: "crafter",  label: "Thợ",             group: "info", accessor: (r) => s(r.crafter) },
  { key: "phan",     label: "Phần phụ trách",  group: "info", accessor: (r) => s(r.phan) },
  { key: "doneAt",   label: "Ngày HT",         group: "info", align: "right", accessor: (r) => formatDate(r.doneAt) },
  { key: "duration", label: "Số giờ thực tế",  group: "info", align: "right", accessor: (r) => s(r.durationNote ? formatDurationDisplay(r.durationNote) : null) },

  // ── Đánh giá (chỉ khâu Nguội/Khóa có dữ liệu) ───────────────────────────────
  { key: "quality",  label: "Chất lượng SP", group: "assessment", nguoiKhoaOnly: true, accessor: (r) => s(r.coldworkQuality) },
  { key: "timeOk",   label: "Thời gian SX",  group: "assessment", nguoiKhoaOnly: true, accessor: (r) => s(r.coldworkTimeOk) },
  { key: "bacSp",    label: "Bậc SP",        group: "assessment", nguoiKhoaOnly: true, accessor: (r) => s(r.bachSP) },
  { key: "gioKpi",   label: "Giờ KPI",       group: "assessment", nguoiKhoaOnly: true, align: "right", accessor: (r) => s(r.gioKpi ? `${r.gioKpi}h` : null) },
  { key: "reason",   label: "Lý do",         group: "assessment", nguoiKhoaOnly: true, accessor: (r) => s(r.coldworkReason) },
  { key: "note",     label: "Ghi chú",       group: "assessment", nguoiKhoaOnly: true, accessor: (r) => s(r.ghiChuNguoi) },
];

// Preset — suy TỪ registry để không lệch khi thêm/bớt field.
export function stageReviewPresets(isNguoiKhoa: boolean): { full: string[]; summary: string[] } {
  const available = STAGE_REVIEW_FIELDS.filter((f) => isNguoiKhoa || !f.nguoiKhoaOnly);
  return {
    full: available.map((f) => f.key),
    summary: ["so", "mo", "product", "crafter", "doneAt", "duration"],
  };
}
