"use client";

import { useState } from "react";
import { ProductionStats } from "./production-stats";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SummaryStats = {
  active: number;
  overdue: number;
  completed: number;
  cancelled: number;
};

export type CrossTabData = {
  cols: string[];
  rows: Array<{
    code: string;
    label: string;
    byCols: Record<string, number>;
    total: number;
  }>;
  colTotals: Record<string, number>;
  grandTotal: number;
  // Số MO chưa có Loại SP thật (specifications.loaiSp) — đang bị đoán từ tên sản phẩm,
  // tách riêng khỏi nhóm "Khác" thật sự để biết còn bao nhiêu MO cần rà soát thêm.
  unassignedCount: number;
};

export type PsxSegmentData = {
  sr: CrossTabData;
  kh: CrossTabData;
  pk: Array<{ code: string; label: string; count: number }>;
  total: number;
};

export type MonthRow = {
  label: string;
  month: number;
  year: number;
  count: number;
};

export type StatisticsData = {
  summary: SummaryStats;
  psxActive: PsxSegmentData;
  psxCompleted: PsxSegmentData;
  ptkActive: CrossTabData;
  monthlyCompleted: MonthRow[];
};

// ─── Store colors (match Sidebar dots) ───────────────────────────────────────

const STORE_COLOR: Record<string, string> = {
  CH1:  "#E91D79",
  CH2:  "#1E40AF",
  CH3:  "#2D7A4F",
  ADM1: "#B8860B",
  ADM2: "#8A8178",
  VVS:  "#7C3AED",
};

