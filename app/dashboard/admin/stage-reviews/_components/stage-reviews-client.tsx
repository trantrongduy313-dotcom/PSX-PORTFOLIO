"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ReviewRow } from "@/app/lib/business/stage-review-rows";
import { STAGE_GROUP, STAGE_HAS_RECORDS, type StageCode } from "@/app/lib/business/production-stage";
import { normalizeSearch, formatDurationDisplay } from "@/app/lib/utils";
import { formatMoVersionedDisplay } from "@/app/lib/business/order-helpers";
import { PrintStageReviewButton } from "./print-stage-review";

// ── Styles ────────────────────────────────────────────────────────────────────

const TH: React.CSSProperties = {
  padding: "8px 10px", fontSize: "10px", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.07em",
  color: "var(--ink-muted)", background: "var(--cream-dark, #f0ebe3)",
  borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", textAlign: "center",
};
const THLeft: React.CSSProperties = { ...TH, textAlign: "left" };
const TD: React.CSSProperties = {
  padding: "8px 10px", fontSize: "13px",
  borderBottom: "1px solid var(--border-light, #f0ede8)",
  textAlign: "center", whiteSpace: "nowrap",
};
const TDLeft: React.CSSProperties = { ...TD, textAlign: "left" };
const LABEL: React.CSSProperties = {
  fontSize: "10px", fontWeight: 600, color: "var(--ink-muted)",
  textTransform: "uppercase", letterSpacing: "0.06em",
  display: "block", marginBottom: "4px",
};

// ── Constants ─────────────────────────────────────────────────────────────────

// Màn này CHỈ phục vụ đánh giá thợ khâu NGUỘI — không còn chọn khâu nữa.
//
// Trước đây có dropdown 7 khâu (Nguội, Khóa, Resin, Đúc, Gắn đá, ĐBXM, QC). Bỏ đi vì:
//   • Nghiệp vụ: Khóa và TC Nguội là khâu CON của Nguội, thợ Nguội làm cả ba → phải xem
//     chung một bảng thì mới đánh giá và tính công đúng, tách ra là sai bản chất.
//   • Các khâu còn lại chưa từng được đánh giá qua màn này; dữ liệu của chúng vẫn nằm
//     nguyên trong extraData và KPI vẫn đọc thẳng từ đó, nên bỏ khỏi đây không mất gì —
//     chỉ mất tiện ích sửa hàng loạt, mà màn Đơn hàng vẫn sửa được từng dòng.
const STAGE_GROUP_CODE = "NGUOI";

// Nhãn ngắn cho cột "Khâu" — cho biết dòng đến từ khâu con nào trong nhóm Nguội. Không dùng
// STAGE_LABEL của production-stage.ts vì nhãn ở đó có tiền tố số thứ tự ("[7] TC Nguội"),
// thừa và gây rối trong một bảng mà mọi dòng đều thuộc cùng một nhóm.
const STAGE_SHORT_LABEL: Record<string, string> = {
  NGUOI: "Nguội", TC_NGUOI: "TC Nguội", KHOA: "Khóa",
  // Khâu ngoài nhóm — thợ Nguội có lúc làm giúp, chỉ ghi nhận công chứ không đánh giá.
  DUC: "Đúc", RESIN: "Resin", TC_DAY: "TC Dây", HOT: "Hột",
  MOC: "Móc máy", DBXM: "ĐBXM", QC: "QC", DUYET_NK: "Duyệt NK",
  CHO_DX_NL: "Chờ ĐX NL", CHO_NL: "Chờ NL",
};

// Màu nền chip cột Khâu — Nguội (khâu chính) để trung tính, hai khâu con tô nhẹ để mắt
// nhận ra ngay dòng nào KHÔNG phải Nguội thuần khi rà bảng.
const STAGE_CHIP_BG: Record<string, string> = {
  NGUOI: "transparent", TC_NGUOI: "rgba(37,99,235,0.10)", KHOA: "rgba(217,119,6,0.12)",
};

// Chip cho dòng khâu NGOÀI nhóm — xám nhạt, tách bạch hẳn với ba khâu thuộc nhóm để không ai
// nhầm đây là việc cần đánh giá.
const OUTSIDE_CHIP_BG = "rgba(100,116,139,0.14)";

const STATUS_OPTS = [
  { val: "all",        label: "Tất cả"        },
  { val: "unreviewed", label: "Chưa đánh giá" },
  { val: "issue",      label: "Có vấn đề"     },
  { val: "reviewed",   label: "Đã đánh giá"   },
];

const MONTHS = ["01","02","03","04","05","06","07","08","09","10","11","12"];
const YEARS  = [2025, 2026, 2027];

// ── Types ─────────────────────────────────────────────────────────────────────

// Trạng thái "Đánh giá" khi áp dụng hàng loạt — 3 lựa chọn rõ ràng, tránh gộp chung
// "false = giữ nguyên" với "false = bỏ đánh giá" như checkbox cũ (nguồn gây lỗi bấm nhầm
// không hoàn tác được hàng loạt).
type BulkReviewMark = "keep" | "mark" | "unmark";

type EditValues = {
  coldworkQuality: string;
  coldworkTimeOk:  string;
  coldworkReason:  string;
  bachSP:          string;
  gioKpi:          string;
  ghiChuNguoi:     string;
  durationNote:    string;
};

// ── Duration helpers ──────────────────────────────────────────────────────────

// Quy 1 chuỗi durationNote ("2n 3g 20p") về tổng SỐ PHÚT — hàm gốc dùng chung cho parseDur
// (tách 1 dòng) và sumDurationMinutes (tổng nhiều dòng, phục vụ chip "Tổng thời gian").
// Phần "g" nhận cả số thập phân ("2.5g") — nếu chỉ bắt số nguyên, regex sẽ khớp nhầm vào
// phần lẻ sau dấu chấm ("2.5g" → bắt "5g" → tính sai gấp đôi).
function durationToMinutes(s: string | null | undefined): number {
  if (!s) return 0;
  let total = 0;
  const dn = s.match(/(\d+)n/); if (dn) total += parseInt(dn[1]) * 1440;
  const dh = s.match(/(\d+(?:\.\d+)?)g/); if (dh) total += parseFloat(dh[1]) * 60;
  const dm = s.match(/(\d+)p/); if (dm) total += parseInt(dm[1]);
  return total;
}

function parseDur(s: string | null | undefined): { h: number; m: number } {
  const total = durationToMinutes(s);
  return { h: Math.floor(total / 60), m: total % 60 };
}

