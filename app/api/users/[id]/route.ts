import type { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { USER_ROLE_VALUES } from "@/app/lib/roles";
import { z } from "zod";

export const updateUserSchema = z.object({
  role: z.enum(USER_ROLE_VALUES).optional(),
  storeId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  // Đổi ĐỊNH DANH ĐĂNG NHẬP — không phải một trường thông tin thường.
  // Hệ thống dùng Google OAuth và callback signIn đối chiếu bằng email (auth.ts), nên đổi
  // email là đổi cách nhân viên đăng nhập. Xem khối xử lý bên dưới để hiểu vì sao phải
  // xoá luôn liên kết Google cũ.
  email: z.string().email("Email không hợp lệ").optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "ADMIN") {
    return Errors.forbidden();
  }

  const { id } = await params;

  let body: unknown;
  try { body = await request.json(); } catch { return Errors.badRequest("Invalid JSON"); }

  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);

  const { role, storeId, isActive } = parsed.data;
  // Chuẩn hoá về chữ thường, giống lúc tạo mới — tránh cùng một email tồn tại hai biến thể
  // hoa/thường mà DB vẫn coi là khác nhau.
  const email = parsed.data.email?.trim().toLowerCase();

  // Prevent admin from deactivating themselves
  if (id === currentUser.id && isActive === false) {
    return Errors.badRequest("Cannot deactivate your own account");
  }

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

  // ── Kiểm tra riêng cho việc đổi email ──────────────────────────────────────
  let emailChangedFrom: string | null = null;

  if (email !== undefined) {
    const target = await prisma.user.findUnique({
      where: { id },
      select: { email: true },
    });
    if (!target) return Errors.notFound("User");

    if (target.email.toLowerCase() !== email) {
      // Tự đổi email của chính mình → dễ tự khoá mình khỏi hệ thống (cùng lý do đã chặn
      // admin tự vô hiệu hoá tài khoản mình ở trên).
      if (id === currentUser.id) {
        return Errors.badRequest("Không thể tự đổi email của chính mình. Nhờ quản trị viên khác thực hiện.");
      }

      // Email là trường DUY NHẤT — kiểm tra cả tài khoản đã xoá mềm, nếu không sẽ vỡ ở
      // tầng DB với thông báo khó hiểu.
      const taken = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, deletedAt: true },
      });
      if (taken && taken.id !== id) {
        return Errors.conflict(
          taken.deletedAt
            ? "Email này thuộc về một tài khoản đã bị xoá — không thể dùng lại."
            : `Email này đã thuộc về tài khoản "${taken.name}".`,
        );
      }

      emailChangedFrom = target.email;
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id, deletedAt: null },
        data: {
          ...(role !== undefined && { role }),
          ...(storeId !== undefined && { storeId: storeId ?? null }),
          ...(isActive !== undefined && { isActive }),
          ...(email !== undefined && { email }),
        },
        select: userSelect,
      });

      // MẤU CHỐT: xoá liên kết Google cũ.
      //
      // Bảng accounts nối tài khoản Google qua mã định danh của Google (providerAccountId),
      // KHÔNG qua email. Nếu chỉ đổi email mà giữ dòng này, tài khoản Google CŨ vẫn đăng nhập
      // được: adapter tìm thấy user qua mã Google, rồi callback signIn đối chiếu email lấy từ
      // DB (đã là email mới) nên vẫn cho qua. Việc đổi email khi đó chỉ có tác dụng hình thức.
      //
      // Xoá đi thì lần đăng nhập tới bằng email mới sẽ tạo liên kết sạch — nhờ cờ
      // allowDangerousEmailAccountLinking đang bật trong auth.config.ts.
      if (emailChangedFrom) {
        await tx.account.deleteMany({ where: { userId: id } });
      }

      return user;
    });

    if (emailChangedFrom) {
      // Hệ thống chưa có bảng nhật ký cho thao tác trên User (WorkflowHistory bắt buộc gắn
      // với một đơn hàng). Ghi log server để còn truy vết được thao tác nhạy cảm này.
      console.warn(
        `[USER EMAIL CHANGED] userId=${id} from=${emailChangedFrom} to=${email} by=${currentUser.id} at=${new Date().toISOString()}`,
      );
    }

    return ok(emailChangedFrom ? { ...updated, emailChanged: true } : updated);
  } catch {
    return Errors.internal();
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "ADMIN") {
    return Errors.forbidden();
  }

  const { id } = await params;

  if (id === currentUser.id) {
    return Errors.badRequest("Không thể xóa tài khoản của chính mình");
  }

  try {
    await prisma.user.update({
      where: { id, deletedAt: null, isActive: false },
      data: { deletedAt: new Date() },
    });
    return ok({ message: "User đã được xóa khỏi hệ thống" });
  } catch {
    return Errors.internal();
  }
}
