"use client";

import { useState } from "react";
import type { UserRole } from "@/app/generated/prisma/client";
import { Kpi3dClient } from "./kpi-3d-client";
import { Kpi3DConfigClient } from "./kpi-3d-config-client";

type Tab = "report" | "config";

const tabButton = (active: boolean): React.CSSProperties => ({
  height: "34px",
  padding: "0 14px",
  border: "1px solid var(--border)",
  borderBottomColor: active ? "var(--cream)" : "var(--border)",
  background: active ? "var(--cream)" : "var(--cream-card)",
  color: active ? "var(--ink)" : "var(--ink-muted)",
  cursor: "pointer",
  fontSize: "12px",
  fontWeight: active ? 700 : 500,
});

export function Kpi3DShellClient({
  defaultMonth,
  defaultYear,
  currentUserRole,
}: {
  defaultMonth: number;
  defaultYear: number;
  currentUserRole: UserRole;
}) {
  const [tab, setTab] = useState<Tab>("report");

  return (
    <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{
        flexShrink: 0,
        display: "flex",
        gap: "6px",
        padding: "10px 24px 0",
        borderBottom: "1px solid var(--border)",
        background: "var(--cream-card)",
      }}>
        <button type="button" style={tabButton(tab === "report")} onClick={() => setTab("report")}>
          Báo cáo KPI
        </button>
        <button type="button" style={tabButton(tab === "config")} onClick={() => setTab("config")}>
          Cấu hình 3D KPI
        </button>
      </div>

      {tab === "report" ? (
        <Kpi3dClient defaultMonth={defaultMonth} defaultYear={defaultYear} />
      ) : (
        <Kpi3DConfigClient currentUserRole={currentUserRole} />
      )}
    </div>
  );
}
