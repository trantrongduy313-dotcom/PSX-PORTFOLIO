import type { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { validateImageUpload, buildImagePath, publicImageUrl, pathFromPublicUrl } from "@/app/lib/business/mo-image";
import { createSignedUploadUrl, deleteStorageObject } from "@/app/lib/storage/supabase-storage";
import { z } from "zod";

// ─── Ảnh đại diện sản phẩm — upload trực tiếp lên Supabase Storage ───────────
//
// Chỉ ADMIN/ORDER — khác route PATCH item (cho cả PRODUCTION), vì việc "chọn ảnh đại diện
// hiện lên table view" là quyết định điều hành đơn hàng, không phải cập nhật tiến độ sản xuất.
//
// Route CỐ Ý MỎNG: xác thực → hỏi module business/storage → ghi. Ba method trên MỘT tài
// nguyên (ảnh của 1 item):
//   POST   — xin vé upload (browser PUT thẳng lên storage sau đó, KHÔNG qua server)
//   PUT    — xác nhận đã upload xong, lưu URL vào DB + ghi lịch sử
//   DELETE — xoá ảnh (khỏi DB VÀ khỏi storage — không xoá storage sẽ để lại file rác)

const BUCKET = "mo-images";

const requestUploadSchema = z.object({
  contentType: z.string(),
  size: z.number().int().positive(),
});

const confirmUploadSchema = z.object({
  path: z.string().min(1),
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
    select: { id: true, orderId: true, designImageUrl: true },
  });
}

/** POST — xin vé upload. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string; itemId: string }> }) {
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
  const parsed = requestUploadSchema.safeParse(body);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);

  const invalid = validateImageUpload(parsed.data);
  if (invalid) return Errors.badRequest(invalid);

  const path = buildImagePath({ orderItemId: itemId, contentType: parsed.data.contentType });
  const signed = await createSignedUploadUrl({ bucket: BUCKET, path });
  if (signed.status === "ERROR") {
    console.error("[mo-image] Không xin được vé upload:", signed.reason);
    return Errors.serviceUnavailable("Không thể chuẩn bị upload ảnh lúc này — vui lòng thử lại.");
  }

  return ok({ uploadUrl: signed.uploadUrl, path });
}

/** PUT — xác nhận đã upload xong, lưu URL vào DB. */
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
  const previousUrl = item.designImageUrl;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.orderItem.update({
      where: { id: itemId },
      data: { designImageUrl: newUrl },
      select: { id: true, designImageUrl: true },
    });
    await tx.workflowHistory.create({
      data: {
        orderId: item.orderId,
        performedById: auth.user.dbId ?? null,
        action: "FIELD_UPDATED",
        comment: previousUrl ? "Đã đổi ảnh đại diện sản phẩm" : "Đã thêm ảnh đại diện sản phẩm",
        metadata: { source: "MO_IMAGE_UPLOAD", orderItemId: itemId } as never,
      },
    });
    return row;
  });

  // Xoá ảnh cũ khỏi storage SAU khi DB đã ghi ảnh mới thành công — không để trang trắng nếu
  // phần xoá lỗi, và không xoá nhầm khi phần lưu DB thất bại trước đó.
  if (previousUrl && previousUrl !== newUrl) {
    const oldPath = pathFromPublicUrl(previousUrl, BUCKET);
    if (oldPath) {
      const del = await deleteStorageObject({ bucket: BUCKET, path: oldPath });
      if (del.status === "ERROR") {
        console.error("[mo-image] Không xoá được ảnh cũ (file rác trong storage):", del.reason);
      }
    }
  }

  return ok(updated);
}

/** DELETE — xoá ảnh khỏi DB và khỏi storage. */
export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const auth = await requireAdminOrOrder();
  if ("denied" in auth) return auth.denied;

  const { itemId } = await ctx.params;
  const item = await loadItem(itemId);
  if (!item) return Errors.notFound("Order item");
  if (!item.designImageUrl) return ok({ id: itemId, designImageUrl: null });

  const path = pathFromPublicUrl(item.designImageUrl, BUCKET);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.orderItem.update({
      where: { id: itemId },
      data: { designImageUrl: null },
      select: { id: true, designImageUrl: true },
    });
    await tx.workflowHistory.create({
      data: {
        orderId: item.orderId,
        performedById: auth.user.dbId ?? null,
        action: "FIELD_UPDATED",
        comment: "Đã xoá ảnh đại diện sản phẩm",
        metadata: { source: "MO_IMAGE_DELETE", orderItemId: itemId } as never,
      },
    });
    return row;
  });

  if (path) {
    const del = await deleteStorageObject({ bucket: BUCKET, path });
    if (del.status === "ERROR") {
      console.error("[mo-image] Không xoá được ảnh khỏi storage (file rác):", del.reason);
    }
  }

  return ok(updated);
}
