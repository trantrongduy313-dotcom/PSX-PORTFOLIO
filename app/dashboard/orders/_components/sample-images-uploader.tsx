"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Trash2, Loader2, Link2, ExternalLink } from "lucide-react";

import { DesignFilePreview } from "./design-file-preview";
import { uploadItemImage, deleteItemImage } from "@/app/lib/api/item-image-client";
import { MAX_SAMPLE_IMAGES } from "@/app/lib/business/mo-image";

// ─── Ảnh mẫu Order gửi cho NV 3D — kéo-thả tối đa 2 ảnh ──────────────────────
//
// 🎯 VÌ SAO TÍNH NĂNG NÀY TỒN TẠI: trước đây ô "Ảnh mẫu" chỉ nhận LINK, nên chỉ để gửi một tấm
// ảnh mẫu Order cũng phải mở Drive, upload, lấy link, dán vào. Với ca phổ biến nhất (đúng một
// ảnh) thì toàn bộ vòng đó là công vô ích.
//
// Nay đường NHANH là đường mặc định: kéo ảnh thả vào là xong. Đường dán link vẫn còn nhưng thu
// về MỘT DÒNG CHỮ dưới dải ảnh — nó phục vụ ca hiếm hơn (ảnh đã sẵn trên Drive), và để nó
// chiếm một ô nhập ngang hàng là mời người dùng đi tiếp con đường chậm.
//
// ⚠️ CHIỀU CAO KHỐI KHÔNG ĐỔI THEO DỮ LIỆU, và đó là một ràng buộc chứ không phải may mắn: dải
// ảnh luôn đủ MAX_SAMPLE_IMAGES khe, dòng dưới luôn đúng một dòng dù có link hay không. Bản
// trước bung sẵn ô nhập khi MO có link, nên khối cao gấp ba ở đơn này và thấp ở đơn kia — giao
// diện nhảy giữa hai trạng thái đọc ra "không chuyên nghiệp" rõ hơn cả việc lệch hàng.
//
// Ca cần NHIỀU ảnh + video thì dùng ô "Folder mẫu" bên cạnh — một link Drive tới cả folder.
//
// GIAO THỨC upload nằm ở app/lib/api/item-image-client.ts, dùng chung với ảnh đại diện MO.
// File này THUẦN GIAO DIỆN.

type Props = {
  orderId: string;
  orderItemId: string;
  /** Ảnh đã upload — tối đa MAX_SAMPLE_IMAGES. */
  uploads: string[];
  /** Link ảnh mẫu (Drive) — đường cũ, vẫn giữ. */
  linkUrl: string;
  disabled?: boolean;
  onUploadsChange: (next: string[]) => void;
  onLinkChange: (value: string) => void;
};

type ConfirmResponse = { sampleImageUploads: string[] };

