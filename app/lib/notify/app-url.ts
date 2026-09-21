// ─── Địa chỉ gốc của ứng dụng, dùng cho link trong thông báo ──────────────────
//
// Tách khỏi notify-design-3d.ts vì đã có NGƯỜI DÙNG THỨ HAI (thông báo phản hồi). Thứ tự ưu
// tiên dưới đây là một BÀI HỌC ĐÃ TRẢ GIÁ, không phải xếp bừa — chép nó sang file thứ hai là
// cách bảo đảm một nửa các thông báo sẽ dùng bản đúng và nửa kia dùng bản cũ.
//
//   1. NEXT_PUBLIC_APP_URL — tên miền công ty tự đặt, bền nhất.
//   2. VERCEL_PROJECT_PRODUCTION_URL — tên miền production ỔN ĐỊNH của project.
//   3. VERCEL_URL — ĐƯỜNG CUỐI, và là chỗ từng sai.
//
// ⚠️ VÌ SAO VERCEL_URL LÀ ĐƯỜNG CUỐI: nó ghim theo TỪNG DEPLOYMENT, ra dạng
// `example.vercel.app`. Thông báo là bản ghi VĨNH VIỄN, nên link kiểu đó
// vừa dài loằng ngoằng (tự xuống dòng giữa URL) vừa mở đúng BẢN BUILD CŨ về sau — và chết hẳn
// khi deployment đó bị xoá. Một bản trước đây bỏ qua bước 2 nên luôn rơi xuống bước 3.

/** Địa chỉ gốc đã bỏ dấu "/" ở cuối. null nếu không cấu hình được biến nào. */
export function appBaseUrl(): string | null {
  const stable =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return stable ? stable.replace(/\/+$/, "") : null;
}

/** Ghép một đường dẫn nội bộ thành URL đầy đủ. null nếu chưa cấu hình được địa chỉ gốc. */
export function appUrl(path: string): string | null {
  const base = appBaseUrl();
  if (!base) return null;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
