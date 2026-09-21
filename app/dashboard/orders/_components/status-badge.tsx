"use client";

import type { OrderStatus, OrderZone } from "@/app/lib/types/order";
import { useLabels } from "@/app/lib/i18n/locale-context";

// Color (text + border) per status — transparent bg, border pill via psx-badge
const STATUS_COLOR: Record<OrderStatus, string> = {
  DRAFT:              "var(--ink-muted)",
  PENDING_DESIGN:     "var(--ink-muted)",
  IN_DESIGN:          "var(--s-blue)",
  DESIGN_REVIEW:      "var(--s-blue)",
  DESIGN_APPROVED:    "var(--s-gold)",
  DESIGN_COMPLETED:   "var(--s-green)",
  PENDING_PRODUCTION: "var(--s-gold)",
  IN_PRODUCTION:      "var(--s-gold)",
  QUALITY_CHECK:      "var(--s-green)",
  COMPLETED:          "var(--s-green)",
  SUSPENDED:          "var(--s-red)",
  CANCELLED:          "var(--ink-muted)",
};

const ZONE_COLOR: Record<OrderZone, string> = {
  PRE_PRODUCTION: "var(--s-blue)",
  MASTER_HUB:     "var(--pink)",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const L = useLabels();
  const color = STATUS_COLOR[status] ?? "var(--ink-muted)";
  return (
    <span
      className="psx-badge"
      style={{
        color,
        borderColor: color,
        textDecoration: status === "CANCELLED" ? "line-through" : undefined,
      }}
    >
      {L.status[status] ?? status}
    </span>
  );
}

export function ZoneBadge({ zone }: { zone: OrderZone }) {
  const L = useLabels();
  const color = ZONE_COLOR[zone] ?? "var(--ink-muted)";
  return (
    <span
      className="psx-badge"
      style={{ color, borderColor: color }}
    >
      {L.zone[zone] ?? zone}
    </span>
  );
}
