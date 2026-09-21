// ─── Dòng tổng KPI Nguội → bảng in ───────────────────────────────────────────
//
// Tách khỏi kpi-nguoi.ts để module toán giữ nguyên trạng thái THUẦN SỐ — dễ test bằng so sánh
// chính xác, không vướng chuyện định dạng. Cùng khuôn với business/kpi-3d/display.ts.
//
// ĐIỂM QUAN TRỌNG: cột (NGUOI_KPI_COLUMNS) và ô (nguoiKpiPrintRow) nằm CẠNH NHAU trong cùng
// một file, vì `key` của cột phải khớp khoá của ô. Để hai thứ này ở hai nơi là kiểu lỗi âm
// thầm cổ điển: thêm cột mà quên thêm ô → bảng in ra một cột trống, không ai báo lỗi gì.

import { formatHours } from "@/app/lib/utils";
import type { NguoiKpiSummary } from "@/app/lib/business/kpi-nguoi";
import type { PrintKpiCol, PrintKpiRow } from "@/app/lib/types/kpi-report";

/** 10 cột bảng tổng KPI Nguội — dùng chung cho bản in Thống kê và bản in Đánh giá Khâu. */
export const NGUOI_KPI_COLUMNS: PrintKpiCol[] = [
  { key: "code",     label: "Mã" },
  { key: "crafter",  label: "Tên thợ" },
  { key: "level",    label: "Bậc" },
  { key: "totalHrs", label: "Tổng giờ thực tế",     align: "right" },
  { key: "moCount",  label: "SL MO thực tế",        align: "right" },
  { key: "units",    label: "SL quy về nhóm chuẩn", align: "right" },
  { key: "quota",    label: "ĐM / Tháng",           align: "right" },
  { key: "result",   label: "Kết quả (%)",          align: "right" },
  { key: "clKd",     label: "SL MO không đạt CLSP", align: "right" },
  { key: "late",     label: "SL MO trễ",            align: "right" },
];

/** Dòng tổng (số) → dòng bảng in (chuỗi đã định dạng). Khoá ô khớp `key` ở NGUOI_KPI_COLUMNS. */
export function nguoiKpiPrintRow(s: NguoiKpiSummary): PrintKpiRow {
  return {
    crafter: s.crafter,
    cells: {
      // Rỗng hiện "—": thợ CHƯA CÓ MÃ, khác một ô trắng trông như lỗi dựng bản in.
      code: s.code || "—",
      crafter: s.crafter,
      level: s.level,
      totalHrs: formatHours(s.totalHours),
      // `units || "—"` giữ nguyên hành vi cũ: 0 đơn vị hiện gạch ngang cho dễ đọc.
      moCount: String(s.moCount),
      units: String(s.units || "—"),
      quota: String(s.quota),
      result: s.resultPct == null ? "—" : `${s.resultPct}%`,
      clKd: String(s.qualityFail || 0),
      late: String(s.timeFail || 0),
    },
  };
}
