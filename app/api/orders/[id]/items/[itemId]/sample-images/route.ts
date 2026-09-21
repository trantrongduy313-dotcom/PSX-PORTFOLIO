import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { prisma } from "@/app/lib/prisma";
import {
  IMAGE_PATH_PREFIX,
  MAX_SAMPLE_IMAGES,
  addSampleImage,
  buildImagePath,
  pathFromPublicUrl,
  publicImageUrl,
  removeSampleImage,
  validateImageUpload,
} from "@/app/lib/business/mo-image";
import { createSignedUploadUrl, deleteStorageObject } from "@/app/lib/storage/supabase-storage";

// ─── Ảnh mẫu Order gửi cho NV 3D — upload trực tiếp, tối đa 2 ────────────────
//
// SONG SINH với route ../image (ảnh đại diện MO): cùng bucket, cùng giao thức ba bước, cùng
// quyền ADMIN/ORDER. Khác đúng MỘT điều, và đó là lý do nó là route riêng chứ không phải một
// tham số của route kia:
//
//     ảnh đại diện = MỘT chuỗi, upload mới GHI ĐÈ cái cũ
//     ảnh mẫu      = DANH SÁCH ≤2, upload mới THÊM VÀO, xoá phải nói xoá cái nào
//
// Gộp hai hình dạng đó vào một route là thêm một nhánh `if` vào mọi bước của cả hai — giấu sự
// khác biệt chứ không xoá được nó. Phần THẬT SỰ dùng chung (kiểm file, dựng đường dẫn, ghép/bóc
// URL, trần 2 ảnh) đã nằm ở business/mo-image.ts, và cả hai route cùng gọi.
//
// Route CỐ Ý MỎNG: xác thực → hỏi module business/storage → ghi.
//   POST   — xin vé upload (browser PUT thẳng lên storage, KHÔNG qua server)
//   PUT    — xác nhận đã upload xong, THÊM URL vào danh sách
//   DELETE — bỏ MỘT ảnh khỏi danh sách + xoá object trong storage

const BUCKET = "mo-images";

const requestUploadSchema = z.object({
  contentType: z.string(),
  size: z.number().int().positive(),
});

const confirmUploadSchema = z.object({
  path: z.string().min(1),
});

/** DELETE phải nói xoá ảnh NÀO — khác route ảnh đại diện, vốn chỉ có một ảnh để xoá. */
const deleteSchema = z.object({
  url: z.string().min(1),
});

async function requireAdminOrOrder() {
  const user = await getCurrentUser();
  if (!user) return { denied: Errors.forbidden() } as const;
  if (!["ADMIN", "ORDER"].includes(user.role)) return { denied: Errors.forbidden() } as const;
  return { user } as const;
}

async function loadItem(itemId: string) {
  return prisma.orderItem.findUnique({
    where: { id: itemId },
    select: { id: true, orderId: true, sampleImageUploads: true },
  });
}

