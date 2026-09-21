"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { fetchJson, jsonBody } from "@/app/lib/utils/fetch-json";
import { resizeImageForUpload } from "@/app/lib/utils/resize-image";
import { MAX_FEEDBACK_IMAGES } from "@/app/lib/business/feedback/validate";

// ─── VẬN CHUYỂN ảnh phản hồi ─────────────────────────────────────────────────
//
// VÌ SAO TÁCH KHỎI `feedback-image-picker.tsx`: file đó đã lên 302 dòng, vượt hạn mức 300 mà
// chính dự án này đặt ra. Cách sai là cắt 2 dòng cho đẹp số. Cách đúng là nhận ra nó đang có
// HAI LÝ DO ĐỂ THAY ĐỔI:
//
//   · vận chuyển  — xin vé, thu nhỏ, PUT lên Supabase, vá trạng thái từng ảnh   ← file này
//   · giao diện   — dán, kéo-thả, chọn tệp, xem trước, xoá                      ← file kia
//
// Đó cũng là toàn bộ giá trị của hạn mức: nó chỉ ra được đường nối TRƯỚC khi file thành 800
// dòng. Bỏ qua vì "chỉ 2 dòng thôi" là bỏ mất tác dụng duy nhất của nó.
//
// LUỒNG mỗi ảnh: File → thu nhỏ trong browser → xin vé từ server → PUT THẲNG lên Supabase
// (KHÔNG qua server, tránh giới hạn body ~4.5MB của Vercel) → giữ lại `path`. Bấm Gửi mới nộp
// danh sách `path` cho /api/feedback.
//
// HOOK NÀY SỞ HỮU objectURL: nó tạo ra và nó thu hồi. Chia đôi việc đó giữa hai file là cách
// chắc chắn có ngày một bên tạo mà không bên nào dọn.

export type PickedImage = {
  /** Khoá cục bộ để React và nút xoá phân biệt các ảnh — KHÔNG gửi lên server. */
  key: string;
  /** Đường dẫn trong bucket sau khi tải xong. null khi đang tải hoặc tải lỗi. */
  path: string | null;
  previewUrl: string;
  state: "uploading" | "done" | "error";
};

let seq = 0;

export type FeedbackImageUpload = {
  /**
   * Chỗ VÀO DUY NHẤT cho mọi cách đưa ảnh vào: chọn tệp, kéo-thả, và dán.
   *
   * `remaining` do chỗ gọi truyền vào (event handler biết qua props, handler dán biết qua ref).
   * Cắt bớt ở đây thay vì để từng ảnh tự bị chối: chọn 10 ảnh một lượt thì người dùng cần MỘT
   * câu nhắc, không phải sáu câu giống nhau.
   */
  addFiles: (files: FileList | null | undefined, remaining: number) => void;
  remove: (key: string) => void;
};

