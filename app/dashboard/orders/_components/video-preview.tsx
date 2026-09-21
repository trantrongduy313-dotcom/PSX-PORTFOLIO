"use client";

import { useState } from "react";
import { ExternalLink, Play } from "lucide-react";

import { resolveVideoEmbed } from "@/app/lib/business/media-embed";
import { MediaLightbox } from "./media-lightbox";

// ─── Xem video sản phẩm NGAY TRONG webapp ─────────────────────────────────────
//
// Trước đây chỉ có thẻ <a> mở tab mới: NV 3D đang xem yêu cầu công việc phải rời webapp sang
// Drive, xem xong quay lại tìm chỗ cũ.
//
// VÌ SAO LÀ LIGHTBOX CHỨ KHÔNG NHÚNG THẲNG VÀO THẺ: cả hai chỗ dùng component này đều là cột
// hẹp (sidebar đơn hàng, panel NV 3D). Một khối 16:9 nhúng thẳng sẽ đẩy trang dài thêm mấy
// trăm pixel ở MỌI lần mở, kể cả khi không ai định xem video — ngược với việc vừa làm là thu
// gọn khối NV 3D cho sidebar đỡ dài. Bấm mới mở, Esc để đóng, giống hệt ảnh.
//
// LINK MỞ TAB MỚI LUÔN GIỮ SONG SONG: nhúng có thể hỏng vì lý do nằm ngoài tầm với của code —
// file chưa chia sẻ, người xem chưa đăng nhập đúng tài khoản Google, định dạng trình duyệt
// không phát được. Khi đó iframe hiện màn "yêu cầu quyền truy cập" của Drive, và người dùng
// phải còn một đường ra. Trường hợp xấu nhất bằng đúng hiện trạng, không thụt lùi.

type Props = {
  url: string | null | undefined;
  /** Nhãn của link mở tab mới. */
  linkLabel?: string;
  /**
   * true = chỉ một nút ▶ vuông, KHÔNG có chữ và không có link mở tab mới. Dùng cho bảng danh
   * sách: mỗi dòng vốn chỉ cao một dòng chữ, thêm hai đoạn chữ nữa sẽ đẩy dòng cao lên và làm
   * bảng tràn ngang. Link mở tab mới vẫn còn ở trong lightbox nên không mất đường ra.
   */
  compact?: boolean;
  /**
   * Cỡ ô ▶ khi compact. "xs" (32px) cho bảng danh sách, "sm" (72px) để xếp cùng hàng với ô
   * ảnh của DesignFilePreview size="sm" — hai ô cạnh nhau lệch cỡ thì hàng thư viện trông
   * như xếp sai, không phải như một bộ.
   */
  size?: "xs" | "sm";
};

const COMPACT_BOX = { xs: 32, sm: 72 } as const;

export function VideoPreview({ url, linkLabel = "Mở video", compact = false, size = "xs" }: Props) {
  const [open, setOpen] = useState(false);

  const raw = url?.trim();
  if (!raw) return null;

  const embed = resolveVideoEmbed(raw);

  const externalLink = (
    <a
      href={raw}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
    >
      <ExternalLink className="w-3 h-3 shrink-0" />
      {linkLabel}
    </a>
  );

  // Không nhận dạng được nguồn → đúng hành vi cũ, chỉ link chữ.
  // Ở bảng thì không có chỗ cho link chữ: ẩn hẳn còn hơn phá vỡ chiều rộng cột.
  if (embed.kind === "none") return compact ? null : externalLink;

  return (
    <div className={compact ? "" : "flex items-center gap-3"}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={compact
          ? "flex items-center justify-center rounded border border-gray-200 bg-gray-50 text-blue-600 hover:border-gray-400 transition-colors shrink-0"
          : "inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline"}
        style={compact ? { width: COMPACT_BOX[size], height: COMPACT_BOX[size] } : undefined}
        title="Xem video ngay trong webapp"
      >
        <Play className={size === "sm" && compact ? "w-6 h-6 shrink-0" : "w-3.5 h-3.5 shrink-0"} />
        {!compact && "Xem video"}
      </button>
      {!compact && externalLink}

      {open && (
        <MediaLightbox onClose={() => setOpen(false)} label="Video sản phẩm">
          {embed.kind === "iframe" ? (
            <div className="relative w-full overflow-hidden rounded-lg bg-black shadow-2xl" style={{ paddingTop: "56.25%" }}>
              <iframe
                src={embed.src}
                title="Video sản phẩm"
                allow="autoplay; fullscreen"
                allowFullScreen
                className="absolute inset-0 w-full h-full border-0"
              />
            </div>
          ) : (
            <video
              src={embed.src}
              controls
              autoPlay
              className="w-full max-h-[85vh] rounded-lg bg-black shadow-2xl"
            />
          )}
          {/* Nhúng hỏng thì người dùng vẫn còn đường ra mà không phải đóng lightbox trước. */}
          <div className="mt-3 text-center">
            <a
              href={raw}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-white/70 hover:text-white hover:underline"
            >
              <ExternalLink className="w-3 h-3" /> Không xem được? Mở ở tab mới
            </a>
          </div>
        </MediaLightbox>
      )}
    </div>
  );
}
