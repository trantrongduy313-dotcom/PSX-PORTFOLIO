import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  code: z.string().min(1).max(20).trim(),
  // Tài khoản đăng nhập gắn với hồ sơ NV 3D này. null = gỡ liên kết.
  // Bỏ qua trường này (undefined) = giữ nguyên liên kết cũ.
  userId: z.string().min(1).nullable().optional(),
});

const designerSelect = {
  id: true,
  name: true,
  code: true,
  isActive: true,
  user: { select: { id: true, name: true, email: true, role: true } },
} as const;

async function checkAuth() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  return ["ADMIN", "ORDER"].includes(role);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAuth()) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ", details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, code, userId } = parsed.data;

  const conflict = await prisma.designer3D.findFirst({ where: { name, NOT: { id } } });
  if (conflict) {
    return NextResponse.json({ error: "Tên nhân viên đã tồn tại" }, { status: 409 });
  }

  // Gắn tài khoản đăng nhập: kiểm tra ĐÚNG role và CHƯA gắn cho NV khác.
  // Sai role sẽ khiến NV đăng nhập được nhưng không vào được màn việc 3D — lỗi khó đoán,
  // nên chặn ngay tại đây thay vì để phát hiện lúc dùng.
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!user) {
      return NextResponse.json({ error: "Không tìm thấy tài khoản" }, { status: 400 });
    }
    if (user.role !== "DESIGN_3D") {
      return NextResponse.json(
        { error: "Tài khoản phải có vai trò Nhân viên Thiết kế 3D" },
        { status: 400 },
      );
    }
    const taken = await prisma.designer3D.findFirst({ where: { userId, NOT: { id } }, select: { name: true } });
    if (taken) {
      return NextResponse.json(
        { error: `Tài khoản này đã gắn với nhân viên "${taken.name}"` },
        { status: 409 },
      );
    }
  }

  const designer = await prisma.designer3D.update({
    where: { id },
    data: { name, code, ...(userId !== undefined ? { userId } : {}) },
    select: designerSelect,
  });

  return NextResponse.json({ data: designer });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAuth()) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const isActive = typeof body?.isActive === "boolean" ? body.isActive : undefined;
  if (isActive === undefined) {
    return NextResponse.json({ error: "Thiếu trường isActive" }, { status: 400 });
  }

  const designer = await prisma.designer3D.update({
    where: { id },
    data: { isActive },
    select: designerSelect,
  });

  return NextResponse.json({ data: designer });
}
