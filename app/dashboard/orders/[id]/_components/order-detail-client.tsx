"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AlertCircle, RefreshCw, ArrowLeft, Package, Info, Cog, History } from "lucide-react";
import { cn } from "@/app/lib/utils";
import { StatusBadge, ZoneBadge } from "@/app/dashboard/orders/_components/status-badge";
import type { OrderDetail } from "@/app/lib/types/order";
import { TabInfo } from "./tab-info";
import { TabItems } from "./tab-items";
import { TabProduction } from "./tab-production";
import { TabHistory } from "./tab-history";
import { PausedPanel } from "./paused-panel";
import { ActionMenu, type DialogType } from "./action-menu";
import {
  CancelDialog,
  PromoteDialog,
  RollbackDialog,
  RaiseAlertDialog,
  ResolveAlertDialog,
  RejectDesignDialog,
  QcResultDialog,
  ConfirmDialog,
  EditOrderDialog,
  type EditOrderData,
} from "./dialogs";

type Tab = "info" | "items" | "production" | "history";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "info", label: "Thông tin", icon: <Info className="w-3.5 h-3.5" /> },
  { key: "items", label: "Sản phẩm", icon: <Package className="w-3.5 h-3.5" /> },
  { key: "production", label: "Sản xuất", icon: <Cog className="w-3.5 h-3.5" /> },
  { key: "history", label: "Lịch sử", icon: <History className="w-3.5 h-3.5" /> },
];

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchOrder(id: string): Promise<OrderDetail> {
  const res = await fetch(`/api/orders/${id}`);
  if (!res.ok) throw new Error("Fetch failed");
  return res.json();
}

async function apiRequest(
  url: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
): Promise<OrderDetail> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 409) {
    const err = await res.json();
    throw Object.assign(new Error("CONFLICT"), { tag: "CONFLICT", payload: err });
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Lỗi không xác định");
  }
  return res.json();
}

const postAction   = (id: string, body: Record<string, unknown>) => apiRequest(`/api/orders/${id}/resolve-action`, "POST",  body);
const postPromote  = (id: string, body: Record<string, unknown>) => apiRequest(`/api/orders/${id}/promote`,        "POST",  body);
const postRollback = (id: string, body: Record<string, unknown>) => apiRequest(`/api/orders/${id}/rollback`,       "POST",  body);
const patchOrder   = (id: string, body: Record<string, unknown>) => apiRequest(`/api/orders/${id}`,               "PATCH", body);

// ─── Conflict banner ──────────────────────────────────────────────────────────

