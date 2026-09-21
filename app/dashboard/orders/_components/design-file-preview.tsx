"use client";

import { useState } from "react";
import { ExternalLink, ImageOff, Eye } from "lucide-react";

import { driveThumbnailUrl, drivePreviewUrl } from "@/app/lib/business/drive-image";
import { ImageLightbox } from "./image-lightbox";
import { MediaLightbox } from "./media-lightbox";

// ─── Xem trước ảnh sản phẩm ───────────────────────────────────────────────────
//
// BA TẦNG ưu tiên hiển thị (quyết định ở resolveMoImageSource, đây chỉ vẽ theo):
//   1. `imageUrl` — ảnh đại diện ADMIN/ORDER upload trực tiếp (Supabase Storage). Ưu tiên
//      cao nhất vì LUÔN xem được — không phụ thuộc chính sách chia sẻ của Drive.
//   2. `driveUrl` là link Drive MỘT ảnh — thử bóc thumbnail (drive-image.ts).
//   3. Không có gì → link chữ dự phòng, hoặc "—".
//
// `driveUrl` (nếu có) LUÔN hiện thêm như link dự phòng/mở-đầy-đủ SONG SONG với ảnh đại diện —
// vì link Drive thường là FOLDER (nhiều góc nhìn), còn ảnh đại diện chỉ để nhận diện nhanh.
//
// CƠ CHẾ TỰ RƠI VỀ LINK: ảnh Drive chỉ hiện được nếu file chia sẻ đủ rộng (Workspace công ty
// có chính sách chia sẻ chặt). Khi ảnh lỗi, component tự chuyển về đúng dòng link — không có
// bước lùi nào cho người dùng.

type Props = {
  /** Link Drive (thường là designFileUrl) — có thể là 1 ảnh hoặc 1 folder. */
  url: string | null | undefined;
  /** Ảnh đại diện đã upload (designImageUrl) — ưu tiên cao nhất khi có. */
  imageUrl?: string | null;
  /** Nhãn của link dự phòng — giữ nguyên chữ mỗi màn đang dùng. */
  linkLabel: string;
  /** Cỡ ô ảnh. "xs" cho bảng danh sách (dòng thấp), "sm" cho danh sách dày, "md" cho panel chi tiết. */
  size?: "xs" | "sm" | "md";
  /**
   * true = chỉ hiện ảnh thu nhỏ, KHÔNG hiện dòng chữ link bên dưới. Dùng cho bảng danh sách —
   * mỗi dòng vốn chỉ cao một dòng chữ, thêm dòng link nữa sẽ đẩy dòng bảng cao lên rất nhiều.
   * Bấm vào ảnh vẫn mở lightbox như bình thường (nút bọc ngoài không đổi theo compact).
   */
  compact?: boolean;
};

const BOX = {
  xs: { w: 32, h: 32 },
  sm: { w: 72, h: 72 },
  md: { w: 132, h: 132 },
} as const;

