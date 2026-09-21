"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";

import { MAX_FEEDBACK_IMAGES } from "@/app/lib/business/feedback/validate";
import { useFeedbackImageUpload, type PickedImage } from "./use-feedback-image-upload";

// ─── GIAO DIỆN đính ảnh vào phản hồi ─────────────────────────────────────────
//
// File này chỉ lo BA CÁCH ĐƯA ẢNH VÀO và phần vẽ. Toàn bộ việc vận chuyển (xin vé, thu nhỏ,
// PUT lên Supabase, dọn objectURL) nằm ở `use-feedback-image-upload.ts` — xem ghi chú ở đó về
// vì sao tách.
//
// ⚠️ CTRL+V LÀ ĐƯỜNG CHÍNH, không phải tính năng phụ. Người vừa bấm PrintScreen sẽ DÁN; buộc
// họ lưu ra file trước là đúng chỗ họ bỏ giữa đường và mở Zalo. Nút chọn tệp vẫn có, vì thợ
// 3D dùng điện thoại thì không có clipboard ảnh.

export type { PickedImage };

type Props = {
  images: PickedImage[];
  setImages: React.Dispatch<React.SetStateAction<PickedImage[]>>;
  disabled?: boolean;
};

export function FeedbackImagePicker({ images, setImages, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const { addFiles, remove } = useFeedbackImageUpload({ images, setImages });

  const remaining = MAX_FEEDBACK_IMAGES - images.length;
  const full = remaining <= 0;

  // ─── Ctrl+V ────────────────────────────────────────────────────────────────
  // Nghe ở cấp DOCUMENT, không phải trên một ô input: người dùng vừa bấm PrintScreen rồi bấm
  // Ctrl+V — con trỏ đang ở đâu thì họ không nghĩ tới, và cũng không nên phải nghĩ tới.
  //
  // Listener gắn ĐÚNG MỘT LẦN (gắn/tháo lại mỗi lần state đổi là cách làm mất đúng cú dán xảy
  // ra giữa hai lần render), nên nó đọc giá trị hiện tại qua ref — và ref được ghi TRONG EFFECT.
  const liveRef = useRef({ addFiles, remaining, disabled });
  useEffect(() => {
    liveRef.current = { addFiles, remaining, disabled };
  });

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const live = liveRef.current;
      if (live.disabled) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length === 0) return;

      // Chỉ chặn hành vi mặc định KHI THẬT SỰ có ảnh — dán chữ vào ô mô tả phải chạy bình thường.
      e.preventDefault();
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(f);
      live.addFiles(dt.files, live.remaining);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const hasError = images.some((i) => i.state === "error");

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !full) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled) addFiles(e.dataTransfer.files, remaining);
        }}
        style={{
          border: `1px dashed ${dragOver ? "var(--pink)" : "var(--border-md)"}`,
          background: dragOver ? "var(--row-hover)" : "transparent",
          padding: "10px",
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          alignItems: "center",
          minHeight: "62px",
        }}
      >
        {images.map((img) => (
          <Thumb key={img.key} img={img} onRemove={() => remove(img.key)} />
        ))}

        {!full && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            aria-label="Chọn ảnh từ máy"
            style={{
              width: "56px",
              height: "56px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid var(--border-md)",
              background: "transparent",
              cursor: disabled ? "not-allowed" : "pointer",
              color: "var(--ink-muted)",
            }}
          >
            <ImagePlus style={{ width: "16px", height: "16px" }} />
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (!disabled) addFiles(e.target.files, remaining);
            e.target.value = "";
          }}
        />
      </div>

      <p style={{ fontSize: "10px", color: "var(--ink-muted)", margin: "5px 0 0", lineHeight: 1.6 }}>
        {full
          ? `Đã đủ ${MAX_FEEDBACK_IMAGES} ảnh.`
          : `Bấm Ctrl+V để dán ảnh vừa chụp, hoặc kéo ảnh vào đây. Tối đa ${MAX_FEEDBACK_IMAGES} ảnh.`}
        {/* Nói TRƯỚC rằng ảnh lỗi không chặn việc gửi. Người thấy chữ LỖI mà không được giải
            thích sẽ tự dừng lại để xử lý nó — mà chẳng có gì cần xử lý. */}
        {hasError && " Ảnh có dấu LỖI sẽ không kèm theo, nhưng phản hồi vẫn gửi được."}
      </p>
    </div>
  );
}

function Thumb({ img, onRemove }: { img: PickedImage; onRemove: () => void }) {
  return (
    <div style={{ position: "relative", width: "56px", height: "56px" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.previewUrl}
        alt=""
        style={{
          width: "56px",
          height: "56px",
          objectFit: "cover",
          border: `1px solid ${img.state === "error" ? "var(--s-red)" : "var(--border)"}`,
          opacity: img.state === "uploading" ? 0.5 : 1,
        }}
      />

      {img.state === "uploading" && (
        <Loader2
          className="animate-spin"
          style={{
            position: "absolute",
            top: "20px",
            left: "20px",
            width: "16px",
            height: "16px",
            color: "var(--ink)",
          }}
        />
      )}

      {/* Ảnh lỗi phải ĐỌC RA được là lỗi. Bản đầu chỉ đổi viền đỏ mảnh trên ô 56px — người
          dùng không nhận ra, nên không hiểu vì sao ảnh không được kèm theo. Ở cỡ này một dải
          chữ là thứ duy nhất nhìn thấy được. */}
      {img.state === "error" && (
        <span
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            background: "var(--s-red)",
            color: "#fff",
            fontSize: "9px",
            fontWeight: 700,
            textAlign: "center",
            letterSpacing: "0.04em",
            padding: "1px 0",
          }}
        >
          LỖI
        </span>
      )}

      <button
        type="button"
        onClick={onRemove}
        aria-label="Bỏ ảnh này"
        style={{
          position: "absolute",
          top: "-6px",
          right: "-6px",
          width: "18px",
          height: "18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--ink)",
          color: "var(--cream)",
          border: "none",
          cursor: "pointer",
          lineHeight: 0,
        }}
      >
        <X style={{ width: "11px", height: "11px" }} />
      </button>
    </div>
  );
}
