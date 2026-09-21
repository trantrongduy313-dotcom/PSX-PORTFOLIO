"use client";

import { MediaLightbox } from "./media-lightbox";

// ─── Xem ảnh cỡ vừa NGAY TRONG webapp ─────────────────────────────────────────
//
// Lớp vỏ (lớp phủ, nút đóng, phím Esc) nay nằm ở MediaLightbox — dùng chung với video. Ở đây
// chỉ còn phần riêng của ảnh.
//
// Ảnh đại diện upload (Supabase Storage) LÀ ẢNH ĐÃ THU NHỎ lúc upload (tối đa 1200px, ~200-400KB,
// xem resize-image.ts), không phải bản gốc. Không tải thêm byte nào ngoài cái <img> ở ô thumbnail
// đã tải — mở lightbox chỉ hiện to cùng ảnh đó.

type Props = {
  src: string;
  onClose: () => void;
};

export function ImageLightbox({ src, onClose }: Props) {
  return (
    <MediaLightbox onClose={onClose} label="Ảnh sản phẩm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Ảnh sản phẩm"
        className="max-w-[min(90vw,720px)] max-h-[85vh] w-auto h-auto mx-auto rounded-lg shadow-2xl object-contain"
      />
    </MediaLightbox>
  );
}