export function SampleImagesUploader({
  orderId, orderItemId, uploads, linkUrl, disabled = false, onUploadsChange, onLinkChange,
}: Props) {
  const [busyUpload, setBusyUpload] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  // 🔴 KHÔNG tự bung theo dữ liệu. Bản trước mở sẵn ô nhập khi MO đã có link — nghe hợp lý,
  // nhưng nó làm CHIỀU CAO KHỐI ĐỔI THEO TỪNG MO: mở đơn có link thì khối cao gấp ba, mở đơn
  // không có thì thấp. Giao diện nhảy giữa hai trạng thái là thứ đọc ra "không chuyên nghiệp"
  // rõ hơn cả việc lệch hàng.
  //
  // Nay link đã có hiện thành MỘT DÒNG CHỮ (cao bằng dòng gợi ý), bấm mới thành ô sửa được.
  const [linkOpen, setLinkOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const endpoint = `/api/orders/${orderId}/items/${orderItemId}/sample-images`;
  const isFull = uploads.length >= MAX_SAMPLE_IMAGES;
  const busy = busyUpload || removing !== null || disabled;

  const handleFile = async (file: File) => {
    if (isFull) {
      toast.error(`Đã đủ ${MAX_SAMPLE_IMAGES} ảnh mẫu — xoá bớt một ảnh trước khi thêm.`);
      return;
    }
    setBusyUpload(true);
    try {
      const confirmed = await uploadItemImage<ConfirmResponse>(endpoint, file);
      onUploadsChange(confirmed.sampleImageUploads);
      toast.success("Đã thêm ảnh mẫu");
    } catch (err) {
      toast.error((err as Error).message || "Upload ảnh thất bại");
    } finally {
      setBusyUpload(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async (url: string) => {
    setRemoving(url);
    try {
      const res = await deleteItemImage<ConfirmResponse>(endpoint, { url });
      onUploadsChange(res.sampleImageUploads);
      toast.success("Đã xoá ảnh mẫu");
    } catch (err) {
      toast.error((err as Error).message || "Xoá ảnh thất bại");
    } finally {
      setRemoving(null);
    }
  };

  // Thả NHIỀU file cùng lúc: nhận đúng số khe còn trống, bỏ phần dư và NÓI RA. Im lặng bỏ bớt
  // là người dùng tưởng đã thêm cả 5 tấm.
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (busy) return;

    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length === 0) return;

    const room = MAX_SAMPLE_IMAGES - uploads.length;
    if (room <= 0) {
      toast.error(`Đã đủ ${MAX_SAMPLE_IMAGES} ảnh mẫu — xoá bớt một ảnh trước khi thêm.`);
      return;
    }
    if (files.length > room) {
      toast.error(`Chỉ nhận thêm ${room} ảnh — còn lại bị bỏ qua.`);
    }
    // MỘT ảnh mỗi lần, tuần tự: hai request PUT song song cùng đọc một danh sách cũ thì ảnh
    // sau ghi đè kết quả của ảnh trước, và một trong hai thành file mồ côi.
    void (async () => {
      for (const file of files.slice(0, room)) await handleFile(file);
    })();
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* ─── DẢI Ô VUÔNG BẰNG NHAU ────────────────────────────────────────────
          Luôn vẽ đủ MAX_SAMPLE_IMAGES khe, kể cả khe chưa có ảnh. Một dải ô đều nhau đọc như
          một control; hai ô so le (một ảnh + một nút nhỏ) đọc như bố cục vỡ.

          Vùng thả bọc CẢ DẢI chứ không từng ô: người dùng nhắm vào "chỗ ảnh", không nhắm vào
          ô thứ hai. */}
      <div
        onDragOver={(e) => { e.preventDefault(); if (!busy) setIsDraggingOver(true); }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
        className={`flex items-center gap-2 rounded-lg p-1 -m-1 transition-colors ${
          isDraggingOver ? "ring-2 ring-blue-400 ring-offset-1 bg-blue-50/50" : ""
        }`}
      >
        {Array.from({ length: MAX_SAMPLE_IMAGES }, (_, i) => {
          const url = uploads[i];
          if (url) {
            return (
              <div key={url} className="relative w-[76px] h-[76px] shrink-0">
                <DesignFilePreview url={null} imageUrl={url} linkLabel="Mở ảnh mẫu" size="sm" compact />
                {!disabled && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleRemove(url)}
                    title="Xoá ảnh này"
                    className="absolute -top-1.5 -right-1.5 rounded-full bg-white border border-red-200 text-red-600 p-0.5 shadow-sm hover:bg-red-50 disabled:opacity-50"
                  >
                    {removing === url ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  </button>
                )}
              </div>
            );
          }
          // Khe TRỐNG. Khe trống ĐẦU TIÊN bấm được; các khe sau chỉ là chỗ giữ nhịp — hai nút
          // "thêm ảnh" cạnh nhau không cho thêm lựa chọn nào, chỉ thêm một câu hỏi.
          const isNextSlot = i === uploads.length;
          return (
            <button
              key={`slot-${i}`}
              type="button"
              disabled={busy || !isNextSlot || disabled}
              onClick={() => inputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-1 w-[76px] h-[76px] shrink-0 rounded border border-dashed transition-colors ${
                isNextSlot && !disabled
                  ? "border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 cursor-pointer"
                  : "border-gray-200 text-gray-300 cursor-default"
              } disabled:opacity-60`}
            >
              {busyUpload && isNextSlot
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Upload className="w-4 h-4" />}
              {isNextSlot && <span className="text-[10px] leading-none">Kéo thả</span>}
            </button>
          );
        })}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          const room = MAX_SAMPLE_IMAGES - uploads.length;
          if (files.length > room) toast.error(`Chỉ nhận thêm ${room} ảnh — còn lại bị bỏ qua.`);
          void (async () => {
            for (const f of files.slice(0, Math.max(0, room))) await handleFile(f);
          })();
        }}
      />

      {/* ─── MỘT DÒNG duy nhất: gợi ý + đường dán link ────────────────────────
          Gộp lại thay vì hai dòng riêng. Chiều cao khối vì thế KHÔNG đổi theo việc MO có link
          hay không — đó là điều kiện để hai trường xếp dọc nhìn cân nhau. */}
      <div className="flex items-center gap-2 text-[10px] text-gray-400 leading-tight">
        <span>Tối đa {MAX_SAMPLE_IMAGES} ảnh</span>
        <span aria-hidden>·</span>
        {linkOpen ? (
          <span className="text-gray-400">link ảnh mẫu:</span>
        ) : linkUrl.trim() ? (
          <>
            <a
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:underline truncate max-w-[220px]"
            >
              <ExternalLink className="w-3 h-3 shrink-0" />
              Mở ảnh mẫu (link)
            </a>
            {!disabled && (
              <button type="button" onClick={() => setLinkOpen(true)} className="hover:text-gray-600 underline">
                sửa
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setLinkOpen(true)}
            className="inline-flex items-center gap-1 hover:text-gray-600 disabled:opacity-50"
          >
            <Link2 className="w-3 h-3" />
            hoặc dán link
          </button>
        )}
      </div>

      {linkOpen && (
        <input
          type="text"
          value={linkUrl}
          disabled={disabled}
          autoFocus
          onChange={(e) => onLinkChange(e.target.value)}
          onBlur={() => setLinkOpen(false)}
          placeholder="https://drive.google.com/..."
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-50"
        />
      )}
    </div>
  );
}
