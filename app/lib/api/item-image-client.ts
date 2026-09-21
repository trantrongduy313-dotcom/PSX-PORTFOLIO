// ─── Giao thức upload ảnh của một OrderItem — phía client ────────────────────
//
// 🔴 VÌ SAO GOM Ở ĐÂY: upload một ảnh KHÔNG phải một lời gọi API, nó là một GIAO THỨC BA BƯỚC:
//
//   1. POST endpoint         → xin "vé" (signed upload URL) + đường dẫn trong bucket
//   2. PUT thẳng lên Storage → gửi byte ảnh, KHÔNG qua server của mình
//   3. PUT endpoint          → báo server lưu URL vào DB
//
// Bước 2 đi thẳng lên Supabase để tránh trần body ~4.5MB của Vercel và để serverless function
// không phải giữ vài MB trong bộ nhớ mỗi lần có người upload.
//
// Ba bước đó phải khớp nhau: bỏ bước 3 là file nằm trong bucket mà DB không biết (rác vĩnh
// viễn); đổi tên tham số ở một bước là hỏng cả chuỗi. Chép giao thức sang component thứ hai là
// chép cả cơ hội để hai bản lệch nhau — mà lệch ở đây không báo lỗi, chỉ để lại file mồ côi.
//
// Cùng lý do với app/lib/api/kpi-report-client.ts: một nơi dựng URL và đọc response, để
// TypeScript có chỗ mà bắt lỗi.
//
// KHÔNG chứa React, không state → dùng được trong mọi component.

import { resizeImageForUpload } from "@/app/lib/utils/resize-image";
import { fetchJson, jsonBody } from "@/app/lib/utils/fetch-json";

/** Vé upload server cấp ở bước 1. */
type UploadTicket = { uploadUrl: string; path: string };

/**
 * Chạy trọn ba bước cho MỘT file, trả về response của bước xác nhận.
 *
 * `T` là hình dạng response của từng endpoint — ảnh đại diện trả `{ designImageUrl }`, ảnh mẫu
 * trả danh sách. Chỗ gọi tự khai, vì đó là phần DUY NHẤT khác nhau giữa các khe ảnh.
 *
 * ⚠️ THU NHỎ ẢNH NẰM TRONG ĐÂY, không phải ở chỗ gọi. Đưa ra ngoài là mở một đường vòng: một
 * component tương lai gọi thẳng mà quên thu nhỏ, rồi ảnh 8MB đi qua và không ai thấy cho tới
 * lúc bucket phình.
 */
export async function uploadItemImage<T>(endpoint: string, file: File): Promise<T> {
  const resized = await resizeImageForUpload(file);

  const ticket = await fetchJson<UploadTicket>(
    endpoint,
    jsonBody({ contentType: resized.contentType, size: resized.blob.size }),
  );

  const uploadRes = await fetch(ticket.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": resized.contentType },
    body: resized.blob,
  });
  if (!uploadRes.ok) throw new Error(`Upload lên storage thất bại (HTTP ${uploadRes.status})`);

  return fetchJson<T>(endpoint, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: ticket.path }),
  });
}

/**
 * Xoá một ảnh.
 *
 * `body` tùy chọn vì hai khe ảnh xoá theo hai cách: ảnh đại diện chỉ có MỘT nên `DELETE` trần
 * là đủ; ảnh mẫu là danh sách nên phải nói xoá cái nào. Không ép chúng thành một hình dạng —
 * chúng khác nhau thật.
 */
export async function deleteItemImage<T>(endpoint: string, body?: unknown): Promise<T> {
  return fetchJson<T>(endpoint, {
    method: "DELETE",
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
}
