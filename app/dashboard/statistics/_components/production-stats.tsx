"use client";

import { useState, useEffect, useMemo } from "react";
import { CrafterMultiselect } from "./crafter-multiselect";
import { PrintProductionStatsButton } from "./print-production-stats";
import {
  workingDays, buildNguoiKpiSummary, type NguoiQuotaConfig,
} from "@/app/lib/business/kpi-nguoi";
import { NGUOI_KPI_COLUMNS, nguoiKpiPrintRow } from "@/app/lib/business/kpi-nguoi-display";
import { fetchStageReport, fetchKpiConfig } from "@/app/lib/api/kpi-report-client";
import { formatHours as fmtHrs } from "@/app/lib/utils";
import type {
  NguoiRow, HotRow, TcDayRow, ResinRow, StageReportData, PrintKpiCol, PrintKpiRow,
} from "@/app/lib/types/kpi-report";

// ─── Types ────────────────────────────────────────────────────────────────────
//
// Kiểu dòng báo cáo + kiểu bảng in dùng CHUNG với API và các bản in khác
// (app/lib/types/kpi-report.ts) — trước đây khai báo lại ở đây, không có ràng buộc nào nên
// dễ lệch âm thầm khi một bên đổi.

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number, of: number): string {
  if (of === 0) return "—";
  return `${Math.round((n / of) * 100)}%`;
}

function pctColor(n: number, of: number): string {
  if (of === 0) return "var(--ink-muted)";
  const r = n / of;
  if (r >= 0.9) return "var(--s-green, #16a34a)";
  if (r >= 0.7) return "var(--s-gold, #d97706)";
  return "var(--s-red, #dc2626)";
}

const TH: React.CSSProperties = {
  padding: "8px 10px", fontSize: "10px", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.07em",
  color: "var(--ink-muted)", background: "var(--cream-dark, #f0ebe3)",
  borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", textAlign: "left",
};

const TD: React.CSSProperties = {
  padding: "8px 10px", fontSize: "12px", borderBottom: "1px solid var(--border-light, #f0ede8)",
};

// Ô Mã thợ — monospace để các mã 5 chữ số thẳng cột, cùng ngôn ngữ hình ảnh với bảng Quản lý Thợ.
// Khai MỘT LẦN cho cả bốn bảng: bốn bản sao của cùng một style là bốn cơ hội lệch.
const TD_CODE: React.CSSProperties = {
  ...TD, fontFamily: "monospace", fontWeight: 700, color: "var(--ink-muted)", whiteSpace: "nowrap",
};

// Rỗng hiện "—": người đọc biết thợ này CHƯA CÓ MÃ, khác hẳn một ô trắng trông như lỗi tải.
const codeCell = (code: string) => code || "—";

