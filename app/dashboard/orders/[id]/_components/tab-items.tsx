"use client";

import { formatCurrency } from "@/app/lib/utils";
import type { OrderItem } from "@/app/lib/types/order";
import { Package, ExternalLink } from "lucide-react";
import { useLabels } from "@/app/lib/i18n/locale-context";
import { DesignFilePreview } from "@/app/dashboard/orders/_components/design-file-preview";

export function TabItems({ items }: { items: OrderItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-sm text-gray-400">
        <Package className="w-8 h-8 mb-2 opacity-30" />
        Chưa có sản phẩm
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4 max-w-3xl">
      {items.map((item) => (
        <ItemCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function ItemCard({ item }: { item: OrderItem }) {
  const L = useLabels();
  const specs = item.specifications as Record<string, string> | null;

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-xs font-bold text-gray-600 shrink-0">
            {item.lineNumber}
          </span>
          <span className="font-medium text-gray-900">{item.productName}</span>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
            {L.category[item.category] ?? item.category}
          </span>
        </div>
        {item.unitPrice && (
          <span className="text-sm font-semibold text-gray-800">
            {formatCurrency(item.unitPrice)} × {item.quantity}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3 grid grid-cols-2 gap-x-8 gap-y-2">
        <Spec label="Số lượng" value={`${item.quantity} cái`} />
        <Spec label="Vật liệu" value={item.material ? L.material[item.material] ?? item.material : null} />
        <Spec label="Trọng lượng" value={item.weightGram ? `${item.weightGram}g` : null} />
        <Spec label="Kích thước" value={item.size} />
        <Spec label="Màu sắc" value={item.color} />
        {item.engraving && <Spec label="Khắc chữ" value={item.engraving} />}

        {/* Flexible specs */}
        {specs &&
          Object.entries(specs).map(([k, v]) => (
            <Spec key={k} label={k} value={String(v)} />
          ))}
      </div>

      {/* Design files — items-start thay vì items-center: ô ảnh xem trước cao hơn dòng chữ
          nên căn giữa sẽ đẩy link "Bản đã duyệt" lệch xuống. */}
      {(item.designFileUrl || item.approvedDesign) && (
        <div className="px-4 py-2 border-t border-gray-100 flex items-start gap-4">
          {item.designFileUrl && (
            <DesignFilePreview url={item.designFileUrl} linkLabel="File thiết kế" size="sm" />
          )}
          {item.approvedDesign && (
            <a
              href={item.approvedDesign}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-green-600 hover:underline flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              Bản đã duyệt
            </a>
          )}
        </div>
      )}

      {/* Production notes */}
      {(item.craftingNote || item.qualityNote || item.crafterName) && (
        <div className="px-4 py-3 border-t border-gray-100 space-y-1.5 bg-purple-50">
          {item.crafterName && (
            <p className="text-xs text-purple-600">
              <strong>Thợ:</strong> {item.crafterName}
            </p>
          )}
          {item.craftingNote && (
            <p className="text-xs text-purple-700 whitespace-pre-wrap">
              <strong>Ghi chú SX:</strong> {item.craftingNote}
            </p>
          )}
          {item.qualityNote && (
            <p className="text-xs text-orange-700 whitespace-pre-wrap">
              <strong>Ghi chú QC:</strong> {item.qualityNote}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-xs text-gray-400">{label}: </span>
      <span className="text-sm text-gray-800">{value}</span>
    </div>
  );
}