// ─── Summary Card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, color, sub }: {
  label: string;
  value: number;
  color?: string;
  sub?: string;
}) {
  return (
    <div style={{
      background: "var(--cream-card)",
      border: "1px solid var(--border)",
      padding: "20px 24px",
      display: "flex",
      flexDirection: "column",
      gap: "4px",
    }}>
      <p style={{
        fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.1em", color: "var(--ink-muted)", margin: 0,
      }}>
        {label}
      </p>
      <p style={{
        fontFamily: "var(--font-cormorant), Georgia, serif",
        fontSize: "40px", fontWeight: 300,
        color: color ?? "var(--ink)",
        margin: 0, lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value.toLocaleString()}
      </p>
      {sub && <p style={{ fontSize: "11px", color: "var(--ink-muted)", margin: 0 }}>{sub}</p>}
    </div>
  );
}

// ─── Cross-tab with store dots + heat-map cells ───────────────────────────────

function CrossTab({ data, emptyMsg }: { data: CrossTabData; emptyMsg?: string }) {
  if (data.rows.length === 0) {
    return (
      <p style={{ fontSize: "13px", color: "var(--ink-muted)", padding: "20px 0", textAlign: "center" }}>
        {emptyMsg ?? "Không có dữ liệu"}
      </p>
    );
  }

  const td: React.CSSProperties = {
    padding: "7px 10px",
    borderBottom: "1px solid var(--border)",
    borderRight: "1px solid var(--border)",
    fontSize: "12px",
    fontVariantNumeric: "tabular-nums",
    textAlign: "right",
    whiteSpace: "nowrap",
  };
  const th: React.CSSProperties = {
    ...td,
    fontWeight: 700,
    fontSize: "10px",
    letterSpacing: "0.07em",
    background: "var(--cream-dark)",
    textAlign: "center",
    color: "var(--ink-muted)",
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left", minWidth: "105px", width: "120px" }}>Loại SP</th>
            <th style={{ ...th, minWidth: "56px", width: "64px" }}>Mã</th>
            {data.cols.map(col => (
              <th key={col} style={{ ...th, minWidth: "58px" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", justifyContent: "center" }}>
                  {STORE_COLOR[col] && (
                    <span style={{
                      width: "6px", height: "6px", borderRadius: "50%",
                      background: STORE_COLOR[col], flexShrink: 0,
                      display: "inline-block",
                    }} />
                  )}
                  {col}
                </span>
              </th>
            ))}
            <th style={{ ...th, color: "var(--ink)", minWidth: "58px" }}>TỔNG</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => {
            const vals = data.cols.map(c => row.byCols[c] ?? 0);
            const rowMax = Math.max(...vals, 1);
            return (
              <tr key={row.code} style={{ background: i % 2 === 1 ? "var(--cream-dark)" : "transparent" }}>
                <td style={{ ...td, textAlign: "left", fontWeight: 500, color: "var(--ink)" }}>
                  {row.label}
                </td>
                <td style={{ ...td, fontFamily: "monospace", fontSize: "11px", color: "var(--ink-muted)", fontWeight: 600 }}>
                  {row.code}
                </td>
                {data.cols.map(col => {
                  const count = row.byCols[col] ?? 0;
                  const ratio = count / rowMax;
                  const alpha = count > 0 ? (0.07 + ratio * 0.18).toFixed(2) : "0";
                  return (
                    <td key={col} style={{
                      ...td,
                      color: count > 0 ? "var(--ink)" : "var(--ink-muted)",
                      fontWeight: count > 0 ? 500 : 400,
                      background: count > 0 ? `rgba(20,110,200,${alpha})` : undefined,
                    }}>
                      {count}
                    </td>
                  );
                })}
                <td style={{ ...td, fontWeight: 700, color: "var(--ink)" }}>{row.total}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: "var(--cream-dark)" }}>
            <td colSpan={2} style={{ ...td, fontWeight: 700, textAlign: "left", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              TỔNG
            </td>
            {data.cols.map(col => (
              <td key={col} style={{
                ...td,
                fontWeight: 700,
                color: (data.colTotals[col] ?? 0) > 0 ? "var(--ink)" : "var(--ink-muted)",
              }}>
                {data.colTotals[col] ?? 0}
              </td>
            ))}
            <td style={{ ...td, fontWeight: 700, color: "var(--s-blue)" }}>
              {data.grandTotal}
            </td>
          </tr>
        </tfoot>
      </table>
      {data.unassignedCount > 0 && (
        <p style={{ fontSize: "11px", color: "var(--s-gold, #b8860b)", padding: "6px 2px 0" }}>
          ⚠ {data.unassignedCount} MO chưa gán Loại SP — đang tạm suy đoán theo tên sản phẩm, có thể không chính xác.
        </p>
      )}
    </div>
  );
}

// ─── PK simple count table ─────────────────────────────────────────────────────

function PkTable({ items }: { items: Array<{ code: string; label: string; count: number }> }) {
  if (!items.length) {
    return (
      <p style={{ fontSize: "13px", color: "var(--ink-muted)", padding: "20px 0", textAlign: "center" }}>
        Không có dữ liệu
      </p>
    );
  }
  const max = Math.max(...items.map(i => i.count), 1);

  return (
    <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: "400px" }}>
      <thead>
        <tr>
          <th style={{
            padding: "7px 10px", fontSize: "10px", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.07em",
            background: "var(--cream-dark)", color: "var(--ink-muted)",
            borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)",
            textAlign: "left",
          }}>
            Loại SP
          </th>
          <th style={{
            padding: "7px 10px", fontSize: "10px", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.07em",
            background: "var(--cream-dark)", color: "var(--ink-muted)",
            borderBottom: "1px solid var(--border)",
            textAlign: "right",
          }}>
            Số lượng
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => (
          <tr key={item.code} style={{ background: i % 2 === 1 ? "var(--cream-dark)" : "transparent" }}>
            <td style={{
              padding: "7px 10px", fontSize: "12px", fontWeight: 500,
              borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)",
              color: "var(--ink)",
            }}>
              {item.label}
            </td>
            <td style={{
              padding: "7px 10px", fontSize: "12px",
              borderBottom: "1px solid var(--border)",
              textAlign: "right",
            }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "10px", justifyContent: "flex-end" }}>
                <span style={{
                  display: "inline-block",
                  width: `${Math.max((item.count / max) * 72, 4)}px`,
                  height: "4px",
                  background: "var(--s-blue)",
                  borderRadius: "2px",
                  opacity: 0.45,
                }} />
                <span style={{ fontWeight: 600, color: "var(--ink)", minWidth: "28px", fontVariantNumeric: "tabular-nums" }}>
                  {item.count}
                </span>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Sub-section divider ──────────────────────────────────────────────────────

function SubHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "7px 16px",
      background: "var(--cream-dark)",
      borderBottom: "1px solid var(--border)",
      borderTop: "1px solid var(--border)",
    }}>
      <span style={{
        fontSize: "10px", fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.12em",
        color: "var(--ink-muted)",
      }}>
        {label}
      </span>
      {count > 0 && (
        <span style={{
          fontSize: "10px", fontWeight: 700,
          background: "var(--cream-card)",
          color: "var(--ink-muted)",
          padding: "1px 7px",
          border: "1px solid var(--border)",
        }}>
          {count}
        </span>
      )}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  title, count, children,
}: {
  title: string;
  count?: number;
  children?: React.ReactNode;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 16px",
      background: "var(--cream-dark)",
      borderBottom: "1px solid var(--border)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{
          fontSize: "11px", fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.1em",
          color: "var(--ink)",
        }}>
          {title}
        </span>
        {count !== undefined && (
          <span style={{
            fontSize: "10px", fontWeight: 700,
            background: "var(--s-blue)", color: "#fff",
            padding: "1px 7px", borderRadius: "999px",
          }}>
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Tab button ───────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px", fontSize: "12px",
        fontWeight: active ? 600 : 400,
        color: active ? "var(--ink)" : "var(--ink-muted)",
        background: active ? "var(--cream-card)" : "transparent",
        border: "1px solid",
        borderColor: active ? "var(--border)" : "transparent",
        borderRadius: "4px",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );
}

