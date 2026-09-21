import type { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { USER_ROLE_VALUES } from "@/app/lib/roles";
import { linkOrCreateDesignerForUser } from "@/app/lib/business/kpi-3d/designer-link";
import { z } from "zod";

export const createUserSchema = z.object({
  name:    z.string().min(1, "Tên không được để trống"),
  email:   z.string().email("Email không hợp lệ"),
  role:    z.enum(USER_ROLE_VALUES),
  storeId: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "ADMIN") return Errors.forbidden();

  let body: unknown;
  try { body = await request.json(); } catch { return Errors.badRequest("Invalid JSON"); }

  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);

  const { name, email, role, storeId } = parsed.data;

  const userSelect = {
    id: true,
    name: true,
    email: true,
    image: true,
    role: true,
    isActive: true,
    storeId: true,
    store: { select: { id: true, code: true, name: true } },
    createdAt: true,
  } as const;

  try {
    // Nếu email thuộc user đã soft-deleted → khôi phục thay vì tạo mới
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      if (existing.deletedAt === null) {
        return Errors.badRequest("Email này đã tồn tại trong hệ thống");
      }

      // Restore: xóa store assignments cũ rồi cập nhật lại thông tin
      const restored = await prisma.$transaction(async (tx) => {
        await tx.userStore.deleteMany({ where: { userId: existing.id } });
        const updated = await tx.user.update({
          where: { id: existing.id },
          data: {
            name,
            role,
            storeId: storeId ?? null,
            isActive: true,
            deletedAt: null,
            image: null,
          },
          select: userSelect,
        });
        // Role NV 3D → tự nối vào hồ sơ NV 3D đã có tên khớp, hoặc tự tạo hồ sơ mới (mã NV
        // để trống cho admin điền sau). Không chặn tạo/khôi phục tài khoản nếu bước này lỗi.
        const designerLink = role === "DESIGN_3D"
          ? await linkOrCreateDesignerForUser(tx, { userId: updated.id, userName: name }).catch(() => null)
          : null;
        return { updated, designerLink };
      });

      return ok({ ...restored.updated, designerLink: restored.designerLink });
    }

    // Email chưa tồn tại → tạo mới bình thường
    const { user, designerLink } = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          email,
          role,
          storeId: storeId ?? null,
          isActive: true,
        },
        select: userSelect,
      });
      const link = role === "DESIGN_3D"
        ? await linkOrCreateDesignerForUser(tx, { userId: created.id, userName: name }).catch(() => null)
        : null;
      return { user: created, designerLink: link };
    });
    return ok({ ...user, designerLink });
  } catch {
    return Errors.internal();
  }
}

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return Errors.forbidden();

  try {
    const isAdmin = currentUser.role === "ADMIN";

    // Admin gets all users (including inactive) with store info
    // Others get only active users (name/role for dropdowns)
    if (isAdmin && request.nextUrl.searchParams.get("all") === "true") {
      const users = await prisma.user.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
          isActive: true,
          storeId: true,
          store: { select: { id: true, code: true, name: true } },
          createdAt: true,
        },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      });
      return ok(users);
    }

    const users = await prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    });
    return ok(users);
  } catch {
    return Errors.internal();
  }
}
