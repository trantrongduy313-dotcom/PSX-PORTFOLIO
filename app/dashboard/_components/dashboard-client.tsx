"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { useLabels, useLocale } from "@/app/lib/i18n/locale-context";
import { formatVersionedDisplay } from "@/app/lib/business/order-helpers";

// ─── Types ────────────────────────────────────────────────────────────────────

type Stats = {
  total: number;
  preProd: number;
  masterHub: number;
  overdue: number;
  suspended: number;
  criticalAlerts: number;
};

type GoldRow = {
  orderNumber: string;
  customerName: string;
  requiredDate: string | null;
  nvls: string[];          // danh sách NVL của SO (có thể nhiều loại)
  totalWeight: number;
  castingNeeded: number;
  moCount: number;
  items: Array<{
    moNumber: string | null;
    productName: string;
    nvl: string;
    weight: number;
  }>;
};

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent, href,
}: {
  label: string;
  value: number;
  sub?: string;
  accent?: boolean;
  href?: string;
}) {
  const inner = (
    <div style={{
      background: "var(--cream-card)",
      border: `1px solid ${accent ? "var(--s-gold)" : "var(--border)"}`,
      padding: "20px 24px",
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      transition: "border-color 0.15s",
    }}>
      <p className="psx-label" style={{ margin: 0 }}>
        {label}
      </p>
      <p style={{
        fontFamily: "var(--font-cormorant), Georgia, serif",
        fontSize: "40px",
        fontWeight: 300,
        color: accent ? "var(--s-gold)" : "var(--ink)",
        margin: 0,
        lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </p>
      {sub && (
        <p style={{
          fontSize: "11px",
          color: "var(--ink-muted)",
          margin: 0,
        }}>
          {sub}
        </p>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: "none", display: "block" }}
        onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).firstElementChild as HTMLElement).style.borderColor = "var(--ink-muted)"}
        onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).firstElementChild as HTMLElement).style.borderColor = accent ? "var(--s-gold)" : "var(--border)"}
      >
        {inner}
      </Link>
    );
  }
  return inner;
}

// ─── Gold estimation widget ───────────────────────────────────────────────────

