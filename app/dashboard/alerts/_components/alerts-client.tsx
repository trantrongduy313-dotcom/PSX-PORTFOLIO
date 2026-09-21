"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Plus, X, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useLabels } from "@/app/lib/i18n/locale-context";
import { formatVersionedDisplay } from "@/app/lib/business/order-helpers";

// ─── Types ────────────────────────────────────────────────────────────────────

type AlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type AlertType = "SPECIAL" | "MATERIAL_SHORTAGE" | "RUSH_ORDER" | "QUALITY_ISSUE" | "DESIGN_CHANGE" | "CUSTOMER_COMPLAINT";

type AlertRow = {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string | null;
  isResolved: boolean;
  resolvedAt: Date | string | null;
  resolvedNote: string | null;
  autoSuspended: boolean;
  createdAt: Date | string;
  /** MO# of the specific item that was suspended (per-item alert). Null for full-order alerts. */
  scopedMoNumber: string | null;
  order: {
    id: string;
    orderNumber: string;
    customerName: string;
    status: string;
    zone: string;
    isSuspended: boolean;
    version: number;
    store: { id: string; code: string; name: string } | null;
  };
  raisedBy: { id: string; name: string; email: string; image: string | null } | null;
};

type OrderItem = {
  id: string;
  moNumber: string | null;
  productName: string;
};

type OrderOption = {
  id: string;
  orderNumber: string;
  customerName: string;
  status: string;
  store: { code: string } | null;
  items: OrderItem[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<AlertSeverity, { color: string; borderColor: string; rowBg?: string }> = {
  LOW:      { color: "var(--ink-muted)", borderColor: "var(--border)" },
  MEDIUM:   { color: "var(--s-blue)",    borderColor: "var(--s-blue)" },
  HIGH:     { color: "var(--s-gold)",    borderColor: "var(--s-gold)", rowBg: "rgba(138,106,26,0.05)" },
  CRITICAL: { color: "var(--s-red)",     borderColor: "var(--s-red)",  rowBg: "rgba(200,30,30,0.06)" },
};

// ─── Severity badge ────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const L = useLabels();
  const c = SEVERITY_CONFIG[severity];
  const isCritical = severity === "CRITICAL";
  const severityLabels: Record<AlertSeverity, string> = {
    LOW: L.ui.alerts.severityLow,
    MEDIUM: L.ui.alerts.severityMedium,
    HIGH: L.ui.alerts.severityHigh,
    CRITICAL: L.ui.alerts.severityCritical,
  };
  return (
    <span className="psx-badge" style={{
      color: c.color, borderColor: c.borderColor,
      background: isCritical ? "rgba(200,30,30,0.1)" : undefined,
      fontWeight: isCritical ? 700 : undefined,
      letterSpacing: isCritical ? "0.04em" : undefined,
    }}>
      {(severity === "CRITICAL" || severity === "HIGH") && (
        <AlertTriangle style={{ width: "10px", height: "10px", marginRight: "4px", flexShrink: 0 }} />
      )}
      {severityLabels[severity]}
    </span>
  );
}

// ─── Field primitive ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <label className="psx-label">{label}</label>
      {children}
    </div>
  );
}

// ─── Raise Alert Modal ────────────────────────────────────────────────────────

