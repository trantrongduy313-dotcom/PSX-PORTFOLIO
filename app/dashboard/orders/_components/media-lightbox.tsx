"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// ─── Lớp phủ xem nội dung cỡ lớn NGAY TRONG webapp ───────────────────────────
//
// Tách ra từ ImageLightbox khi thêm video: hai thứ chỉ khác nhau ở phần tử bên trong (thẻ img
// hay iframe/video), còn lớp phủ, nút đóng, phím Esc và cách chặn sự kiện thì y hệt. Chép lại
// lớp vỏ lần thứ hai nghĩa là mọi sửa đổi về sau (bẫy tiêu điểm bàn phím, hiệu ứng, màu nền)
// phải nhớ sửa hai chỗ — đúng loại lệch vừa mất công dọn ở tab Thiết kế.

type Props = {
  children: ReactNode;
  onClose: () => void;
  /** Nhãn cho trình đọc màn hình — nội dung bên trong không tự mô tả được. */
  label: string;
};

export function MediaLightbox({ children, onClose, label }: Props) {
  // Esc để đóng — hành vi lightbox chuẩn, không cần chuột.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Chỉ tồn tại phía trình duyệt (lightbox chỉ mở khi người dùng bấm), nhưng vẫn phải chặn
  // trường hợp React render phía máy chủ — lúc đó không có `document`.
  if (typeof document === "undefined") return null;

  // ─── VÌ SAO PHẢI PORTAL RA BODY ────────────────────────────────────────────
  //
  // Sidebar đơn hàng trượt vào bằng `translate-x-0 / translate-x-full`. Một phần tử có
  // `transform` sẽ TRỞ THÀNH KHUNG THAM CHIẾU cho mọi con dùng `position: fixed` — nên
  // `fixed inset-0` ở đây không còn tính theo màn hình mà tính theo sidebar rộng 520px.
  // Kết quả: lớp phủ và nội dung bị nhốt trong sidebar, phần còn lại của trang vẫn sáng nguyên.
  //
  // Sidebar cũng tạo một ngăn xếp z-index riêng (z-40), nên dù có tăng z-index bao nhiêu thì
  // lightbox vẫn không thể phủ lên bảng bên trái. Portal giải quyết cả hai bằng một nước đi:
  // nội dung được gắn thẳng vào body, không còn tổ tiên nào can thiệp.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      // z-[2000]: lightbox là thứ người dùng CHỦ ĐỘNG mở để nhìn, nên phải nằm trên mọi lớp
      // phủ khác. Khảo sát z-index đang dùng trong app: cao nhất là 1100 (hộp thoại lồng ở màn
      // Quản lý user), rồi 1000, rồi 900 (panel chi tiết màn Việc thiết kế 3D). Mức 50 cũ chỉ
      // đủ thắng sidebar Đơn hàng (z-40) — mở ảnh từ màn 3D thì panel 900 đè lên mất.
      //
      // Không dùng số cực lớn: toast lỗi (sonner) phải còn hiện được đè lên lightbox, nếu không
      // người dùng mở ảnh rồi gặp lỗi sẽ không thấy thông báo nào.
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Đóng"
        className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Chặn không cho bấm vào nội dung đóng luôn theo lớp phủ — chỉ đóng khi bấm ra ngoài
          hoặc bấm nút X. Với video điều này còn quan trọng hơn ảnh: mỗi lần bấm nút phát hay
          kéo thanh thời gian mà lightbox đóng mất thì không xem được gì. */}
      <div onClick={(e) => e.stopPropagation()} className="max-w-[min(92vw,900px)] w-full">
        {children}
      </div>
    </div>,
    document.body,
  );
}