function GoldWidget({ rows, pendingCount }: { rows: GoldRow[]; pendingCount: number }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeNvl, setActiveNvl] = useState<string | null>(null);
  const L = useLabels();
  const locale = useLocale();
  const localeCode = locale === "en" ? "en-US" : "vi-VN";

  // Unique NVL list cho filter chips — sort để thứ tự ổn định
  const allNvls = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(r => r.nvls.forEach(n => set.add(n)));
    return Array.from(set).sort();
  }, [rows]);

  // Filter rows theo NVL chip đang active
  const filteredRows = useMemo(
    () => activeNvl ? rows.filter(r => r.nvls.includes(activeNvl)) : rows,
    [rows, activeNvl],
  );

  const totalFiltered = filteredRows.reduce((s, r) => s + r.totalWeight, 0);

  if (rows.length === 0) {
    return (
      <div style={{
        background: "var(--cream-card)",
        border: "1px solid var(--border)",
        padding: "40px 24px",
        textAlign: "center",
      }}>
        <p style={{ fontSize: "13px", color: "var(--ink-muted)", margin: "0 0 4px" }}>
          {L.ui.dashboard.goldEmpty}
        </p>
        <p style={{ fontSize: "11px", color: "var(--ink-muted)", opacity: 0.6, margin: 0 }}>
          {L.ui.dashboard.goldEmptyHint}
        </p>
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid var(--border)", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "10px 20px",
        background: "var(--cream-dark)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink)" }}>
            {L.ui.dashboard.goldHeader}
          </span>
          <span style={{
            fontSize: "10px",
            fontWeight: 500,
            color: "var(--s-gold)",
            border: "1px solid var(--s-gold)",
            padding: "1px 8px",
            letterSpacing: "0.06em",
          }}>
            {pendingCount} {L.ui.dashboard.goldSo}
          </span>
        </div>
        <span style={{ fontSize: "12px", color: "var(--ink-muted)" }}>
          Tổng: <strong style={{ color: "var(--s-gold)" }}>{totalFiltered.toFixed(2)}g</strong>
          {activeNvl && (
            <span style={{ fontSize: "10px", color: "var(--ink-muted)", marginLeft: "4px" }}>
              ({filteredRows.length} SO)
            </span>
          )}
        </span>
      </div>

      {/* NVL filter chips */}
      {allNvls.length > 1 && (
        <div style={{
          padding: "6px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          gap: "4px",
          flexWrap: "wrap",
          background: "var(--cream)",
        }}>
          <button
            onClick={() => { setActiveNvl(null); setExpanded(null); }}
            style={{
              fontSize: "10px", fontWeight: activeNvl === null ? 700 : 400,
              padding: "2px 8px", border: "1px solid",
              borderColor: activeNvl === null ? "var(--ink)" : "var(--border-md)",
              background: activeNvl === null ? "var(--ink)" : "transparent",
              color: activeNvl === null ? "var(--cream)" : "var(--ink-muted)",
              cursor: "pointer", letterSpacing: "0.04em",
            }}
          >
            Tất cả
          </button>
          {allNvls.map(nvl => (
            <button
              key={nvl}
              onClick={() => { setActiveNvl(activeNvl === nvl ? null : nvl); setExpanded(null); }}
              style={{
                fontSize: "10px", fontWeight: activeNvl === nvl ? 700 : 400,
                padding: "2px 8px", border: "1px solid",
                borderColor: activeNvl === nvl ? "var(--s-gold)" : "var(--border-md)",
                background: activeNvl === nvl ? "var(--s-gold)" : "transparent",
                color: activeNvl === nvl ? "#fff" : "var(--ink-muted)",
                cursor: "pointer", letterSpacing: "0.04em",
              }}
            >
              {nvl}
            </button>
          ))}
        </div>
      )}

      {/* Scrollable table — max 450px, header sticky */}
      <div style={{ maxHeight: "450px", overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--cream-dark)" }}>
            <tr>
              <th style={{ width: "32px" }} className="psx-th" />
              <th className="psx-th" style={{ textAlign: "left" }}>{L.ui.dashboard.goldMa}</th>
              <th className="psx-th" style={{ textAlign: "left" }}>{L.ui.dashboard.goldCustomer}</th>
              <th className="psx-th" style={{ textAlign: "left" }}>{L.ui.dashboard.goldNvl}</th>
              <th className="psx-th" style={{ textAlign: "right" }}>{L.ui.dashboard.goldDelivery}</th>
              <th className="psx-th" style={{ textAlign: "right" }}>{L.ui.dashboard.goldWeight3d}</th>
              <th className="psx-th" style={{ textAlign: "right" }}>{L.ui.dashboard.goldCasting}</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <>
                <tr
                  key={row.orderNumber}
                  className="psx-tr"
                  onClick={() => setExpanded(expanded === row.orderNumber ? null : row.orderNumber)}
                >
                  <td className="psx-td" style={{ color: "var(--ink-muted)", paddingRight: 0 }}>
                    {expanded === row.orderNumber
                      ? <ChevronDown style={{ width: "13px", height: "13px" }} />
                      : <ChevronRight style={{ width: "13px", height: "13px" }} />}
                  </td>
                  <td className="psx-td">
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink)", fontFamily: "monospace" }}>
                      {row.orderNumber}
                    </span>
                    <span style={{ fontSize: "10px", color: "var(--ink-muted)", marginLeft: "6px" }}>
                      {row.moCount} MO
                    </span>
                  </td>
                  <td className="psx-td" style={{ fontSize: "12px", color: "var(--ink-muted)", maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.customerName}
                  </td>
                  <td className="psx-td">
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      {row.nvls.map((nvl) => (
                        <span key={nvl} className="psx-badge" style={{ color: "var(--s-gold)", borderColor: "var(--s-gold)", fontSize: "10px" }}>
                          {nvl}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="psx-td" style={{ textAlign: "right", fontSize: "11px", color: "var(--ink-muted)", whiteSpace: "nowrap" }}>
                    {row.requiredDate ? new Date(row.requiredDate).toLocaleDateString(localeCode) : "—"}
                  </td>
                  <td className="psx-td" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 500, color: "var(--ink)" }}>
                    {row.totalWeight > 0 ? `${row.totalWeight.toFixed(2)}g` : <span style={{ color: "var(--border-md)" }}>—</span>}
                  </td>
                  <td className="psx-td" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "var(--s-gold)" }}>
                    {row.castingNeeded > 0 ? `${row.castingNeeded.toFixed(2)}g` : <span style={{ color: "var(--border-md)" }}>—</span>}
                  </td>
                </tr>

                {expanded === row.orderNumber && row.items.map((item, i) => (
                  <tr key={i} style={{ background: "var(--cream)", borderBottom: "1px solid var(--border)" }}>
                    <td className="psx-td" />
                    <td colSpan={2} className="psx-td">
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink)" }}>
                        {formatVersionedDisplay(item.moNumber) || "—"}
                      </span>
                      <span style={{ fontSize: "12px", color: "var(--ink-muted)", marginLeft: "8px" }}>
                        {item.productName}
                      </span>
                    </td>
                    <td className="psx-td">
                      <span className="psx-badge" style={{ fontSize: "10px", color: "var(--s-gold)", borderColor: "var(--s-gold)" }}>
                        {item.nvl}
                      </span>
                    </td>
                    <td className="psx-td" />
                    <td className="psx-td" style={{ textAlign: "right", fontSize: "12px", color: "var(--ink-muted)", fontVariantNumeric: "tabular-nums" }}>
                      {item.weight > 0 ? `${item.weight.toFixed(2)}g` : "—"}
                    </td>
                    <td className="psx-td" style={{ textAlign: "right", fontSize: "12px", color: "var(--ink-muted)", fontVariantNumeric: "tabular-nums" }}>
                      {item.weight > 0 ? `${(item.weight * 1.05).toFixed(2)}g` : "—"}
                    </td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{
        padding: "8px 20px",
        fontSize: "10px",
        color: "var(--ink-muted)",
        background: "var(--cream-dark)",
        borderTop: "1px solid var(--border)",
        margin: 0,
      }}>
        {L.ui.dashboard.goldNote}
      </p>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

export function DashboardClient({
  stats, goldEstimate, pendingCount, currentDate,
}: {
  stats: Stats;
  goldEstimate: GoldRow[];
  pendingCount: number;
  currentDate: string;
}) {
  const L = useLabels();
  const locale = useLocale();
  const localeCode = locale === "en" ? "en-US" : "vi-VN";
  const dateStr = new Date(currentDate).toLocaleDateString(localeCode, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto", background: "var(--cream)" }}>

      {/* ── Page header ────────────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        padding: "18px 32px 14px",
        borderBottom: "1px solid var(--border)",
        background: "var(--cream-card)",
      }}>
        <h1 style={{
          fontFamily: "var(--font-cormorant), Georgia, serif",
          fontSize: "26px",
          fontWeight: 400,
          color: "var(--ink)",
          margin: "0 0 2px",
          letterSpacing: "0.02em",
        }}>
          Dashboard
        </h1>
        <p style={{
          fontSize: "11px",
          color: "var(--ink-muted)",
          margin: 0,
          textTransform: "capitalize",
        }}>
          {dateStr}
        </p>
      </div>

      <div style={{ flex: 1, padding: "28px 32px", display: "flex", flexDirection: "column", gap: "28px", maxWidth: "960px" }}>

        {/* ── Stat cards ─────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", alignItems: "stretch" }}>
          <StatCard label={L.ui.dashboard.total} value={stats.total} sub={L.ui.dashboard.totalSub} href="/dashboard/orders" />
          <StatCard label={L.ui.dashboard.designRoom} value={stats.preProd} sub={L.ui.dashboard.designSub} href="/dashboard/orders?tab=pre-production" />
          <StatCard label={L.ui.dashboard.productionRoom} value={stats.masterHub} sub={L.ui.dashboard.productionSub} href="/dashboard/orders?tab=master-hub" />
          <StatCard
            label={L.ui.dashboard.overdue}
            value={stats.overdue}
            sub={L.ui.dashboard.overdueSub}
            accent={stats.overdue > 0}
            href={stats.overdue > 0 ? "/dashboard/orders?tab=all" : undefined}
          />
        </div>

        {/* ── Alerts ─────────────────────────────────────── */}
        {(stats.suspended > 0 || stats.criticalAlerts > 0) && (
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {stats.suspended > 0 && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 14px",
                border: "1px solid var(--s-red)",
                fontSize: "12px",
                color: "var(--s-red)",
              }}>
                <AlertTriangle style={{ width: "13px", height: "13px" }} />
                <strong>{stats.suspended}</strong> {L.ui.dashboard.suspendedLabel}
                <Link href="/dashboard/orders?status=SUSPENDED" style={{ color: "var(--s-red)", marginLeft: "4px", fontWeight: 700 }}>
                  {L.ui.dashboard.viewLink}
                </Link>
              </div>
            )}
            {stats.criticalAlerts > 0 && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 14px",
                border: "1px solid var(--s-gold)",
                fontSize: "12px",
                color: "var(--s-gold)",
              }}>
                <AlertTriangle style={{ width: "13px", height: "13px" }} />
                <strong>{stats.criticalAlerts}</strong> {L.ui.dashboard.criticalLabel}
              </div>
            )}
          </div>
        )}

        {/* ── Gold widget ─────────────────────────────────── */}
        <div>
          <p className="psx-label" style={{ margin: "0 0 10px" }}>
            {L.ui.dashboard.goldTitle}
          </p>
          <GoldWidget rows={goldEstimate} pendingCount={pendingCount} />
        </div>

        {/* ── Quick links ─────────────────────────────────── */}
        <div>
          <p className="psx-label" style={{ margin: "0 0 12px" }}>
            {L.ui.dashboard.quickAccess}
          </p>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link href="/dashboard/orders/new" className="psx-btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none" }}>
              {L.ui.dashboard.createOrder}
            </Link>
            <Link href="/dashboard/orders?tab=pre-production" className="psx-btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none" }}>
              {L.ui.dashboard.designRoomLink}
            </Link>
            <Link href="/dashboard/orders?tab=master-hub" className="psx-btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none" }}>
              {L.ui.dashboard.productionLink}
            </Link>
            <Link
              href="/dashboard/orders?tab=suspended"
              className="psx-btn-secondary"
              style={{
                display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none",
                color: stats.suspended > 0 ? "var(--s-red)" : undefined,
                borderColor: stats.suspended > 0 ? "var(--s-red)" : undefined,
              }}
            >
              {L.ui.dashboard.suspendedLink} ({stats.suspended})
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