// ─── Monthly bar chart ────────────────────────────────────────────────────────

function MonthlyTable({ rows }: { rows: MonthRow[] }) {
  const filled = rows.filter(r => r.count > 0);
  if (!filled.length) {
    return (
      <p style={{ fontSize: "13px", color: "var(--ink-muted)", padding: "24px 0", textAlign: "center" }}>
        Không có dữ liệu
      </p>
    );
  }
  const max = Math.max(...filled.map(r => r.count));

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {rows.map(row => (
        <div key={`${row.year}-${row.month}`} style={{
          display: "flex", alignItems: "center", gap: "12px",
          padding: "6px 0",
          borderBottom: "1px solid var(--border)",
        }}>
          <span style={{ fontSize: "12px", color: "var(--ink-muted)", width: "68px", flexShrink: 0 }}>
            {row.label}
          </span>
          <div style={{ flex: 1, height: "8px", background: "var(--border)", borderRadius: "2px", overflow: "hidden" }}>
            <div style={{
              width: `${max > 0 ? (row.count / max) * 100 : 0}%`,
              height: "100%",
              background: "var(--s-green)",
              borderRadius: "2px",
              transition: "width 0.3s ease",
            }} />
          </div>
          <span style={{
            fontSize: "12px", fontWeight: 600, color: row.count > 0 ? "var(--ink)" : "var(--ink-muted)",
            width: "32px", textAlign: "right", flexShrink: 0,
            fontVariantNumeric: "tabular-nums",
          }}>
            {row.count || "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── PSX segment (SR + KH + PK) ──────────────────────────────────────────────

function PsxSegment({ data }: { data: PsxSegmentData }) {
  const pkTotal = data.pk.reduce((s, i) => s + i.count, 0);
  return (
    <div>
      <SubHeader label="SR — Cửa hàng" count={data.sr.grandTotal} />
      <CrossTab data={data.sr} emptyMsg="Không có đơn SR" />

      <SubHeader label="KH — Khách hàng" count={data.kh.grandTotal} />
      <CrossTab data={data.kh} emptyMsg="Không có đơn KH" />

      <SubHeader label="PK — Nội bộ PSX" count={pkTotal} />
      <div style={{ padding: "0 0 0 0" }}>
        <PkTable items={data.pk} />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type PsxTab = "active" | "completed";
type SectionTab = "psx" | "ptk" | "monthly" | "kpi";

const SECTION_TABS: Array<{ key: SectionTab; label: string }> = [
  { key: "psx",     label: "Phòng Sản Xuất" },
  { key: "ptk",     label: "Phòng Thiết Kế" },
  { key: "monthly", label: "Hoàn tất theo tháng" },
  { key: "kpi",     label: "KPI Thợ SX" },
];

export function StatisticsClient({ data }: { data: StatisticsData }) {
  const [psxTab, setPsxTab] = useState<PsxTab>("active");
  const [section, setSection] = useState<SectionTab>("psx");
  const psxData = psxTab === "active" ? data.psxActive : data.psxCompleted;

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      overflow: "hidden", background: "var(--cream)",
    }}>

      {/* ── Fixed top: Title + Summary Cards ─────────────────── */}
      <div style={{
        flexShrink: 0,
        padding: "20px 28px 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--cream)",
      }}>
        <div style={{ marginBottom: "14px" }}>
          <h2 style={{
            fontFamily: "var(--font-cormorant), Georgia, serif",
            fontSize: "28px", fontWeight: 400,
            color: "var(--ink)", margin: 0, letterSpacing: "0.04em",
          }}>
            Thống kê
          </h2>
          <p style={{ fontSize: "12px", color: "var(--ink-muted)", margin: "4px 0 0" }}>
            Tổng quan số lượng sản phẩm theo cửa hàng và loại
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
          <StatCard label="Đang thực hiện" value={data.summary.active} color="var(--s-blue)" />
          <StatCard label="Quá hạn" value={data.summary.overdue} color="var(--s-red)" sub="Chưa hoàn tất" />
          <StatCard label="Hoàn tất" value={data.summary.completed} color="var(--s-green)" />
          <StatCard label="Đã hủy" value={data.summary.cancelled} />
        </div>
      </div>

      {/* ── Section tab bar ──────────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        display: "flex", alignItems: "center",
        padding: "0 28px",
        borderBottom: "1px solid var(--border)",
        background: "var(--cream-card)",
        overflowX: "auto",
      }}>
        {SECTION_TABS.map(({ key, label }) => {
          const active = section === key;
          const count = key === "psx" ? psxData.total
                      : key === "ptk" ? data.ptkActive.grandTotal
                      : null;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key)}
              style={{
                padding: "10px 16px",
                fontSize: "13px",
                fontWeight: active ? 500 : 400,
                whiteSpace: "nowrap",
                color: active ? "var(--ink)" : "var(--ink-muted)",
                background: "none",
                border: "none",
                borderBottom: `2px solid ${active ? "var(--pink)" : "transparent"}`,
                marginBottom: "-1px",
                cursor: "pointer",
                transition: "color 0.15s, border-color 0.15s",
              }}
            >
              {label}
              {count !== null && count > 0 && (
                <span style={{
                  marginLeft: "6px", fontSize: "10px", fontWeight: 700,
                  background: active ? "var(--cream-dark)" : "var(--cream)",
                  color: "var(--ink-muted)",
                  border: "1px solid var(--border)",
                  padding: "1px 5px",
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Section content (scrollable within tab) ──────────── */}
      <div style={{ flex: 1, overflow: "auto" }}>

        {section === "psx" && (
          <div style={{ background: "var(--cream-card)", border: "1px solid var(--border)", margin: "20px 28px" }}>
            <SectionHeader title="Phòng Sản Xuất (PSX)" count={psxData.total}>
              <div style={{ display: "flex", gap: "4px" }}>
                <TabBtn active={psxTab === "active"} onClick={() => setPsxTab("active")}>Đang SX</TabBtn>
                <TabBtn active={psxTab === "completed"} onClick={() => setPsxTab("completed")}>Hoàn tất</TabBtn>
              </div>
            </SectionHeader>
            <PsxSegment data={psxData} />
          </div>
        )}

        {section === "ptk" && (
          <div style={{ background: "var(--cream-card)", border: "1px solid var(--border)", margin: "20px 28px" }}>
            <SectionHeader title="Phòng Thiết Kế (PTK)" count={data.ptkActive.grandTotal}>
              <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>Đang thiết kế</span>
            </SectionHeader>
            <CrossTab data={data.ptkActive} emptyMsg="Không có đơn đang thiết kế" />
          </div>
        )}

        {section === "monthly" && (
          <div style={{ background: "var(--cream-card)", border: "1px solid var(--border)", margin: "20px 28px" }}>
            <SectionHeader title="Hoàn tất theo tháng (PSX)" />
            <div style={{ padding: "16px" }}>
              <MonthlyTable rows={data.monthlyCompleted} />
            </div>
          </div>
        )}

        {section === "kpi" && (
          <div style={{ margin: "20px 28px" }}>
            <ProductionStats />
          </div>
        )}

      </div>
    </div>
  );
}