function ConflictBanner({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm text-amber-800">
        <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
        Đơn hàng này vừa được cập nhật bởi người dùng khác. Vui lòng tải lại để xem phiên bản mới nhất.
      </div>
      <button
        type="button"
        onClick={onRefresh}
        className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-amber-700 border border-amber-200 bg-white hover:bg-amber-50 px-3 py-1.5 rounded"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Tải lại
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OrderDetailClient({ initialOrder }: { initialOrder: OrderDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const queryKey = ["order", initialOrder.id];

  const { data: order, refetch } = useQuery<OrderDetail>({
    queryKey,
    queryFn: () => fetchOrder(initialOrder.id),
    initialData: initialOrder,
    staleTime: 15_000,
  });

  const [activeTab, setActiveTab] = useState<Tab>("info");
  const [conflictDetected, setConflictDetected] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Dialog state
  const [openDialog, setOpenDialog] = useState<DialogType | null>(null);
  const [resolveAlertId, setResolveAlertId] = useState<string | null>(null);
  const [confirmComment, setConfirmComment] = useState("");

  function closeDialog() {
    setOpenDialog(null);
    setResolveAlertId(null);
    setConfirmComment("");
    setApiError(null);
  }

  function handleConflict() {
    setConflictDetected(true);
    closeDialog();
  }

  function handleSuccess(updated: OrderDetail) {
    queryClient.setQueryData(queryKey, updated);
    setConflictDetected(false);
    closeDialog();
  }

  function handleError(err: unknown) {
    const e = err as { tag?: string; message?: string };
    if (e.tag === "CONFLICT") {
      handleConflict();
    } else {
      setApiError(e.message ?? "Lỗi không xác định");
    }
  }

  // Generic resolve-action mutation
  const actionMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => postAction(order.id, body),
    onSuccess: handleSuccess,
    onError: handleError,
  });

  // Promote mutation
  const promoteMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => postPromote(order.id, body),
    onSuccess: handleSuccess,
    onError: handleError,
  });

  // Rollback mutation
  const rollbackMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => postRollback(order.id, body),
    onSuccess: handleSuccess,
    onError: handleError,
  });

  // Edit info mutation — PATCH /api/orders/[id]
  const editMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => patchOrder(order.id, body),
    onSuccess: handleSuccess,
    onError: handleError,
  });

  const isLoading =
    actionMutation.isPending ||
    promoteMutation.isPending ||
    rollbackMutation.isPending ||
    editMutation.isPending;

  function handleActionMenu(type: DialogType) {
    setApiError(null);
    setOpenDialog(type);
  }

  function handleResolveAlertFromPanel(alertId: string) {
    setResolveAlertId(alertId);
    setOpenDialog("resolveAlert");
  }

  function handleResumeFromPanel() {
    setOpenDialog("resume");
  }

  // ─── Submit handlers ────────────────────────────────────────────────────────

  function submitCancel({ reason }: { reason: string }) {
    actionMutation.mutate({ action: "CANCEL", reason, version: order.version });
  }

  function submitPromote({ comment }: { comment?: string }) {
    promoteMutation.mutate({ comment, version: order.version });
  }

  function submitRollback({ reason, createSnapshot }: { reason: string; createSnapshot: boolean }) {
    rollbackMutation.mutate({ reason, createSnapshot, version: order.version });
  }

  function submitRaiseAlert(data: {
    alertType: string;
    severity: string;
    title: string;
    description?: string;
  }) {
    actionMutation.mutate({ action: "RAISE_ALERT", ...data, version: order.version });
  }

  function submitResolveAlert({ resolveNote }: { resolveNote?: string }) {
    if (!resolveAlertId) return;
    actionMutation.mutate({
      action: "RESOLVE_ALERT",
      alertId: resolveAlertId,
      resolveNote,
      version: order.version,
    });
  }

  function submitSubmitForReview({ comment }: { comment?: string }) {
    actionMutation.mutate({ action: "SUBMIT_FOR_REVIEW", comment, version: order.version });
  }

  function submitApproveDesign({ comment }: { comment?: string }) {
    actionMutation.mutate({ action: "APPROVE_DESIGN", comment, version: order.version });
  }

  function submitRejectDesign({ comment }: { comment: string }) {
    actionMutation.mutate({ action: "REJECT_DESIGN", comment, version: order.version });
  }

  function submitResume({ comment }: { comment?: string }) {
    actionMutation.mutate({ action: "RESUME", comment, version: order.version });
  }

  function submitQcPass({ qcNote }: { qcNote?: string }) {
    actionMutation.mutate({ action: "MARK_QC_PASS", qcNote, version: order.version });
  }

  function submitQcFail({ qcNote }: { qcNote?: string }) {
    actionMutation.mutate({ action: "MARK_QC_FAIL", qcNote, version: order.version });
  }

  function submitEditInfo(data: EditOrderData) {
    const { comment, ...fields } = data;
    editMutation.mutate({
      ...fields,
      version: order.version,
      // TODO: thay bằng ID người dùng thực khi có auth
      updatedById: order.createdBy?.id ?? "system",
      comment,
      // V2: tạo snapshot trước khi sửa nếu đơn còn ở Pre-Production
      createVersion: order.zone === "PRE_PRODUCTION",
      versionReason: comment,
    });
  }

  const unresolvedAlerts = order.alerts.filter((a) => !a.isResolved);
  const resolveAlertObj = resolveAlertId
    ? order.alerts.find((a) => a.id === resolveAlertId)
    : undefined;

  return (
    <>
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-5 py-4">
          {/* Breadcrumb */}
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Danh sách đơn hàng
          </button>

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-gray-900 truncate">{order.orderNumber}</h1>
                <StatusBadge status={order.status} />
                <ZoneBadge zone={order.zone} />
                {order.isSuspended && (
                  <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded border border-red-200">
                    TẠM NGƯNG
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {order.customerName}
                {order.customerPhone ? ` · ${order.customerPhone}` : ""}
              </p>
            </div>
            <div className="shrink-0">
              <ActionMenu order={order} onAction={handleActionMenu} />
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-5xl mx-auto px-5">
          <div className="flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors",
                  activeTab === tab.key
                    ? "border-blue-600 text-blue-700 font-medium"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                )}
              >
                {tab.icon}
                {tab.label}
                {tab.key === "history" && order.workflowHistory.length > 0 && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-1.5 rounded-full">
                    {order.workflowHistory.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Body ───────────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-5 py-5 space-y-4">
        {/* Banners */}
        {conflictDetected && (
          <ConflictBanner
            onRefresh={() => {
              refetch();
              setConflictDetected(false);
            }}
          />
        )}

        {apiError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-red-800">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              {apiError}
            </div>
            <button
              type="button"
              onClick={() => setApiError(null)}
              className="text-red-400 hover:text-red-600 text-xs"
            >
              Đóng
            </button>
          </div>
        )}

        {/* Paused panel */}
        {order.isSuspended && unresolvedAlerts.length > 0 && (
          <PausedPanel
            alerts={unresolvedAlerts}
            onResolveAlert={handleResolveAlertFromPanel}
            onResume={handleResumeFromPanel}
            resolving={isLoading}
          />
        )}

        {/* Tab content */}
        {activeTab === "info" && <TabInfo order={order} />}
        {activeTab === "items" && <TabItems items={order.items} />}
        {activeTab === "production" && <TabProduction productionDetail={order.productionDetail} />}
        {activeTab === "history" && <TabHistory history={order.workflowHistory} />}
      </div>

      {/* ─── Dialogs ────────────────────────────────────────────────────────── */}

      <CancelDialog
        open={openDialog === "cancel"}
        onClose={closeDialog}
        onSubmit={submitCancel}
        loading={isLoading}
      />

      <PromoteDialog
        open={openDialog === "promote"}
        onClose={closeDialog}
        onSubmit={submitPromote}
        loading={isLoading}
      />

      <RollbackDialog
        open={openDialog === "rollback"}
        onClose={closeDialog}
        onSubmit={submitRollback}
        loading={isLoading}
      />

      <RaiseAlertDialog
        open={openDialog === "raiseAlert"}
        onClose={closeDialog}
        onSubmit={submitRaiseAlert}
        loading={isLoading}
      />

      <ResolveAlertDialog
        open={openDialog === "resolveAlert"}
        onClose={closeDialog}
        onSubmit={submitResolveAlert}
        loading={isLoading}
        alertTitle={resolveAlertObj?.title}
      />

      <RejectDesignDialog
        open={openDialog === "rejectDesign"}
        onClose={closeDialog}
        onSubmit={submitRejectDesign}
        loading={isLoading}
      />

      <QcResultDialog
        open={openDialog === "qcPass"}
        onClose={closeDialog}
        onSubmit={submitQcPass}
        loading={isLoading}
        result="PASS"
      />

      <QcResultDialog
        open={openDialog === "qcFail"}
        onClose={closeDialog}
        onSubmit={submitQcFail}
        loading={isLoading}
        result="FAIL"
      />

      {/* Submit for review */}
      <ConfirmDialog
        open={openDialog === "submitForReview"}
        onClose={closeDialog}
        onSubmit={submitSubmitForReview}
        loading={isLoading}
        title="Gửi duyệt thiết kế"
        description="Đơn hàng sẽ chuyển sang trạng thái Chờ duyệt."
        submitLabel="Gửi duyệt"
        comment={confirmComment}
        onCommentChange={setConfirmComment}
      />

      {/* Approve design */}
      <ConfirmDialog
        open={openDialog === "approveDesign"}
        onClose={closeDialog}
        onSubmit={submitApproveDesign}
        loading={isLoading}
        title="Duyệt thiết kế"
        description="Đơn hàng sẽ chuyển sang trạng thái Đã duyệt và có thể chuyển lên Master Hub."
        submitLabel="Duyệt thiết kế"
        comment={confirmComment}
        onCommentChange={setConfirmComment}
      />

      {/* Resume */}
      <ConfirmDialog
        open={openDialog === "resume"}
        onClose={closeDialog}
        onSubmit={submitResume}
        loading={isLoading}
        title="Tiếp tục sản xuất"
        description="Đơn hàng sẽ được bỏ tạm ngưng và tiếp tục sản xuất."
        submitLabel="Tiếp tục"
        comment={confirmComment}
        onCommentChange={setConfirmComment}
      />

      {/* Edit order info — V2: CRITICAL_FIELDS lock applied inside dialog */}
      <EditOrderDialog
        open={openDialog === "editInfo"}
        onClose={closeDialog}
        onSubmit={submitEditInfo}
        loading={isLoading}
        order={order}
      />
    </>
  );
}
