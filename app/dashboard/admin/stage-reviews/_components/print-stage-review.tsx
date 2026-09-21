"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer } from "lucide-react";
import type { ReviewRow } from "@/app/lib/business/stage-review-rows";
import { usePrintFlow, formatExportedAt } from "@/app/lib/utils/print-helpers";
import { STAGE_REVIEW_FIELDS, STAGE_REVIEW_GROUPS, stageReviewPresets } from "./stage-review-fields";
import { useKpiQuota } from "@/app/lib/hooks/use-kpi-quota";
import type { NguoiKpiSummary } from "@/app/lib/business/kpi-nguoi";
import {
  summarizeNguoiReviewRows, nguoiSummaryStats, groupByCrafter, STAGE_SUMMARY_TITLE,
} from "@/app/lib/business/stage-review-summary";

// Một dòng in — công việc bình thường, hoặc dòng TỔNG (colSpan hết bảng) chèn ngay sau nhóm
// công việc của một thợ. Gộp cả hai vào MỘT mảng rồi render 1 bảng duy nhất — tránh lặp lại
// header 2 lần (2 bảng nối tiếp trông như 2 bản in dán lại, xem stage-review-summary.ts).
type PrintItem =
  | { kind: "row"; no: number; row: ReviewRow }
  | { kind: "total"; crafter: string; summary: NguoiKpiSummary };

function buildPrintItems(
  rows: ReviewRow[],
  showSummary: boolean,
  summaryByCrafter: Map<string, NguoiKpiSummary>,
): PrintItem[] {
  // Không cần tổng → giữ nguyên thứ tự gốc (theo thời gian làm việc), không gom nhóm lại.
  const groups = showSummary ? groupByCrafter(rows) : [{ crafter: null, items: rows }];
  const items: PrintItem[] = [];
  let no = 0;
  for (const g of groups) {
    for (const row of g.items) items.push({ kind: "row", no: ++no, row });
    const summary = g.crafter ? summaryByCrafter.get(g.crafter) : undefined;
    if (summary) items.push({ kind: "total", crafter: g.crafter as string, summary });
  }
  return items;
}