function RaiseAlertModal({
  orders,
  onClose,
  onSuccess,
  initialOrderId,
}: {
  orders: OrderOption[];
  onClose: () => void;
  onSuccess: (orderId: string) => void;
  initialOrderId?: string;
}) {
  const L = useLabels();
  const [orderId, setOrderId] = useState(initialOrderId ?? "");
  const [scopedItemId, setScopedItemId] = useState("");
  const [type, setType] = useState<AlertType>("SPECIAL");
  const [severity, setSeverity] = useState<AlertSeverity>("HIGH");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const TYPE_LABELS: Record<AlertType, string> = {
    SPECIAL:            L.ui.alerts.typeSPECIAL,
    MATERIAL_SHORTAGE:  L.ui.alerts.typeMATERIAL_SHORTAGE,
    RUSH_ORDER:         L.ui.alerts.typeRUSH_ORDER,
    QUALITY_ISSUE:      L.ui.alerts.typeQUALITY_ISSUE,
    DESIGN_CHANGE:      L.ui.alerts.typeDESIGN_CHANGE,
    CUSTOMER_COMPLAINT: L.ui.alerts.typeCUSTOMER_COMPLAINT,
  };
  const SEVERITY_LABELS: Record<AlertSeverity, string> = {
    LOW: L.ui.alerts.severityLow,
    MEDIUM: L.ui.alerts.severityMedium,
    HIGH: L.ui.alerts.severityHigh,
    CRITICAL: L.ui.alerts.severityCritical,
  };

  // PSX items of the selected order
  const selectedOrder = orders.find(o => o.id === orderId) ?? null;
  const psxItems = selectedOrder?.items ?? [];

  // Auto-select item when only one PSX item
  const effectiveScopedItemId = psxItems.length === 1 ? psxItems[0].id : scopedItemId;

  function handleOrderChange(newOrderId: string) {
    setOrderId(newOrderId);
    setScopedItemId(""); // reset item selection
    setError("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orderId) { setError("Vui lòng chọn đơn hàng"); return; }
    if (psxItems.length > 1 && !effectiveScopedItemId) {
      setError("Vui lòng chọn MO cụ thể cần cảnh báo"); return;
    }
    if (!title.trim()) { setError("Vui lòng nhập tiêu đề cảnh báo"); return; }

    // Optimistic: close immediately, fire API in background
    onClose();

    const promise = fetch(`/api/orders/${orderId}/alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type, severity, title,
        description: description || undefined,
        scopedItemId: effectiveScopedItemId || undefined,
      }),
    }).then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as Record<string, Record<string, string>>).error?.message ?? "Lỗi không xác định");
      }
      onSuccess(orderId);
    });

    toast.promise(promise, {
      loading: "Đang tạo cảnh báo...",
      success: "Đã tạo cảnh báo",
      error: (err: Error) => `Tạo thất bại: ${err.message}`,
    });
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(42,39,37,0.5)" }}>
      <div style={{ background: "var(--cream-card)", width: "100%", maxWidth: "520px", margin: "0 16px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--cream-dark)" }}>
          <h2 style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontSize: "18px", fontWeight: 400, color: "var(--ink)", margin: 0 }}>
            {L.ui.alerts.createTitle}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", padding: "4px", display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <Field label={L.ui.alerts.chooseOrder}>
            <select value={orderId} onChange={e => handleOrderChange(e.target.value)} className="psx-input">
              <option value="">— {L.ui.alerts.chooseOrder} —</option>
              {orders.map(o => (
                <option key={o.id} value={o.id}>
                  {o.orderNumber} · {o.customerName} {o.store ? `(${o.store.code})` : ""}
                </option>
              ))}
            </select>
          </Field>

          {/* MO dropdown: hiện khi đơn có nhiều PSX items — chọn MO nào cần cảnh báo */}
          {psxItems.length > 1 && (
            <Field label={L.ui.alerts.chooseMo}>
              <select value={scopedItemId} onChange={e => setScopedItemId(e.target.value)} className="psx-input">
                <option value="">— {L.ui.alerts.chooseMo} —</option>
                {psxItems.map(item => (
                  <option key={item.id} value={item.id}>
                    {formatVersionedDisplay(item.moNumber) || item.id} — {item.productName}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {psxItems.length === 1 && (
            <p style={{ fontSize: "11px", color: "var(--ink-muted)", margin: 0 }}>
              MO: <strong>{formatVersionedDisplay(psxItems[0].moNumber) || psxItems[0].id}</strong> — {psxItems[0].productName}
              <em style={{ marginLeft: "6px" }}>(tự động chọn)</em>
            </p>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <Field label={L.ui.alerts.typeLabel}>
              <select value={type} onChange={e => setType(e.target.value as AlertType)} className="psx-input">
                {(Object.keys(TYPE_LABELS) as AlertType[]).map(t => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </Field>
            <Field label={L.ui.alerts.severityLabel}>
              <select value={severity} onChange={e => setSeverity(e.target.value as AlertSeverity)} className="psx-input">
                {(Object.keys(SEVERITY_LABELS) as AlertSeverity[]).map(s => (
                  <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Mọi cảnh báo đều tạm ngưng + cảnh báo cũ tự biến mất */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", padding: "10px 12px", background: "var(--cream-dark)", borderLeft: "3px solid var(--s-red)", fontSize: "11px", color: "var(--s-red)" }}>
            <AlertTriangle style={{ width: "13px", height: "13px", marginTop: "1px", flexShrink: 0 }} />
            <span>{L.ui.alerts.autoSuspendWarning}</span>
          </div>

          <Field label={L.ui.alerts.titleField}>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Mô tả ngắn gọn vấn đề..."
              maxLength={200}
              className="psx-input"
            />
          </Field>

          <Field label={L.ui.alerts.descField}>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Mô tả chi tiết tình huống..."
              className="psx-input"
              style={{ resize: "none", padding: "4px 0", height: "auto" }}
            />
          </Field>

          {error && <p style={{ fontSize: "11px", color: "var(--s-red)", margin: 0 }}>{error}</p>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "4px" }}>
            <button type="button" onClick={onClose} className="psx-btn-secondary">{L.ui.alerts.cancelBtn}</button>
            <button type="submit" className="psx-btn-primary">
              {L.ui.alerts.createConfirm}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Resolve Modal ────────────────────────────────────────────────────────────

type ResolveAction = "complete" | "resume" | "showroom" | "rollback" | "cancel";

const RESOLVE_ACTIONS: {
  key: ResolveAction;
  label: string;
  desc: string;
  color: string;
  bg: string;
  border: string;
}[] = [
  // "Hoàn tất" is intentionally excluded: a suspended order has an unresolved issue.
  // User must first resume production, then complete it via the panel.
  {
    key: "resume",
    label: "Tiếp tục sản xuất",
    desc: "Bỏ tạm ngưng, đơn hàng tiếp tục được xử lý bình thường",
    color: "#166534",
    bg: "rgba(22,101,52,0.06)",
    border: "#16a34a",
  },
  {
    key: "showroom",
    label: "Chuyển thành Showroom",
    desc: "Đổi thành Hàng Showroom, gắn hậu tố -SR và tiếp tục sản xuất",
    color: "#1e40af",
    bg: "rgba(30,64,175,0.06)",
    border: "#3b82f6",
  },
  {
    key: "rollback",
    label: "Thiết kế lại",
    desc: "Chuyển MO về Phòng Thiết Kế để xử lý lại từ đầu",
    color: "#92400e",
    bg: "rgba(146,64,14,0.06)",
    border: "#d97706",
  },
  {
    key: "cancel",
    label: "Hủy đơn",
    desc: "Hủy toàn bộ đơn hàng — không thể hoàn tác",
    color: "#991b1b",
    bg: "rgba(153,27,27,0.06)",
    border: "#ef4444",
  },
];

function ResolveModal({
  alert,
  onClose,
  onSuccess,
}: {
  alert: AlertRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const L = useLabels();
  const [selectedAction, setSelectedAction] = useState<ResolveAction | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const RESOLVE_ACTIONS_L = [
    { key: "resume" as ResolveAction,   label: L.ui.alerts.resumeLabel,   desc: L.ui.alerts.resumeDesc,   color: "#166534", bg: "rgba(22,101,52,0.06)",  border: "#16a34a" },
    { key: "showroom" as ResolveAction, label: L.ui.alerts.showroomLabel, desc: L.ui.alerts.showroomDesc, color: "#1e40af", bg: "rgba(30,64,175,0.06)",  border: "#3b82f6" },
    { key: "rollback" as ResolveAction, label: L.ui.alerts.rollbackLabel, desc: L.ui.alerts.rollbackDesc, color: "#92400e", bg: "rgba(146,64,14,0.06)",  border: "#d97706" },
    { key: "cancel" as ResolveAction,   label: L.ui.alerts.cancelLabel,   desc: L.ui.alerts.cancelDesc,   color: "#991b1b", bg: "rgba(153,27,27,0.06)", border: "#ef4444" },
  ];

  // Always show action buttons for PSX orders — user must decide what to do with the MO.
  // Previously only shown when order was actively suspended, but alerts are PSX-only so
  // action buttons are always relevant regardless of current suspension state.
  const showActions = alert.order.zone === "MASTER_HUB";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (showActions && !selectedAction) { setError("Vui lòng chọn một hành động"); return; }
    if (selectedAction === "cancel" && !note.trim()) { setError("Vui lòng nhập lý do hủy đơn"); return; }

    // Optimistic: close immediately, fire API chain in background
    onClose();

    const doAction = async () => {
      let res: Response;

      if (!showActions) {
        res = await fetch(`/api/alerts/${alert.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolvedNote: note || undefined, resumeOrder: false }),
        });
      } else if (selectedAction === "resume") {
        if (alert.order.isSuspended) {
          res = await fetch(`/api/orders/${alert.order.id}/resolve-action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "RESUME", version: alert.order.version, comment: note || undefined }),
          });
        } else {
          res = await fetch(`/api/alerts/${alert.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resolvedNote: note || "Tiếp tục sản xuất", resumeOrder: true }),
          });
        }
      } else if (selectedAction === "complete") {
        const orderDetailRes = await fetch(`/api/orders/${alert.order.id}`);
        const orderDetail = orderDetailRes.ok ? await orderDetailRes.json() : null;
        const suspendedItem = (orderDetail?.data?.items ?? orderDetail?.items ?? [])
          .find((it: { zone: string; itemStatus: string | null }) => it.zone === "MASTER_HUB" && it.itemStatus === "SUSPENDED");
        if (suspendedItem?.id) {
          res = await fetch(`/api/orders/${alert.order.id}/items/${suspendedItem.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemStatus: "COMPLETED" }),
          });
        } else {
          res = await fetch(`/api/orders/${alert.order.id}/production`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ version: alert.order.version, status: "COMPLETED" }),
          });
        }
      } else if (selectedAction === "showroom") {
        const srOrderRes = await fetch(`/api/orders/${alert.order.id}`);
        const srOrderDetail = srOrderRes.ok ? await srOrderRes.json() : null;
        const suspendedForSr = (srOrderDetail?.data?.items ?? srOrderDetail?.items ?? [])
          .find((it: { zone: string; itemStatus: string | null }) => it.zone === "MASTER_HUB" && it.itemStatus === "SUSPENDED");
        if (suspendedForSr?.id) {
          const srMoNumber: string = suspendedForSr.moNumber ?? "";
          const newMoNumber = srMoNumber.endsWith("-SR") ? srMoNumber : `${srMoNumber}-SR`;
          res = await fetch(`/api/orders/${alert.order.id}/items/${suspendedForSr.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ moNumber: newMoNumber, itemStatus: null, specifications: { isShowroom: true } }),
          });
        } else {
          res = await fetch(`/api/orders/${alert.order.id}/resolve-action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "RESUME", convertToShowroom: true, version: alert.order.version, comment: note || undefined }),
          });
        }
      } else if (selectedAction === "rollback") {
        const rbOrderRes = await fetch(`/api/orders/${alert.order.id}`);
        const rbOrderDetail = rbOrderRes.ok ? await rbOrderRes.json() : null;
        const suspendedForRb = (rbOrderDetail?.data?.items ?? rbOrderDetail?.items ?? [])
          .find((it: { zone: string; itemStatus: string | null }) => it.zone === "MASTER_HUB" && it.itemStatus === "SUSPENDED");
        res = await fetch(`/api/orders/${alert.order.id}/rollback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version: alert.order.version,
            reason: note.trim() || "Thiết kế lại từ giải quyết cảnh báo",
            targetStatus: "IN_DESIGN",
            createSnapshot: true,
            ...(suspendedForRb?.id ? { activeItemId: suspendedForRb.id } : {}),
          }),
        });
      } else {
        // cancel
        const orderDetailRes = await fetch(`/api/orders/${alert.order.id}`);
        const orderDetail = orderDetailRes.ok ? await orderDetailRes.json() : null;
        const suspendedItem = (orderDetail?.data?.items ?? orderDetail?.items ?? [])
          .find((it: { zone: string; itemStatus: string | null }) => it.zone === "MASTER_HUB" && it.itemStatus === "SUSPENDED");
        if (suspendedItem?.id) {
          res = await fetch(`/api/orders/${alert.order.id}/items/${suspendedItem.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemStatus: "CANCELLED" }),
          });
        } else {
          res = await fetch(`/api/orders/${alert.order.id}/resolve-action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "CANCEL", reason: note.trim() || "Hủy từ giải quyết cảnh báo", version: alert.order.version }),
          });
        }
      }

      if (!res!.ok) {
        const data = await res!.json().catch(() => ({}));
        throw new Error((data as Record<string, Record<string, string>>).error?.message ?? "Lỗi không xác định");
      }
      onSuccess();
    };

    toast.promise(doAction(), {
      loading: "Đang xử lý...",
      success: "Hoàn tất",
      error: (err: Error) => `Thất bại: ${err.message}`,
    });
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(42,39,37,0.5)" }}>
      <div style={{ background: "var(--cream-card)", width: "100%", maxWidth: "480px", margin: "0 16px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--cream-dark)" }}>
          <h2 style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontSize: "18px", fontWeight: 400, color: "var(--ink)", margin: 0 }}>
            {L.ui.alerts.resolveTitle}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-muted)", padding: "4px", display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Alert context */}
          <div style={{ padding: "10px 14px", background: "var(--cream-dark)", borderLeft: "3px solid var(--s-red)" }}>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink)", margin: "0 0 2px" }}>{alert.title}</p>
            <p style={{ fontSize: "11px", color: "var(--ink-muted)", margin: 0 }}>
              {alert.scopedMoNumber
                ? <><span style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--ink)" }}>MO: {alert.scopedMoNumber}</span> · SO: {alert.order.orderNumber}</>
                : alert.order.orderNumber
              } · {alert.order.customerName}
              {alert.order.store && ` · ${alert.order.store.code}`}
            </p>
          </div>

          {/* Action buttons — always shown for PSX orders */}
          {showActions && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <p className="psx-label">{L.ui.alerts.resolveAction}</p>
              {RESOLVE_ACTIONS_L.map((act) => (
                <button
                  key={act.key}
                  type="button"
                  onClick={() => { setSelectedAction(act.key); setError(""); }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: "2px",
                    padding: "10px 14px",
                    background: selectedAction === act.key ? act.bg : "var(--cream)",
                    border: `1px solid ${selectedAction === act.key ? act.border : "var(--border)"}`,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "border-color 0.12s, background 0.12s",
                    width: "100%",
                  }}
                >
                  <p style={{ fontSize: "12px", fontWeight: 600, color: selectedAction === act.key ? act.color : "var(--ink)", margin: 0 }}>
                    {act.label}
                  </p>
                  <p style={{ fontSize: "11px", color: "var(--ink-muted)", margin: 0 }}>{act.desc}</p>
                </button>
              ))}
            </div>
          )}

          {/* Note / reason */}
          <Field label={
            selectedAction === "cancel" ? L.ui.alerts.noteCancelLabel :
            selectedAction === "rollback" ? L.ui.alerts.noteRollbackLabel :
            L.ui.alerts.noteGenericLabel
          }>
            <textarea
              value={note}
              onChange={e => { setNote(e.target.value); setError(""); }}
              rows={2}
              maxLength={1000}
              placeholder={
                selectedAction === "cancel" ? L.ui.alerts.placeholderCancel :
                selectedAction === "rollback" ? L.ui.alerts.placeholderRollback :
                L.ui.alerts.placeholderGeneric
              }
              className="psx-input"
              style={{ resize: "none", padding: "4px 0", height: "auto" }}
            />
          </Field>

          {/* Warning for destructive actions */}
          {selectedAction === "cancel" && (
            <div style={{ display: "flex", gap: "8px", padding: "8px 12px", background: "rgba(153,27,27,0.06)", borderLeft: "3px solid var(--s-red)", fontSize: "11px", color: "#991b1b" }}>
              <AlertTriangle style={{ width: "13px", height: "13px", marginTop: "1px", flexShrink: 0 }} />
              <span>{L.ui.alerts.cancelWarning}</span>
            </div>
          )}
          {selectedAction === "rollback" && (
            <div style={{ display: "flex", gap: "8px", padding: "8px 12px", background: "rgba(146,64,14,0.06)", borderLeft: "3px solid #d97706", fontSize: "11px", color: "#92400e" }}>
              <AlertTriangle style={{ width: "13px", height: "13px", marginTop: "1px", flexShrink: 0 }} />
              <span>{L.ui.alerts.rollbackWarning}</span>
            </div>
          )}

          {error && <p style={{ fontSize: "11px", color: "var(--s-red)", margin: 0 }}>{error}</p>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "4px" }}>
            <button type="button" onClick={onClose} className="psx-btn-secondary">{L.ui.alerts.cancelBtn}</button>
            <button
              type="submit"
              disabled={showActions && !selectedAction}
              className="psx-btn-primary"
              style={selectedAction === "cancel" ? { background: "var(--s-red)", borderColor: "var(--s-red)" } : undefined}
            >
              {L.ui.alerts.confirm}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Alert row ────────────────────────────────────────────────────────────────

