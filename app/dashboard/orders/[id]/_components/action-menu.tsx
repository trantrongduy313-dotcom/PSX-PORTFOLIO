"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Play, ArrowLeft, CheckCircle, XCircle, AlertTriangle, Ban, ThumbsUp, ThumbsDown, Pencil, Edit2 } from "lucide-react";
import type { OrderDetail } from "@/app/lib/types/order";

export type DialogType =
  | "cancel"
  | "promote"
  | "rollback"
  | "raiseAlert"
  | "resolveAlert"
  | "submitForReview"
  | "approveDesign"
  | "rejectDesign"
  | "resume"
  | "qcPass"
  | "qcFail"
  | "editInfo";

interface ActionItem {
  key: DialogType;
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  separator?: boolean;
}

function getAvailableActions(order: OrderDetail): ActionItem[] {
  const { status, zone, isSuspended } = order;
  const actions: ActionItem[] = [];

  // Sửa thông tin — luôn hiển thị trừ khi đã huỷ
  if (status !== "CANCELLED") {
    actions.push({
      key: "editInfo",
      label: "Sửa thông tin",
      icon: <Edit2 className="w-4 h-4" />,
    });
  }

  if (isSuspended) {
    actions.push({
      key: "raiseAlert",
      label: "Thêm cảnh báo",
      icon: <AlertTriangle className="w-4 h-4" />,
      separator: true,
    });
    if (order.alerts.some((a) => !a.isResolved)) {
      actions.push({
        key: "resolveAlert",
        label: "Xử lý cảnh báo",
        icon: <CheckCircle className="w-4 h-4" />,
      });
    }
    actions.push({ key: "resume", label: "Tiếp tục sản xuất", icon: <Play className="w-4 h-4" />, separator: true });
    actions.push({ key: "cancel", label: "Huỷ đơn", icon: <Ban className="w-4 h-4" />, danger: true });
    return actions;
  }

  if (zone === "PRE_PRODUCTION") {
    if (status === "DRAFT" || status === "IN_DESIGN") {
      actions.push({
        key: "submitForReview",
        label: "Gửi duyệt thiết kế",
        icon: <Pencil className="w-4 h-4" />,
        separator: true,
      });
    }
    if (status === "DESIGN_REVIEW") {
      actions.push({
        key: "approveDesign",
        label: "Duyệt thiết kế",
        icon: <ThumbsUp className="w-4 h-4" />,
        separator: true,
      });
      actions.push({
        key: "rejectDesign",
        label: "Từ chối thiết kế",
        icon: <ThumbsDown className="w-4 h-4" />,
        danger: true,
      });
    }
    if (status === "DESIGN_APPROVED") {
      actions.push({
        key: "promote",
        label: "Chuyển lên Master Hub",
        icon: <Play className="w-4 h-4" />,
        separator: true,
      });
    }
  }

  if (zone === "MASTER_HUB") {
    if (status === "QUALITY_CHECK") {
      actions.push({ key: "qcPass", label: "QC Đạt", icon: <CheckCircle className="w-4 h-4" />, separator: true });
      actions.push({ key: "qcFail", label: "QC Không đạt", icon: <XCircle className="w-4 h-4" />, danger: true });
    }
    actions.push({
      key: "rollback",
      label: "Hoàn về Pre-Production",
      icon: <ArrowLeft className="w-4 h-4" />,
      danger: true,
      separator: actions.length > 0,
    });
  }

  actions.push({
    key: "raiseAlert",
    label: "Thêm cảnh báo",
    icon: <AlertTriangle className="w-4 h-4" />,
    separator: actions.length > 0,
  });

  if (status !== "COMPLETED" && status !== "CANCELLED") {
    actions.push({
      key: "cancel",
      label: "Huỷ đơn",
      icon: <Ban className="w-4 h-4" />,
      danger: true,
    });
  }

  return actions;
}

interface ActionMenuProps {
  order: OrderDetail;
  onAction: (type: DialogType) => void;
}

export function ActionMenu({ order, onAction }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const actions = getAvailableActions(order);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (actions.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm"
      >
        Hành động
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 overflow-hidden">
          {actions.map((action) => (
            <div key={action.key}>
              {action.separator && <div className="my-1 border-t border-gray-100" />}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onAction(action.key);
                }}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left hover:bg-gray-50 ${
                  action.danger ? "text-red-600 hover:bg-red-50" : "text-gray-700"
                }`}
              >
                <span className={action.danger ? "text-red-500" : "text-gray-400"}>
                  {action.icon}
                </span>
                {action.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
