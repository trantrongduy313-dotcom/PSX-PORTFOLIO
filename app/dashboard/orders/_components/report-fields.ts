import { formatDate } from "@/app/lib/utils";
import { formatMoVersionedDisplay, stripVersionSuffix } from "@/app/lib/business/order-helpers";
import { toBomStatus, BOM_STATUS_BADGE } from "@/app/lib/business/bom";
import { STATUS_LABEL, type OrderStatus } from "@/app/lib/types/order";

// Dòng báo cáo = 1 phần tử của sortedTableRows (OrderSummary phẳng theo từng MO).
// Dùng `any` vì đây là kiểu suy rộng ở client (nhiều field đọc qua firstItem).
export type ReportRow = Record<string, any>;

// Cụm hiển thị trong hộp chọn cột — 1 field thuộc đúng 1 cụm.
export type ReportGroup = "order" | "product" | "production";

export interface ReportFieldDef {
  key: string;
  label: string;                       // nhãn tiếng Việt (báo cáo cho sếp)
  group: ReportGroup;                  // cụm hiển thị trong hộp chọn cột
  accessor: (r: ReportRow) => string;  // trả CHUỖI đã format sẵn
  align?: "left" | "right";
  psxOnly?: boolean;                   // field chỉ có giá trị khi đơn đã ở PSX (PTK sẽ hiện "—")
  bossDefault?: boolean;               // thuộc preset "Báo cáo sếp"
  locked?: boolean;                    // cột bắt buộc — luôn có mặt trong bản in, checkbox khóa
  // Cột cần tính TỔNG cuối báo cáo — trả số (g…) hoặc null nếu không có số liệu.
  // Khai báo ở đây = tự hiện trong hộp Tổng hợp (config-driven), không sửa UI.
  sumValue?: (r: ReportRow) => number | null;
  // Quy đổi đơn vị truyền thống đi kèm dòng tổng (VD Lượng = 37.5g). Chỉ áp dụng cho các
  // tổng là HÀM LƯỢNG KIM LOẠI RÒNG (QĐ 24K, QĐ Bạc) — KHÔNG áp dụng cho TL3D (trọng lượng
  // thiết kế thô, không phải hàm lượng kim loại). Mở rộng được cho đơn vị khác sau này
  // (VD "Chỉ" = 3.75g) chỉ bằng cách thêm 1 khai báo, không sửa kiến trúc.
  unitConvert?: { label: string; factor: number };
  // Trọng số bề ngang cột trong PDF (mặc định 1). Cột chữ dài (Thông tin HT, Khách hàng…)
  // khai số lớn, cột ngắn (ngày, số liệu) khai số nhỏ. report-pdf.ts quy đổi trọng số này
  // thành ĐỘ RỘNG SỐ TUYỆT ĐỐI vừa khít bề ngang trang — bắt buộc pdfmake ngắt dòng trong ô
  // thay vì đẩy cột tràn ra ngoài trang rồi cắt mất (hành vi của widths "*" khi tổng
  // minWidth vượt khổ giấy). Thêm cột mới sau này chỉ cần khai ở đây, không sửa code PDF.
  widthWeight?: number;
}

// Parse chuỗi số ("3.225") → number | null (bỏ rỗng/không phải số). Dùng cho sumValue.
function num(v: unknown): number | null {
  const raw = String(v ?? "").trim();
  if (raw === "") return null;
  const n = parseFloat(raw);
  return Number.isNaN(n) ? null : n;
}

const s = (v: unknown) => (v == null || v === "" ? "—" : String(v));

// Loại SP: suy mã ngắn từ tên sản phẩm (đồng bộ với cột "Loại SP" ở tab Tổng quan)
function productTypeCode(name: string | null | undefined): string {
  if (!name) return "—";
  const n = name.toLowerCase();
  if (n.includes("nhẫn")) return "RI";
  if (n.includes("bông") || n.includes("khoen")) return "ER";
  if (n.includes("mặt")) return "PE";
  if (n.includes("vòng") || n.includes("lắc")) return "BR";
  if (n.includes("dây")) return "NE";
  if (n.includes("charm") || n.includes("phụ kiện")) return "AC";
  return "—";
}

// Cụm — quyết định thứ tự & nhãn nhóm trong hộp chọn cột.
export const REPORT_GROUPS: { key: ReportGroup; label: string }[] = [
  { key: "order",      label: "Đơn hàng" },
  { key: "product",    label: "Sản phẩm & Kỹ thuật" },
  { key: "production", label: "Sản xuất & Kết quả" },
];