export function useFeedbackImageUpload(params: {
  images: PickedImage[];
  /**
   * ⚠️ Phải là HÀM CẬP NHẬT của React (`setImages`), không phải `(next) => void`.
   *
   * Dán nhiều ảnh trong MỘT cú Ctrl+V sẽ gọi `upload` liên tiếp trước khi React kịp render
   * lại. Nếu mỗi lần gọi tự dựng mảng mới từ `images` cũ thì ảnh sau ghi đè ảnh trước và
   * người dùng mất ảnh mà không có lỗi nào.
   */
  setImages: React.Dispatch<React.SetStateAction<PickedImage[]>>;
}): FeedbackImageUpload {
  const { images, setImages } = params;

  const upload = async (file: File) => {
    const key = `img-${++seq}`;
    const previewUrl = URL.createObjectURL(file);

    // Hiện ảnh NGAY, trước khi tải xong. Người dùng thấy ảnh mình vừa dán đã được nhận vào,
    // nên không dán lại lần nữa vì tưởng không ăn.
    //
    // Chốt hạn mức LẦN NỮA ở đây dù chỗ gọi đã cắt bớt: đây là nơi duy nhất thấy được số ảnh
    // THẬT tại thời điểm ghi, nên là nơi duy nhất chốt được chắc chắn.
    setImages((prev) =>
      prev.length >= MAX_FEEDBACK_IMAGES
        ? prev
        : [...prev, { key, path: null, previewUrl, state: "uploading" }],
    );

    const patch = (next: Partial<PickedImage>) =>
      setImages((prev) => prev.map((i) => (i.key === key ? { ...i, ...next } : i)));

    try {
      // Thu nhỏ trong BROWSER trước khi tải — dùng lại đúng hàm của ảnh MO. Ảnh chụp màn hình
      // full-HD thường 2–4MB; thu xuống vài trăm KB làm việc dán ảnh dùng được cả trên mạng yếu.
      const resized = await resizeImageForUpload(file);

      const signed = await fetchJson<{ uploadUrl: string; path: string }>(
        "/api/feedback/upload-url",
        jsonBody({ contentType: resized.contentType, size: resized.blob.size }),
      );

      const res = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": resized.contentType },
        body: resized.blob,
      });
      if (!res.ok) throw new Error(`Tải ảnh lên thất bại (HTTP ${res.status})`);

      patch({ path: signed.path, state: "done" });
    } catch (err) {
      // KHÔNG bỏ ảnh khỏi danh sách khi lỗi: để nguyên kèm dấu lỗi thì người dùng thấy được
      // cái gì không thành. Âm thầm biến mất là họ tưởng đã gửi kèm ảnh.
      //
      // Và ảnh lỗi KHÔNG chặn việc gửi — feedback-dialog.tsx tự bỏ nó khỏi lượt gửi. Chặn là
      // cái bẫy đã gặp trên production: công cụ báo lỗi chặn người đang cố báo lỗi.
      patch({ state: "error" });
      toast.error((err as Error).message || "Tải ảnh lên thất bại");
    }
  };

  const addFiles = (files: FileList | null | undefined, remaining: number) => {
    if (!files) return;
    // Chỉ nhận ảnh. Kéo cả một thư mục vào thì bỏ qua phần không phải ảnh chứ không báo lỗi
    // đỏ — người dùng đang cố giúp, không đang làm sai.
    const picked = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (picked.length === 0) return;

    if (picked.length > remaining) {
      toast.error(`Tối đa ${MAX_FEEDBACK_IMAGES} ảnh cho mỗi phản hồi.`);
    }
    for (const file of picked.slice(0, Math.max(0, remaining))) void upload(file);
  };

  const remove = (key: string) => {
    // Gọi từ event handler nên `images` LUÔN là bản mới nhất — không cần ref.
    const target = images.find((i) => i.key === key);
    if (target) URL.revokeObjectURL(target.previewUrl);
    setImages((prev) => prev.filter((i) => i.key !== key));
    // ⚠️ CỐ Ý KHÔNG xoá object đã tải trên storage. Bỏ một ảnh khỏi phản hồi CHƯA GỬI là việc
    // rất thường (dán nhầm, dán thừa), và gọi xoá ở đây cần thêm một route DELETE mà client
    // nào cũng gọi được — tức là một cửa để xoá object theo path tuỳ ý. Cái giá là file mồ côi
    // trong bucket; đó là lý do đường dẫn chia theo tháng, để dọn hàng loạt về sau.
  };

  // Thu hồi mọi objectURL khi component đóng — không thu hồi là rò bộ nhớ mỗi lần mở hộp thoại.
  // Ref cập nhật TRONG EFFECT (React 19 cấm ghi ref lúc render).
  const cleanupRef = useRef(images);
  useEffect(() => {
    cleanupRef.current = images;
  }, [images]);
  useEffect(() => {
    return () => {
      for (const i of cleanupRef.current) URL.revokeObjectURL(i.previewUrl);
    };
  }, []);

  return { addFiles, remove };
}
