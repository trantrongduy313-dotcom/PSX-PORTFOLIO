"use client";

import { useContext } from "react";
import { ChevronRight } from "lucide-react";

import { cn, formatDate } from "@/app/lib/utils";
import { useLabels } from "@/app/lib/i18n/locale-context";
import type { OrderDetail, OrderStatus } from "@/app/lib/types/order";
import type { ItemForm } from "@/app/lib/utils/order-helpers";
import { shouldShowMaSoMau } from "@/app/lib/business/orders/ma-so-mau";
import { isPartialWriteRole } from "@/app/lib/business/orders/item-writable-fields";
import { Banner, EditBadge, Field, ReadOnlyCtx, inputCls } from "./panel-atoms";
import { PhanLoaiKtSelect } from "./panel-controls";
import {
  ACTION_LABEL, HINH_DANG_HOT_OPTIONS, LOAI_HANG_OPTIONS, LOAI_SP_OPTIONS,
  STATUS_LABEL_VI, STONE_TYPE_OPTIONS, TEN_SP_OPTIONS,
} from "./panel-options";
import { DesignFilePreview } from "./design-file-preview";
import { MoImageUploader } from "./mo-image-uploader";
import { MaSoMauField } from "./ma-so-mau-field";
import { PlatingSelect } from "./plating-select";
import { NvlSelect } from "./nvl-select";

// Hai tab dung chung cua OrderDetailPanel: San pham (PreItemsTab) va Lich su (HistoryTab).
// Ca hai chi doc form da dung san va goi updateItemForm - khong tu nap du lieu, khong mutation.