// Registry DUY NHẤT: thêm field mới = thêm 1 entry (checkbox + preset tự cập nhật).
// Dữ liệu đều đã có sẵn trong snapshot (firstItem / productionSummary / order-level) — không cần sửa API.
export const REPORT_FIELDS: ReportFieldDef[] = [
  // ── Đơn hàng ──────────────────────────────────────────────────────────────
  // SO bắt buộc, luôn đứng TRƯỚC MO# — bản in phải xác định được đơn hàng gốc.
  { key: "so",          label: "SO",             group: "order", locked: true, bossDefault: true, widthWeight: 0.8, accessor: (r) => s(r.orderNumber ? stripVersionSuffix(r.orderNumber) : null) },
  { key: "mo",          label: "MO#",            group: "order", bossDefault: true, widthWeight: 0.9, accessor: (r) => s(formatMoVersionedDisplay(r.firstItem?.moNumber, r.firstItem?.isFromWebapp ?? false) || r.orderNumber) },
  { key: "customer",    label: "Khách hàng",     group: "order", bossDefault: true, widthWeight: 1.8, accessor: (r) => s(r.customerName) },
  { key: "sales",       label: "Sales",          group: "order", accessor: (r) => s(r.salesName) },
  { key: "nguon",       label: "Nguồn",          group: "order", accessor: (r) => s(r.nguon) },
  { key: "phanLoaiKh",  label: "Phân loại KH",   group: "order", accessor: (r) => s(r.phanLoaiKh) },
  { key: "priority",    label: "Ưu tiên",        group: "order", accessor: (r) => s(r.priorityCode) },
  { key: "donHang3Sao", label: "Đơn hàng 3 Sao", group: "order", accessor: (r) => (r.donHang3Sao ? "Có" : "Không") },
  { key: "linkChat",    label: "Link chat",      group: "order", widthWeight: 2, accessor: (r) => s(r.linkChat) },
  { key: "saleNote",    label: "Ghi chú Sales",  group: "order", widthWeight: 2, accessor: (r) => s(r.firstItem?.saleNote ?? r.saleNote) },
  { key: "orderDate",   label: "Ngày tạo",       group: "order", align: "right", widthWeight: 0.8, accessor: (r) => formatDate(r.orderDate) },
  // BOM per-MO (PTK) — trạng thái hiện tại + ngày của trạng thái đó (nếu có)
  { key: "bom",         label: "BOM",            group: "order", accessor: (r) => {
    const st = toBomStatus(r.firstItem?.bomStatus);
    if (!st) return "—";
    const d = r.firstItem?.bomDate ? ` (${formatDate(r.firstItem.bomDate)})` : "";
    return `${BOM_STATUS_BADGE[st]}${d}`;
  } },

  // ── Sản phẩm & Kỹ thuật ────────────────────────────────────────────────────
  { key: "loaiSp",       label: "Loại SP",       group: "product", widthWeight: 0.6, accessor: (r) => r.firstItem?.loaiSp || productTypeCode(r.firstItem?.productName) },
  { key: "product",      label: "Sản phẩm",      group: "product", bossDefault: true, widthWeight: 1.6, accessor: (r) => s(r.firstItem?.productName) },
  { key: "dienGiai",     label: "Diễn giải SP",  group: "product", widthWeight: 2.4, accessor: (r) => s(r.firstItem?.techNote) },
  { key: "nvl",          label: "NVL",           group: "product", widthWeight: 1.2, accessor: (r) => s(r.firstItem?.nvl) },
  { key: "size",         label: "Size",          group: "product", widthWeight: 0.6, accessor: (r) => s(r.firstItem?.size) },
  { key: "techClass",    label: "Phân loại KT",  group: "product", widthWeight: 1.4, accessor: (r) => { const v = r.firstItem?.techClassification; return Array.isArray(v) && v.length ? v.join(" + ") : "—"; } },
  { key: "mainStoneType",label: "Loại đá chủ",   group: "product", accessor: (r) => s(r.firstItem?.mainStoneType) },
  { key: "mainStoneSize",label: "Đá chủ",        group: "product", accessor: (r) => s(r.firstItem?.mainStoneSize) },
  { key: "plating",      label: "Xi mạ",         group: "product", accessor: (r) => s(r.firstItem?.platingType) },
  { key: "weightReq",    label: "TL yêu cầu (g)",group: "product", align: "right", widthWeight: 0.8, accessor: (r) => s(r.firstItem?.weightGram) },
  { key: "designFile",   label: "File 3D",       group: "product", widthWeight: 0.6, accessor: (r) => (r.firstItem?.designFileUrl ? "Có" : "—") },

  // ── Sản xuất & Kết quả ─────────────────────────────────────────────────────
  { key: "stage",         label: "Công đoạn",         group: "production", psxOnly: true, accessor: (r) => s(r.productionSummary?.congDoan) },
  { key: "tl3d",          label: "TL 3D (g)",         group: "production", psxOnly: true, locked: true, align: "right", widthWeight: 0.7, accessor: (r) => s(r.productionSummary?.tl3d ?? r.firstItem?.tl3d), sumValue: (r) => num(r.productionSummary?.tl3d ?? r.firstItem?.tl3d) },
  { key: "tlXuong",       label: "TL Xưởng (g)",      group: "production", psxOnly: true, align: "right", widthWeight: 0.7, accessor: (r) => s(r.productionSummary?.tlXuong) },
  { key: "qd24k",         label: "QĐ 24K",            group: "production", psxOnly: true, align: "right", widthWeight: 0.7, accessor: (r) => s(r.productionSummary?.qd24k), sumValue: (r) => num(r.productionSummary?.qd24k), unitConvert: { label: "Lượng", factor: 37.5 } },
  { key: "qdPt",          label: "QĐ PT",             group: "production", psxOnly: true, align: "right", widthWeight: 0.7, accessor: (r) => s(r.productionSummary?.qdPt) },
  // QĐ Bạc — TÁCH RIÊNG khỏi qd24k (mốc tinh khiết bạc 999 khác vàng 9999); tổng riêng
  // trong PDF (KHÔNG cộng chung với Tổng QĐ 24K — gram vàng và gram bạc là 2 đại lượng khác).
  { key: "qdBac",         label: "QĐ Bạc",            group: "production", psxOnly: true, align: "right", widthWeight: 0.7, accessor: (r) => s(r.productionSummary?.qdBac), sumValue: (r) => num(r.productionSummary?.qdBac), unitConvert: { label: "Lượng", factor: 37.5 } },
  { key: "tlThucTeHt",    label: "TL HT (g)",         group: "production", psxOnly: true, align: "right", widthWeight: 0.7, accessor: (r) => s(r.productionSummary?.tlThucTeHt) },
  { key: "danhGiaTl",     label: "Đánh giá TL",       group: "production", psxOnly: true, widthWeight: 0.9, accessor: (r) => s(r.productionSummary?.danhGiaTl) },
  { key: "pctChenLech",   label: "% chênh lệch",      group: "production", psxOnly: true, align: "right", widthWeight: 0.7, accessor: (r) => { const v = r.productionSummary?.pctChenLech; return v ? `${v}%` : "—"; } },
  { key: "thongTinHt",    label: "Thông tin HT",      group: "production", psxOnly: true, widthWeight: 3, accessor: (r) => s(r.productionSummary?.thongTinHt) },
  { key: "sku",           label: "Mã SKU",            group: "production", psxOnly: true, widthWeight: 1.4, accessor: (r) => s(r.firstItem?.sku) },
  { key: "canhBaoDacBiet",label: "Cảnh báo đặc biệt", group: "production", widthWeight: 2, accessor: (r) => s(r.productionSummary?.canhBaoDacBiet ?? r.activeAlertTitle) },
  { key: "estimatedDate", label: "Ngày chốt SX",      group: "production", align: "right", widthWeight: 0.8, accessor: (r) => formatDate(r.firstItem?.estimatedDate ?? r.estimatedDate) },
  { key: "requiredDate",  label: "Ngày DK HT",        group: "production", bossDefault: true, align: "right", widthWeight: 0.8, accessor: (r) => formatDate(r.firstItem?.requiredDate) },
  { key: "completedDate", label: "Ngày HT",           group: "production", psxOnly: true, align: "right", widthWeight: 0.8, accessor: (r) => formatDate(r.firstItem?.completedDate ?? r.completedDate) },
  { key: "status",        label: "Trạng thái",        group: "production", bossDefault: true, widthWeight: 0.8, accessor: (r) => STATUS_LABEL[r.status as OrderStatus] ?? s(r.status) },
];