/** POST — xin vé upload. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const auth = await requireAdminOrOrder();
  if ("denied" in auth) return auth.denied;

  const { itemId } = await ctx.params;
  const item = await loadItem(itemId);
  if (!item) return Errors.notFound("Order item");

  // 🔴 CHẶN TRẦN NGAY Ở BƯỚC XIN VÉ, không đợi tới bước xác nhận. Để lọt tới đó thì file đã
  // nằm trong bucket rồi mới bị từ chối ghi — một file mồ côi cho mỗi lần người dùng thử.
  if (item.sampleImageUploads.length >= MAX_SAMPLE_IMAGES) {
    return Errors.badRequest(`Đã đủ ${MAX_SAMPLE_IMAGES} ảnh mẫu — xoá bớt một ảnh trước khi thêm.`);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.badRequest("Invalid JSON");
  }
  const parsed = requestUploadSchema.safeParse(body);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);

  const invalid = validateImageUpload(parsed.data);
  if (invalid) return Errors.badRequest(invalid);

  const path = buildImagePath({
    orderItemId: itemId,
    contentType: parsed.data.contentType,
    prefix: IMAGE_PATH_PREFIX.sample,
  });
  const signed = await createSignedUploadUrl({ bucket: BUCKET, path });
  if (signed.status === "ERROR") {
    console.error("[sample-images] Không xin được vé upload:", signed.reason);
    return Errors.serviceUnavailable("Không thể chuẩn bị upload ảnh lúc này — vui lòng thử lại.");
  }

  return ok({ uploadUrl: signed.uploadUrl, path });
}

/** PUT — xác nhận đã upload xong, THÊM vào danh sách. */
export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const auth = await requireAdminOrOrder();
  if ("denied" in auth) return auth.denied;

  const { itemId } = await ctx.params;
  const item = await loadItem(itemId);
  if (!item) return Errors.notFound("Order item");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.badRequest("Invalid JSON");
  }
  const parsed = confirmUploadSchema.safeParse(body);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);

  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) return Errors.serviceUnavailable("Chưa cấu hình SUPABASE_URL.");

  const newUrl = publicImageUrl({ supabaseUrl, bucket: BUCKET, path: parsed.data.path });

  // Kiểm lại trần MỘT LẦN NỮA ở đây, không chỉ ở POST: giữa hai request có thể có người thứ hai
  // vừa thêm ảnh. `addSampleImage` trả null nghĩa là đầy → dọn luôn file vừa upload thay vì để
  // nó nằm lại làm rác.
  const next = addSampleImage(item.sampleImageUploads, newUrl);
  if (next === null) {
    const orphan = pathFromPublicUrl(newUrl, BUCKET);
    if (orphan) await deleteStorageObject({ bucket: BUCKET, path: orphan });
    return Errors.badRequest(`Đã đủ ${MAX_SAMPLE_IMAGES} ảnh mẫu — xoá bớt một ảnh trước khi thêm.`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.orderItem.update({
      where: { id: itemId },
      data: { sampleImageUploads: next },
      select: { id: true, sampleImageUploads: true },
    });
    await tx.workflowHistory.create({
      data: {
        orderId: item.orderId,
        performedById: auth.user.dbId ?? null,
        action: "FIELD_UPDATED",
        comment: `Đã thêm ảnh mẫu (${next.length}/${MAX_SAMPLE_IMAGES})`,
        metadata: { source: "SAMPLE_IMAGE_UPLOAD", orderItemId: itemId } as never,
      },
    });
    return row;
  });

  return ok(updated);
}

/** DELETE — bỏ MỘT ảnh khỏi danh sách và khỏi storage. */
export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const auth = await requireAdminOrOrder();
  if ("denied" in auth) return auth.denied;

  const { itemId } = await ctx.params;
  const item = await loadItem(itemId);
  if (!item) return Errors.notFound("Order item");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.badRequest("Invalid JSON");
  }
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);

  const target = parsed.data.url;
  if (!item.sampleImageUploads.includes(target)) {
    // Không có gì để xoá — trả về trạng thái hiện tại thay vì lỗi. Bấm xoá hai lần, hoặc hai
    // người cùng xoá một ảnh, đều dẫn tới đây và đều KHÔNG phải sự cố.
    return ok({ id: itemId, sampleImageUploads: item.sampleImageUploads });
  }

  const next = removeSampleImage(item.sampleImageUploads, target);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.orderItem.update({
      where: { id: itemId },
      data: { sampleImageUploads: next },
      select: { id: true, sampleImageUploads: true },
    });
    await tx.workflowHistory.create({
      data: {
        orderId: item.orderId,
        performedById: auth.user.dbId ?? null,
        action: "FIELD_UPDATED",
        comment: `Đã xoá một ảnh mẫu (còn ${next.length}/${MAX_SAMPLE_IMAGES})`,
        metadata: { source: "SAMPLE_IMAGE_DELETE", orderItemId: itemId } as never,
      },
    });
    return row;
  });

  // Xoá object SAU khi DB đã ghi — không xoá nhầm khi phần lưu DB thất bại trước đó.
  const path = pathFromPublicUrl(target, BUCKET);
  if (path) {
    const del = await deleteStorageObject({ bucket: BUCKET, path });
    if (del.status === "ERROR") {
      console.error("[sample-images] Không xoá được ảnh (file rác trong storage):", del.reason);
    }
  }

  return ok(updated);
}
