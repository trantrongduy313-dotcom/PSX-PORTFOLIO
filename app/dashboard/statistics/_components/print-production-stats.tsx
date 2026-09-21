"use client";

import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { usePrintFlow, formatExportedAt } from "@/app/lib/utils/print-helpers";
import type { PrintKpiCol, PrintKpiRow } from "@/app/lib/types/kpi-report";

// In bảng TỔNG HỢP KPI (1 dòng/thợ = số liệu cộng dồn trong tháng) — khác PrintStageReviewButton
// (in từng công việc). Cấu trúc cột khác nhau theo từng khâu (Nguội/Hột/TC dây/Resin) nên nhận
// cols/rows đã build sẵn từ production-stats.tsx thay vì tự biết về từng loại bảng.
//
// PrintKpiCol/PrintKpiRow đã chuyển sang app/lib/types/kpi-report.ts — bản in Đánh giá Khâu
// sắp dùng cùng hai kiểu này, để ở component thì thành khai báo cục bộ mà nơi khác phải import
// chéo vào thư mục _components của màn khác.
// rowKey: dùng làm React key khi 1 thợ có nhiều dòng in (VD Thủ công dây — 1 dòng/nhóm công việc).
// Lọc theo thợ vẫn dựa vào `crafter`, không phải rowKey.

export function PrintProductionStatsButton({
  tabLabel, month, year, cols, rows, crafterOptions, selectedCrafters,
}: {
  tabLabel: string;
  month: number;
  year: number;
  cols: PrintKpiCol[];
  rows: PrintKpiRow[];
  crafterOptions: string[];
  selectedCrafters: string[];
}) {
  const { printing, requestPrint } = usePrintFlow(() => {});

  const printRows = selectedCrafters.length === 0
    ? rows
    : rows.filter((r) => selectedCrafters.includes(r.crafter));

  return (
    <>
      <button
        type="button"
        disabled={printRows.length === 0}
        onClick={requestPrint}
        className="psx-btn-secondary"
        style={{ height: "30px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", opacity: printRows.length === 0 ? 0.5 : 1 }}
      >
        <Printer className="w-3.5 h-3.5" /> In / Xuất PDF
      </button>

      {printing && typeof document !== "undefined" && createPortal(
        <div id="print-report">
          <div className="pr-head">
            <h1>KPI Sản Xuất — Khâu {tabLabel}</h1>
            <div className="pr-sub">
              {selectedCrafters.length === 0
                ? `Tất cả thợ (${crafterOptions.length})`
                : selectedCrafters.length === 1
                ? selectedCrafters[0]
                : `${selectedCrafters.length} thợ: ${selectedCrafters.join(", ")}`}
              {" — "}Tháng {month}/{year}
            </div>
            <div className="pr-meta">Ngày xuất: {formatExportedAt()} · Tổng: {printRows.length} thợ</div>
          </div>
          <table className="pr-table">
            <thead>
              <tr>
                <th style={{ width: "28px" }}>#</th>
                {cols.map((c) => <th key={c.key} style={{ textAlign: c.align ?? "left" }}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {printRows.map((r, i) => (
                <tr key={r.rowKey ?? r.crafter}>
                  <td>{i + 1}</td>
                  {cols.map((c) => <td key={c.key} style={{ textAlign: c.align ?? "left" }}>{r.cells[c.key] ?? "—"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
        document.body,
      )}
    </>
  );
}
