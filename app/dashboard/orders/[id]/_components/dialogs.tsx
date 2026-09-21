"use client";

import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { cn } from "@/app/lib/utils";
import type { OrderDetail } from "@/app/lib/types/order";
// Ô ngày dùng chung — LUÔN dd/mm/yyyy. `<input type="date">` trần hiện mm/dd/yyyy trên máy đặt
// vùng Mỹ, và với ô Deadline thì "08/09" đọc nhầm là lệch một tháng.
import { DateInput } from "@/app/dashboard/orders/_components/date-input";

// ─── Generic modal shell ──────────────────────────────────────────────────────

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormFooter({
  onClose,
  loading,
  submitLabel,
  danger,
}: {
  onClose: () => void;
  loading: boolean;
  submitLabel: string;
  danger?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50">
      <button
        type="button"
        onClick={onClose}
        disabled={loading}
        className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
      >
        Huỷ
      </button>
      <button
        type="submit"
        disabled={loading}
        className={cn(
          "px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50",
          danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
        )}
      >
        {loading ? "Đang xử lý..." : submitLabel}
      </button>
    </div>
  );
}

// ─── Cancel dialog ────────────────────────────────────────────────────────────

export function CancelDialog({
  open,
  onClose,
  onSubmit,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { reason: string }) => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ reason });
  }

  return (
    <Modal open={open} onClose={onClose} title="Huỷ đơn hàng">
      <form onSubmit={handleSubmit}>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-600">
            Đơn hàng sẽ bị huỷ và không thể hoàn tác. Vui lòng nhập lý do.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Lý do huỷ <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
              placeholder="Nhập lý do huỷ đơn..."
            />
          </div>
        </div>
        <FormFooter onClose={onClose} loading={loading} submitLabel="Huỷ đơn" danger />
      </form>
    </Modal>
  );
}

// ─── Promote dialog ───────────────────────────────────────────────────────────

export function PromoteDialog({
  open,
  onClose,
  onSubmit,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { comment?: string }) => void;
  loading: boolean;
}) {
  const [comment, setComment] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ comment: comment.trim() || undefined });
  }

  return (
    <Modal open={open} onClose={onClose} title="Chuyển lên Master Hub">
      <form onSubmit={handleSubmit}>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-600">
            Đơn hàng sẽ được chuyển sang khu vực sản xuất (Master Hub) với trạng thái{" "}
            <strong>Chờ sản xuất</strong>.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Ghi chú (tuỳ chọn)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              placeholder="Ghi chú bàn giao..."
            />
          </div>
        </div>
        <FormFooter onClose={onClose} loading={loading} submitLabel="Chuyển lên Master Hub" />
      </form>
    </Modal>
  );
}

// ─── Rollback dialog ──────────────────────────────────────────────────────────

