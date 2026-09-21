import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import {
  FEEDBACK_BUCKET,
  buildFeedbackImagePath,
  validateImageUpload,
} from "@/app/lib/business/feedback/image";
import { createSignedUploadUrl } from "@/app/lib/storage/supabase-storage";

// ─── Xin vé upload ảnh phản hồi ──────────────────────────────────────────────
//
// Browser PUT thẳng lên Supabase Storage bằng vé này — KHÔNG qua server. Cùng khuôn đã chạy
// cho ảnh MO (app/api/orders/[id]/items/[itemId]/image/route.ts), và cùng lý do: tránh giới
// hạn body ~4.5MB của Vercel, và không để byte ảnh chiếm thời gian/bộ nhớ của serverless
// function.
//
// MỌI ROLE ĐANG ĐĂNG NHẬP đều gọi được — khác hẳn route ảnh MO (chỉ ADMIN/ORDER). Đây là
// điểm quan trọng của cả tính năng: nếu thợ 3D hay Sales không kèm được ảnh thì họ mở Zalo,
// và ta có hai kênh song song — tệ hơn một.
//
// KHÔNG có bước "xác nhận đã upload" riêng (route ảnh MO có `PUT`). Ở đây bước xác nhận CHÍNH
// LÀ việc gửi phản hồi: `POST /api/feedback` nhận danh sách `imagePaths`. Ảnh đã tải nhưng
// người dùng bỏ không gửi sẽ thành file mồ côi trong bucket — đó là cái giá đã biết và chấp
// nhận, đổi lấy việc không phải tạo một bản ghi nháp cho mỗi lần mở hộp thoại.

const schema = z.object({
  contentType: z.string(),
  size: z.number().int().positive(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Errors.forbidden();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.badRequest("Invalid JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);

  // Dùng LẠI phép kiểm của ảnh MO (8MB, jpeg/png/webp) — xem ghi chú ở business/feedback/image.ts
  // về việc vì sao không chép lại hai hằng số đó sang đây.
  const invalid = validateImageUpload(parsed.data);
  if (invalid) return Errors.badRequest(invalid);

  const path = buildFeedbackImagePath({ contentType: parsed.data.contentType, now: new Date() });
  const signed = await createSignedUploadUrl({ bucket: FEEDBACK_BUCKET, path });

  if (signed.status === "ERROR") {
    // Ghi log ĐẦY ĐỦ lý do ở server, nhưng KHÔNG trả nó ra client: `reason` có thể chứa phản
    // hồi thô của Supabase. Cùng cách xử lý ở route ảnh MO.
    console.error("[feedback] Không xin được vé upload:", signed.reason);
    // Câu này CÓ hứa "vẫn gửi được", và bản đầu đã nói dối: nút Gửi chặn khi còn ảnh lỗi.
    // Nay feedback-dialog.tsx tự bỏ ảnh lỗi khỏi lượt gửi, nên lời hứa là thật.
    return Errors.serviceUnavailable("Không tải được ảnh lên. Bạn vẫn gửi được phản hồi bằng chữ.");
  }

  return ok({ uploadUrl: signed.uploadUrl, path });
}
