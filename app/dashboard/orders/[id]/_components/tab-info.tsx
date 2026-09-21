"use client";

import { StatusBadge, ZoneBadge } from "@/app/dashboard/orders/_components/status-badge";
import { formatCurrency, formatDate, cn } from "@/app/lib/utils";
import type { OrderDetail } from "@/app/lib/types/order";
import { Star, Zap, ExternalLink, Calendar, DollarSign, User, FileText, MessageSquare } from "lucide-react";

export function TabInfo({ order }: { order: OrderDetail }) {
  return (
    <div className="p-5 space-y-6 max-w-3xl">
      {/* Customer */}
      <Section title="Khách hàng">
        <Row label="Tên khách" value={order.customerName} />
        <Row label="Số điện thoại" value={order.customerPhone} />
        <Row label="Email" value={order.customerEmail} />
        {order.saleNote && (
          <Row label="Ghi chú Sale">
            <p className="text-sm text-gray-700 whitespace-pre-wrap bg-amber-50 rounded-md px-3 py-2 border border-amber-100">
              {order.saleNote}
            </p>
          </Row>
        )}
      </Section>

      {/* Sale info — V2: NGUON, PHAN_LOAI_KH, DON_HANG_3_SAO, LINK_CHAT */}
      {(order.nguon || order.phanLoaiKh || order.donHang3Sao || order.linkChat) && (
        <Section title="Thông tin sale">
          {order.nguon && <Row label="Nguồn" value={order.nguon} />}
          {order.phanLoaiKh && <Row label="Phân loại KH" value={order.phanLoaiKh} />}
          <Row label="Đơn 3 sao">
            {order.donHang3Sao
              ? <span className="text-sm font-semibold text-yellow-600">★★★ Có</span>
              : <span className="text-sm text-gray-400">Không</span>}
          </Row>
          {order.linkChat && (
            <Row label="Link Chat">
              <a
                href={order.linkChat}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline flex items-center gap-1 break-all"
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                {order.linkChat}
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </Row>
          )}
        </Section>
      )}

      {/* Status & flags */}
      <Section title="Trạng thái">
        <Row label="Trạng thái">
          <div className="flex items-center gap-2">
            <StatusBadge status={order.status} />
            <ZoneBadge zone={order.zone} />
          </div>
        </Row>
        {/* V2: CAP_DO_UU_TIEN */}
        <Row label="Cấp độ ưu tiên">
          <span className={cn(
            "text-sm font-medium",
            order.priorityCode === "UT1" ? "text-red-600" :
            order.priorityCode === "UT2" ? "text-orange-600" :
            order.priorityCode === "SR"  ? "text-purple-600" :
            "text-gray-700"
          )}>
            {order.priorityCode || "Normal"}
          </span>
        </Row>
        <Row label="Cờ">
          <div className="flex items-center gap-3">
            <Flag active={order.isPriority} icon={<Star className="w-4 h-4" />} label="Ưu tiên" activeClass="text-yellow-600" />
            <Flag active={order.isRush} icon={<Zap className="w-4 h-4" />} label="Gấp" activeClass="text-orange-600" />
          </div>
        </Row>
      </Section>

      {/* Dates */}
      <Section title="Ngày tháng">
        <Row label="Ngày tạo" value={formatDate(order.orderDate)} />
        <Row label="Deadline">
          <span className={cn(
            "text-sm",
            order.requiredDate && new Date(order.requiredDate) < new Date() &&
            order.status !== "COMPLETED" && order.status !== "CANCELLED"
              ? "text-red-600 font-medium"
              : "text-gray-700"
          )}>
            <Calendar className="w-3.5 h-3.5 inline mr-1" />
            {formatDate(order.requiredDate)}
          </span>
        </Row>
        {/* V2 ref: TUAN_DU_KIEN — tự tính từ NGAY_DK_HT */}
        {order.requiredDate && (
          <Row label="Tuần dự kiến">
            <span className="text-sm font-medium text-blue-700">
              Tuần {getISOWeek(new Date(order.requiredDate))} / {new Date(order.requiredDate).getFullYear()}
            </span>
          </Row>
        )}
        {order.estimatedDate && (
          <Row label="Dự kiến xong" value={formatDate(order.estimatedDate)} />
        )}
        {order.completedDate && (
          <Row label="Hoàn thành" value={formatDate(order.completedDate)} />
        )}
      </Section>

      {/* Finance */}
      <Section title="Tài chính">
        <Row label="Giá trị ước tính">
          <span className="text-sm font-medium text-gray-900">
            <DollarSign className="w-3.5 h-3.5 inline mr-0.5 text-gray-400" />
            {formatCurrency(order.estimatedTotal, order.currency)}
          </span>
        </Row>
        <Row label="Đặt cọc" value={formatCurrency(order.depositAmount, order.currency)} />
        {order.finalTotal && (
          <Row label="Thành tiền" value={formatCurrency(order.finalTotal, order.currency)} />
        )}
      </Section>

      {/* People */}
      <Section title="Nhân sự">
        {/* V2: SALES — free-text name, no FK */}
        {order.salesName && (
          <Row label="Sales" value={order.salesName} />
        )}
        <Row label="Tạo bởi">
          {order.createdBy ? <UserChip user={order.createdBy} /> : <span className="text-sm text-gray-400">—</span>}
        </Row>
        <Row label="Phụ trách">
          {order.assignedTo ? <UserChip user={order.assignedTo} /> : <span className="text-sm text-gray-400">Chưa giao</span>}
        </Row>
      </Section>

      {/* Design files */}
      {(order.designBriefUrl || order.referenceUrls?.length > 0) && (
        <Section title="File thiết kế">
          {order.designBriefUrl && (
            <Row label="Brief">
              <a
                href={order.designBriefUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline flex items-center gap-1"
              >
                <FileText className="w-3.5 h-3.5" />
                Xem brief
                <ExternalLink className="w-3 h-3" />
              </a>
            </Row>
          )}
          {order.referenceUrls?.length > 0 && (
            <Row label="Ảnh tham khảo">
              <div className="flex flex-wrap gap-2">
                {order.referenceUrls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline border border-blue-200 rounded px-2 py-1"
                  >
                    Ảnh {i + 1}
                  </a>
                ))}
              </div>
            </Row>
          )}
        </Section>
      )}

      {/* Meta */}
      <Section title="Thông tin hệ thống">
        <Row label="ID" value={<span className="font-mono text-xs text-gray-400">{order.id}</span>} />
        <Row label="Phiên bản" value={`v${order.version}`} />
        <Row label="Cập nhật" value={formatDate(order.updatedAt)} />
      </Section>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// V2 ref: TUAN_DU_KIEN — ISO 8601 week number derived from NGAY_DK_HT
function getISOWeek(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</h3>
      <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 px-4 py-3">
      <span className="w-36 shrink-0 text-sm text-gray-500">{label}</span>
      <div className="flex-1 min-w-0">
        {children ?? (
          <span className="text-sm text-gray-800">
            {value == null || value === "" ? "—" : value}
          </span>
        )}
      </div>
    </div>
  );
}

function Flag({
  active,
  icon,
  label,
  activeClass,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  activeClass: string;
}) {
  return (
    <span className={cn("flex items-center gap-1 text-sm", active ? activeClass : "text-gray-300")}>
      {icon}
      {label}
    </span>
  );
}

function UserChip({ user }: { user: { name: string; role: string } }) {
  return (
    <span className="flex items-center gap-1.5 text-sm text-gray-700">
      <User className="w-3.5 h-3.5 text-gray-400" />
      {user.name}
      <span className="text-xs text-gray-400">({user.role})</span>
    </span>
  );
}