function fmtManual(h: number, m: number): string {
  if (h === 0 && m === 0) return "";
  if (h === 0) return `${m}p`;
  if (m === 0) return `${h}g`;
  return `${h}g ${m}p`;
}

// Tổng số phút của nhiều dòng — dùng cho chip "Tổng thời gian" (theo bộ lọc Thợ hiện tại).
function sumDurationMinutes(rows: ReviewRow[]): number {
  return rows.reduce((sum, r) => sum + durationToMinutes(r.durationNote), 0);
}

// Format tổng phút → chuỗi hiển thị "Xh Yp" (giờ thẳng, không quy ra ngày — hợp tư duy KPI).
function formatTotalDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) return "—";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}p`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}p`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function hasIssue(r: ReviewRow): boolean {
  return r.coldworkQuality === "Không đạt"
    || r.coldworkTimeOk === "Không đạt"
    || Boolean(r.coldworkReason);
}

function rowKey(r: ReviewRow) { return `${r.pdId}-${r.itemId}-${r.recordIndex}`; }

// Tìm dòng CHƯA đánh giá kế tiếp sau `current` trong `rows` — hàm thuần, dùng để tự động
// nhảy sang MO tiếp theo sau "Lưu & Đánh giá" (độc lập khỏi mutation/side-effect).
function findNextUnreviewed(rows: ReviewRow[], current: ReviewRow): ReviewRow | undefined {
  const curIdx = rows.findIndex(r => r.pdId === current.pdId && r.itemId === current.itemId && r.recordIndex === current.recordIndex);
  return rows.slice(curIdx + 1).find(r => !r.reviewedAt);
}

// Suy phần body liên quan "reviewedAt" từ lựa chọn bulk — hàm thuần, dễ test độc lập.
// "keep" → không gửi key reviewedAt (API giữ nguyên); "mark"/"unmark" → gửi timestamp/null.
function reviewedAtPayload(mark: BulkReviewMark): { reviewedAt?: string | null } {
  if (mark === "mark")   return { reviewedAt: new Date().toISOString() };
  if (mark === "unmark") return { reviewedAt: null };
  return {};
}

// Sentinel cho dropdown Chất lượng/Thời gian — phân biệt "Giữ nguyên" (value="", không gửi
// key) với "Bỏ trống, chưa đánh giá" (value=BULK_CLEAR, gửi key với null để XOÁ giá trị cũ).
const BULK_CLEAR = "__clear__";

// Suy giá trị thật sẽ gửi lên server từ lựa chọn dropdown — hàm thuần.
// undefined = không gửi field này (giữ nguyên); null = xoá về trống; string = gán giá trị.
function bulkFieldValue(selected: string): string | null | undefined {
  if (selected === "") return undefined;
  if (selected === BULK_CLEAR) return null;
  return selected;
}

// Đã xoá về trống bất kỳ field nào chưa? Dùng để tự kèm "Bỏ đánh giá" — MO có Chất lượng/
// Thời gian trống thì không còn hợp lý giữ dấu "Đã đánh giá".
function hasAnyClearedField(...selections: string[]): boolean {
  return selections.includes(BULK_CLEAR);
}

// Đánh giá hiệu lực khi áp dụng — có field bị xoá trống thì LUÔN bỏ đánh giá,
// bất kể dropdown "Đánh giá" đang chọn gì (tránh trạng thái nửa vời: field trống nhưng
// vẫn còn dấu ✓ Đã đánh giá).
function effectiveReviewMark(mark: BulkReviewMark, anyFieldCleared: boolean): BulkReviewMark {
  return anyFieldCleared ? "unmark" : mark;
}

// Thông báo xác nhận ngắn sau khi áp dụng hàng loạt — để user biết chắc vừa làm gì.
function bulkResultMessage(mark: BulkReviewMark, count: number, anyFieldCleared: boolean): string {
  if (anyFieldCleared) return `Đã bỏ trống đánh giá cho ${count} MO.`;
  if (mark === "mark")   return `Đã đánh dấu Đã đánh giá cho ${count} MO.`;
  if (mark === "unmark") return `Đã bỏ đánh giá cho ${count} MO.`;
  return `Đã áp dụng cho ${count} MO.`;
}

function initEdit(r: ReviewRow): EditValues {
  return {
    coldworkQuality: r.coldworkQuality ?? "",
    coldworkTimeOk:  r.coldworkTimeOk  ?? "",
    coldworkReason:  r.coldworkReason  ?? "",
    bachSP:          r.bachSP          ?? "",
    gioKpi:          r.gioKpi          ?? "",
    ghiChuNguoi:     r.ghiChuNguoi     ?? "",
    durationNote:    r.durationNote    ?? "",
  };
}

// ── ResultBadge — summary column replacing 5 assessment columns ───────────────

