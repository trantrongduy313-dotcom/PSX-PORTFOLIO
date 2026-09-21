"use client";

// ─── Thu nhỏ ảnh NGAY TRONG BROWSER trước khi upload ─────────────────────────
//
// VÌ SAO PHẢI THU NHỎ Ở ĐÂY: ảnh render 3D gốc có thể tới vài MB (ảnh mẫu từ Drive: 533KB —
// 4.3MB). Nếu upload ảnh gốc thẳng lên storage:
//   - ~2.200 MO × ~1.5MB = ~3GB tổng, và upload chậm với mạng công ty.
//   - Vercel giới hạn body request ~4.5MB — nếu ảnh đi QUA server sẽ có ảnh bị từ chối.
// Thu nhỏ ở đây giải quyết cả hai: mỗi ảnh còn ~200-400KB, và ảnh KHÔNG đi qua server (upload
// thẳng lên Supabase Storage bằng vé server cấp) nên giới hạn body của Vercel không áp dụng.

const MAX_DIMENSION = 1200;
const JPEG_QUALITY = 0.8;

export type ResizedImage = { blob: Blob; contentType: string };

/** Thu nhỏ ảnh về tối đa 1200px chiều dài nhất, nén JPEG ~80%. Giữ nguyên tỉ lệ. */
export async function resizeImageForUpload(file: File): Promise<ResizedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Không tạo được canvas để thu nhỏ ảnh.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) throw new Error("Không nén được ảnh.");

    return { blob, contentType: "image/jpeg" };
  } finally {
    bitmap.close();
  }
}
