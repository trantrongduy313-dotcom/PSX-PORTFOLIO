import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { prisma } from "@/app/lib/prisma";
import { isChangelogArea } from "@/app/lib/business/changelog/area";
import { canDelete, contentPatch, unpublishPatch } from "@/app/lib/business/changelog/publish";
import { validateChangelogDraft } from "@/app/lib/business/changelog/validate";

// ─── Sửa nội dung / bỏ đăng / xoá nháp ───────────────────────────────────────
//
// CHỈ ADMIN.
//
// ⚠️ KHÔNG CÓ ĐƯỜNG ĐĂNG Ở ĐÂY. Đăng là việc theo LƯỢT (`POST /api/changelog/publish`) — một
// lượt, một tin Chat. Hai đường đăng là một trong hai sẽ quên bắn thông báo, hoặc bắn hai lần.
//
// 🔴 VÀ SỬA NỘI DUNG KHÔNG BAO GIỜ BẮN THÔNG BÁO. Chốt chặn đó nằm ở TẦNG KIỂU, không ở kỷ luật
// của người viết route: `contentPatch` trả về ĐÚNG bốn trường nội dung, nên không có đường nào
// để ghi `notifiedAt` hay `publishedAt` từ đây kể cả khi ai đó muốn.

const patchSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  area: z.string().optional(),
  isImportant: z.boolean().optional(),
  /** true = đưa mục đã đăng về nháp. Không có `publish: true` — xem ghi chú đầu file. */
  unpublish: z.literal(true).optional(),
});

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { denied: Errors.forbidden() } as const;
  if (user.role !== "ADMIN") return { denied: Errors.forbidden() } as const;
  return { user } as const;
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("denied" in auth) return auth.denied;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.badRequest("Invalid JSON");
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);

  const existing = await prisma.changelogEntry.findUnique({
    where: { id },
    select: { id: true, title: true, body: true, area: true, isImportant: true, isPublished: true },
  });
  if (!existing) return Errors.notFound("Changelog entry");

  // ─── Bỏ đăng ────────────────────────────────────────────────────────────────
  if (parsed.data.unpublish) {
    if (!existing.isPublished) return Errors.badRequest("Mục này đang là nháp.");
    const updated = await prisma.changelogEntry.update({
      where: { id },
      // `unpublishPatch()` CỐ Ý không xoá `notifiedAt`: mọi người đã nhận tin rồi và không có
      // cách nào rút lại. Xoá nó là tự cho mình quyền bắn lại lần hai cho cùng nội dung.
      data: unpublishPatch(),
      select: { id: true, isPublished: true, publishedAt: true },
    });
    return ok(updated);
  }

  // ─── Sửa nội dung ───────────────────────────────────────────────────────────
  const merged = {
    title: parsed.data.title ?? existing.title,
    body: parsed.data.body ?? existing.body,
    area: parsed.data.area ?? existing.area,
    isImportant: parsed.data.isImportant ?? existing.isImportant,
  };

  const invalid = validateChangelogDraft(merged);
  if (invalid) return Errors.badRequest(invalid);
  if (!isChangelogArea(merged.area)) return Errors.badRequest("Khu vực không hợp lệ.");

  const patch = contentPatch(merged);
  const updated = await prisma.changelogEntry.update({
    where: { id },
    data: { ...patch, area: merged.area },
    select: {
      id: true,
      title: true,
      body: true,
      area: true,
      isImportant: true,
      isPublished: true,
      publishedAt: true,
      updatedAt: true,
    },
  });

  return ok(updated);
}

/** DELETE — chỉ xoá được NHÁP. */
export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("denied" in auth) return auth.denied;

  const { id } = await ctx.params;
  const existing = await prisma.changelogEntry.findUnique({
    where: { id },
    select: { id: true, isPublished: true },
  });
  if (!existing) return Errors.notFound("Changelog entry");

  if (!canDelete(existing)) {
    // Nêu ĐƯỜNG RA, không chỉ nói "không được": mục đã đăng thì người ta đã đọc, xoá là làm
    // lịch sử nói dối. Muốn nó không hiện nữa thì bỏ đăng.
    return Errors.badRequest(
      "Mục đã đăng thì không xoá được — người dùng đã đọc nó rồi. Hãy bỏ đăng nếu không muốn nó hiện nữa.",
    );
  }

  await prisma.changelogEntry.delete({ where: { id } });
  return ok({ id, deleted: true });
}
