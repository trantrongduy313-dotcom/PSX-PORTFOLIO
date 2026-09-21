// ─── Gọi API và đọc lỗi cho tử tế ────────────────────────────────────────────
//
// VÌ SAO CÓ FILE NÀY: gọi `await res.json()` trực tiếp trên một response 500 KHÔNG CÓ BODY sẽ
// ném lỗi của trình duyệt:
//
//     Failed to execute 'json' on 'Response': Unexpected end of JSON input
//
// Câu đó che mất lý do thật của server và đã khiến việc chẩn đoán một sự cố mất sáu vòng dò.
// Đọc text rồi mới parse để tránh việc đó — đoạn này bị viết lại ở hai chỗ trước khi gộp về
// đây, nên giữ làm bản dùng chung duy nhất để không có bản thứ ba.

export type ApiErrorBody = { error?: { code?: string; message?: string } };

/**
 * Gọi API, trả về data đã parse. Ném Error với thông điệp DÙNG ĐƯỢC nếu thất bại.
 *
 * Thứ tự ưu tiên thông điệp lỗi: message của server → mã HTTP. Không bao giờ để lộ lỗi parse
 * của trình duyệt ra người dùng, vì nó nói về JSON chứ không nói về việc gì vừa sai.
 */
export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);

  const raw = await res.text();
  let body: (ApiErrorBody & { data?: T }) | null = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null; // body không phải JSON (VD: trang lỗi HTML, hoặc rỗng)
  }

  if (!res.ok) {
    throw new Error(body?.error?.message ?? `Yêu cầu thất bại (HTTP ${res.status})`);
  }
  return (body?.data ?? body) as T;
}

/** Bọc JSON body cho các lệnh ghi — tránh gõ lại headers ở mỗi chỗ gọi. */
export function jsonBody(payload: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}