const TDnum: React.CSSProperties = { ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums" };

// ─── Sub-tables ───────────────────────────────────────────────────────────────

// Màu Kết quả % theo mức năng suất (so định mức).
function resultColor(p: number | null): string {
  if (p == null) return "var(--ink-muted)";
  if (p >= 90) return "var(--s-green, #16a34a)";
  if (p >= 70) return "var(--s-gold, #d97706)";
  return "var(--s-red, #dc2626)";
}

function NguoiTable({ rows, defaultWorkDays, workDays, onEditWorkDays }: {
  rows: NguoiRow[];
  /** Ngày công theo lịch — dùng cho thợ chưa được điền. */
  defaultWorkDays: number;
  workDays: Record<string, number>;
  onEditWorkDays: (crafter: string, value: number | null) => void;
}) {
  if (!rows.length) return <EmptyMsg />;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "760px" }}>
        <thead>
          <tr>
            <th style={{ ...TH, width: "72px" }}>Mã</th>
            <th style={TH}>Thợ</th>
            <th style={TH}>Bậc</th>
            <th style={{ ...TH, textAlign: "right" }}>Ngày công thực tế</th>
            <th style={{ ...TH, textAlign: "right" }}>Tổng giờ thực tế</th>
            <th style={{ ...TH, textAlign: "right" }}>SL MO thực tế</th>
            <th style={{ ...TH, textAlign: "right" }}>SL quy về nhóm chuẩn</th>
            <th style={{ ...TH, textAlign: "right" }}>ĐM / Tháng</th>
            <th style={{ ...TH, textAlign: "right" }}>Kết quả (%)</th>
            <th style={{ ...TH, textAlign: "right" }}>SL MO không đạt CLSP</th>
            <th style={{ ...TH, textAlign: "right" }}>SL MO trễ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            // Dùng CHUNG hàm ghép với hai bản in — bảng trên màn hình trước đây tự tính riêng,
            // là nơi thứ ba có thể lệch số so với bản in của chính nó.
            const { units, workDays: wd, quota, resultPct: p } =
              buildNguoiKpiSummary(r, { defaultWorkDays, workDays });
            // `isEntered` là mối quan tâm THUẦN GIAO DIỆN (tô nền ô nhập khác đi), nên vẫn tính
            // tại đây — không đẩy vào module nghiệp vụ.
            const isEntered = workDays[r.crafter] != null;
            return (
              <tr key={r.crafter} style={{ background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)" }}>
                <td style={TD_CODE}>{codeCell(r.code)}</td>
                <td style={TD}>{r.crafter}</td>
                <td style={TD}><span style={{ fontSize: "10px", color: "var(--ink-muted)" }}>{r.level}</span></td>
                {/* Ô SỬA ĐƯỢC nay là NGÀY CÔNG, không phải ĐM. Người dùng nhập nguyên liệu; ĐM
                    là kết quả và chỉ đọc — hai người nhìn cùng con số luôn biết nó từ đâu ra. */}
                <td style={TDnum}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", justifyContent: "flex-end" }}>
                    <input
                      type="number" min={0}
                      value={wd}
                      onChange={(e) => onEditWorkDays(r.crafter, e.target.value === "" ? null : Math.max(0, parseInt(e.target.value, 10) || 0))}
                      title={isEntered ? "Ngày công thực tế đã nhập — nhấn ↺ để về ngày công theo lịch" : "Đang dùng ngày công theo lịch — sửa để nhập số thực tế của thợ này"}
                      style={{
                        width: "52px", textAlign: "right", fontSize: "12px", padding: "2px 4px",
                        border: "1px solid var(--border)", borderRadius: "3px",
                        background: isEntered ? "rgba(217,119,6,0.10)" : "var(--cream)",
                        color: "var(--ink)", fontWeight: isEntered ? 700 : 400,
                      }}
                    />
                    {isEntered && (
                      <button type="button" onClick={() => onEditWorkDays(r.crafter, null)} title="Về ngày công theo lịch"
                        style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ink-muted)", fontSize: "11px", padding: 0 }}>↺</button>
                    )}
                  </span>
                </td>
                <td style={TDnum}>{fmtHrs(r.totalHours)}</td>
                <td style={TDnum}><strong>{r.moCount}</strong></td>
                <td style={TDnum}>{units || "—"}</td>
                {/* ĐM CHỈ ĐỌC — suy ra từ ngày công bên trái. Cho sửa cả hai là hai nguồn cho
                    cùng một con số, và sớm muộn chúng lệch. */}
                <td style={{ ...TDnum, color: "var(--ink-muted)" }} title="Tự tính: ngày công thực tế × 2">
                  {quota}
                </td>
                <td style={{ ...TDnum, fontWeight: 600, color: resultColor(p) }}>{p == null ? "—" : `${p}%`}</td>
                <td style={{ ...TDnum, color: r.qualityFail > 0 ? "var(--s-red, #dc2626)" : "var(--ink-muted)" }}>{r.qualityFail || 0}</td>
                <td style={{ ...TDnum, color: r.timeFail > 0 ? "var(--s-red, #dc2626)" : "var(--ink-muted)" }}>{r.timeFail || 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HotTable({ rows }: { rows: HotRow[] }) {
  if (!rows.length) return <EmptyMsg />;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "520px" }}>
        <thead>
          <tr>
            <th style={{ ...TH, width: "72px" }}>Mã</th>
            <th style={TH}>Thợ</th>
            <th style={TH}>Bậc</th>
            <th style={{ ...TH, textAlign: "right" }}>SL MO</th>
            <th style={{ ...TH, textAlign: "right" }}>Xoàn</th>
            <th style={{ ...TH, textAlign: "right" }}>Xoàn Lab</th>
            <th style={{ ...TH, textAlign: "right" }}>CZ</th>
            <th style={{ ...TH, textAlign: "right" }}>Đá màu</th>
            <th style={{ ...TH, textAlign: "right" }}>Khác</th>
            <th style={{ ...TH, textAlign: "right" }}>Tổng HỘT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const total = r.xoan + r.xoanLab + r.cz + (r.daMau ?? 0) + r.khac;
            return (
              <tr key={r.crafter} style={{ background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)" }}>
                <td style={TD_CODE}>{codeCell(r.code)}</td>
                <td style={TD}>{r.crafter}</td>
                <td style={TD}><span style={{ fontSize: "10px", color: "var(--ink-muted)" }}>{r.level}</span></td>
                <td style={TDnum}><strong>{r.moCount}</strong></td>
                <td style={TDnum}>{r.xoan || "—"}</td>
                <td style={TDnum}>{r.xoanLab || "—"}</td>
                <td style={TDnum}>{r.cz || "—"}</td>
                <td style={TDnum}>{(r.daMau ?? 0) || "—"}</td>
                <td style={TDnum}>{r.khac || "—"}</td>
                <td style={{ ...TDnum, fontWeight: 600 }}>{total || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const WORK_GROUP_ORDER = ["MÓC MÁY", "DÂY LẮC", "NẤU NL", "—"];
const WORK_GROUP_LABEL: Record<string, string> = {
  "MÓC MÁY": "Móc máy",
  "DÂY LẮC": "Dây lắc",
  "NẤU NL":  "Nấu NL",
  "—": "Khác",
};

function TcDayTable({ rows }: { rows: TcDayRow[] }) {
  if (!rows.length) return <EmptyMsg />;

  // Group by crafter
  const crafterOrder: string[] = [];
  const bycrafter: Record<string, TcDayRow[]> = {};
  for (const r of rows) {
    if (!bycrafter[r.crafter]) { crafterOrder.push(r.crafter); bycrafter[r.crafter] = []; }
    bycrafter[r.crafter].push(r);
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "480px" }}>
        <thead>
          <tr>
            <th style={{ ...TH, width: "72px" }}>Mã</th>
            <th style={TH}>Thợ</th>
            <th style={TH}>Bậc</th>
            <th style={TH}>Nhóm công việc</th>
            <th style={{ ...TH, textAlign: "right" }}>SL MO</th>
            <th style={{ ...TH, textAlign: "right" }}>Tổng giờ</th>
          </tr>
        </thead>
        <tbody>
          {crafterOrder.map(crafter => {
            const crafterRows = bycrafter[crafter];
            const sorted = [...crafterRows].sort((a, b) =>
              WORK_GROUP_ORDER.indexOf(a.workGroup) - WORK_GROUP_ORDER.indexOf(b.workGroup)
            );
            const totalMo  = crafterRows.reduce((s, r) => s + r.moCount, 0);
            const totalHrs = crafterRows.reduce((s, r) => s + r.totalHours, 0);
            return sorted.map((r, i) => (
              <tr key={`${crafter}||${r.workGroup}`} style={{ background: "transparent" }}>
                {i === 0 && (
                  <td style={{ ...TD_CODE, verticalAlign: "top" }} rowSpan={sorted.length}>{codeCell(r.code)}</td>
                )}
                {i === 0 && (
                  <td style={{ ...TD, verticalAlign: "top" }} rowSpan={sorted.length}>{crafter}</td>
                )}
                {i === 0 && (
                  <td style={{ ...TD, verticalAlign: "top" }} rowSpan={sorted.length}>
                    <span style={{ fontSize: "10px", color: "var(--ink-muted)" }}>{r.level}</span>
                  </td>
                )}
                <td style={TD}>
                  <span style={{
                    fontSize: "10px", fontWeight: 600, padding: "2px 6px", borderRadius: "3px",
                    background: r.workGroup === "MÓC MÁY" ? "rgba(59,130,246,0.1)" : r.workGroup === "DÂY LẮC" ? "rgba(16,163,74,0.1)" : r.workGroup === "NẤU NL" ? "rgba(217,119,6,0.1)" : "rgba(0,0,0,0.05)",
                    color: r.workGroup === "MÓC MÁY" ? "#1d4ed8" : r.workGroup === "DÂY LẮC" ? "#15803d" : r.workGroup === "NẤU NL" ? "#b45309" : "var(--ink-muted)",
                  }}>
                    {WORK_GROUP_LABEL[r.workGroup] ?? r.workGroup}
                  </span>
                </td>
                <td style={TDnum}>{r.moCount}</td>
                <td style={TDnum}>{fmtHrs(r.totalHours)}</td>
              </tr>
            )).concat(sorted.length > 1 ? [
              <tr key={`${crafter}||total`} style={{ background: "rgba(0,0,0,0.02)" }}>
                {/* Phủ Mã · Thợ · Bậc · Nhóm công việc — 4 cột. Thêm cột mà quên số này là
                    dòng "Tổng cộng" lệch khỏi hai cột số bên phải. */}
                <td colSpan={4} style={{ ...TD, fontSize: "10px", color: "var(--ink-muted)", fontStyle: "italic" }}>
                  Tổng cộng
                </td>
                <td style={{ ...TDnum, fontWeight: 700 }}>{totalMo}</td>
                <td style={{ ...TDnum, fontWeight: 700 }}>{fmtHrs(totalHrs)}</td>
              </tr>
            ] : []);
          })}
        </tbody>
      </table>
    </div>
  );
}

function ResinTable({ rows }: { rows: ResinRow[] }) {
  if (!rows.length) return <EmptyMsg />;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "560px" }}>
        <thead>
          <tr>
            <th style={{ ...TH, width: "72px" }}>Mã</th>
            <th style={TH}>Thợ</th>
            <th style={TH}>Bậc</th>
            <th style={{ ...TH, textAlign: "right" }}>SL MO</th>
            <th style={{ ...TH, textAlign: "right" }}>TL Đạt</th>
            <th style={{ ...TH, textAlign: "right" }}>TL KĐ</th>
            <th style={{ ...TH, textAlign: "right" }}>Tỉ lệ TL</th>
            <th style={{ ...TH, textAlign: "right" }}>CL Đạt</th>
            <th style={{ ...TH, textAlign: "right" }}>CL KĐ</th>
            <th style={{ ...TH, textAlign: "right" }}>Tỉ lệ CL</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const wFilled = r.weightPass + r.weightFail;
            const qFilled = r.qualityPass + r.qualityFail;
            return (
              <tr key={r.crafter} style={{ background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)" }}>
                <td style={TD_CODE}>{codeCell(r.code)}</td>
                <td style={TD}>{r.crafter}</td>
                <td style={TD}><span style={{ fontSize: "10px", color: "var(--ink-muted)" }}>{r.level}</span></td>
                <td style={TDnum}><strong>{r.moCount}</strong></td>
                <td style={{ ...TDnum, color: "var(--s-green, #16a34a)" }}>{r.weightPass || "—"}</td>
                <td style={{ ...TDnum, color: r.weightFail > 0 ? "var(--s-red, #dc2626)" : "var(--ink-muted)" }}>{r.weightFail || "—"}</td>
                <td style={{ ...TDnum, fontWeight: 600, color: pctColor(r.weightPass, wFilled) }}>{pct(r.weightPass, wFilled)}</td>
                <td style={{ ...TDnum, color: "var(--s-green, #16a34a)" }}>{r.qualityPass || "—"}</td>
                <td style={{ ...TDnum, color: r.qualityFail > 0 ? "var(--s-red, #dc2626)" : "var(--ink-muted)" }}>{r.qualityFail || "—"}</td>
                <td style={{ ...TDnum, fontWeight: 600, color: pctColor(r.qualityPass, qFilled) }}>{pct(r.qualityPass, qFilled)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyMsg() {
  return (
    <p style={{ fontSize: "13px", color: "var(--ink-muted)", textAlign: "center", padding: "32px 0" }}>
      Không có dữ liệu trong tháng này
    </p>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const NOW = new Date();
const CUR_YEAR  = NOW.getFullYear();
const CUR_MONTH = NOW.getMonth() + 1;
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const YEARS  = [CUR_YEAR - 1, CUR_YEAR];

type ProdTab = "nguoi" | "hot" | "tcday" | "resin";

const TAB_LABELS: Record<ProdTab, string> = {
  resin: "Resin",
  nguoi: "Nguội",
  hot:   "Gắn đá Hột",
  tcday: "Thủ công dây",
};

// Cột bản in — khớp đúng cột hiển thị của từng bảng (NguoiTable/HotTable/TcDayTable/ResinTable).
const PRINT_COLS: Record<ProdTab, PrintKpiCol[]> = {
  // Khâu Nguội dùng bộ cột từ module dùng chung — bản in Đánh giá Khâu cũng sẽ dùng đúng bộ
  // này, nên định nghĩa phải nằm một chỗ (kpi-nguoi-display.ts), cạnh hàm dựng ô tương ứng.
  nguoi: NGUOI_KPI_COLUMNS,
  hot: [
    { key: "crafter", label: "Tên thợ" },
    { key: "level",   label: "Bậc" },
    { key: "moCount", label: "SL MO",     align: "right" },
    { key: "xoan",    label: "Xoàn",      align: "right" },
    { key: "xoanLab", label: "Xoàn Lab",  align: "right" },
    { key: "cz",      label: "CZ",        align: "right" },
    { key: "daMau",   label: "Đá màu",    align: "right" },
    { key: "khac",    label: "Khác",      align: "right" },
    { key: "total",   label: "Tổng HỘT",  align: "right" },
  ],
  tcday: [
    { key: "crafter",   label: "Tên thợ" },
    { key: "level",     label: "Bậc" },
    { key: "workGroup", label: "Nhóm công việc" },
    { key: "moCount",   label: "SL MO",    align: "right" },
    { key: "totalHrs",  label: "Tổng giờ", align: "right" },
  ],
  resin: [
    { key: "crafter",   label: "Tên thợ" },
    { key: "level",     label: "Bậc" },
    { key: "moCount",   label: "SL MO",    align: "right" },
    { key: "wDat",      label: "TL Đạt",   align: "right" },
    { key: "wKd",       label: "TL KĐ",    align: "right" },
    { key: "tlTl",      label: "Tỉ lệ TL", align: "right" },
    { key: "clDat",     label: "CL Đạt",   align: "right" },
    { key: "clKd",      label: "CL KĐ",    align: "right" },
    { key: "tlCl",      label: "Tỉ lệ CL", align: "right" },
  ],
};

function buildPrintRows(tab: ProdTab, data: StageReportData, nguoiCfg: NguoiQuotaConfig): PrintKpiRow[] {
  if (tab === "nguoi") {
    // Tính (buildNguoiKpiSummary) và định dạng (nguoiKpiPrintRow) đều từ module dùng chung —
    // bản in Đánh giá Khâu gọi đúng hai hàm này nên hai màn không thể ra số khác nhau.
    return data.nguoi.map((r) => nguoiKpiPrintRow(buildNguoiKpiSummary(r, nguoiCfg)));
  }
  if (tab === "hot") {
    return data.hot.map((r) => ({
      crafter: r.crafter,
      cells: {
        crafter: r.crafter,
        level: r.level, moCount: String(r.moCount),
        xoan: String(r.xoan || "—"), xoanLab: String(r.xoanLab || "—"), cz: String(r.cz || "—"),
        daMau: String((r.daMau ?? 0) || "—"), khac: String(r.khac || "—"),
        total: String((r.xoan + r.xoanLab + r.cz + (r.daMau ?? 0) + r.khac) || "—"),
      },
    }));
  }
  if (tab === "tcday") {
    return data.tcday.map((r) => ({
      crafter: r.crafter, rowKey: `${r.crafter}||${r.workGroup}`,
      cells: {
        crafter: r.crafter,
        level: r.level, workGroup: WORK_GROUP_LABEL[r.workGroup] ?? r.workGroup,
        moCount: String(r.moCount), totalHrs: fmtHrs(r.totalHours),
      },
    }));
  }
  return data.resin.map((r) => {
    const wFilled = r.weightPass + r.weightFail;
    const qFilled = r.qualityPass + r.qualityFail;
    return {
      crafter: r.crafter,
      cells: {
        crafter: r.crafter,
        level: r.level, moCount: String(r.moCount),
        wDat: String(r.weightPass || "—"), wKd: String(r.weightFail || "—"), tlTl: pct(r.weightPass, wFilled),
        clDat: String(r.qualityPass || "—"), clKd: String(r.qualityFail || "—"), tlCl: pct(r.qualityPass, qFilled),
      },
    };
  });
}

export function ProductionStats() {
  const [year,    setYear]    = useState(CUR_YEAR);
  const [month,   setMonth]   = useState(CUR_MONTH);
  const [tab,     setTab]     = useState<ProdTab>("nguoi");
  const [data,    setData]    = useState<StageReportData | null>(null);
  const [loading, setLoading] = useState(false);
  // Thợ đã chọn để in — riêng theo từng tab (đổi tab thì không giữ lựa chọn của tab khác,
  // vì mỗi khâu có nhóm thợ khác nhau).
  const [selectedCrafters, setSelectedCrafters] = useState<string[]>([]);
  // Cấu hình ĐM/Tháng khâu Nguội (theo year/month): số ngày lễ + ĐM ghi đè từng thợ.
  const [holidayDays, setHolidayDays] = useState(0);
  const [workDays,    setWorkDays]    = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchStageReport(year, month)
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year, month]);

  // Tải cấu hình ĐM khi đổi tháng/năm.
  useEffect(() => {
    let cancelled = false;
    fetchKpiConfig(year, month)
      .then(c => { if (!cancelled) { setHolidayDays(c.holidayDays); setWorkDays(c.workDays); } })
      .catch(() => { if (!cancelled) { setHolidayDays(0); setWorkDays({}); } });
    return () => { cancelled = true; };
  }, [year, month]);

  // Ngày công THEO LỊCH — mặc định cho thợ chưa được điền số thực tế. Ô "Ngày lễ" nay chỉ còn
  // tác dụng ở đây; thợ đã có số thực tế thì lịch không ảnh hưởng tới họ nữa.
  const defaultWorkDays = useMemo(() => workingDays(year, month, holidayDays), [year, month, holidayDays]);

  // Lưu cấu hình (PUT) — gọi sau khi đổi ngày lễ hoặc ngày công thực tế của một thợ.
  function persistConfig(nextHolidayDays: number, nextWorkDays: Record<string, number>) {
    fetch("/api/admin/kpi-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month, holidayDays: nextHolidayDays, workDays: nextWorkDays }),
    }).catch(() => {});
  }

  function handleHolidayChange(days: number) {
    const d = Math.max(0, days || 0);
    setHolidayDays(d);
    persistConfig(d, workDays);
  }

  // Sửa ngày công thực tế của 1 thợ: value=null → bỏ số đã nhập, quay về ngày công theo lịch.
  function handleEditWorkDays(crafter: string, value: number | null) {
    setWorkDays(prev => {
      const next = { ...prev };
      if (value == null) delete next[crafter];
      else next[crafter] = value;
      persistConfig(holidayDays, next);
      return next;
    });
  }

  const crafterOptions = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const r of data[tab]) if (r.crafter?.trim()) set.add(r.crafter.trim());
    return [...set].sort((a, b) => a.localeCompare(b, "vi"));
  }, [data, tab]);

  // Đổi tab → reset lựa chọn thợ (nhóm thợ khác nhau giữa các khâu)
  function changeTab(t: ProdTab) { setTab(t); setSelectedCrafters([]); }

  return (
    <div style={{ background: "var(--cream-card)", border: "1px solid var(--border)" }}>
      {/* Section header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px", borderBottom: "1px solid var(--border)",
      }}>
        <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--ink-muted)" }}>
          KPIs Sản xuất
        </span>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <CrafterMultiselect options={crafterOptions} selected={selectedCrafters} onChange={setSelectedCrafters} />
          {data && (
            <PrintProductionStatsButton
              tabLabel={TAB_LABELS[tab]}
              month={month}
              year={year}
              cols={PRINT_COLS[tab]}
              rows={buildPrintRows(tab, data, { defaultWorkDays, workDays })}
              crafterOptions={crafterOptions}
              selectedCrafters={selectedCrafters}
            />
          )}
          {tab === "nguoi" && (
            <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--ink-muted)" }}
              title="Số ngày nghỉ lễ trong tháng — định nghĩa NGÀY CÔNG MẶC ĐỊNH (Chủ Nhật tự trừ). Thợ đã điền ngày công thực tế thì không bị ảnh hưởng.">
              Ngày lễ
              <input type="number" min={0} value={holidayDays}
                onChange={e => handleHolidayChange(parseInt(e.target.value, 10) || 0)}
                className="psx-input" style={{ width: "48px", fontSize: "12px", padding: "4px", textAlign: "right" }} />
            </label>
          )}
          <select
            value={month}
            onChange={e => setMonth(parseInt(e.target.value))}
            className="psx-input"
            style={{ width: "90px", fontSize: "12px", padding: "4px 0" }}
          >
            {MONTHS.map(m => (
              <option key={m} value={m}>Tháng {m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            className="psx-input"
            style={{ width: "70px", fontSize: "12px", padding: "4px 0" }}
          >
            {YEARS.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", padding: "10px 16px 0", borderBottom: "1px solid var(--border)" }}>
        {(Object.keys(TAB_LABELS) as ProdTab[]).map(t => (
          <button
            key={t}
            onClick={() => changeTab(t)}
            style={{
              padding: "6px 14px", fontSize: "12px",
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? "var(--ink)" : "var(--ink-muted)",
              background: tab === t ? "var(--cream-card)" : "transparent",
              border: "1px solid",
              borderColor: tab === t ? "var(--border)" : "transparent",
              borderRadius: "4px 4px 0 0",
              cursor: "pointer",
              transition: "all 0.15s",
              marginBottom: "-1px",
            }}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "16px" }}>
        {loading && (
          <p style={{ fontSize: "13px", color: "var(--ink-muted)", textAlign: "center", padding: "32px 0" }}>
            Đang tải...
          </p>
        )}
        {!loading && data && (
          <>
            {tab === "resin" && <ResinTable rows={data.resin} />}
            {tab === "nguoi" && <NguoiTable rows={data.nguoi} defaultWorkDays={defaultWorkDays} workDays={workDays} onEditWorkDays={handleEditWorkDays} />}
            {tab === "hot"   && <HotTable   rows={data.hot} />}
            {tab === "tcday" && <TcDayTable rows={data.tcday} />}
          </>
        )}
        {!loading && !data && (
          <p style={{ fontSize: "13px", color: "var(--s-red, #dc2626)", textAlign: "center", padding: "32px 0" }}>
            Không thể tải dữ liệu
          </p>
        )}
      </div>
    </div>
  );
}
