import { REPORT_FIELDS, type ReportRow } from "./report-fields";

// Tính TỔNG cho mọi cột có khai báo `sumValue` (VD TL 3D, QĐ 24K) — hàm THUẦN, test được.
// Config-driven: thêm cột cần tổng = thêm `sumValue` trong REPORT_FIELDS, KHÔNG sửa ở đây.
export interface ReportTotal {
  key: string;
  label: string; // nhãn cột (VD "TL 3D (g)")
  total: number;
  // Quy đổi đơn vị truyền thống đi kèm (VD Lượng) — truyền nguyên khai báo từ REPORT_FIELDS,
  // không tính trước ở đây để nơi hiển thị (report-pdf) tự quyết định số chữ số thập phân.
  unitConvert?: { label: string; factor: number };
}

export function computeTotals(rows: ReportRow[]): ReportTotal[] {
  return REPORT_FIELDS.filter((f) => f.sumValue).map((f) => {
    let total = 0;
    for (const r of rows) {
      const v = f.sumValue!(r);
      if (v != null) total += v;
    }
    return { key: f.key, label: f.label, total, unitConvert: f.unitConvert };
  });
}