function ResultBadge({ r }: { r: ReviewRow }) {
  const issue        = hasIssue(r);
  const hasAny       = !!(r.coldworkQuality || r.coldworkTimeOk || r.bachSP || r.gioKpi);

  if (!hasAny) return <span style={{ color: "var(--ink-muted)", fontSize: "11px" }}>—</span>;

  if (issue) {
    const failed: string[] = [];
    if (r.coldworkQuality === "Không đạt") failed.push("Chất lượng");
    if (r.coldworkTimeOk  === "Không đạt") failed.push("TG SX");
    return (
      <div style={{ textAlign: "left" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, color: "#dc2626" }}>
          ⚠ {failed.join(" · ")}
        </span>
        {r.coldworkReason && (
          <span title={r.coldworkReason} style={{
            display: "block", fontSize: "10px", color: "#b45309",
            maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{r.coldworkReason}</span>
        )}
        {(r.bachSP || r.gioKpi) && (
          <span style={{ display: "block", fontSize: "10px", color: "var(--ink-muted)" }}>
            {r.bachSP ? `Bậc ${r.bachSP}` : ""}
            {r.bachSP && r.gioKpi ? " · " : ""}
            {r.gioKpi ? `${r.gioKpi}h KPI` : ""}
          </span>
        )}
      </div>
    );
  }

  const parts: string[] = [];
  if (r.coldworkQuality === "Đạt" && r.coldworkTimeOk === "Đạt") parts.push("Đạt");
  else if (r.coldworkQuality === "Đạt") parts.push("CL Đạt");
  else if (r.coldworkTimeOk  === "Đạt") parts.push("TG Đạt");
  if (r.bachSP) parts.push(`Bậc ${r.bachSP}`);
  if (r.gioKpi) parts.push(`${r.gioKpi}h KPI`);

  return (
    <span style={{ fontSize: "11px", fontWeight: 600, color: "#15803d" }}>
      {parts.join(" · ")}
    </span>
  );
}

// ── EditForm ──────────────────────────────────────────────────────────────────

function EditForm({
  row, stage, vals, isSaving, onChange, onSave, onSaveAndReview, onCancel,
}: {
  row: ReviewRow; stage: string; vals: EditValues; isSaving: boolean;
  onChange: (v: Partial<EditValues>) => void;
  onSave: () => void; onSaveAndReview: () => void; onCancel: () => void;
}) {
  // `stage` ở đây là KHÂU GỐC CỦA DÒNG (NGUOI | TC_NGUOI | KHOA), không phải khâu đang xem —
  // cả ba cùng hiển thị trên một bảng nên form phải bám theo dòng, không bám theo màn hình.
  const isNguoiKhoa = STAGE_GROUP[stage as StageCode] === "NGUOI";
  // "Ghi chú" nằm trong records[] (khoá `ghiChu`), nên chỉ có ở khâu dùng records.
  // KHOA còn ở dạng scalar và chưa từng có trường này → ẩn, đúng như trước.
  const hasGhiChu = STAGE_HAS_RECORDS.has(stage);

  const inp: React.CSSProperties = {
    fontSize: "12px", padding: "5px 8px",
    border: "1px solid var(--border)", borderRadius: "5px",
    background: "var(--cream)", color: "var(--ink)", width: "100%",
  };
  const sel: React.CSSProperties = { ...inp, cursor: "pointer" };
  const row1: React.CSSProperties = { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" };

  const durH  = vals.durationNote ? parseDur(vals.durationNote).h : "";
  const durM  = vals.durationNote ? parseDur(vals.durationNote).m : "";

  return (
    <div style={{
      padding: "12px 20px 14px 28px",
      background: "rgba(0,0,0,0.018)",
      borderLeft: "3px solid var(--ink)",
    }}>
      {/* MO header */}
      <div style={{ display: "flex", gap: "14px", marginBottom: "10px", alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 700 }}>{formatMoVersionedDisplay(row.moNumber, row.isFromWebapp)}</span>
        {row.productName && <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>{row.productName}</span>}
        {row.crafter     && <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>Thợ: {row.crafter}</span>}
        <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>Phần phụ trách: <strong style={{ color: "var(--ink)", fontWeight: 600 }}>{row.phan || "—"}</strong></span>
        <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>HT: {fmtDate(row.doneAt)}</span>
      </div>

      {/* Row 1 — assessment fields (NGUOI/KHOA only) */}
      {isNguoiKhoa && (
        <div style={{ ...row1, marginBottom: "8px" }}>
          <div style={{ minWidth: "118px" }}>
            <label style={LABEL}>Chất lượng SP</label>
            <select value={vals.coldworkQuality} onChange={e => onChange({ coldworkQuality: e.target.value })} style={sel} disabled={isSaving}>
              <option value="">-- Chọn --</option>
              <option value="Đạt">Đạt</option>
              <option value="Không đạt">Không đạt</option>
            </select>
          </div>

          <div style={{ minWidth: "118px" }}>
            <label style={LABEL}>Thời gian SX</label>
            <select value={vals.coldworkTimeOk} onChange={e => onChange({ coldworkTimeOk: e.target.value })} style={sel} disabled={isSaving}>
              <option value="">-- Chọn --</option>
              <option value="Đạt">Đạt</option>
              <option value="Không đạt">Không đạt</option>
            </select>
          </div>

          <div style={{ minWidth: "90px" }}>
            <label style={LABEL}>Bậc SP</label>
            <select value={vals.bachSP} onChange={e => onChange({ bachSP: e.target.value })} style={sel} disabled={isSaving}>
              <option value="">--</option>
              {["1","2","3","4","5"].map(v => <option key={v} value={v}>Bậc {v}</option>)}
            </select>
          </div>

          <div>
            <label style={LABEL}>Giờ KPI</label>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <input
                type="number" min={0} max={999} step={0.5}
                value={vals.gioKpi ? (parseFloat(vals.gioKpi) || "") : ""}
                placeholder="0"
                disabled={isSaving}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  onChange({ gioKpi: !isNaN(v) && v > 0 ? String(v) : "" });
                }}
                style={{ ...inp, width: "58px", textAlign: "right" }}
              />
              <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>giờ</span>
            </div>
          </div>
        </div>
      )}

      {/* Row 2 — detail fields */}
      <div style={{ ...row1 }}>
        {isNguoiKhoa && (
          <div style={{ minWidth: "180px", flex: 2 }}>
            <label style={LABEL}>Lý do</label>
            <input
              type="text" value={vals.coldworkReason}
              placeholder="Ghi lý do nếu có..."
              disabled={isSaving}
              onChange={e => onChange({ coldworkReason: e.target.value })}
              style={inp}
            />
          </div>
        )}

        {isNguoiKhoa && hasGhiChu && (
          <div style={{ minWidth: "160px", flex: 2 }}>
            <label style={LABEL}>Ghi chú</label>
            <input
              type="text" value={vals.ghiChuNguoi}
              placeholder="Ghi chú..."
              disabled={isSaving}
              onChange={e => onChange({ ghiChuNguoi: e.target.value })}
              style={inp}
            />
          </div>
        )}

        <div style={{ minWidth: "150px", flexShrink: 0 }}>
          <label style={LABEL}>Số giờ thực tế</label>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <input
              type="number" min={0} max={999}
              value={durH}
              placeholder="0"
              disabled={isSaving}
              onChange={e => {
                const { m } = parseDur(vals.durationNote);
                const newH = e.target.value === "" ? 0 : Math.max(0, parseInt(e.target.value) || 0);
                onChange({ durationNote: fmtManual(newH, m) });
              }}
              style={{ ...inp, width: "56px", textAlign: "right" }}
            />
            <span style={{ fontSize: "11px", color: "var(--ink-muted)", flexShrink: 0 }}>giờ</span>
            <input
              type="number" min={0} max={59}
              value={durM}
              placeholder="0"
              disabled={isSaving}
              onChange={e => {
                const { h } = parseDur(vals.durationNote);
                const newM = e.target.value === "" ? 0 : Math.min(59, Math.max(0, parseInt(e.target.value) || 0));
                onChange({ durationNote: fmtManual(h, newM) });
              }}
              style={{ ...inp, width: "56px", textAlign: "right" }}
            />
            <span style={{ fontSize: "11px", color: "var(--ink-muted)", flexShrink: 0 }}>phút</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "8px", marginTop: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={onSave} disabled={isSaving} style={{
          padding: "5px 14px", fontSize: "12px", fontWeight: 600, cursor: isSaving ? "wait" : "pointer",
          border: "1px solid var(--border)", borderRadius: "6px",
          background: "var(--cream-card)", color: "var(--ink)",
        }}>
          {isSaving ? "Đang lưu..." : "Lưu"}
        </button>

        <button onClick={onSaveAndReview} disabled={isSaving} style={{
          padding: "5px 14px", fontSize: "12px", fontWeight: 600, cursor: isSaving ? "wait" : "pointer",
          border: "none", borderRadius: "6px",
          background: row.reviewedAt ? "rgba(22,163,74,0.15)" : "var(--ink)",
          color: row.reviewedAt ? "#15803d" : "var(--cream)",
        }}>
          {row.reviewedAt ? "✓ Đã đánh giá · Lưu lại" : "Lưu & Đánh giá ✓"}
        </button>

        {row.reviewedAt && (
          <button onClick={onSave} disabled={isSaving} title="Bỏ đánh giá" style={{
            padding: "5px 10px", fontSize: "11px", cursor: isSaving ? "wait" : "pointer",
            border: "1px solid var(--border)", borderRadius: "6px",
            background: "transparent", color: "var(--ink-muted)",
          }}>
            Bỏ đánh giá
          </button>
        )}

        <button onClick={onCancel} disabled={isSaving} style={{
          padding: "5px 14px", fontSize: "12px", cursor: "pointer",
          border: "1px solid var(--border)", borderRadius: "6px",
          background: "transparent", color: "var(--ink-muted)", marginLeft: "4px",
        }}>
          Hủy
        </button>

        {row.reviewedAt && (
          <span style={{ fontSize: "10px", color: "var(--ink-muted)", marginLeft: "4px" }}>
            Đã đánh giá lúc {fmtDateTime(row.reviewedAt)}{row.reviewedBy ? ` · ${row.reviewedBy}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function StageReviewsClient({
  defaultMonth, defaultYear,
}: { defaultMonth: number; defaultYear: number }) {
  const [month,        setMonth]        = useState(defaultMonth);
  const [year,         setYear]         = useState(defaultYear);
  // Không còn state — màn này cố định ở nhóm Nguội (xem ghi chú ở STAGE_GROUP_CODE).
  const stage = STAGE_GROUP_CODE;
  const [statusFilter, setStatusFilter] = useState("all");
  const [search,       setSearch]       = useState("");
  const [crafterFilter, setCrafterFilter] = useState("");
  const [expandedKey,  setExpandedKey]  = useState<string | null>(null);
  const [editValues,   setEditValues]   = useState<EditValues | null>(null);

  // Đánh giá hàng loạt (chỉ khâu Nguội) — chọn nhiều dòng rồi áp cùng lúc để tiết kiệm thời gian.
  const [selectedKeys,   setSelectedKeys]   = useState<Set<string>>(new Set());
  const [bulkQuality,    setBulkQuality]    = useState(""); // "" = giữ nguyên
  const [bulkTimeOk,     setBulkTimeOk]     = useState("");
  const [bulkReviewMark, setBulkReviewMark] = useState<BulkReviewMark>("keep");
  const [bulkMessage,    setBulkMessage]    = useState<string | null>(null);

  const queryClient = useQueryClient();
  const queryKey    = ["stage-reviews", stage, month, year] as const;

  const { data, isFetching, isError } = useQuery<{ rows: ReviewRow[] }>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/admin/stage-reviews?stage=${stage}&month=${month}&year=${year}`);
      if (!res.ok) throw new Error("Lỗi tải dữ liệu");
      return res.json();
    },
    staleTime: 2 * 60_000,
  });

  // ── Optimistic UI: đổi giao diện NGAY khi bấm, đồng bộ server chạy nền, chỉ
  // rollback khi lỗi — người dùng không phải chờ round-trip mới thấy kết quả.

  // Chụp/khôi phục cache — dùng chung cho mọi mutation cần rollback khi lỗi.
  function snapshotRows(): { rows: ReviewRow[] } | undefined {
    return queryClient.getQueryData<{ rows: ReviewRow[] }>(queryKey);
  }
  function restoreRows(snapshot: { rows: ReviewRow[] } | undefined) {
    if (snapshot) queryClient.setQueryData(queryKey, snapshot);
  }

  const { mutate: toggleReview, isPending: isToggling } = useMutation({
    mutationFn: async (row: ReviewRow) => {
      const reviewedAt = row.reviewedAt ? null : new Date().toISOString();
      const res = await fetch("/api/admin/stage-reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdId: row.pdId, itemId: row.itemId, stageCode: row.stageCode, recordIndex: row.recordIndex, reviewedAt }),
      });
      if (!res.ok) throw new Error("Lỗi cập nhật");
      const json = await res.json();
      return { ...row, reviewedAt: json.updated.reviewedAt };
    },
    onMutate: (row) => {
      const snapshot = snapshotRows();
      const reviewedAt = row.reviewedAt ? null : new Date().toISOString();
      patchCache({ pdId: row.pdId, itemId: row.itemId, stageCode: row.stageCode, recordIndex: row.recordIndex, reviewedAt });
      return { snapshot };
    },
    onError: (_err, _row, ctx) => {
      restoreRows(ctx?.snapshot);
      toast.error("Cập nhật đánh giá thất bại — vui lòng thử lại.");
    },
    onSuccess: (updated) => patchCache(updated), // đồng bộ đúng timestamp server (nếu lệch)
  });

  const { mutate: saveEdit, isPending: isSaving } = useMutation({
    mutationFn: async ({ row, vals, andReview, unReview }: {
      row: ReviewRow; vals: EditValues; andReview?: boolean; unReview?: boolean;
    }) => {
      const body: Record<string, unknown> = {
        pdId: row.pdId, itemId: row.itemId, stageCode: row.stageCode, recordIndex: row.recordIndex,
        fields: {
          coldworkQuality: vals.coldworkQuality || null,
          coldworkTimeOk:  vals.coldworkTimeOk  || null,
          coldworkReason:  vals.coldworkReason  || null,
          bachSP:          vals.bachSP          || null,
          gioKpi:          vals.gioKpi          || null,
          ghiChuNguoi:     vals.ghiChuNguoi     || null,
          durationNote:    vals.durationNote    || null,
        },
      };
      if (andReview) body.reviewedAt = new Date().toISOString();
      if (unReview)  body.reviewedAt = null;
      const res = await fetch("/api/admin/stage-reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Lỗi lưu dữ liệu");
      const json = await res.json();
      return { ...row, ...json.updated };
    },
    onMutate: ({ row, vals, andReview, unReview }) => {
      const snapshot = snapshotRows();
      const reviewedAt = andReview ? new Date().toISOString() : unReview ? null : undefined;
      patchCache({
        pdId: row.pdId, itemId: row.itemId, stageCode: row.stageCode, recordIndex: row.recordIndex,
        coldworkQuality: vals.coldworkQuality || null,
        coldworkTimeOk:  vals.coldworkTimeOk  || null,
        coldworkReason:  vals.coldworkReason  || null,
        bachSP:          vals.bachSP          || null,
        gioKpi:          vals.gioKpi          || null,
        ghiChuNguoi:     vals.ghiChuNguoi     || null,
        durationNote:    vals.durationNote    || null,
        ...(reviewedAt !== undefined ? { reviewedAt } : {}),
      });

      // "Lưu & Đánh giá" tự nhảy sang MO chưa đánh giá kế tiếp (dựa trên danh sách TRƯỚC
      // khi patch, để tìm đúng dòng kế tiếp không phải chính dòng vừa lưu).
      if (andReview) {
        const next = findNextUnreviewed(snapshot?.rows ?? [], row);
        if (next) { setExpandedKey(rowKey(next)); setEditValues(initEdit(next)); }
        else { setExpandedKey(null); setEditValues(null); }
      } else {
        setExpandedKey(null);
        setEditValues(null);
      }

      return { snapshot, row, vals };
    },
    onError: (_err, _vars, ctx) => {
      restoreRows(ctx?.snapshot);
      if (ctx) {
        // Mở lại đúng dòng lỗi, khôi phục giá trị đang nhập — user không mất dữ liệu vừa gõ.
        setExpandedKey(rowKey(ctx.row));
        setEditValues(ctx.vals);
      }
      toast.error("Lưu đánh giá thất bại — vui lòng thử lại.");
    },
    onSuccess: (updated) => patchCache(updated), // đồng bộ lại field/timestamp chính xác từ server
  });

  const { mutate: bulkReview, isPending: isBulkSaving } = useMutation({
    mutationFn: async (targets: ReviewRow[]) => {
      const fields: Record<string, string | null> = {};
      const qualityVal = bulkFieldValue(bulkQuality);
      const timeOkVal  = bulkFieldValue(bulkTimeOk);
      if (qualityVal !== undefined) fields.coldworkQuality = qualityVal;
      if (timeOkVal  !== undefined) fields.coldworkTimeOk  = timeOkVal;
      const anyFieldCleared = hasAnyClearedField(bulkQuality, bulkTimeOk);
      const body: Record<string, unknown> = {
        targets: targets.map(r => ({ pdId: r.pdId, itemId: r.itemId, stageCode: r.stageCode, recordIndex: r.recordIndex })),
        ...(Object.keys(fields).length ? { fields } : {}),
        ...reviewedAtPayload(effectiveReviewMark(bulkReviewMark, anyFieldCleared)),
      };
      const res = await fetch("/api/admin/stage-reviews", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Lỗi cập nhật hàng loạt");
      const json = await res.json();
      return json.updated as Array<Partial<ReviewRow> & { pdId: string; itemId: string; stageCode: string; recordIndex: number }>;
    },
    onSuccess: (updatedList) => {
      showBulkMessage(bulkResultMessage(bulkReviewMark, updatedList.length, hasAnyClearedField(bulkQuality, bulkTimeOk)));
      for (const u of updatedList) patchCache(u);
      resetBulkSelection();
    },
  });

  // Xoá lựa chọn hàng loạt + trả các dropdown bulk về mặc định — dùng khi đổi khâu/tháng/năm
  // (tránh giá trị cũ vô tình áp dụng nhầm cho danh sách MO mới).
  function resetBulkSelection() {
    setSelectedKeys(new Set());
    setBulkQuality("");
    setBulkTimeOk("");
    setBulkReviewMark("keep");
  }

  // Hiện thông báo kết quả hàng loạt, tự ẩn sau 4s — để user biết chắc vừa làm gì mà
  // không phải thêm modal/toast library.
  function showBulkMessage(msg: string) {
    setBulkMessage(msg);
    setTimeout(() => setBulkMessage((cur) => (cur === msg ? null : cur)), 4000);
  }

  // Ngưỡng cần xác nhận trước khi áp dụng — tránh bấm nhầm ảnh hưởng số lượng lớn MO.
  const BULK_CONFIRM_THRESHOLD = 20;

  function handleApplyBulk() {
    if (selectedRows.length > BULK_CONFIRM_THRESHOLD) {
      const ok = window.confirm(`Áp dụng cho ${selectedRows.length} MO — bạn chắc chứ?`);
      if (!ok) return;
    }
    bulkReview(selectedRows);
  }

  function patchCache(updated: Partial<ReviewRow> & { pdId: string; itemId: string; stageCode: string; recordIndex: number }) {
    queryClient.setQueryData(queryKey, (old: { rows: ReviewRow[] } | undefined) => {
      if (!old) return old;
      return { ...old, rows: old.rows.map(r =>
        r.pdId === updated.pdId && r.itemId === updated.itemId && r.stageCode === updated.stageCode && r.recordIndex === updated.recordIndex
          ? { ...r, ...updated } : r
      )};
    });
  }

  function handleRowClick(r: ReviewRow, e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-review-btn]")) return;
    // Dòng khâu ngoài nhóm chỉ để ghi nhận công — không có form đánh giá để mở.
    if (r.isOutsideGroup) return;
    const key = rowKey(r);
    if (expandedKey === key) {
      setExpandedKey(null); setEditValues(null);
    } else {
      setExpandedKey(key); setEditValues(initEdit(r));
    }
  }

  const allRows = data?.rows ?? [];

  // Danh sách thợ (distinct) trong kỳ hiện tại — nguồn cho dropdown lọc theo Thợ.
  const crafterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) if (r.crafter?.trim()) set.add(r.crafter.trim());
    return [...set].sort((a, b) => a.localeCompare(b, "vi"));
  }, [allRows]);

  // scopedRows = allRows lọc theo Thợ + search (CHƯA gồm statusFilter) — dùng cho thống kê,
  // để số liệu phản ánh đúng phạm vi đang xem (vd chọn 1 thợ → thấy tổng/chưa đánh giá của thợ đó).
  const scopedRows = useMemo(() => {
    const q = normalizeSearch(search);
    return allRows.filter(r => {
      if (crafterFilter && r.crafter !== crafterFilter) return false;
      if (q) {
        // Gồm cả dạng hiển thị (formatMoVersionedDisplay, "_") để user gõ tìm đúng theo cái
        // đang thấy trên màn hình cũng khớp được với dữ liệu gốc (có thể vẫn là ".").
        const hay = normalizeSearch(`${r.moNumber ?? ""} ${formatMoVersionedDisplay(r.moNumber, r.isFromWebapp)} ${r.productName ?? ""} ${r.crafter ?? ""}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, crafterFilter, search]);

  const filteredRows = useMemo(() => {
    if (statusFilter === "unreviewed") return scopedRows.filter(r => !r.reviewedAt);
    if (statusFilter === "issue")      return scopedRows.filter(r => hasIssue(r));
    if (statusFilter === "reviewed")   return scopedRows.filter(r => Boolean(r.reviewedAt));
    return scopedRows;
  }, [scopedRows, statusFilter]);

  // Màn chỉ còn nhóm Nguội nên hai cờ này luôn bật — giữ tên biến để phần JSX bên dưới không
  // phải sửa hàng loạt, nhưng không còn là điều kiện động nữa.
  const isNguoiKhoa = true;
  const bulkEnabled = true;
  // Cột: checkbox + # + Khâu + MO# + SP + Thợ + Ngày HT + TG + Kết quả + Đánh giá
  const colCount = 10;

  // Dòng ĐÁNH GIÁ ĐƯỢC = thuộc nhóm Nguội. Dòng khâu ngoài nhóm chỉ ghi nhận công nên phải
  // loại khỏi cả chọn hàng loạt lẫn thống kê — nếu tính vào, chúng luôn ở trạng thái "chưa
  // đánh giá" và kéo tụt tỷ lệ hoàn thành xuống mãi mãi dù không ai làm gì sai.
  const reviewableRows = useMemo(() => scopedRows.filter(r => !r.isOutsideGroup), [scopedRows]);
  const selectableRows = useMemo(() => filteredRows.filter(r => !r.isOutsideGroup), [filteredRows]);

  // Dòng đã chọn = giao selectedKeys với dòng ĐANG hiển thị (an toàn: không áp lên dòng đã bị lọc ẩn).
  const selectedRows = useMemo(
    () => selectableRows.filter(r => selectedKeys.has(rowKey(r))),
    [selectableRows, selectedKeys],
  );
  const allFilteredSelected = selectableRows.length > 0 && selectableRows.every(r => selectedKeys.has(rowKey(r)));

  const total      = reviewableRows.length;
  const reviewed   = reviewableRows.filter(r => r.reviewedAt).length;
  const issues     = reviewableRows.filter(r => hasIssue(r)).length;
  const unreviewed = total - reviewed;
  const pct        = total > 0 ? Math.round(reviewed / total * 100) : 0;
  // scopedRows đã lọc theo Thợ + tìm kiếm — chọn 1 thợ → tổng giờ của thợ đó; để "Tất cả
  // thợ" → tổng giờ mọi thợ. Tự đổi theo tháng/năm/khâu đang xem (không cần logic lọc riêng).
  const totalDurationMinutes = useMemo(() => sumDurationMinutes(scopedRows), [scopedRows]);

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <label style={{ ...LABEL, marginBottom: 0 }}>Tháng</label>
          <select value={month} onChange={e => { setMonth(Number(e.target.value)); resetBulkSelection(); }} className="psx-input" style={{ fontSize: "13px", width: "72px" }}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{i + 1}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <label style={{ ...LABEL, marginBottom: 0 }}>Năm</label>
          <select value={year} onChange={e => { setYear(Number(e.target.value)); resetBulkSelection(); }} className="psx-input" style={{ fontSize: "13px", width: "88px" }}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Lọc theo Thợ — chọn 1 thợ để đánh giá liền mạch tất cả đơn của thợ đó */}
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <label style={{ ...LABEL, marginBottom: 0 }}>Thợ</label>
          <select value={crafterFilter} onChange={e => setCrafterFilter(e.target.value)} className="psx-input" style={{ fontSize: "13px", width: "160px" }}>
            <option value="">Tất cả thợ</option>
            {crafterOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Tìm nhanh theo MO# / sản phẩm / tên thợ (bỏ dấu) */}
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flex: "1 1 200px", minWidth: "180px" }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm MO#, sản phẩm, thợ…"
            className="psx-input"
            style={{ fontSize: "13px", width: "100%" }}
          />
          {(search || crafterFilter) && (
            <button
              type="button"
              onClick={() => { setSearch(""); setCrafterFilter(""); }}
              style={{ fontSize: "11px", color: "var(--ink-muted)", background: "transparent", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
            >Xóa lọc</button>
          )}
        </div>

        <div style={{ height: "24px", width: "1px", background: "var(--border)", margin: "0 2px" }} />

        <div style={{ display: "flex", gap: "4px" }}>
          {STATUS_OPTS.map(opt => (
            <button key={opt.val} onClick={() => setStatusFilter(opt.val)} style={{
              padding: "4px 10px", fontSize: "11px",
              fontWeight: statusFilter === opt.val ? 700 : 400,
              border: `1px solid ${statusFilter === opt.val ? "var(--ink)" : "var(--border)"}`,
              borderRadius: "5px",
              background: statusFilter === opt.val ? "var(--ink)" : "transparent",
              color: statusFilter === opt.val ? "var(--cream)" : "var(--ink-muted)",
              cursor: "pointer", whiteSpace: "nowrap",
            }}>{opt.label}</button>
          ))}
        </div>

        <div style={{ marginLeft: "auto" }}>
          <PrintStageReviewButton
            rows={scopedRows}
            crafter={crafterFilter}
            stageCode={stage}
            stageLabel="Nguội"
            month={month}
            year={year}
            isNguoiKhoa={isNguoiKhoa}
          />
        </div>

        {isFetching && <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>Đang tải...</span>}
        {isError    && <span style={{ fontSize: "11px", color: "var(--s-red,#dc2626)" }}>Lỗi tải dữ liệu</span>}
      </div>

      {/* Progress + summary */}
      {total > 0 && (
        <div style={{ marginBottom: "16px" }}>
          {/* Progress bar */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
            <div style={{ flex: 1, height: "6px", background: "var(--border)", borderRadius: "3px", overflow: "hidden", maxWidth: "360px" }}>
              <div style={{
                height: "100%", width: `${pct}%`, borderRadius: "3px",
                background: issues > 0 ? "linear-gradient(90deg, #16a34a, #ca8a04)" : "#16a34a",
                transition: "width 0.4s ease",
              }} />
            </div>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap" }}>
              {reviewed}/{total} đã đánh giá ({pct}%)
            </span>
            {issues > 0 && (
              <span style={{ fontSize: "11px", color: "#dc2626", whiteSpace: "nowrap" }}>
                · {issues} có vấn đề
              </span>
            )}
            {reviewed === total && total > 0 && (
              <span style={{ fontSize: "11px", color: "#16a34a", fontWeight: 600 }}>✓ Hoàn tất</span>
            )}
          </div>

          {/* Summary chips */}
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            {[
              { label: "Tổng",          val: total,      color: "var(--ink)" },
              { label: "Chưa đánh giá", val: unreviewed, color: unreviewed > 0 ? "var(--ink)" : "var(--ink-muted)" },
              { label: "Có vấn đề",     val: issues,     color: issues > 0 ? "#dc2626" : "var(--ink-muted)" },
              { label: "Đã đánh giá",   val: reviewed,   color: reviewed > 0 ? "#15803d" : "var(--ink-muted)" },
              { label: "Tổng thời gian", val: formatTotalDuration(totalDurationMinutes), color: "var(--ink)" },
            ].map(item => (
              <div key={item.label} style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                <span style={{ fontSize: "18px", fontWeight: 600, color: item.color, lineHeight: 1 }}>{item.val}</span>
                <span style={{ fontSize: "10px", color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Thanh đánh giá HÀNG LOẠT — chỉ khâu Nguội, hiện khi đã chọn ≥1 dòng */}
      {bulkEnabled && selectedRows.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
          padding: "10px 14px", marginBottom: "12px",
          background: "var(--cream-dark)", border: "1px solid var(--ink)", borderRadius: "6px",
        }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink)" }}>
            Đã chọn {selectedRows.length} MO
          </span>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <label style={{ ...LABEL, marginBottom: 0 }}>Chất lượng</label>
            <select value={bulkQuality} onChange={e => setBulkQuality(e.target.value)} className="psx-input" style={{ fontSize: "12px", width: "160px" }}>
              <option value="">— Giữ nguyên</option>
              <option value="Đạt">Đạt</option>
              <option value="Không đạt">Không đạt</option>
              <option value={BULK_CLEAR}>↺ Bỏ trống (chưa đánh giá)</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <label style={{ ...LABEL, marginBottom: 0 }}>Thời gian</label>
            <select value={bulkTimeOk} onChange={e => setBulkTimeOk(e.target.value)} className="psx-input" style={{ fontSize: "12px", width: "160px" }}>
              <option value="">— Giữ nguyên</option>
              <option value="Đạt">Đạt</option>
              <option value="Không đạt">Không đạt</option>
              <option value={BULK_CLEAR}>↺ Bỏ trống (chưa đánh giá)</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <label style={{ ...LABEL, marginBottom: 0 }}>Đánh giá</label>
            <select
              value={bulkReviewMark} onChange={e => setBulkReviewMark(e.target.value as BulkReviewMark)}
              disabled={hasAnyClearedField(bulkQuality, bulkTimeOk)}
              title={hasAnyClearedField(bulkQuality, bulkTimeOk) ? "Đã chọn Bỏ trống ở Chất lượng/Thời gian — tự động Bỏ đánh giá" : undefined}
              className="psx-input" style={{ fontSize: "12px", width: "170px" }}
            >
              <option value="keep">— Giữ nguyên</option>
              <option value="mark">✓ Đánh dấu Đã đánh giá</option>
              <option value="unmark">✗ Bỏ đánh giá</option>
            </select>
          </div>
          <button
            type="button"
            disabled={isBulkSaving || (!bulkQuality && !bulkTimeOk && bulkReviewMark === "keep")}
            onClick={handleApplyBulk}
            style={{
              padding: "5px 14px", fontSize: "12px", fontWeight: 600,
              border: "none", borderRadius: "6px", background: "var(--ink)", color: "var(--cream)",
              cursor: isBulkSaving ? "wait" : "pointer",
              opacity: (isBulkSaving || (!bulkQuality && !bulkTimeOk && bulkReviewMark === "keep")) ? 0.5 : 1,
            }}
          >
            {isBulkSaving ? "Đang áp dụng..." : `Áp dụng cho ${selectedRows.length} MO`}
          </button>
          <button
            type="button" onClick={resetBulkSelection}
            style={{ padding: "5px 10px", fontSize: "11px", background: "transparent", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--ink-muted)", cursor: "pointer" }}
          >
            Bỏ chọn
          </button>
          {bulkMessage && (
            <span style={{ fontSize: "12px", color: "var(--s-green, #16a34a)", fontWeight: 600 }}>
              {bulkMessage}
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <div style={{ background: "var(--cream-card)", border: "1px solid var(--border)", overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "620px" }}>
          <thead>
            <tr>
              {bulkEnabled && (
                <th style={{ ...TH, width: "34px" }}>
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={e => {
                      if (e.target.checked) setSelectedKeys(new Set(selectableRows.map(rowKey)));
                      else setSelectedKeys(new Set());
                    }}
                    title="Chọn tất cả dòng đang hiển thị"
                  />
                </th>
              )}
              <th style={{ ...TH, width: "32px" }}>#</th>
              {/* Nhóm Nguội gồm ba khâu con — không có cột này thì không phân biệt được
                  dòng nào là Nguội thuần, dòng nào là TC Nguội / Khóa khi tính công. */}
              <th style={{ ...TH, width: "82px" }}>Khâu</th>
              <th style={{ ...THLeft, minWidth: "100px" }}>MO#</th>
              <th style={{ ...THLeft, minWidth: "130px" }}>Sản phẩm</th>
              <th style={{ ...THLeft, minWidth: "100px" }}>Thợ</th>
              <th style={TH}>Ngày HT</th>
              <th style={TH}>Thời gian</th>
              {isNguoiKhoa && <th style={{ ...THLeft, minWidth: "160px" }}>Kết quả</th>}
              <th style={{ ...TH, minWidth: "110px" }}>Đánh giá</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && !isFetching && (
              <tr>
                <td colSpan={colCount} style={{ ...TD, padding: "40px", color: "var(--ink-muted)" }}>
                  {total === 0
                    ? `Không có MO nào hoàn thành khâu Nguội (gồm TC Nguội, Khóa) trong tháng ${month}/${year}`
                    : "Không có kết quả phù hợp với bộ lọc"}
                </td>
              </tr>
            )}

            {filteredRows.map((r, i) => {
              const key      = rowKey(r);
              const expanded = expandedKey === key;
              const issue    = hasIssue(r);

              // Left border color: expanded → black, reviewed+OK → green, issue → red, default → transparent
              const borderColor = expanded
                ? "var(--ink)"
                : r.reviewedAt && !issue ? "#16a34a"
                : issue ? "#dc2626"
                : "transparent";

              return (
                <>
                  <tr
                    key={key}
                    onClick={e => handleRowClick(r, e)}
                    style={{
                      cursor: "pointer",
                      background: expanded
                        ? "rgba(0,0,0,0.04)"
                        : i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.012)",
                      borderLeft: `3px solid ${borderColor}`,
                      transition: "background 0.1s",
                    }}
                  >
                    {bulkEnabled && (
                      <td style={TD} data-review-btn="1" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedKeys.has(key)}
                          disabled={r.isOutsideGroup}
                          title={r.isOutsideGroup ? "Khâu ngoài nhóm — không đánh giá" : undefined}
                          onChange={e => {
                            setSelectedKeys(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(key); else next.delete(key);
                              return next;
                            });
                          }}
                        />
                      </td>
                    )}
                    <td style={{ ...TD, fontSize: "11px", color: "var(--ink-muted)" }}>
                      {expanded ? "▼" : i + 1}
                    </td>
                    <td style={TD}>
                      <span
                        title={r.isOutsideGroup
                          ? "Khâu ngoài nhóm Nguội — chỉ ghi nhận công, không đánh giá"
                          : undefined}
                        style={{
                          fontSize: "11px", fontWeight: 600, padding: "2px 7px", borderRadius: "4px",
                          background: r.isOutsideGroup
                            ? OUTSIDE_CHIP_BG
                            : (STAGE_CHIP_BG[r.stageCode] ?? "transparent"),
                          color: r.isOutsideGroup || r.stageCode === "NGUOI" ? "var(--ink-muted)" : "var(--ink)",
                          fontStyle: r.isOutsideGroup ? "italic" : "normal",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {STAGE_SHORT_LABEL[r.stageCode] ?? r.stageCode}
                      </span>
                    </td>
                    <td style={TDLeft}>
                      <span style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: 600 }}>
                        {formatMoVersionedDisplay(r.moNumber, r.isFromWebapp) || "—"}
                      </span>
                    </td>
                    <td style={TDLeft}>
                      <span style={{ fontSize: "12px" }}>
                        {r.productName ?? <span style={{ color: "var(--ink-muted)", fontStyle: "italic" }}>Chưa có tên</span>}
                      </span>
                    </td>
                    <td style={TDLeft}>
                      <span style={{ fontSize: "12px" }}>{r.crafter ?? <span style={{ color: "var(--ink-muted)" }}>—</span>}</span>
                      <div style={{ fontSize: "10px", color: "var(--ink-muted)" }}>Phần: {r.phan || "—"}</div>
                    </td>
                    <td style={TD}><span style={{ fontSize: "12px" }}>{fmtDate(r.doneAt)}</span></td>
                    <td style={TD}><span style={{ fontSize: "12px", color: "var(--ink-muted)" }}>{r.durationNote ? formatDurationDisplay(r.durationNote) : "—"}</span></td>

                    {isNguoiKhoa && (
                      <td style={{ ...TDLeft, maxWidth: "180px" }}>
                        {r.isOutsideGroup
                          ? <span style={{ fontSize: "11px", color: "var(--ink-muted)", fontStyle: "italic" }}>Chỉ ghi nhận công</span>
                          : <ResultBadge r={r} />}
                      </td>
                    )}

                    {/* Review button */}
                    <td style={TD} data-review-btn="1" onClick={e => e.stopPropagation()}>
                      {r.isOutsideGroup ? (
                        <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>—</span>
                      ) : r.reviewedAt ? (
                        <button
                          onClick={() => toggleReview(r)}
                          disabled={isToggling}
                          title={`Đã đánh giá lúc ${fmtDateTime(r.reviewedAt)}\nNhấn để bỏ đánh giá`}
                          style={{
                            cursor: isToggling ? "wait" : "pointer",
                            border: "none", borderRadius: "6px",
                            background: "rgba(22,163,74,0.12)", color: "#15803d",
                            padding: "4px 10px", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap",
                          }}
                        >
                          ✓ {fmtDate(r.reviewedAt)}
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleReview(r)}
                          disabled={isToggling}
                          style={{
                            cursor: isToggling ? "wait" : "pointer",
                            border: "1px solid var(--border)", borderRadius: "6px",
                            background: "transparent", color: "var(--ink-muted)",
                            padding: "4px 10px", fontSize: "11px", whiteSpace: "nowrap",
                          }}
                        >
                          Đánh giá
                        </button>
                      )}
                    </td>
                  </tr>

                  {expanded && editValues && (
                    <tr key={`${key}-form`}>
                      <td colSpan={colCount} style={{ padding: 0, borderBottom: "2px solid var(--border)" }}>
                        <EditForm
                          row={r} stage={r.stageCode} vals={editValues} isSaving={isSaving}
                          onChange={v => setEditValues(prev => prev ? { ...prev, ...v } : prev)}
                          onSave={() => saveEdit({ row: r, vals: editValues })}
                          onSaveAndReview={() => saveEdit({ row: r, vals: editValues, andReview: !r.reviewedAt, unReview: Boolean(r.reviewedAt) })}
                          onCancel={() => { setExpandedKey(null); setEditValues(null); }}
                        />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: "11px", color: "var(--ink-muted)", marginTop: "10px" }}>
        * Nhấn vào dòng để mở form đánh giá · Nhấn "Lưu & Đánh giá ✓" để tự động chuyển sang MO tiếp theo
      </p>
    </div>
  );
}