export function PreItemsTab({
  order, itemForms, dirtyItemIds, isWorking, updateItemForm, activeItemId, activeItemSuspended,
  currentUserRole, onItemSaved,
}: {
  order: OrderDetail;
  itemForms: Record<string, ItemForm>;
  dirtyItemIds: Set<string>;
  isWorking: boolean;
  activeItemSuspended: boolean;
  updateItemForm: (id: string, patch: Partial<ItemForm>) => void;
  activeItemId?: string | null;
  currentUserRole?: string;
  /**
   * Gọi sau khi một thay đổi trong tab này đã LƯU XONG — panel làm mới dữ liệu VÀ danh sách.
   *
   * Tên cũ là `onImageChanged`, và cái tên đó đã hẹp hơn việc nó làm từ lúc ô Mã số mẫu dùng
   * chung nó. Một cái tên hẹp hơn sự thật là chỗ để người sau bỏ sót.
   */
  onItemSaved?: () => void;
}) {
  const isReadOnly = useContext(ReadOnlyCtx);
  const L = useLabels();
  // Use the active item's zone when available; fall back to order zone
  const focusedItem = activeItemId ? (order.items || []).find((i) => i.id === activeItemId) : null;
  const isMh = ((focusedItem as any)?.zone ?? order.zone) === "MASTER_HUB";
  // Khi mở từ một MO cụ thể, chỉ hiển thị item đó
  const displayItems = activeItemId
    ? (order.items || []).filter((item) => item.id === activeItemId)
    : (order.items || []);
  // Khi đơn ở PSX: thông số SP đã chốt — chỉ xem, không cho sửa
  const itemsLocked = isMh;

  return (
    <div className="p-4 space-y-4">
      {itemsLocked && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: "8px",
          padding: "10px 14px", fontSize: "11px", fontWeight: 500, color: "#92400e",
          background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px",
        }}>
          <span style={{ fontSize: "14px", lineHeight: 1, flexShrink: 0 }}>🔒</span>
          {/* ⚠️ Câu gốc chỉ đường tới nút "Thiết kế lại" — vai ghi-một-phần KHÔNG CÓ nút đó
              (footer của họ chỉ có Đóng + Lưu). Hướng dẫn tới một nút không tồn tại. */}
          <span>{isPartialWriteRole(currentUserRole) ? L.ui.panel.specsLockedPartial : L.ui.panel.specsLocked}</span>
        </div>
      )}
      {displayItems.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">{L.ui.panel.noItems}</p>
      ) : (
        displayItems.map((item) => {
          const f = itemForms[item.id];
          if (!f) return null;
          const isDirtyItem = dirtyItemIds.has(item.id);
          const missingNvl = !f.nvl?.trim();
          // Ép kiểu HẸP, không phải `any`: `OrderDetail["items"]` chưa khai hai cột này (cùng
          // lý do các chỗ khác trong file dùng `(x as any).zone`). Khai đúng thứ cần là chỗ này
          // vẫn được trình biên dịch kiểm, thay vì mở toang cả object.
          const itemZone = (item as { zone?: string | null }).zone ?? order.zone;

          return (
            <div key={item.id} style={{
              border: `1px solid ${isDirtyItem ? "var(--pink)" : missingNvl && !isMh ? "var(--s-gold)" : "var(--border)"}`,
              overflow: "hidden",
              opacity: itemsLocked ? 0.85 : 1,
            }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 16px",
                background: "var(--cream-dark)",
                borderBottom: "1px solid var(--border)",
              }}>
                <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink)" }}>
                  {item.lineNumber}. {(() => {
                    const raw = f.productName || item.productName || "";
                    const idx = TEN_SP_OPTIONS.indexOf(raw);
                    return idx >= 0 ? L.tenSp[idx] : raw;
                  })()}
                </p>
                <div className="flex items-center gap-2">
                  {isDirtyItem && <span style={{ fontSize: "10px", color: "var(--pink)", fontWeight: 600 }}>{L.ui.panel.modified}</span>}
                  {missingNvl && !isMh && (
                    <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--s-gold)", border: "1px solid var(--s-gold)", padding: "1px 6px", textTransform: "uppercase" }}>
                      ⚠ {L.ui.panel.missingNvl}
                    </span>
                  )}
                  {itemsLocked && (
                    <span style={{ fontSize: "10px", fontWeight: 600, color: "#92400e", background: "#fef3c7", border: "1px solid #fde68a", padding: "1px 6px", letterSpacing: "0.04em" }}>
                      {L.ui.panel.locked}
                    </span>
                  )}
                  {!isReadOnly && !itemsLocked && <EditBadge />}
                </div>
              </div>

              <div className="p-4 space-y-3" style={{ background: "var(--cream-card)" }}>
                {/* ─── MÃ SỐ MẪU ────────────────────────────────────────────────
                    ĐẶT TRÊN CÙNG, và chỉ ở PSX. Đây là lý do DUY NHẤT R&D mở panel — chôn nó
                    dưới mười ô thông số đã khoá là bắt họ cuộn qua thứ không dùng được.

                    Ô này ĐI THEO NÚT LƯU CHUNG như 40 ô còn lại — hai bản trước từng cho nó
                    tự lưu và bị người dùng bác. Xem ma-so-mau-field.tsx.

                    ⚠️ VÌ THẾ nó phải được gửi CÓ ĐIỀU KIỆN ở chỗ dựng payload (~dòng 1460):
                    route từ chối cả request khi field có mặt mà vai không nhập được. */}
                {shouldShowMaSoMau(itemZone) && (
                  <div data-fieldname="mã số mẫu">
                    <Field label="Mã số mẫu">
                      <MaSoMauField
                        itemZone={itemZone}
                        value={f.masoMau}
                        role={currentUserRole}
                        disabled={activeItemSuspended || isWorking}
                        onChange={(v) => updateItemForm(item.id, { masoMau: v })}
                      />
                    </Field>
                  </div>
                )}

                <div data-fieldname="tên sản phẩm">
                  <Field label={L.ui.form.tenSp}>
                    <select value={f.productName}
                      disabled={activeItemSuspended || isWorking || isReadOnly || itemsLocked}
                      onChange={(e) => updateItemForm(item.id, { productName: e.target.value })}
                      className={inputCls(activeItemSuspended || itemsLocked)}>
                      <option value="">{L.ui.form.select}</option>
                      {TEN_SP_OPTIONS.map((canonical, i) => (
                        <option key={canonical} value={canonical}>{L.tenSp[i] ?? canonical}</option>
                      ))}
                      {f.productName && !TEN_SP_OPTIONS.includes(f.productName) && (
                        <option value={f.productName}>{f.productName}</option>
                      )}
                    </select>
                  </Field>
                </div>

                <div data-fieldname="loại sp">
                  <Field label="Loại SP">
                    <select value={f.loaiSp ?? ""}
                      disabled={activeItemSuspended || isWorking || isReadOnly}
                      onChange={(e) => updateItemForm(item.id, { loaiSp: e.target.value })}
                      className={inputCls(activeItemSuspended)}>
                      <option value="">{L.ui.form.select}</option>
                      {LOAI_SP_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3" data-fieldname="nvl xi mạ">
                  <Field label={L.ui.form.nvl} required>
                    <NvlSelect
                      value={f.nvl}
                      disabled={activeItemSuspended || isWorking || isReadOnly || itemsLocked}
                      onChange={(v) => updateItemForm(item.id, { nvl: v })}
                      className={cn(inputCls(activeItemSuspended || itemsLocked), missingNvl && !isMh && !f.nvl ? "border-amber-400 bg-amber-50" : "")} />
                  </Field>
                  <Field label={L.ui.form.plating}>
                    <PlatingSelect
                      value={f.platingType}
                      disabled={activeItemSuspended || isWorking || isReadOnly || itemsLocked}
                      onChange={(v) => updateItemForm(item.id, { platingType: v })}
                      className={inputCls(activeItemSuspended || itemsLocked)} />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3" data-fieldname="số lượng size kích thước">
                  <Field label={L.ui.form.quantity}>
                    <input type="number" value={item.quantity} readOnly disabled className={inputCls(true)} />
                  </Field>
                  <Field label={L.ui.form.size}>
                    <input type="text" value={f.size}
                      disabled={activeItemSuspended || isWorking || isReadOnly || itemsLocked}
                      onChange={(e) => updateItemForm(item.id, { size: e.target.value })}
                      className={inputCls(activeItemSuspended || itemsLocked)} placeholder={L.ui.form.phSizeSidebar} />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3" data-fieldname="trọng lượng yêu cầu tl loại đá chủ">
                  <Field label={L.ui.form.weightReq}>
                    <input type="number" value={f.weightGram} step="0.01" min="0"
                      disabled={activeItemSuspended || isWorking || isReadOnly || itemsLocked}
                      onChange={(e) => updateItemForm(item.id, { weightGram: e.target.value })}
                      className={inputCls(activeItemSuspended || itemsLocked)} placeholder="0.00" />
                  </Field>
                  <Field label={L.ui.form.mainStone}>
                    <select value={f.mainStoneType}
                      disabled={activeItemSuspended || isWorking || isReadOnly || itemsLocked}
                      onChange={(e) => updateItemForm(item.id, { mainStoneType: e.target.value })}
                      className={inputCls(activeItemSuspended || itemsLocked)}>
                      <option value="">{L.ui.form.select}</option>
                      {STONE_TYPE_OPTIONS.map((canonical, i) => (
                        <option key={canonical} value={canonical}>{L.stoneTypes[i] ?? canonical}</option>
                      ))}
                      {f.mainStoneType && !STONE_TYPE_OPTIONS.includes(f.mainStoneType) && <option value={f.mainStoneType}>{f.mainStoneType}</option>}
                    </select>
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3" data-fieldname="đá chủ đá tấm">
                  <Field label={L.ui.panel.fieldMainStone}>
                    <input type="text" value={f.mainStoneSize}
                      disabled={activeItemSuspended || isWorking || isReadOnly || itemsLocked}
                      onChange={(e) => updateItemForm(item.id, { mainStoneSize: e.target.value })}
                      className={inputCls(activeItemSuspended || itemsLocked)} placeholder={L.ui.form.phMainStoneSidebar} />
                  </Field>
                  <Field label={L.ui.panel.fieldSlabStone}>
                    <input type="text" value={f.chiTietDaTam}
                      disabled={activeItemSuspended || isWorking || isReadOnly || itemsLocked}
                      onChange={(e) => updateItemForm(item.id, { chiTietDaTam: e.target.value })}
                      className={inputCls(activeItemSuspended || itemsLocked)} placeholder={L.ui.form.phSlabStoneSidebar} />
                  </Field>
                </div>

                {/* Phân loại KT — chỉ hiện ở PRE_PRODUCTION (PTK điền); PSX xem/sửa ở tab KỸ THUẬT */}
                {!isMh && (
                <div data-fieldname="phân loại kỹ thuật loại hàng hình dáng hột">
                  <Field label={L.ui.panel.fieldTechClass}>
                    <PhanLoaiKtSelect
                      value={f.techClassification ?? []}
                      onChange={(next) => updateItemForm(item.id, { techClassification: next })}
                      disabled={activeItemSuspended || isWorking || isReadOnly || itemsLocked}
                    />
                  </Field>
                </div>
                )}

                <div className="grid grid-cols-2 gap-3" data-fieldname="loại hàng hình dáng hột">
                  <Field label={L.ui.panel.fieldLoaiHang}>
                    <select value={f.loaiHang}
                      disabled={activeItemSuspended || isWorking || isReadOnly || itemsLocked}
                      onChange={(e) => updateItemForm(item.id, { loaiHang: e.target.value })}
                      className={inputCls(activeItemSuspended || itemsLocked)}>
                      <option value="">{L.ui.form.select}</option>
                      {LOAI_HANG_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                      {f.loaiHang && !LOAI_HANG_OPTIONS.includes(f.loaiHang) && <option value={f.loaiHang}>{f.loaiHang}</option>}
                    </select>
                  </Field>
                  <Field label={L.ui.panel.fieldStoneShape}>
                    <select value={f.hinhDangHot}
                      disabled={activeItemSuspended || isWorking || isReadOnly || itemsLocked}
                      onChange={(e) => updateItemForm(item.id, { hinhDangHot: e.target.value })}
                      className={inputCls(activeItemSuspended || itemsLocked)}>
                      <option value="">{L.ui.form.select}</option>
                      {HINH_DANG_HOT_OPTIONS.map((canonical, i) => (
                        <option key={canonical} value={canonical}>{L.hinhDangHot[i] ?? canonical}</option>
                      ))}
                      {f.hinhDangHot && !HINH_DANG_HOT_OPTIONS.includes(f.hinhDangHot) && <option value={f.hinhDangHot}>{f.hinhDangHot}</option>}
                    </select>
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3" data-fieldname="diễn giải sản phẩm ghi chú sp">
                  <Field label={L.ui.panel.fieldProductDesc}>
                    <textarea value={f.techNote}
                      disabled={activeItemSuspended || isWorking || isReadOnly || itemsLocked}
                      onChange={(e) => updateItemForm(item.id, { techNote: e.target.value })}
                      rows={2} className={cn(inputCls(activeItemSuspended || itemsLocked), "resize-none")}
                      placeholder={L.ui.form.phProductDesc} />
                  </Field>
                  <Field label={L.ui.panel.fieldProductNote}>
                    <textarea value={f.ghiChuSp}
                      disabled={activeItemSuspended || isWorking || isReadOnly || itemsLocked}
                      onChange={(e) => updateItemForm(item.id, { ghiChuSp: e.target.value })}
                      rows={2} className={cn(inputCls(activeItemSuspended || itemsLocked), "resize-none")}
                      placeholder={L.ui.form.phProductNote} />
                  </Field>
                </div>

                {/* Ghi chú Sales — editable ở PTK, read-only ở PSX (itemsLocked) */}
                <div data-fieldname="ghi chú sales từ form">
                  <p className="psx-label" style={{ marginBottom: "6px" }}>{L.ui.form.salesNote}</p>
                  {itemsLocked ? (
                    <div className={inputCls(true)} style={{ minHeight: "36px", whiteSpace: "pre-wrap", lineHeight: 1.5, color: f.saleNote ? "var(--ink-body)" : "var(--ink-muted)", fontStyle: f.saleNote ? "normal" : "italic" }}>
                      {f.saleNote || "—"}
                    </div>
                  ) : (
                    <textarea
                      value={f.saleNote ?? ""}
                      onChange={(e) => updateItemForm(item.id, { saleNote: e.target.value })}
                      disabled={activeItemSuspended || isWorking || isReadOnly}
                      className={inputCls(activeItemSuspended || isReadOnly)}
                      placeholder={L.ui.form.phSalesNoteSidebar}
                      rows={3}
                      style={{ resize: "vertical", minHeight: "60px", lineHeight: 1.5 }}
                    />
                  )}
                </div>

                <div data-fieldname="ảnh file 3d link hình">
                  <Field label={L.ui.form.designFile}>
                    {itemsLocked ? (
                      <DesignFilePreview url={f.designFileUrl} imageUrl={f.designImageUrl} linkLabel={L.ui.panel.viewFile3d} />
                    ) : (
                      <div className="flex flex-col gap-2">
                        <input type="text" value={f.designFileUrl}
                          disabled={activeItemSuspended || isWorking || isReadOnly}
                          onChange={(e) => updateItemForm(item.id, { designFileUrl: e.target.value })}
                          className={inputCls(activeItemSuspended)}
                          placeholder="https://drive.google.com/..." />
                        {/* Ảnh đại diện upload trực tiếp — chỉ ADMIN/ORDER, để nhận diện nhanh
                            trên table view. Link Drive ở trên vẫn giữ song song để xem đủ góc
                            nhìn (Drive thường là folder, webapp không liệt kê được nội dung). */}
                        {(currentUserRole === "ADMIN" || currentUserRole === "ORDER") ? (
                          <MoImageUploader
                            orderId={order.id}
                            orderItemId={item.id}
                            driveUrl={f.designFileUrl}
                            imageUrl={f.designImageUrl}
                            linkLabel={L.ui.panel.viewFile3d}
                            onUploaded={(newUrl) => { updateItemForm(item.id, { designImageUrl: newUrl }); onItemSaved?.(); }}
                            onDeleted={() => { updateItemForm(item.id, { designImageUrl: null }); onItemSaved?.(); }}
                          />
                        ) : (
                          // Xem trước ngay khi dán link — thấy được là dán đúng ảnh hay nhầm file,
                          // thay vì phải lưu rồi mở tab mới mới biết.
                          (f.designFileUrl || f.designImageUrl) && (
                            <DesignFilePreview url={f.designFileUrl} imageUrl={f.designImageUrl} linkLabel={L.ui.panel.viewFile3d} size="sm" />
                          )
                        )}
                      </div>
                    )}
                  </Field>
                </div>
              </div>
            </div>
          );
        })
      )}

      {!isMh && order.items.some((i) => !itemForms[i.id]?.nvl?.trim()) && (
        <Banner variant="amber">{L.ui.panel.missingNvlWarning}</Banner>
      )}
    </div>
  );
}