// Preset cột — suy TỪ registry để không lệch khi thêm/bớt field.
export const REPORT_PRESETS: Record<string, string[]> = {
  boss: REPORT_FIELDS.filter((f) => f.bossDefault).map((f) => f.key),
  full: REPORT_FIELDS.map((f) => f.key),
};

// Suy nhãn "kỳ báo cáo" từ bộ lọc đang áp — để user không phải gõ tay.
export function derivePeriodLabel(f: Record<string, any> | undefined | null): string {
  if (!f) return "Tất cả đơn";
  const d = (v?: string) => (v ? formatDate(v) : "");
  if (f.deadlinePreset === "thisWeek") return "Dự kiến hoàn thành trong tuần này";
  if (f.deadlinePreset === "overdue")  return "Đơn quá hạn dự kiến hoàn thành";
  if (f.deadlinePreset === "week")     return "Dự kiến hoàn thành 7 ngày tới";
  if (f.requiredDateFrom || f.requiredDateTo)   return `Ngày DK HT: ${d(f.requiredDateFrom)} – ${d(f.requiredDateTo)}`;
  if (f.estimatedDateFrom || f.estimatedDateTo) return `Ngày chốt SX: ${d(f.estimatedDateFrom)} – ${d(f.estimatedDateTo)}`;
  if (f.completedDateFrom || f.completedDateTo) return `Ngày hoàn tất: ${d(f.completedDateFrom)} – ${d(f.completedDateTo)}`;
  if (f.dateFrom || f.dateTo) return `Ngày tạo: ${d(f.dateFrom)} – ${d(f.dateTo)}`;
  return "Tất cả đơn (theo bộ lọc hiện tại)";
}
