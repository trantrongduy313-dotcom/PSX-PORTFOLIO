import { drivePreviewUrl } from "@/app/lib/business/drive-image";

// ─── Đổi link video thành thứ xem được NGAY TRONG webapp ─────────────────────
//
// VẤN ĐỀ: Order dán link video (Drive/YouTube/file .mp4) để NV 3D xem sản phẩm thật. Trước đây
// giao diện chỉ render thẻ <a> — bấm là rời webapp sang tab mới, mất bối cảnh công việc đang làm.
//
// VÌ SAO IFRAME CHỨ KHÔNG PHẢI <video src>: file trên Drive không có URL phát trực tiếp ổn định
// (link /view trả về trang HTML, link /uc bị chặn/đổi liên tục). Drive có sẵn endpoint /preview
// làm riêng cho việc nhúng.
//
// ĐIỂM KHÁC QUAN TRỌNG SO VỚI ẢNH: endpoint thumbnail của ảnh (drive-image.ts) gọi bằng thẻ
// <img> nên KHÔNG mang phiên đăng nhập Google của người xem — file chỉ chia sẻ nội bộ domain
// sẽ trả về trang đăng nhập. Iframe thì CÓ mang phiên đó. Mọi user vào webapp đều đăng nhập
// bằng Google, nên video chia sẻ trong domain nhiều khả năng phát được mà KHÔNG cần nới chính
// sách chia sẻ của CTYHP (chính sách đã chặn hai cách tích hợp Google khác của dự án — xem
// YEU_CAU_HO_TRO_IT_GOOGLE_OAUTH.md).
//
// Dù vậy vẫn KHÔNG chắc chắn: nếu người xem không có quyền, iframe hiện giao diện "yêu cầu
// quyền truy cập" của Drive. Trường hợp đó vẫn không tệ hơn hiện trạng, và link mở tab mới
// luôn được giữ song song.
//
// Hàm THUẦN để test trực tiếp, không nhét regex vào JSX.

export type VideoEmbed =
  /** Nhúng bằng <iframe> — Drive, YouTube. */
  | { kind: "iframe"; src: string }
  /** Phát bằng <video controls> — link trỏ thẳng tới file video. */
  | { kind: "video"; src: string }
  /** Không nhận dạng được → chỉ còn cách mở tab mới. */
  | { kind: "none" };

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"]);

/** Đuôi file trình duyệt phát được bằng thẻ <video>. */
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".ogv", ".m4v"];

/**
 * Bóc video ID của YouTube. Trả null nếu không phải link YouTube.
 *
 * Hỗ trợ: /watch?v=ID, youtu.be/ID, /embed/ID, /shorts/ID — đủ các dạng người dùng copy ra.
 */
export function extractYoutubeId(url: string | null | undefined): string | null {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (!YOUTUBE_HOSTS.has(parsed.hostname)) return null;

  // youtu.be/{ID} — toàn bộ path là ID.
  if (parsed.hostname.endsWith("youtu.be")) {
    const id = parsed.pathname.replace(/^\//, "").split("/")[0];
    return id || null;
  }

  const fromQuery = parsed.searchParams.get("v");
  if (fromQuery) return fromQuery;

  const match = parsed.pathname.match(/\/(?:embed|shorts|v)\/([^/?]+)/);
  return match?.[1] ?? null;
}

/**
 * Quyết định cách xem một link video ngay trong webapp.
 *
 * Thứ tự thử KHÔNG tuỳ tiện: bóc ID theo host trước (Drive, YouTube) rồi mới xét đuôi file.
 * Ngược lại thì một link Drive có "?name=abc.mp4" trong query sẽ bị nhận nhầm là file trực
 * tiếp, và thẻ <video> trỏ vào trang HTML của Drive sẽ hiện ô đen câm.
 */
export function resolveVideoEmbed(url: string | null | undefined): VideoEmbed {
  const raw = url?.trim();
  if (!raw) return { kind: "none" };

  const drivePreview = drivePreviewUrl(raw);
  if (drivePreview) return { kind: "iframe", src: drivePreview };

  const youtubeId = extractYoutubeId(raw);
  if (youtubeId) {
    return { kind: "iframe", src: `https://www.youtube.com/embed/${encodeURIComponent(youtubeId)}` };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    // Không phải URL hợp lệ (user gõ thiếu https:// chẳng hạn) — không đoán, để link chữ xử lý.
    return { kind: "none" };
  }
  // CHỈ http/https: chặn javascript:/data: lọt vào src của thẻ video.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { kind: "none" };

  const path = parsed.pathname.toLowerCase();
  if (VIDEO_EXTENSIONS.some((ext) => path.endsWith(ext))) {
    return { kind: "video", src: raw };
  }

  return { kind: "none" };
}