function AlertCard({ alert, onResolve }: { alert: AlertRow; onResolve: (a: AlertRow) => void }) {
  const L = useLabels();
  const [expanded, setExpanded] = useState(false);
  const cfg = SEVERITY_CONFIG[alert.severity];
  const TYPE_LABELS: Record<AlertType, string> = {
    SPECIAL:            L.ui.alerts.typeSPECIAL,
    MATERIAL_SHORTAGE:  L.ui.alerts.typeMATERIAL_SHORTAGE,
    RUSH_ORDER:         L.ui.alerts.typeRUSH_ORDER,
    QUALITY_ISSUE:      L.ui.alerts.typeQUALITY_ISSUE,
    DESIGN_CHANGE:      L.ui.alerts.typeDESIGN_CHANGE,
    CUSTOMER_COMPLAINT: L.ui.alerts.typeCUSTOMER_COMPLAINT,
  };

  const rowBg = alert.isResolved ? "var(--cream-dark)" : (cfg.rowBg ?? "var(--cream-card)");

  return (
    <div style={{
      border: `1px solid ${alert.isResolved ? "var(--border)" : cfg.borderColor}`,
      background: rowBg,
      opacity: alert.isResolved ? 0.65 : 1,
    }}>
      <div
        style={{
          display: "flex", alignItems: "flex-start", gap: "12px",
          padding: "12px 16px", cursor: "pointer",
          background: rowBg,
          borderLeft: alert.isResolved ? "3px solid var(--border)" : `4px solid ${cfg.color}`,
        }}
        onClick={() => setExpanded(e => !e)}
      >
        <AlertTriangle style={{ width: "14px", height: "14px", marginTop: "2px", flexShrink: 0, color: cfg.color }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            <SeverityBadge severity={alert.severity} />
            <span style={{ fontSize: "10px", color: "var(--ink-muted)", background: "var(--cream-dark)", border: "1px solid var(--border)", padding: "1px 7px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              {TYPE_LABELS[alert.type]}
            </span>
            {alert.autoSuspended && (
              <span style={{ fontSize: "10px", color: "var(--s-red)", border: "1px solid var(--s-red)", padding: "1px 7px", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}>
                {L.ui.alerts.suspendedBadge}
              </span>
            )}
          </div>
          <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink)", margin: "4px 0 2px" }}>{alert.title}</p>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {alert.scopedMoNumber
              ? <><span style={{ fontSize: "11px", fontFamily: "monospace", fontWeight: 600, color: "var(--s-blue)" }}>MO: {alert.scopedMoNumber}</span><span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>SO: {alert.order.orderNumber}</span></>
              : <span style={{ fontSize: "11px", color: "var(--s-blue)", fontFamily: "monospace" }}>{alert.order.orderNumber}</span>
            }
            <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>{alert.order.customerName}</span>
            {alert.order.store && (
              <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>{alert.order.store.code}</span>
            )}
            <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>
              · {alert.raisedBy?.name ?? "System"} · {new Date(alert.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {!alert.isResolved && (
            <button
              onClick={e => { e.stopPropagation(); onResolve(alert); }}
              className="psx-btn-secondary"
              style={{ height: "28px", fontSize: "10px", padding: "0 12px" }}
            >
              {L.ui.alerts.resolveBtn}
            </button>
          )}
          {alert.isResolved && (() => {
            const note = alert.resolvedNote ?? "";
            let badge: { label: string; color: string } | null = null;
            if (alert.order.status === "CANCELLED" || note.includes("Hủy")) {
              badge = { label: L.ui.alerts.badgeCancelled, color: "var(--s-red)" };
            } else if (alert.order.customerName === "HÀNG SHOWROOM" || note.toLowerCase().includes("showroom")) {
              badge = { label: L.ui.alerts.badgeShowroom, color: "var(--s-blue)" };
            } else if (alert.autoSuspended && !alert.order.isSuspended) {
              badge = { label: L.ui.alerts.badgeResume, color: "var(--s-green)" };
            }
            return (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {badge && (
                  <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em", color: badge.color, border: `1px solid ${badge.color}`, padding: "1px 6px" }}>
                    {badge.label}
                  </span>
                )}
                <CheckCircle2 style={{ width: "15px", height: "15px", color: "var(--s-green)" }} />
              </div>
            );
          })()}
          <ChevronDown
            style={{
              width: "14px", height: "14px", color: "var(--ink-muted)",
              transition: "transform 0.15s",
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "12px 16px 14px", borderTop: "1px solid var(--border)", background: "var(--cream)" }}>
          {alert.description && (
            <p style={{ fontSize: "13px", color: "var(--ink-body)", margin: "0 0 8px" }}>{alert.description}</p>
          )}
          {alert.isResolved && (
            <p style={{ fontSize: "11px", color: "var(--ink-muted)", margin: "0 0 4px" }}>
              <span style={{ color: "var(--s-green)", fontWeight: 600 }}>{L.ui.alerts.resolvedLabel}</span>
              {alert.resolvedAt && ` · ${new Date(alert.resolvedAt).toLocaleDateString()}`}
              {alert.resolvedNote && ` · ${alert.resolvedNote}`}
            </p>
          )}
          <p style={{ fontSize: "11px", color: "var(--ink-muted)", margin: 0 }}>
            {L.ui.alerts.orderStatus} <span style={{ fontWeight: 600, color: "var(--ink-body)" }}>{alert.order.status}</span>
            {alert.order.isSuspended && <span style={{ marginLeft: "8px", color: "var(--s-red)", fontWeight: 600 }}>· {L.ui.alerts.onHoldStatus}</span>}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function AlertsClient({
  alerts: initialAlerts,
  orders,
  initialOrderId,
  onOrdersInvalidate,
}: {
  alerts: AlertRow[];
  orders: OrderOption[];
  initialOrderId?: string;
  /** Called after any resolve action so parent can invalidate orders cache */
  onOrdersInvalidate?: () => void;
}) {
  const L = useLabels();
  const [alerts, setAlerts] = useState(initialAlerts);
  const [showRaise, setShowRaise] = useState(!!initialOrderId);
  const [resolving, setResolving] = useState<AlertRow | null>(null);
  const [isReloading, setIsReloading] = useState(false);
  const queryClient = useQueryClient();

  const unresolved = alerts.filter(a => !a.isResolved);
  const resolved = alerts.filter(a => a.isResolved);
  const criticalCount = unresolved.filter(a => a.severity === "CRITICAL").length;

  /** Reload alerts list AND invalidate orders cache so the orders table reflects changes */
  async function reload(orderPanelId?: string) {
    setIsReloading(true);
    try {
      const res = await fetch("/api/alerts");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAlerts(data.data);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      // Also invalidate the specific order panel cache so the sidebar shows the new alert
      if (orderPanelId) {
        queryClient.invalidateQueries({ queryKey: ["order-panel", orderPanelId] });
      }
      onOrdersInvalidate?.();
    } catch {
      alert("Không thể tải lại danh sách cảnh báo. Vui lòng tải lại trang.");
    } finally {
      setIsReloading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto", background: "var(--cream)" }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, padding: "16px 24px",
        borderBottom: "1px solid var(--border)",
        background: "var(--cream-card)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <h1 style={{
            fontFamily: "var(--font-cormorant), Georgia, serif",
            fontSize: "22px", fontWeight: 400, color: "var(--ink)", margin: "0 0 2px",
            display: "flex", alignItems: "center", gap: "8px",
          }}>
            <AlertTriangle style={{ width: "18px", height: "18px", color: "var(--s-gold)" }} />
            {L.ui.alerts.pageTitle}
          </h1>
          {criticalCount > 0 && (
            <p style={{ fontSize: "11px", color: "var(--s-red)", margin: 0, fontWeight: 600 }}>
              {criticalCount} {L.ui.alerts.criticalCount}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowRaise(true)}
          disabled={isReloading}
          className="psx-btn-primary"
          style={{ display: "flex", alignItems: "center", gap: "6px" }}
        >
          <Plus style={{ width: "14px", height: "14px" }} />
          {L.ui.alerts.createBtn}
        </button>
      </div>

      <div style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: "24px", maxWidth: "860px" }}>

        {/* Unresolved */}
        <div>
          <p className="psx-label" style={{ marginBottom: "10px" }}>
            {L.ui.alerts.unresolved}
            <span style={{ marginLeft: "8px", fontWeight: 400 }}>({unresolved.length})</span>
          </p>
          {unresolved.length === 0 ? (
            <div style={{ background: "var(--cream-card)", border: "1px solid var(--border)", padding: "40px 24px", textAlign: "center" }}>
              <CheckCircle2 style={{ width: "28px", height: "28px", color: "var(--s-green)", margin: "0 auto 8px", opacity: 0.5 }} />
              <p style={{ fontSize: "13px", color: "var(--ink-muted)", margin: 0 }}>{L.ui.alerts.noAlerts}</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {unresolved.map(a => (
                <AlertCard key={a.id} alert={a} onResolve={setResolving} />
              ))}
            </div>
          )}
        </div>

        {/* Resolved */}
        {resolved.length > 0 && (
          <div>
            <p className="psx-label" style={{ marginBottom: "10px" }}>
              {L.ui.alerts.resolvedTab}
              <span style={{ marginLeft: "8px", fontWeight: 400 }}>({resolved.length})</span>
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {resolved.map(a => (
                <AlertCard key={a.id} alert={a} onResolve={setResolving} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showRaise && (
        <RaiseAlertModal
          orders={orders}
          initialOrderId={initialOrderId}
          onClose={() => setShowRaise(false)}
          onSuccess={(oid) => { setShowRaise(false); reload(oid); onOrdersInvalidate?.(); }}
        />
      )}
      {resolving && (
        <ResolveModal
          alert={resolving}
          onClose={() => setResolving(null)}
          onSuccess={() => { setResolving(null); reload(resolving.order.id); onOrdersInvalidate?.(); }}
        />
      )}
    </div>
  );
}