export function RollbackDialog({
  open,
  onClose,
  onSubmit,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { reason: string; createSnapshot: boolean }) => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState("");
  const [snapshot, setSnapshot] = useState(true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ reason, createSnapshot: snapshot });
  }

  return (
    <Modal open={open} onClose={onClose} title="Hoàn về Pre-Production">
      <form onSubmit={handleSubmit}>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-600">
            Đơn hàng sẽ được đưa về khu vực thiết kế (Pre-Production). Toàn bộ thông tin sản xuất
            hiện tại sẽ bị xoá.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Lý do <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              placeholder="Nhập lý do hoàn trả..."
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={snapshot}
              onChange={(e) => setSnapshot(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-700">Lưu snapshot trạng thái Master Hub hiện tại</span>
          </label>
        </div>
        <FormFooter onClose={onClose} loading={loading} submitLabel="Hoàn về Pre-Production" danger />
      </form>
    </Modal>
  );
}

// ─── Raise Alert dialog ───────────────────────────────────────────────────────

const ALERT_TYPES = [
  { value: "SPECIAL", label: "Đặc biệt" },
  { value: "MATERIAL_SHORTAGE", label: "Thiếu vật tư" },
  { value: "RUSH_ORDER", label: "Đơn gấp" },
  { value: "QUALITY_ISSUE", label: "Vấn đề chất lượng" },
  { value: "DESIGN_CHANGE", label: "Thay đổi thiết kế" },
  { value: "CUSTOMER_COMPLAINT", label: "Khiếu nại" },
] as const;

const SEVERITIES = [
  { value: "LOW", label: "Thấp" },
  { value: "MEDIUM", label: "Trung bình" },
  { value: "HIGH", label: "Cao" },
  { value: "CRITICAL", label: "Khẩn cấp — tự động tạm ngưng" },
] as const;

export function RaiseAlertDialog({
  open,
  onClose,
  onSubmit,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    alertType: string;
    severity: string;
    title: string;
    description?: string;
  }) => void;
  loading: boolean;
}) {
  const [alertType, setAlertType] = useState("SPECIAL");
  const [severity, setSeverity] = useState("MEDIUM");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      alertType,
      severity,
      title,
      description: description.trim() || undefined,
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Thêm cảnh báo">
      <form onSubmit={handleSubmit}>
        <div className="px-5 py-4 space-y-4">
          {severity === "CRITICAL" && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              Cảnh báo Khẩn cấp sẽ tự động tạm ngưng đơn hàng.
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Loại cảnh báo
              </label>
              <select
                value={alertType}
                onChange={(e) => setAlertType(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {ALERT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Mức độ
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {SEVERITIES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Tiêu đề <span className="text-red-500">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              type="text"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Mô tả ngắn về vấn đề..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Chi tiết (tuỳ chọn)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>
        <FormFooter onClose={onClose} loading={loading} submitLabel="Thêm cảnh báo" />
      </form>
    </Modal>
  );
}

// ─── Resolve Alert dialog ─────────────────────────────────────────────────────

export function ResolveAlertDialog({
  open,
  onClose,
  onSubmit,
  loading,
  alertTitle,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { resolveNote?: string }) => void;
  loading: boolean;
  alertTitle?: string;
}) {
  const [note, setNote] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ resolveNote: note.trim() || undefined });
  }

  return (
    <Modal open={open} onClose={onClose} title="Xử lý cảnh báo">
      <form onSubmit={handleSubmit}>
        <div className="px-5 py-4 space-y-4">
          {alertTitle && (
            <p className="text-sm text-gray-600">
              Đánh dấu đã xử lý: <strong>{alertTitle}</strong>
            </p>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Ghi chú xử lý (tuỳ chọn)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Mô tả cách xử lý..."
            />
          </div>
        </div>
        <FormFooter onClose={onClose} loading={loading} submitLabel="Xác nhận xử lý" />
      </form>
    </Modal>
  );
}

// ─── Reject design dialog ─────────────────────────────────────────────────────

export function RejectDesignDialog({
  open,
  onClose,
  onSubmit,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { comment: string }) => void;
  loading: boolean;
}) {
  const [comment, setComment] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ comment });
  }

  return (
    <Modal open={open} onClose={onClose} title="Từ chối thiết kế">
      <form onSubmit={handleSubmit}>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Lý do từ chối <span className="text-red-500">*</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              required
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Nêu rõ lý do từ chối thiết kế..."
            />
          </div>
        </div>
        <FormFooter onClose={onClose} loading={loading} submitLabel="Từ chối" danger />
      </form>
    </Modal>
  );
}

// ─── QC result dialogs ────────────────────────────────────────────────────────

export function QcResultDialog({
  open,
  onClose,
  onSubmit,
  loading,
  result,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { qcNote?: string }) => void;
  loading: boolean;
  result: "PASS" | "FAIL";
}) {
  const [qcNote, setQcNote] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ qcNote: qcNote.trim() || undefined });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={result === "PASS" ? "QC Đạt" : "QC Không đạt"}
    >
      <form onSubmit={handleSubmit}>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-600">
            {result === "PASS"
              ? "Đơn hàng vượt qua kiểm tra chất lượng và sẽ chuyển sang trạng thái Hoàn thành."
              : "Đơn hàng không đạt QC và sẽ quay lại sản xuất để làm lại."}
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Ghi chú QC (tuỳ chọn)
            </label>
            <textarea
              value={qcNote}
              onChange={(e) => setQcNote(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Ghi chú kết quả kiểm tra..."
            />
          </div>
        </div>
        <FormFooter
          onClose={onClose}
          loading={loading}
          submitLabel={result === "PASS" ? "Xác nhận đạt" : "Xác nhận không đạt"}
          danger={result === "FAIL"}
        />
      </form>
    </Modal>
  );
}

