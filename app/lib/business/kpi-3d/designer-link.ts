import "server-only";

import type { Prisma } from "@/app/generated/prisma/client";

type Transaction = Prisma.TransactionClient;

// ─── Nối User (tài khoản đăng nhập) ↔ Designer3D (hồ sơ nhân viên) ───────────
//
// Trước đây phải tạo 2 nơi tách rời rồi vào Sửa để gắn tay: tạo User ở Quản lý User, tạo
// Designer3D ở Quản lý NV 3D, sau đó chọn tài khoản từ dropdown. Module này gộp lại — tạo 1
// bên thì bên kia tự nối hoặc tự sinh, theo cả 2 chiều.
//
// Vì sao khớp CHÍNH XÁC (không mờ/gần đúng): Designer3D.name là trường DUY NHẤT, nên khớp
// đúng chuẩn hoá sẽ không bao giờ ra 2 kết quả — an toàn để tự động, không cần hộp thoại xác
// nhận. Không khớp ai → tạo hồ sơ mới, mã NV để trống cho admin điền sau (đúng yêu cầu khách).

/** Chuẩn hoá tên để so khớp — bỏ khoảng trắng thừa, không phân biệt hoa/thường. */
export function normalizeName(name: string): string {
  return name.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}

export type DesignerLinkResult =
  | { mode: "LINKED"; designerId: string; designerName: string }
  | { mode: "CREATED"; designerId: string; designerName: string }
  | { mode: "SKIPPED" };

/**
 * Khi tạo/khôi phục User với role DESIGN_3D: tự nối vào hồ sơ NV 3D đã có tên khớp và CHƯA
 * gắn tài khoản nào, hoặc tự tạo hồ sơ mới (mã NV để trống) nếu không khớp ai.
 *
 * Cố ý KHÔNG chặn việc tạo User nếu bước này lỗi — đây là tiện ích đi kèm, không phải điều
 * kiện bắt buộc để có tài khoản.
 */
export async function linkOrCreateDesignerForUser(
  tx: Transaction,
  params: { userId: string; userName: string },
): Promise<DesignerLinkResult> {
  const target = normalizeName(params.userName);

  const candidates = await tx.designer3D.findMany({
    where: { isActive: true, userId: null },
    select: { id: true, name: true },
  });
  const match = candidates.find((d) => normalizeName(d.name) === target);

  if (match) {
    await tx.designer3D.update({ where: { id: match.id }, data: { userId: params.userId } });
    return { mode: "LINKED", designerId: match.id, designerName: match.name };
  }

  const created = await tx.designer3D.create({
    data: { name: params.userName, code: "", isActive: true, userId: params.userId },
    select: { id: true, name: true },
  });
  return { mode: "CREATED", designerId: created.id, designerName: created.name };
}

export type UserLinkResult =
  | { mode: "LINKED"; userId: string }
  | { mode: "CREATED"; userId: string }
  | { mode: "ERROR"; reason: string };

/**
 * Khi tạo Designer3D kèm email: nối vào tài khoản đã có (đúng role, chưa gắn cho NV khác),
 * hoặc tạo tài khoản mới với role NV 3D nếu email chưa từng đăng ký.
 *
 * KHÔNG tự đổi role của một tài khoản đã tồn tại với role KHÁC — đó là quyết định của admin
 * ở Quản lý User, không nên bị ghi đè ngầm từ màn Quản lý NV 3D.
 */
export async function linkOrCreateUserForDesigner(
  tx: Transaction,
  params: { email: string; designerName: string; excludeDesignerId?: string },
): Promise<UserLinkResult> {
  const existing = await tx.user.findUnique({
    where: { email: params.email },
    select: { id: true, role: true, deletedAt: true },
  });

  if (existing) {
    if (existing.deletedAt) return { mode: "ERROR", reason: "Tài khoản này đã bị xoá." };
    if (existing.role !== "DESIGN_3D") {
      return {
        mode: "ERROR",
        reason: `Tài khoản "${params.email}" đang có vai trò khác — đổi vai trò thành Nhân viên Thiết kế 3D ở Quản lý User trước.`,
      };
    }
    const taken = await tx.designer3D.findFirst({
      where: { userId: existing.id, NOT: params.excludeDesignerId ? { id: params.excludeDesignerId } : undefined },
      select: { name: true },
    });
    if (taken) {
      return { mode: "ERROR", reason: `Tài khoản này đã gắn với nhân viên "${taken.name}".` };
    }
    return { mode: "LINKED", userId: existing.id };
  }

  const created = await tx.user.create({
    data: { name: params.designerName, email: params.email, role: "DESIGN_3D", isActive: true },
    select: { id: true },
  });
  return { mode: "CREATED", userId: created.id };
}
