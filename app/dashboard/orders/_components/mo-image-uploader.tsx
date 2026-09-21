"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Trash2, Loader2 } from "lucide-react";

import { DesignFilePreview } from "./design-file-preview";
import { uploadItemImage, deleteItemImage } from "@/app/lib/api/item-image-client";

// ─── Upload ảnh đại diện cho MỘT sản phẩm (OrderItem) ────────────────────────
//
// Chỉ ADMIN/ORDER thấy nút này (route đã ép quyền, ẩn nút ở đây chỉ để giao diện gọn — không
// phải lớp bảo mật).
//
// GIAO THỨC BA BƯỚC (thu nhỏ → xin vé → PUT thẳng lên Storage → xác nhận) nằm ở
// app/lib/api/item-image-client.ts, KHÔNG ở đây: sắp có component thứ hai (ảnh mẫu) chạy đúng
// giao thức đó, và chép nó sang là chép cả cơ hội để hai bản lệch nhau — mà lệch ở đây không
// báo lỗi, chỉ để lại file mồ côi trong bucket.
//
// Còn lại trong file này là THUẦN GIAO DIỆN: vùng thả, nút, trạng thái đang chạy.

type Props = {
  orderId: string;
  orderItemId: string;
  driveUrl: string | null | undefined;
  imageUrl: string | null | undefined;
  linkLabel: string;
  onUploaded: (newImageUrl: string) => void;
  onDeleted: () => void;
};

export function MoImageUploader({ orderId, orderItemId, driveUrl, imageUrl, linkLabel, onUploaded, onDeleted }: Props) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // true khi đang kéo file ảnh ngang qua vùng thả — chỉ để đổi viền, không đổi luồng xử lý.
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const endpoint = `/api/orders/${orderId}/items/${orderItemId}/image`;
  const busy = uploading || deleting;

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const confirmed = await uploadItemImage<{ designImageUrl: string }>(endpoint, file);
      onUploaded(confirmed.designImageUrl);
      toast.success("Đã lưu ảnh đại diện");
    } catch (err) {
      toast.error((err as Error).message || "Upload ảnh thất bại");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteItemImage(endpoint);
      onDeleted();
      toast.success("Đã xoá ảnh đại diện");
    } catch (err) {
      toast.error((err as Error).message || "Xoá ảnh thất bại");
    } finally {
      setDeleting(false);
    }
  };

  // Kéo-thả gọi ĐÚNG handleFile như click-chọn — không có đường tắt nào bỏ qua thu nhỏ/kiểm
  // dung lượng/loại file phía dưới. Chỉ thêm một cách khác để đưa File vào cùng một hàm.
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
        className={`rounded-lg transition-colors ${
          isDraggingOver ? "ring-2 ring-blue-400 ring-offset-1 bg-blue-50/50" : ""
        }`}
      >
        <DesignFilePreview url={driveUrl} imageUrl={imageUrl} linkLabel={linkLabel} size="sm" />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          {imageUrl ? "Đổi ảnh" : "Upload ảnh"}
        </button>

        {imageUrl && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleDelete()}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            Xoá
          </button>
        )}
      </div>
    </div>
  );
}
