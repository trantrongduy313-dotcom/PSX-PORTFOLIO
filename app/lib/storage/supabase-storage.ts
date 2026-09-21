import "server-only";

// ─── Supabase Storage — gọi REST API trực tiếp, KHÔNG thêm @supabase/supabase-js ─────────────
//
// Dự án chưa dùng SDK Supabase nào (auth qua NextAuth + Prisma trực tiếp, không phải Supabase
// Auth) — thêm cả một SDK chỉ để tạo 1 signed URL và xoá object là không cần thiết. Cùng khuôn
// "raw fetch, không SDK" đã dùng cho notify/google-chat.ts.
//
// SERVICE_ROLE KEY BỎ QUA MỌI RLS — chỉ dùng ở đây (server, "server-only"), KHÔNG BAO GIỜ gửi
// ra browser. Vé upload (signed URL) là thứ duy nhất browser nhận được, và vé đó chỉ ghi được
// vào đúng 1 đường dẫn, hết hạn sau vài phút — nên browser không cầm được service_role.

export type StorageConfigError = { kind: "MISSING_CONFIG"; reason: string };

function readConfig(): { url: string; serviceRoleKey: string } | StorageConfigError {
  // .trim(): giá trị dán vào Vercel có thể kèm khoảng trắng/xuống dòng ở cuối — chuỗi chỉ có
  // khoảng trắng vẫn là "đã đặt" với `!value` nên phải cắt trước khi kiểm.
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  // Nêu ĐÍCH DANH biến nào thiếu. Bản đầu gộp cả hai vào một câu nên khi lỗi xảy ra thật,
  // không biết phải đi sửa biến nào — mất một vòng dò vô ích.
  const missing: string[] = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length > 0) {
    return { kind: "MISSING_CONFIG", reason: `Thiếu biến môi trường: ${missing.join(", ")}.` };
  }

  // Kiểm dạng URL luôn: nếu dán nhầm (VD dán service_role key vào ô URL, hoặc dán thiếu
  // https://) thì báo ngay ở đây, thay vì để lỗi mơ hồ ở bước gọi mạng phía sau.
  if (!/^https:\/\/[^/]+\.supabase\.(co|in)$/i.test(url!.replace(/\/+$/, ""))) {
    return {
      kind: "MISSING_CONFIG",
      reason: "SUPABASE_URL không đúng dạng — phải là https://<project-ref>.supabase.co (không kèm đường dẫn).",
    };
  }

  return { url: url!.replace(/\/+$/, ""), serviceRoleKey: serviceRoleKey! };
}

export type SignedUploadResult =
  | { status: "OK"; uploadUrl: string; token: string }
  | { status: "ERROR"; reason: string };

/**
 * Xin vé upload cho ĐÚNG một đường dẫn — browser dùng vé này để PUT thẳng lên storage, KHÔNG
 * qua server. Server không bao giờ chạm vào byte ảnh nào, tránh giới hạn body ~4.5MB của
 * Vercel và tránh chiếm thời gian/bộ nhớ của serverless function.
 */
export async function createSignedUploadUrl(params: {
  bucket: string;
  path: string;
}): Promise<SignedUploadResult> {
  const config = readConfig();
  if ("kind" in config) return { status: "ERROR", reason: config.reason };

  try {
    const res = await fetch(
      `${config.url}/storage/v1/object/upload/sign/${params.bucket}/${encodeURIComponentPath(params.path)}`,
      {
        method: "POST",
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { status: "ERROR", reason: `Supabase Storage trả HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}` };
    }

    const body = (await res.json()) as { url?: string };
    if (!body.url) return { status: "ERROR", reason: "Supabase Storage không trả về URL vé upload." };

    // body.url dạng "/object/upload/sign/{bucket}/{path}?token=..." — ghép thành URL đầy đủ.
    const uploadUrl = `${config.url}/storage/v1${body.url}`;
    const token = new URL(uploadUrl).searchParams.get("token") ?? "";
    return { status: "OK", uploadUrl, token };
  } catch (error) {
    return { status: "ERROR", reason: error instanceof Error ? error.message : String(error) };
  }
}

export type DeleteObjectResult = { status: "OK" } | { status: "ERROR"; reason: string };

/** Xoá object khỏi bucket. Gọi khi user thay/xoá ảnh — không xoá thì mỗi lần đổi ảnh để lại 1 file rác. */
export async function deleteStorageObject(params: { bucket: string; path: string }): Promise<DeleteObjectResult> {
  const config = readConfig();
  if ("kind" in config) return { status: "ERROR", reason: config.reason };

  try {
    const res = await fetch(`${config.url}/storage/v1/object/${params.bucket}/${encodeURIComponentPath(params.path)}`, {
      method: "DELETE",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
    // 404 nghĩa là file đã không còn — coi như thành công, không phải lỗi cần báo.
    if (!res.ok && res.status !== 404) {
      const detail = await res.text().catch(() => "");
      return { status: "ERROR", reason: `Supabase Storage trả HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}` };
    }
    return { status: "OK" };
  } catch (error) {
    return { status: "ERROR", reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Encode từng đoạn path riêng, GIỮ dấu "/" làm ký tự phân cấp — encodeURIComponent thô sẽ encode luôn "/". */
function encodeURIComponentPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}
