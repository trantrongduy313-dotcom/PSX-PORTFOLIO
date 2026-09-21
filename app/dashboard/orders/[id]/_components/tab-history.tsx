"use client";

import { formatDate, cn } from "@/app/lib/utils";
import type { WorkflowEntry } from "@/app/lib/types/order";
import { STATUS_LABEL, ZONE_LABEL } from "@/app/lib/types/order";
import { Clock, ArrowRight, User, History } from "lucide-react";

const ACTION_LABEL: Record<string, string> = {
  CREATED: "Tạo đơn",
  UPDATED: "Cập nhật",
  STATUS_CHANGED: "Đổi trạng thái",
  ZONE_MOVED: "Chuyển khu vực",
  CANCELLED: "Huỷ đơn",
  SUSPENDED: "Tạm ngưng",
  RESUMED: "Tiếp tục",
  ALERT_RAISED: "Thêm cảnh báo",
  ALERT_RESOLVED: "Xử lý cảnh báo",
  DESIGN_SUBMITTED: "Gửi thiết kế",
  DESIGN_APPROVED: "Duyệt thiết kế",
  DESIGN_REJECTED: "Từ chối thiết kế",
  PROMOTED: "Chuyển lên Master Hub",
  ROLLED_BACK: "Hoàn về Pre-Production",
  QC_PASSED: "QC đạt",
  QC_FAILED: "QC không đạt",
  WORKSHOP_CHANGED: "Đổi xưởng",
  VERSION_SNAPSHOT: "Lưu phiên bản",
};

const ACTION_COLOR: Record<string, string> = {
  CREATED: "bg-blue-100 text-blue-700",
  CANCELLED: "bg-red-100 text-red-700",
  SUSPENDED: "bg-orange-100 text-orange-700",
  RESUMED: "bg-green-100 text-green-700",
  PROMOTED: "bg-purple-100 text-purple-700",
  ROLLED_BACK: "bg-amber-100 text-amber-700",
  ALERT_RAISED: "bg-red-100 text-red-700",
  ALERT_RESOLVED: "bg-green-100 text-green-700",
  QC_PASSED: "bg-green-100 text-green-700",
  QC_FAILED: "bg-red-100 text-red-700",
  DESIGN_APPROVED: "bg-green-100 text-green-700",
  DESIGN_REJECTED: "bg-red-100 text-red-700",
};

export function TabHistory({ history }: { history: WorkflowEntry[] }) {
  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-sm text-gray-400">
        <History className="w-8 h-8 mb-2 opacity-30" />
        Chưa có lịch sử hoạt động
      </div>
    );
  }

  return (
    <div className="p-5 max-w-2xl">
      <div className="space-y-0">
        {history.map((entry, i) => {
          const isLast = i === history.length - 1;
          const colorClass = ACTION_COLOR[entry.action] ?? "bg-gray-100 text-gray-600";

          return (
            <div key={entry.id} className="flex gap-3">
              {/* Timeline column */}
              <div className="flex flex-col items-center">
                <div className={cn("flex items-center justify-center w-7 h-7 rounded-full shrink-0 z-10 text-xs font-bold", colorClass)}>
                  <Clock className="w-3.5 h-3.5" />
                </div>
                {!isLast && <div className="w-0.5 flex-1 min-h-[20px] bg-gray-100" />}
              </div>

              {/* Content */}
              <div className={cn("pb-4 flex-1 min-w-0", isLast && "pb-0")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("text-xs font-semibold px-1.5 py-0.5 rounded", colorClass)}>
                    {ACTION_LABEL[entry.action] ?? entry.action}
                  </span>
                  <TransitionPill entry={entry} />
                </div>

                {entry.comment && (
                  <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded px-2.5 py-1.5 border border-gray-100">
                    {entry.comment}
                  </p>
                )}

                <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                  <User className="w-3 h-3" />
                  <span>{entry.performedBy.name}</span>
                  <span className="opacity-50">·</span>
                  <span>{formatDate(entry.performedAt)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TransitionPill({ entry }: { entry: WorkflowEntry }) {
  const parts: React.ReactNode[] = [];

  if (entry.fromStatus && entry.toStatus && entry.fromStatus !== entry.toStatus) {
    parts.push(
      <span key="status" className="flex items-center gap-1 text-xs text-gray-500">
        <span className="text-gray-400">{STATUS_LABEL[entry.fromStatus] ?? entry.fromStatus}</span>
        <ArrowRight className="w-3 h-3 text-gray-300" />
        <span className="text-gray-700 font-medium">{STATUS_LABEL[entry.toStatus] ?? entry.toStatus}</span>
      </span>
    );
  }

  if (entry.fromZone && entry.toZone && entry.fromZone !== entry.toZone) {
    parts.push(
      <span key="zone" className="flex items-center gap-1 text-xs text-gray-500">
        <span className="text-gray-400">{ZONE_LABEL[entry.fromZone]}</span>
        <ArrowRight className="w-3 h-3 text-gray-300" />
        <span className="text-gray-700 font-medium">{ZONE_LABEL[entry.toZone]}</span>
      </span>
    );
  }

  if (parts.length === 0) return null;
  return <>{parts}</>;
}
