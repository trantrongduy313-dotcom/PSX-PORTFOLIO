import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { prisma } from "@/app/lib/prisma";
import { currentCommitSha } from "@/app/lib/business/feedback/context";
import { DEFAULT_CHANGELOG_AREA, isChangelogArea } from "@/app/lib/business/changelog/area";
import { validateChangelogDraft } from "@/app/lib/business/changelog/validate";

// ─── Đọc & tạo mục changelog ─────────────────────────────────────────────────
//
// Route CỐ Ý MỎNG: xác thực → hỏi module business → ghi. Mọi luật (đăng có bắn thông báo hay
// không, độ dài, khu vực hợp lệ) nằm ở app/lib/business/changelog/* và có test.
//
// ⚠️ KHÔNG có đường đăng ở route này. Tạo ra là NHÁP, luôn luôn. Đăng là một việc THEO LƯỢT ở
// `POST /api/changelog/publish` — một lượt, một tin Chat. Nếu ở đây có cờ `isPublished` nhận từ
// client thì có hai đường đăng, và một trong hai sẽ quên bắn thông báo (hoặc bắn hai lần).

const createSchema = z.object({
  title: z.string(),
  body: z.string().optional(),
  area: z.string().optional(),
  isImportant: z.boolean().optional(),
});

const PUBLIC_SELECT = {
  id: true,
  title: true,
  body: true,
  area: true,
  isImportant: true,
  publishedAt: true,
  authorName: true,
} as const;

const ADMIN_SELECT = {
  ...PUBLIC_SELECT,
  isPublished: true,
  notifiedAt: true,
  commitSha: true,
  createdAt: true,
} as const;

const LIST_LIMIT = 200;

/**
 * GET — danh sách.
 *
 *   (mặc định)   → CHỈ mục ĐÃ ĐĂNG. Mọi role đang đăng nhập.
 *   ?scope=admin → gồm cả nháp. CHỈ ADMIN.
 *
 * ⚠️ Nháp KHÔNG được lọt ra đường công khai. Đó là nội dung viết nửa vời — người dùng đọc được
 * một mục nháp là đọc một lời thông báo chưa ai định nói.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Errors.forbidden();

  const scope = request.nextUrl.searchParams.get("scope") ?? "public";
  if (scope !== "public" && scope !== "admin") {
    return Errors.badRequest("scope phải là 'public' hoặc 'admin'.");
  }
  if (scope === "admin" && user.role !== "ADMIN") return Errors.forbidden();

  const rows = await prisma.changelogEntry.findMany({
    where: scope === "admin" ? {} : { isPublished: true },
    // Nháp lên đầu ở màn admin (chưa xử lý thì phải thấy trước); còn lại mới nhất trước.
    orderBy: scope === "admin" ? [{ isPublished: "asc" }, { createdAt: "desc" }] : { publishedAt: "desc" },
    take: LIST_LIMIT,
    select: scope === "admin" ? ADMIN_SELECT : PUBLIC_SELECT,
  });

  return ok(rows);
}

/** POST — tạo một NHÁP. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Errors.forbidden();
  if (user.role !== "ADMIN") return Errors.forbidden();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.badRequest("Invalid JSON");
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);

  const area = parsed.data.area ?? DEFAULT_CHANGELOG_AREA;
  const draft = {
    title: parsed.data.title,
    body: parsed.data.body ?? "",
    area,
    isImportant: parsed.data.isImportant ?? false,
  };

  const invalid = validateChangelogDraft(draft);
  if (invalid) return Errors.badRequest(invalid);
  // `validateChangelogDraft` đã kiểm khu vực, nhưng TypeScript không biết điều đó — type guard
  // ở đây là để enum của Prisma nhận được kiểu hẹp, không phải để kiểm lần hai.
  if (!isChangelogArea(area)) return Errors.badRequest("Khu vực không hợp lệ.");

  const created = await prisma.changelogEntry.create({
    data: {
      title: draft.title.trim(),
      body: draft.body.trim(),
      area,
      isImportant: draft.isImportant,
      authorId: user.dbId ?? null,
      authorName: user.name?.trim() || user.email?.trim() || "Admin",
      // Đọc ở SERVER: đây là bản build đang PHỤC VỤ, còn client chỉ biết bản của bundle nó đã
      // tải — hai con số lệch nhau đúng vào lúc đáng quan tâm nhất, ngay sau một lần deploy.
      commitSha: currentCommitSha(process.env),
      // isPublished / publishedAt / notifiedAt CỐ Ý không nhận từ đây. Xem ghi chú đầu file.
    },
    select: ADMIN_SELECT,
  });

  return ok(created, 201);
}