// ─── Edit Order dialog ────────────────────────────────────────────────────────

// V2: CAP_DO_UU_TIEN — UT1 (+7d), UT2 (+14d), Normal (+21d), SR (+30d)
const PRIORITY_OPTIONS = [
  { value: "UT1", label: "UT1 — Siêu gấp (7 ngày)" },
  { value: "UT2", label: "UT2 — Gấp (14 ngày)" },
  { value: "Normal", label: "Normal (21 ngày)" },
  { value: "SR", label: "SR — Special Request (30 ngày)" },
] as const;

// V2: PHAN_LOAI_KH — từ cfg_Dropdowns sheet
const PHAN_LOAI_KH = ["VIP", "KH", "SR"] as const;

export type EditOrderData = {
  customerName: string;
  salesName?: string;
  nguon?: string;
  phanLoaiKh?: string;
  priorityCode: string;
  requiredDate?: string;
  donHang3Sao: boolean;
  linkChat?: string;
  saleNote?: string;
  comment?: string;
};

export function EditOrderDialog({
  open,
  onClose,
  onSubmit,
  loading,
  order,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: EditOrderData) => void;
  loading: boolean;
  order: OrderDetail;
}) {
  // V2: CRITICAL_FIELDS — khóa customerName và salesName sau khi đơn đạt khâu Đúc (IN_PRODUCTION+)
  //
  // Ở ĐÂY `order.status` LÀ ĐÚNG, khác với sidebar: dialog này sửa field cấp SO (order.customerName),
  // không phải bản ghi đè riêng theo MO. Nên không đổi sang trạng thái hiệu dụng của MO.
  //
  // Nhưng phần "ĐÃ CÓ giá trị mới khoá" thì áp dụng y như sidebar: khoá để đừng ĐỔI cái đã in ra
  // phiếu, không phải để đừng ĐIỀN chỗ còn trống. Đơn nhập từ script thường trống tên khách, và
  // trước đây tới lúc phát hiện thì đơn đã vào sản xuất — ô mờ vĩnh viễn, không còn đường nhập.
  //
  // Đo `order.customerName` (giá trị ĐÃ LƯU) chứ không phải state `customerName`: đo state thì vừa
  // gõ một chữ là ô tự khoá lại ngay giữa lúc đang gõ.
  const inProductionStage = ["IN_PRODUCTION", "QUALITY_CHECK", "COMPLETED"].includes(order.status);
  const customerLocked = inProductionStage && !!(order.customerName ?? "").trim();
  const salesLocked = inProductionStage && !!(order.salesName ?? "").trim();

  const [customerName, setCustomerName] = useState(order.customerName);
  const [salesName, setSalesName] = useState(order.salesName ?? "");
  const [nguon, setNguon] = useState(order.nguon ?? "");
  const [phanLoaiKh, setPhanLoaiKh] = useState(order.phanLoaiKh ?? "");
  const [priorityCode, setPriorityCode] = useState(order.priorityCode || "Normal");
  const [requiredDate, setRequiredDate] = useState(
    order.requiredDate ? order.requiredDate.slice(0, 10) : ""
  );
  const [donHang3Sao, setDonHang3Sao] = useState(order.donHang3Sao);
  const [linkChat, setLinkChat] = useState(order.linkChat ?? "");
  const [saleNote, setSaleNote] = useState(order.saleNote ?? "");
  const [comment, setComment] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      customerName: customerName.trim(),
      salesName: salesName.trim() || undefined,
      nguon: nguon.trim() || undefined,
      phanLoaiKh: phanLoaiKh || undefined,
      priorityCode,
      requiredDate: requiredDate ? new Date(requiredDate).toISOString() : undefined,
      donHang3Sao,
      linkChat: linkChat.trim() || undefined,
      saleNote: saleNote.trim() || undefined,
      comment: comment.trim() || undefined,
    });
  }

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400";
  const disabledCls = "disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed";

  return (
    <Modal open={open} onClose={onClose} title="Sửa thông tin đơn hàng">
      <form onSubmit={handleSubmit}>
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* V2: CRITICAL_FIELDS warning banner */}
          {inProductionStage && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex items-start gap-2 text-xs text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {/* Câu chữ phải khớp với luật thật. Bản cũ ghi "không thể thay đổi" cả khi ô đang
                  trống — người dùng tin rồi đi tìm cách khác thay vì cứ gõ vào. */}
              Đơn đã vào sản xuất — Khách hàng và Sales đã có thì không đổi được nữa, còn trống thì vẫn điền được
            </div>
          )}

          {/* CRITICAL: Tên khách hàng — khóa khi ĐÃ CÓ giá trị và đơn đã vào sản xuất */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Tên khách hàng {!customerLocked && <span className="text-red-500">*</span>}
            </label>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              disabled={customerLocked}
              required={!customerLocked}
              type="text"
              className={cn(inputCls, disabledCls)}
            />
          </div>

          {/* CRITICAL: Sales — khóa khi ĐÃ CÓ giá trị và đơn đã vào sản xuất */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Sales</label>
            <input
              value={salesName}
              onChange={(e) => setSalesName(e.target.value)}
              disabled={salesLocked}
              type="text"
              className={cn(inputCls, disabledCls)}
              placeholder="Tên nhân viên sale..."
            />
          </div>

          {/* Nguồn + Phân loại KH */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Nguồn</label>
              <input
                value={nguon}
                onChange={(e) => setNguon(e.target.value)}
                type="text"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Phân loại KH</label>
              <select
                value={phanLoaiKh}
                onChange={(e) => setPhanLoaiKh(e.target.value)}
                className={inputCls}
              >
                <option value="">—</option>
                {PHAN_LOAI_KH.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {/* V2: CAP_DO_UU_TIEN */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Cấp độ ưu tiên</label>
            <select
              value={priorityCode}
              onChange={(e) => setPriorityCode(e.target.value)}
              className={inputCls}
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Deadline</label>
            <DateInput
              value={requiredDate}
              onChange={setRequiredDate}
              className={inputCls}
            />
          </div>

          {/* Đơn 3 sao */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={donHang3Sao}
              onChange={(e) => setDonHang3Sao(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-700">Đơn 3 sao ★★★</span>
          </label>

          {/* Link Chat */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Link Chat</label>
            <input
              value={linkChat}
              onChange={(e) => setLinkChat(e.target.value)}
              type="text"
              className={inputCls}
              placeholder="https://..."
            />
          </div>

          {/* Ghi chú Sale */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Ghi chú Sale</label>
            <textarea
              value={saleNote}
              onChange={(e) => setSaleNote(e.target.value)}
              rows={3}
              className={cn(inputCls, "resize-none")}
            />
          </div>

          {/* Comment cho audit log */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Lý do chỉnh sửa (tuỳ chọn)
            </label>
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              type="text"
              className={inputCls}
              placeholder="Ghi rõ lý do nếu cần..."
            />
          </div>
        </div>
        <FormFooter onClose={onClose} loading={loading} submitLabel="Lưu thay đổi" />
      </form>
    </Modal>
  );
}

// ─── Simple confirm dialog ────────────────────────────────────────────────────

export function ConfirmDialog({
  open,
  onClose,
  onSubmit,
  loading,
  title,
  description,
  submitLabel,
  comment,
  onCommentChange,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { comment?: string }) => void;
  loading: boolean;
  title: string;
  description?: string;
  submitLabel: string;
  comment?: string;
  onCommentChange?: (v: string) => void;
}) {
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ comment: comment?.trim() || undefined });
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit}>
        <div className="px-5 py-4 space-y-4">
          {description && <p className="text-sm text-gray-600">{description}</p>}
          {onCommentChange !== undefined && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Ghi chú (tuỳ chọn)
              </label>
              <textarea
                value={comment}
                onChange={(e) => onCommentChange(e.target.value)}
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          )}
        </div>
        <FormFooter onClose={onClose} loading={loading} submitLabel={submitLabel} />
      </form>
    </Modal>
  );
}
