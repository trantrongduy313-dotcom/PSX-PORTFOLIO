"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, FileText } from "lucide-react";
import { REPORT_FIELDS, REPORT_GROUPS, REPORT_PRESETS, derivePeriodLabel, type ReportRow } from "./report-fields";
import { formatExportedAt } from "@/app/lib/utils/print-helpers";
import { computeTotals } from "./report-totals";
import { openReportPdf } from "./report-pdf";
import { toast } from "sonner";

// Tính năng Xuất PDF: chọn trường + meta → sinh PDF (pdfmake) → MỞ INLINE trên trình duyệt
// (xem ngay, tự tải/in từ trình xem PDF). Dữ liệu đã lọc (rows) trong bộ nhớ.
export function PrintReport({
  open, onClose, rows, filters,
}: {
  open: boolean;
  onClose: () => void;
  rows: ReportRow[];
  filters: Record<string, any>;
}) {
  const [fields, setFields] = useState<string[]>(REPORT_PRESETS.boss);
  const [title, setTitle] = useState("Báo cáo đơn hàng");
  const [period, setPeriod] = useState("");
  const [exporter, setExporter] = useState("");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");

  // Mở modal → điền sẵn nhãn kỳ báo cáo theo bộ lọc hiện tại
  useEffect(() => { if (open) setPeriod(derivePeriodLabel(filters)); }, [open, filters]);

  // Nhiều cột → tự bật khổ Ngang (gợi ý chủ động thay vì chỉ cảnh báo suông).
  // Một chiều: user vẫn tự chọn lại Dọc được, không ép ngược về Ngang.
  useEffect(() => {
    if (fields.length > 8) setOrientation((o) => (o === "portrait" ? "landscape" : o));
  }, [fields.length]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  // Cột locked (VD "SO") luôn có mặt trong bản in dù có nằm trong `fields` hay không —
  // đảm bảo không bao giờ in thiếu cột bắt buộc.
  const cols = REPORT_FIELDS.filter((f) => f.locked || fields.includes(f.key));
  const toggle = (k: string) => {
    const f = REPORT_FIELDS.find((x) => x.key === k);
    if (f?.locked) return; // cột bắt buộc — không cho bỏ chọn
    setFields((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  };
  const exportedAt = formatExportedAt();

  const handleExport = async () => {
    if (rows.length === 0 || cols.length === 0) return;
    const meta = `${exporter ? `Người xuất: ${exporter} · ` : ""}Ngày xuất: ${exportedAt} · Tổng: ${rows.length} MO`;
    try {
      await openReportPdf({ title, period, meta, cols, rows, totals: computeTotals(rows), orientation });
      onClose();
    } catch (err) {
      toast.error(`Tạo PDF thất bại: ${(err as Error)?.message ?? "Vui lòng thử lại"}`);
    }
  };

  return (
    <>
      {/* ── Modal chọn trường + meta ─────────────────────────────── */}
      {open && createPortal(
        <div
          onClick={onClose}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--cream-card)", border: "1px solid var(--border)", borderRadius: "8px", width: "min(560px, 96vw)", maxHeight: "90vh", overflow: "auto", boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: "14px", fontWeight: 700 }}>In / Xuất PDF báo cáo</span>
              <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)" }}><X className="w-4 h-4" /></button>
            </div>

            <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {/* Meta */}
              <label style={{ fontSize: "12px" }}>
                <span style={{ display: "block", fontSize: "10px", color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3px" }}>Tiêu đề</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="psx-input" style={{ width: "100%", fontSize: "13px" }} />
              </label>
              <label style={{ fontSize: "12px" }}>
                <span style={{ display: "block", fontSize: "10px", color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3px" }}>Kỳ báo cáo</span>
                <input value={period} onChange={(e) => setPeriod(e.target.value)} className="psx-input" style={{ width: "100%", fontSize: "13px" }} />
              </label>
              <label style={{ fontSize: "12px" }}>
                <span style={{ display: "block", fontSize: "10px", color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3px" }}>Người xuất (tùy chọn)</span>
                <input value={exporter} onChange={(e) => setExporter(e.target.value)} placeholder="Tên người báo cáo" className="psx-input" style={{ width: "100%", fontSize: "13px" }} />
              </label>

              {/* Preset + chọn cột (nhóm theo cụm) */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "10px", color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Cột hiển thị</span>
                  <button type="button" onClick={() => setFields(REPORT_PRESETS.boss)} style={presetBtn}>Báo cáo sếp</button>
                  <button type="button" onClick={() => setFields(REPORT_PRESETS.full)} style={presetBtn}>Đầy đủ</button>
                  <button type="button" onClick={() => setFields(REPORT_FIELDS.filter((f) => f.locked).map((f) => f.key))} style={presetBtn}>Bỏ chọn hết</button>
                  <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--ink-muted)" }}>Đã chọn <strong>{fields.length}</strong></span>
                </div>
                {REPORT_GROUPS.map((g) => {
                  const groupFields = REPORT_FIELDS.filter((f) => f.group === g.key);
                  return (
                    <div key={g.key} style={{ marginBottom: "10px" }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--ink)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{g.label}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
                        {groupFields.map((f) => (
                          <label key={f.key} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: f.locked ? "default" : "pointer" }}>
                            <input type="checkbox" checked={f.locked || fields.includes(f.key)} disabled={f.locked} onChange={() => toggle(f.key)} />
                            <span>{f.label}{f.locked && <span style={{ color: "var(--ink-muted)", fontSize: "10px" }}> (bắt buộc)</span>}{f.psxOnly && <span style={{ color: "var(--ink-muted)", fontSize: "10px" }}> (PSX)</span>}</span>
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
                  <input type="radio" name="orient" checked={orientation === "portrait"} onChange={() => setOrientation("portrait")} /> Dọc
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                  <input type="radio" name="orient" checked={orientation === "landscape"} onChange={() => setOrientation("landscape")} /> Ngang
                </label>
                {fields.length > 8 && orientation === "portrait" && (
                  <span style={{ fontSize: "10px", color: "#d97706" }}>
                    {fields.length} cột trên khổ Dọc — chữ sẽ rất nhỏ, nên chọn khổ Ngang
                  </span>
                )}
              </div>

              <div style={{ fontSize: "11px", color: "var(--ink-muted)" }}>
                Xuất <strong>{rows.length}</strong> MO (theo bộ lọc hiện tại). File PDF sẽ <strong>mở trên trình duyệt</strong> — xem trực tiếp, tải hoặc in từ đó.
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
              <button type="button" onClick={onClose} className="psx-btn-secondary" style={{ height: "32px", fontSize: "12px" }}>Đóng</button>
              <button
                type="button"
                disabled={rows.length === 0 || cols.length === 0}
                onClick={handleExport}
                className="psx-btn-primary"
                style={{ height: "32px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", opacity: (rows.length === 0 || cols.length === 0) ? 0.5 : 1 }}
              >
                <FileText className="w-3.5 h-3.5" /> Xem / Tải PDF
              </button>
            </div>
          </div>
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