// In chi tiết TỪNG công việc (MO) của 1 thợ trong tháng — dùng đúng danh sách đã lọc sẵn
// trên màn Đánh giá Khâu (crafterFilter). User tự chọn cột hiển thị + khổ giấy, cùng pattern
// với In/Xuất PDF đơn hàng (print-report.tsx) để đồng bộ trải nghiệm trong hệ thống.
export function PrintStageReviewButton({
  rows, crafter, stageCode, stageLabel, month, year, isNguoiKhoa,
}: {
  rows: ReviewRow[];
  crafter: string; // "" = tất cả thợ (vẫn cho in, nhưng khuyến nghị chọn 1 thợ trước khi in)
  stageCode: string;
  stageLabel: string;
  month: number;
  year: number;
  isNguoiKhoa: boolean;
}) {
  const presets = stageReviewPresets(isNguoiKhoa);
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<string[]>(presets.full);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [withSummary, setWithSummary] = useState(true);
  const { printing, requestPrint } = usePrintFlow(() => setOpen(false));

  // ── Khối tổng KPI ở cuối bản in ──────────────────────────────────────────
  // Chỉ những khâu có trong bảng tra mới có khối tổng. Cấu hình ĐM tải LƯỜI: chỉ gọi API khi
  // hộp thoại In đang mở VÀ khâu này thực sự cần — mở màn Đánh giá Khâu không tốn request nào.
  const summaryTitle = STAGE_SUMMARY_TITLE[stageCode];
  const wantSummary  = Boolean(summaryTitle) && withSummary;
  const quota = useKpiQuota(year, month, wantSummary && (open || printing));
  const summaryRows = quota.cfg ? summarizeNguoiReviewRows(rows, quota.cfg) : [];
  const showSummary = wantSummary && summaryRows.length > 0;
  const summaryByCrafter = new Map(summaryRows.map(s => [s.crafter, s]));
  const printItems = buildPrintItems(rows, showSummary, summaryByCrafter);

  const availableFields = STAGE_REVIEW_FIELDS.filter((f) => isNguoiKhoa || !f.nguoiKhoaOnly);
  // Cột locked (VD "SO") luôn có mặt trong bản in dù có nằm trong `fields` hay không —
  // đảm bảo không bao giờ in thiếu cột bắt buộc.
  const cols = availableFields.filter((f) => f.locked || fields.includes(f.key));
  const toggle = (k: string) => {
    const f = availableFields.find((x) => x.key === k);
    if (f?.locked) return; // cột bắt buộc — không cho bỏ chọn
    setFields((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  };

  return (
    <>
      <button
        type="button"
        disabled={rows.length === 0}
        onClick={() => { setFields(presets.full); setOpen(true); }}
        className="psx-btn-secondary"
        style={{ height: "32px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", opacity: rows.length === 0 ? 0.5 : 1 }}
        title={crafter ? undefined : "Chọn 1 thợ ở bộ lọc để in đúng nhu cầu — hiện đang in tất cả thợ"}
      >
        <Printer className="w-3.5 h-3.5" /> In / Xuất PDF
      </button>

      {/* ── Modal chọn cột + khổ giấy ─────────────────────────────────────── */}
      {open && !printing && typeof document !== "undefined" && createPortal(
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--cream-card)", border: "1px solid var(--border)", borderRadius: "8px", width: "min(480px, 96vw)", maxHeight: "90vh", overflow: "auto", boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: "14px", fontWeight: 700 }}>In / Xuất PDF Đánh giá Khâu</span>
              <button type="button" onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)" }}><X className="w-4 h-4" /></button>
            </div>

            <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ fontSize: "11px", color: "var(--ink-muted)" }}>
                Khâu {stageLabel} — {crafter || "Tất cả thợ"} — Tháng {month}/{year}
              </div>

              {/* Preset + chọn cột (nhóm theo cụm) */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "10px", color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Cột hiển thị</span>
                  <button type="button" onClick={() => setFields(presets.full)} style={presetBtn}>Đầy đủ</button>
                  <button type="button" onClick={() => setFields(presets.summary)} style={presetBtn}>Tóm tắt</button>
                  <button type="button" onClick={() => setFields(availableFields.filter((f) => f.locked).map((f) => f.key))} style={presetBtn}>Bỏ chọn hết</button>
                  <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--ink-muted)" }}>Đã chọn <strong>{fields.length}</strong></span>
                </div>
                {STAGE_REVIEW_GROUPS.map((g) => {
                  const groupFields = availableFields.filter((f) => f.group === g.key);
                  if (groupFields.length === 0) return null;
                  return (
                    <div key={g.key} style={{ marginBottom: "10px" }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--ink)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{g.label}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
                        {groupFields.map((f) => (
                          <label key={f.key} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: f.locked ? "default" : "pointer" }}>
                            <input type="checkbox" checked={f.locked || fields.includes(f.key)} disabled={f.locked} onChange={() => toggle(f.key)} />
                            <span>{f.label}{f.locked && <span style={{ color: "var(--ink-muted)", fontSize: "10px" }}> (bắt buộc)</span>}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Hướng giấy */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px" }}>
                <span style={{ fontSize: "10px", color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Khổ giấy</span>
                <label style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                  <input type="radio" name="stage-orient" checked={orientation === "portrait"} onChange={() => setOrientation("portrait")} /> Dọc
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                  <input type="radio" name="stage-orient" checked={orientation === "landscape"} onChange={() => setOrientation("landscape")} /> Ngang
                </label>
                {fields.length > 8 && orientation === "portrait" && (
                  <span style={{ fontSize: "10px", color: "#d97706" }}>Nhiều cột — nên chọn khổ Ngang</span>
                )}
              </div>

              {/* Khối tổng — chỉ hiện tuỳ chọn ở những khâu có bảng tổng */}
              {summaryTitle && (
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}>
                    <input type="checkbox" checked={withSummary} onChange={() => setWithSummary(v => !v)} />
                    <span>Kèm dòng <strong>TỔNG</strong> cuối mỗi thợ ({summaryTitle})</span>
                  </label>
                  {withSummary && (
                    <div style={{ fontSize: "10px", color: "var(--ink-muted)", marginTop: "4px", lineHeight: 1.5 }}>
                      {quota.loading && "Đang tải ĐM/Tháng…"}
                      {quota.failed && <span style={{ color: "#d97706" }}>Không tải được ĐM/Tháng — bản in sẽ bỏ dòng TỔNG.</span>}
                      {!quota.loading && !quota.failed && (
                        <>Tổng cộng từ <strong>{rows.length}</strong> công việc đang lọc, tô đậm ngay dưới các dòng của
                        từng thợ. ĐM/Tháng là chỉ tiêu cả tháng, nên nếu danh sách chỉ là một phần của tháng thì Kết
                        quả % sẽ thấp hơn thực tế.</>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div style={{ fontSize: "11px", color: "var(--ink-muted)" }}>
                Sẽ in <strong>{rows.length}</strong> công việc. Trong hộp thoại in, chọn <strong>&quot;Lưu thành PDF&quot;</strong>.
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
              <button type="button" onClick={() => setOpen(false)} className="psx-btn-secondary" style={{ height: "32px", fontSize: "12px" }}>Đóng</button>
              <button
                type="button"
                disabled={rows.length === 0 || cols.length === 0}
                onClick={requestPrint}
                className="psx-btn-primary"
                style={{ height: "32px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", opacity: (rows.length === 0 || cols.length === 0) ? 0.5 : 1 }}
              >
                <Printer className="w-3.5 h-3.5" /> Xem trước & In
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Print view ────────────────────────────────────────────────────── */}
      {printing && typeof document !== "undefined" && createPortal(
        <div id="print-report">
          {orientation === "landscape" && <style>{"@media print { @page { size: A4 landscape; } }"}</style>}
          <div className="pr-head">
            <h1>Đánh giá Khâu {stageLabel}</h1>
            <div className="pr-sub">{crafter || "Tất cả thợ"} — Tháng {month}/{year}</div>
            <div className="pr-meta">Ngày xuất: {formatExportedAt()} · Tổng: {rows.length} công việc</div>
          </div>
          <table className="pr-table">
            <thead>
              <tr>
                <th style={{ width: "28px" }}>#</th>
                {cols.map((c) => <th key={c.key} style={{ textAlign: c.align ?? "left" }}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {printItems.map((item) => item.kind === "row" ? (
                <tr key={`${item.row.pdId}-${item.row.itemId}-${item.row.recordIndex}`}>
                  <td>{item.no}</td>
                  {cols.map((c) => <td key={c.key} style={{ textAlign: c.align ?? "left" }}>{c.accessor(item.row)}</td>)}
                </tr>
              ) : (
                // Hộp "Tổng hợp" — colSpan hết bảng chi tiết (số cột thay đổi theo cols đang
                // chọn), mỗi số liệu là một cặp nhãn:giá-trị rõ nghĩa (không viết tắt), cùng
                // ngôn ngữ hình ảnh với hộp Tổng hợp của bản in Đơn hàng (report-pdf.ts). Xem lý
                // do gộp vào 1 bảng thay vì dựng bảng riêng ở stage-review-summary.ts.
                <tr key={`total-${item.crafter}`} className="pr-total-row">
                  <td colSpan={cols.length + 1}>
                    <div className="pr-total-title">Tổng hợp — {item.crafter}</div>
                    <div className="pr-total-grid">
                      {nguoiSummaryStats(item.summary).map((stat) => (
                        <span key={stat.label} className="pr-total-stat">
                          <span className="pr-total-label">{stat.label}:</span>
                          <span className="pr-total-value">{stat.value}</span>
                        </span>
                      ))}
                    </div>
                  </td>
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

const presetBtn: React.CSSProperties = {
  fontSize: "11px", padding: "2px 8px", border: "1px solid var(--border)", borderRadius: "4px",
  background: "transparent", color: "var(--ink-muted)", cursor: "pointer",
};