// ─── History Tab (shared) ─────────────────────────────────────────────────────

export function HistoryTab({ order, compact }: { order: OrderDetail; compact?: boolean }) {
  const entries = order.workflowHistory || [];
  if (entries.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">Chưa có lịch sử.</p>;
  }
  return (
    <div className={cn("space-y-0", compact ? "" : "p-4")}>
      {entries.map((entry, i) => (
        <div key={entry.id} className="flex gap-3">
          <div className="flex flex-col items-center pt-1.5">
            <div className={cn("w-2 h-2 rounded-full shrink-0",
              entry.action === "ZONE_MOVED" || entry.action === "PROMOTED" ? "bg-green-500" :
              entry.action === "SUSPENDED" ? "bg-red-400" : "bg-blue-400"
            )} />
            {i < entries.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
          </div>
          <div className="pb-4 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-gray-800">
                {ACTION_LABEL[entry.action] ?? entry.action}
              </span>
              {entry.toStatus && (
                <>
                  <ChevronRight className="w-3 h-3 text-gray-300" />
                  <span className="text-xs text-gray-600">
                    {STATUS_LABEL_VI[entry.toStatus as OrderStatus] ?? entry.toStatus}
                  </span>
                </>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {entry.performedBy?.name ?? "—"} · {formatDate(entry.performedAt)}
            </p>
            {entry.comment && (
              <p className="text-xs text-gray-500 mt-1 italic">{entry.comment}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