export function DesignFilePreview({ url, imageUrl, linkLabel, size = "md", compact = false }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);

  const uploadedUrl = imageUrl?.trim() || null;
  const driveUrl = url?.trim() || null;

  // Tầng 1: ảnh đại diện đã upload — dùng trực tiếp, không cần bóc ID Drive.
  // Tầng 2: chưa có ảnh đại diện, link Drive là 1 ảnh đơn — thử bóc thumbnail (cỡ nhỏ, vừa ô).
  const thumbnailSrc = uploadedUrl ?? (driveUrl ? driveThumbnailUrl(driveUrl, size === "md" ? 400 : 200) : null);
  // Ảnh hiện trong LIGHTBOX cần cỡ LỚN hơn ô thumbnail — ảnh Drive cỡ 200/400 phóng to sẽ mờ.
  // Ảnh upload đã sẵn ở mức 1200px (resize-image.ts) nên dùng thẳng, không cần đổi cỡ.
  const lightboxSrc = uploadedUrl ?? (driveUrl ? driveThumbnailUrl(driveUrl, 1200) : null);
  // Đường dự phòng khi <img> thất bại — xem chú thích ở nhánh !thumbnailSrc || imageFailed.
  const embedSrc = drivePreviewUrl(driveUrl);

  if (!thumbnailSrc && !driveUrl) return <span className="text-sm text-gray-400">—</span>;

  const box = BOX[size];

  // Link Drive — vừa là dự phòng khi không có ảnh/ảnh lỗi, vừa luôn hiện dưới ảnh (không
  // compact) để mở link Drive đầy đủ góc nhìn, SONG SONG với ảnh đại diện.
  const driveFileLink = driveUrl ? (
    <a
      href={driveUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
    >
      <ExternalLink className="w-3 h-3 shrink-0" />
      {linkLabel}
    </a>
  ) : null;

  // Thumbnail không dựng được (bóc ID lỗi) hoặc tải lỗi.
  //
  // LÝ DO THƯỜNG GẶP NHẤT KHÔNG PHẢI LINK SAI: thẻ <img> gọi drive.google.com là request
  // cross-site, mà trình duyệt nay chặn cookie bên thứ ba → Drive không thấy phiên đăng nhập
  // của người xem nên trả trang đăng nhập thay vì ảnh. Chỉ file chia sẻ "Anyone with the link"
  // mới qua được, mà chính sách CTYHP thì chặt.
  //
  // Iframe /preview thì CÓ mang phiên đó. Nên thay vì bỏ cuộc và đẩy người dùng sang Drive,
  // mời họ xem ngay trong webapp bằng đường khác. Link mở tab mới vẫn giữ song song vì iframe
  // cũng có thể hỏng (sai tài khoản Google, chặn cookie rất gắt).
  if (!thumbnailSrc || imageFailed) {
    if (!driveFileLink) return <span style={{ color: "var(--ink-muted)", opacity: 0.5 }}>—</span>;

    // Trong bảng, nhánh dự phòng đầy đủ (icon + nút chữ + link chữ) sẽ phá vỡ chiều rộng cột
    // và đẩy dòng cao lên. Thu về đúng MỘT ô vuông bằng cỡ thumbnail: bấm vào mở iframe.
    if (compact) {
      // KHÔNG dựng ô vuông có viền + icon ImageOff nữa.
      //
      // Nó là hình khối DUY NHẤT có viền trong cả hàng, nên nó hút mắt mạnh nhất — vào đúng ô ít
      // thông tin nhất. Và mọi ô trống khác trong bảng dùng "—": hai ngôn ngữ thị giác cho cùng
      // một nghĩa "không có gì". Tệ hơn, một icon "ảnh vỡ" đọc ra là LỖI, trong khi sự thật chỉ
      // là CHƯA CÓ.
      if (!embedSrc) {
        return (
          <span style={{ color: "var(--ink-muted)", opacity: 0.5, userSelect: "none" }} title="Không xem được ảnh">
            —
          </span>
        );
      }
      return (
        <>
          {/* CÓ đường xem được thì vẫn là một nút bấm — nhưng bỏ viền và bỏ nền: chỉ còn con mắt
              nhỏ màu xanh. Nó vẫn nói "bấm được" mà không còn nặng hơn mọi ô khác trong hàng. */}
          <button
            type="button"
            onClick={() => setEmbedOpen(true)}
            className="flex items-center justify-center text-blue-600 hover:text-blue-800 transition-colors shrink-0"
            style={{ width: box.w, height: box.h }}
            title="Xem ảnh ngay trong webapp"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          {embedOpen && (
            <MediaLightbox onClose={() => setEmbedOpen(false)} label="Ảnh sản phẩm">
              <div className="relative w-full overflow-hidden rounded-lg bg-black shadow-2xl" style={{ paddingTop: "70%" }}>
                <iframe src={embedSrc} title="Ảnh sản phẩm" allowFullScreen className="absolute inset-0 w-full h-full border-0" />
              </div>
            </MediaLightbox>
          )}
        </>
      );
    }

    return (
      <div className="flex items-center gap-2 flex-wrap">
        {imageFailed && (
          <span
            className="flex items-center justify-center rounded border border-gray-200 bg-gray-50 text-gray-300 shrink-0"
            style={{ width: 28, height: 28 }}
            title="Không tải được ảnh thu nhỏ — thử 'Xem ảnh' để mở ngay trong webapp"
          >
            <ImageOff className="w-3.5 h-3.5" />
          </span>
        )}
        {embedSrc && (
          <button
            type="button"
            onClick={() => setEmbedOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline"
            title="Xem ngay trong webapp"
          >
            <Eye className="w-3.5 h-3.5 shrink-0" /> Xem ảnh
          </button>
        )}
        {driveFileLink}
        {embedOpen && embedSrc && (
          <MediaLightbox onClose={() => setEmbedOpen(false)} label="Ảnh sản phẩm">
            <div className="relative w-full overflow-hidden rounded-lg bg-black shadow-2xl" style={{ paddingTop: "70%" }}>
              <iframe
                src={embedSrc}
                title="Ảnh sản phẩm"
                allowFullScreen
                className="absolute inset-0 w-full h-full border-0"
              />
            </div>
            <div className="mt-3 text-center">
              <a
                href={driveUrl ?? "#"}
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

  // Dùng <img> thường thay vì next/image: ảnh Drive/Supabase không cần tối ưu qua server,
  // và tránh phải thêm host vào remotePatterns cho một thay đổi cần đẩy nhanh.
  const thumbnailImg = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbnailSrc}
      alt="Ảnh sản phẩm"
      width={box.w}
      height={box.h}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setImageFailed(true)}
      className="w-full h-full object-cover"
    />
  );

  const thumbnailBoxClass =
    "block rounded border border-gray-200 overflow-hidden bg-gray-50 hover:border-gray-400 transition-colors shrink-0";

  // BẤT KỲ ảnh hiện được (upload tay hoặc bóc từ link Drive đơn) đều mở LIGHTBOX ngay trong
  // webapp — không rời trang. Trước đây chỉ ảnh upload mới có hành vi này, ảnh Drive vẫn mở
  // tab mới, tạo trải nghiệm không đồng nhất giữa hai nguồn ảnh mà người dùng không phân biệt
  // được bằng mắt. Link Drive gốc (driveFileLink) vẫn luôn hiện song song bên dưới để xem đủ
  // góc nhìn/toàn bộ folder — lightbox không thay thế nó, chỉ thay việc "bấm ảnh nhỏ = rời trang".
  const thumbnailBox = (
    <button
      type="button"
      onClick={() => setLightboxOpen(true)}
      className={thumbnailBoxClass}
      style={{ width: box.w, height: box.h }}
      title="Bấm để xem ảnh cỡ lớn hơn"
    >
      {thumbnailImg}
    </button>
  );

  // compact: chỉ ảnh, không có dòng link riêng — bấm ảnh mở lightbox, đủ dùng cho bảng dày.
  if (compact) {
    return (
      <>
        {thumbnailBox}
        {lightboxOpen && lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxOpen(false)} />}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 items-start">
      {thumbnailBox}
      {/* Link Drive LUÔN hiện song song khi có — ảnh trong lightbox chỉ để nhận diện nhanh,
          Drive vẫn là nơi xem đủ góc nhìn/toàn bộ folder. Không gọn theo nguồn ảnh nữa vì giờ
          MỌI ảnh hiện được đều dùng lightbox, không còn phân biệt "đã mở đúng chỗ đó" như trước. */}
      {driveFileLink}
      {lightboxOpen && lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxOpen(false)} />}
    </div>
  );
}
