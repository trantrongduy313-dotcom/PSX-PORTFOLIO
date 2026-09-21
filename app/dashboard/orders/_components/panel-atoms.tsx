"use client";

import { createContext, useContext } from "react";
import { AlertTriangle } from "lucide-react";

import { cn } from "@/app/lib/utils";
import { useLabels } from "@/app/lib/i18n/locale-context";
import { TONE_CHIP_CLASS } from "@/app/lib/ui/status-tone";
import type { StatusBadge } from "@/app/lib/business/kpi-3d/display";

// Các phần tử trình bày dùng lại trong OrderDetailPanel: nhãn mục, ô có nhãn, dải cảnh báo, chip
// trạng thái. Không phần tử nào ở đây biết về đơn hàng, MO hay trạng thái nghiệp vụ.
//
// Tách khỏi order-detail-panel.tsx (8.552 dòng) theo đường nối thật: đổi cách một ô trông ra sao
// là một lý do để thay đổi, đổi luồng nghiệp vụ của panel là một lý do khác.

/** Panel đang ở chế độ chỉ-đọc — `SectionLabel` và `PreItemsTab` đọc để ẩn phần sửa được. */
export const ReadOnlyCtx = createContext(false);

export function SectionLabel({ children, editable }: {
  children: React.ReactNode;
  editable?: boolean;
}) {
  const readOnly = useContext(ReadOnlyCtx);
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="psx-label">{children}</p>
      {editable && !readOnly && <EditBadge />}
    </div>
  );
}

export function EditBadge() {
  const L = useLabels();
  return (
    <span style={{
      fontSize: "9px", fontWeight: 700, color: "var(--ink-muted)",
      background: "var(--cream-dark)", border: "1px solid var(--border)",
      padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.06em",
    }}>
      {L.ui.panel.canEdit}
    </span>
  );
}

export function Field({ label, required, children }: {
  label: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="psx-label" style={{ display: "block", marginBottom: "6px" }}>
        {label}
        {required && <span style={{ color: "var(--s-red)", marginLeft: "2px" }}>*</span>}
      </label>
      {children}
    </div>
  );
}

export function Banner({ variant, children }: {
  variant: "red" | "amber";
  children: React.ReactNode;
}) {
  const color = variant === "red" ? "var(--s-red)" : "var(--s-gold)";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px",
      border: `1px solid ${color}`, borderLeft: `3px solid ${color}`,
      fontSize: "12px", color,
    }}>
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ flexShrink: 0 }} />
      {children}
    </div>
  );
}

export function inputCls(disabled?: boolean): string {
  return cn("psx-input text-sm", disabled ? "cursor-not-allowed" : "");
}

/**
 * Chip trạng thái ở cuối dòng tóm tắt — neo phải, KHÔNG bị `truncate` cắt.
 *
 * `ml-auto` + `shrink-0`: phần bị cắt là TÊN NGƯỜI (còn đọc được một nửa), không phải phán quyết
 * (mất một nửa là mất hẳn). Nhãn "—" thì không dựng chip: một chip rỗng vẫn là một hình khối.
 */
export function SummaryBadge({ badge }: { badge: StatusBadge | null }) {
  if (!badge || !badge.label || badge.label === "—") return null;
  return (
    <span className={cn(
      "shrink-0 ml-auto rounded border px-1.5 py-0.5 text-[10px] font-semibold",
      TONE_CHIP_CLASS[badge.tone],
    )}>
      {badge.label}
    </span>
  );
}
