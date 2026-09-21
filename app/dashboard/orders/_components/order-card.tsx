"use client";

import Link from "next/link";
import { StatusBadge, ZoneBadge } from "./status-badge";
import { formatCurrency, formatDate, isOverdue, cn } from "@/app/lib/utils";
import { getBaseSoNumber } from "@/app/lib/utils/order-helpers";
import { formatMoVersionedDisplay } from "@/app/lib/business/order-helpers";
import type { OrderSummary } from "@/app/lib/types/order";

// V2 ref: col-pri — màu theo CAP_DO_UU_TIEN
const PRIORITY_DOT: Record<string, string> = {
  UT1:    "bg-amber-500",
  UT2:    "bg-blue-700",
  SR:     "bg-red-600",
  Normal: "bg-gray-300",
};

const PRIORITY_LABEL: Record<string, string> = {
  UT1: "Siêu gấp",
  UT2: "Gấp",
  SR:  "SR",
};

export function OrderCard({
  order,
  onCardClick,
  hideZoneBadge = false,
}: {
  order: OrderSummary;
  onCardClick?: (id: string) => void;
  hideZoneBadge?: boolean;
}) {
  const overdue =
    isOverdue(order.requiredDate) &&
    order.status !== "COMPLETED" &&
    order.status !== "CANCELLED";

  const dotColor = PRIORITY_DOT[order.priorityCode] ?? "bg-gray-300";
  const priorityLabel = PRIORITY_LABEL[order.priorityCode];
  const fi = order.firstItem;

  const cardCls = cn(
    "group block rounded-xl border bg-white p-4 hover:shadow-md transition-all duration-150 text-left w-full",
    order.isSuspended
      ? "border-red-300 bg-red-50/60"
      : overdue
      ? "border-orange-200"
      : "border-gray-200 hover:border-blue-200"
  );

  const inner = (
    <>
      {/* Header: MO# + priority dot + alerts + status badges */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          {/* Priority dot */}
          <span
            className={cn("inline-block w-2.5 h-2.5 rounded-full shrink-0 mt-0.5", dotColor)}
            title={priorityLabel ?? "Normal"}
          />
          <div className="min-w-0">
            {/* MO# với prefix label */}
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-muted, #9ca3af)" }}>
                MO
              </span>
              <span className="font-mono text-sm font-bold text-gray-800 group-hover:text-blue-700 transition-colors">
                {/* Cùng khuôn với orders-table.tsx — thẻ và bảng là hai cách xem CÙNG một
                    danh sách, mã hiện khác nhau thì user tưởng là hai đơn khác nhau. */}
                {formatMoVersionedDisplay(fi?.moNumber, fi?.isFromWebapp ?? false) || order.orderNumber}
              </span>
              {priorityLabel && (
                <span className="text-[10px] font-semibold text-gray-400 uppercase">
                  {priorityLabel}
                </span>
              )}
              {order._count.alerts > 0 && (
                <span className="text-[10px] font-bold text-red-500 uppercase tracking-wide">
                  ! Cảnh báo
                </span>
              )}
            </div>
            {/* SO# + ngày tạo */}
            <div className="flex items-center gap-2 mt-0.5" style={{ color: "var(--ink-muted, #9ca3af)", fontSize: "11px" }}>
              {fi?.moNumber != null && fi.moNumber !== order.orderNumber && (
                <span>
                  <span className="font-semibold text-[10px] uppercase tracking-wide" style={{ marginRight: "3px" }}>SO</span>
                  {getBaseSoNumber(order.orderNumber)}
                </span>
              )}
              <span>{formatDate(order.firstItem?.orderDate ?? order.orderDate)}</span>
            </div>
          </div>
        </div>

        {/* Badges trạng thái — inline row */}
        <div className="shrink-0 flex flex-row flex-wrap items-start justify-end gap-1">
          <StatusBadge status={order.status} />
          {!hideZoneBadge && <ZoneBadge zone={order.zone} />}
        </div>
      </div>

      {/* Khách hàng */}
      <p className="text-sm font-semibold text-gray-900 truncate">
        {order.customerName}
      </p>

      {/* Sản phẩm (V2: tenSp) — firstItem.productName */}
      {fi && (
        <div className="mt-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-100 text-xs text-gray-700 space-y-0.5">
          <p className="font-medium truncate" title={fi.productName}>
            {fi.productName}
          </p>
          {/* NVL + Size + SL inline */}
          {(fi.nvl || fi.size || fi.quantity > 0) && (
            <div className="flex gap-3 text-gray-500 flex-wrap">
              {fi.nvl     && <span>NVL: <span className="font-mono font-medium text-gray-700">{fi.nvl}</span></span>}
              {fi.size    && <span>Size: {fi.size}</span>}
              {fi.quantity > 0 && <span>SL: <span className="font-medium text-gray-700">{fi.quantity}</span></span>}
            </div>
          )}
          {/* Đá chủ */}
          {fi.mainStoneType && (
            <p className="text-gray-500 truncate">
              Đá: {fi.mainStoneType}{fi.mainStoneSize ? ` ${fi.mainStoneSize}` : ""}
            </p>
          )}
          {/* Ghi chú SP */}
          {fi.ghiChuSp && (
            <p className="text-gray-400 line-clamp-1 italic" title={fi.ghiChuSp}>
              {fi.ghiChuSp}
            </p>
          )}
        </div>
      )}

      {/* Footer 1 dòng: deadline + Sales + giá trị */}
      <div className="flex items-center justify-between gap-2 text-xs text-gray-400 mt-2.5">
        <div className="flex items-center gap-3 min-w-0">
          {order.requiredDate && (
            <span className={cn("shrink-0", overdue ? "text-red-600 font-semibold" : "text-gray-400")}>
              {formatDate(order.requiredDate, { relative: true })}
            </span>
          )}
          {order.salesName && (
            <span className="truncate">
              Sales: <span className="text-gray-600">{order.salesName}</span>
            </span>
          )}
        </div>
        {order.estimatedTotal && (
          <span className="shrink-0 font-semibold text-gray-700 tabular-nums">
            {formatCurrency(order.estimatedTotal)}
          </span>
        )}
      </div>
    </>
  );

  if (onCardClick) {
    return (
      <button type="button" onClick={() => onCardClick(order.id)} className={cardCls}>
        {inner}
      </button>
    );
  }

  return (
    <Link href={`/dashboard/orders/${order.id}`} className={cardCls}>
      {inner}
    </Link>
  );
}
