// ─── Đổi link Google Drive thành URL xem được bằng thẻ <img> ─────────────────
//
// VẤN ĐỀ: OrderItem.designFileUrl lưu link Drive dạng người-bấm-vào, ví dụ
//     https://drive.google.com/file/d/1h_GrsZk2rvNslsGrNYjz4jIovT0RGlgC/view?usp=drivesdk
// Link đó KHÔNG phải ảnh — trỏ <img src> vào nó sẽ ra trang HTML của Drive, không ra hình.
// Muốn hiện ảnh phải đổi sang endpoint thumbnail và truyền file ID.
//
// Drive có nhiều dạng URL khác nhau (tuỳ chỗ người dùng copy ra), nên việc bóc ID phải xử lý
// được cả mấy dạng. Tách thành hàm THUẦN để test trực tiếp, thay vì nhét regex vào JSX.
//
// ⚠️ GIỚI HẠN CẦN BIẾT: ảnh chỉ hiện được nếu file được chia sẻ đủ rộng. Workspace của công ty
// (CTYHP) có chính sách chia sẻ chặt — đã từng chặn hai cách tích hợp Google khác của dự án
// này (xem YEU_CAU_HO_TRO_IT_GOOGLE_OAUTH.md). Nếu file bị giới hạn trong domain, trình duyệt
// sẽ nhận về trang đăng nhập thay vì ảnh. Vì vậy giao diện PHẢI tự rơi về link chữ khi ảnh
// lỗi — xem DesignFilePreview. Nhờ đó trường hợp xấu nhất bằng đúng hiện trạng, không thụt lùi.

/** Các host của Google Drive/Docs mà ta chấp nhận bóc ID. */
const DRIVE_HOSTS = new Set(["drive.google.com", "docs.google.com", "drive.usercontent.google.com"]);

/**
 * Bóc file ID từ link Drive. Trả null nếu không phải link Drive hoặc không tìm thấy ID.
 *
 * Hỗ trợ các dạng thường gặp:
 *   /file/d/{ID}/view        — dạng copy từ nút Share (phổ biến nhất)
 *   /open?id={ID}            — dạng link cũ
 *   /uc?id={ID}&export=view  — dạng link tải trực tiếp
 *   /d/{ID}/                 — dạng rút gọn
 */
export function extractDriveFileId(url: string | null | undefined): string | null {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  // Chỉ nhận host của Google: tránh biến một URL bất kỳ thành lời gọi ra ngoài.
  if (!DRIVE_HOSTS.has(parsed.hostname)) return null;

  // Dạng query: ?id=...
  const fromQuery = parsed.searchParams.get("id");
  if (fromQuery) return fromQuery;

  // Dạng đường dẫn: /file/d/{ID}/... hoặc /d/{ID}/...
  const match = parsed.pathname.match(/\/d\/([^/]+)/);
  return match?.[1] ?? null;
}

/**
 * URL ảnh thu nhỏ để đưa vào <img src>.
 *
 * `sz=w{n}` là chiều rộng tối đa. Lấy ảnh vừa đủ to cho ô hiển thị chứ không lấy ảnh gốc —
 * ảnh render 3D thường rất nặng, tải nguyên bản sẽ làm chậm cả trang danh sách.
 */
export function driveThumbnailUrl(url: string | null | undefined, width = 400): string | null {
  const id = extractDriveFileId(url);
  return id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${width}` : null;
}

/**
 * URL để nhúng vào <iframe> — xem file Drive ngay trong webapp.
 *
 * KHÁC BIỆT QUYẾT ĐỊNH SO VỚI driveThumbnailUrl: thẻ <img> gọi drive.google.com là request
 * CROSS-SITE, mà trình duyệt nay chặn cookie bên thứ ba mặc định → request đi tới Drive KHÔNG
 * mang phiên đăng nhập Google của người xem. Drive thấy khách lạ nên trả trang đăng nhập thay
 * vì ảnh, và <img> báo lỗi. Chỉ file chia sẻ ở mức "Anyone with the link" mới qua được — mà
 * chính sách CTYHP thì chặt.
 *
 * Iframe thì CÓ mang phiên đó. Nên cùng một file, cùng một người: nhúng iframe xem được trong
 * khi <img> thất bại. Đây là đường dự phòng khi thumbnail hỏng, KHÔNG thay thế nó — thumbnail
 * vẫn nhanh hơn và hiện được ngay trong ô nhỏ mà không cần bấm.
 *
 * Vẫn không chắc chắn tuyệt đối: trình duyệt chặn cookie bên thứ ba rất gắt, hoặc người xem
 * đăng nhập webapp bằng tài khoản Google khác với tài khoản có quyền, thì iframe hiện màn
 * "yêu cầu quyền truy cập" của Drive. Trường hợp đó vẫn không tệ hơn hiện trạng.
 */
export function drivePreviewUrl(url: string | null | undefined): string | null {
  const id = extractDriveFileId(url);
  return id ? `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview` : null;
}
