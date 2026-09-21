"use client";

import type { OrderAlert } from "@/app/lib/types/order";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { formatDate } from "@/app/lib/utils";

const SEVERITY_LABEL: Record<string, string> = {
  LOW: "Thấp",
  MEDIUM: "Trung bình",
  HIGH: "Cao",
  CRITICAL: "Khẩn cấp",
};

const ALERT_TYPE_LABEL: Record<string, string> = {
  SPECIAL: "Đặc biệt",
  MATERIAL_SHORTAGE: "Thiếu vật tư",
  RUSH_ORDER: "Đơn gấp",
  QUALITY_ISSUE: "Vấn đề chất lượng",
  DESIGN_CHANGE: "Thay đổi thiết kế",
  CUSTOMER_COMPLAINT: "Khiếu nại",
};

interface PausedPanelProps {
  alerts: OrderAlert[];
  onResolveAlert?: (alertId: string) => void;
  onResume?: () => void;
  resolving?: boolean;
}

export function PausedPanel({ alerts, onResolveAlert, onResume, resolving }: PausedPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const criticalAlerts = alerts.filter((a) => !a.isResolved && a.severity === "CRITICAL");
  const otherAlerts = alerts.filter((a) => !a.isResolved && a.severity !== "CRITICAL");

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span className="font-semibold text-red-700 text-sm">
            Đơn hàng đang TẠM NGƯNG
          </span>
          <span className="text-xs bg-red-100 text-red-600 border border-red-200 px-1.5 py-0.5 rounded font-medium">
            {alerts.filter((a) => !a.isResolved).length} cảnh báo chưa xử lý
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-red-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-red-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-red-200 divide-y divide-red-100">
          {/* Critical alerts */}
          {criticalAlerts.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              onResolve={onResolveAlert ? () => onResolveAlert(alert.id) : undefined}
              resolving={resolving}
              isCritical
            />
          ))}

          {/* Other alerts */}
          {otherAlerts.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              onResolve={onResolveAlert ? () => onResolveAlert(alert.id) : undefined}
              resolving={resolving}
            />
          ))}

          {/* Resume hint */}
          <div className="px-4 py-3 bg-red-50 flex items-center justify-between">
            <p className="text-xs text-red-600">
              {criticalAlerts.length > 0
                ? "Phải giải quyết tất cả cảnh báo Khẩn cấp trước khi tiếp tục."
                : "Tất cả cảnh báo Khẩn cấp đã được xử lý. Có thể tiếp tục sản xuất."}
            </p>
            {onResume && criticalAlerts.length === 0 && (
              <button
                type="button"
                onClick={onResume}
                disabled={resolving}
                className="ml-4 shrink-0 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded disabled:opacity-50"
              >
                Tiếp tục sản xuất
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AlertRow({
  alert,
  onResolve,
  resolving,
  isCritical,
}: {
  alert: OrderAlert;
  onResolve?: () => void;
  resolving?: boolean;
  isCritical?: boolean;
}) {
  return (
    <div className={`px-4 py-3 ${isCritical ? "bg-red-50" : "bg-orange-50"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                isCritical ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
              }`}
            >
              {SEVERITY_LABEL[alert.severity]}
            </span>
            <span className="text-xs text-gray-500">
              {ALERT_TYPE_LABEL[alert.type] ?? alert.type}
            </span>
          </div>
          <p className="mt-0.5 text-sm font-medium text-gray-800">{alert.title}</p>
          {alert.description && (
            <p className="text-xs text-gray-600 mt-0.5">{alert.description}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">{formatDate(alert.createdAt)}</p>
        </div>
        {onResolve && (
          <button
            type="button"
            onClick={onResolve}
            disabled={resolving}
            className="shrink-0 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 bg-white hover:bg-gray-50 px-2.5 py-1 rounded disabled:opacity-40"
          >
            Xử lý
          </button>
        )}
      </div>
    </div>
  );
}
