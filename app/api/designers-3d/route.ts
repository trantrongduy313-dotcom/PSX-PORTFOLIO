import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { linkOrCreateUserForDesigner } from "@/app/lib/business/kpi-3d/designer-link";
import { z } from "zod";

const designerSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  code: z.string().min(1).max(20).trim(),
  // Tuỳ chọn: gắn/tạo tài khoản đăng nhập ngay lúc tạo hồ sơ — gộp 2 bước (tạo NV 3D rồi
  // vào Sửa để gắn tài khoản) thành 1.
  email: z.string().email().nullable().optional(),
});

export async function GET() {
  const designers = await prisma.designer3D.findMany({
    where: { isActive: true },
    orderBy: [{ code: "asc" }, { name: "asc" }],
    select: { id: true, name: true, code: true },
  });
  return NextResponse.json({ data: designers });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!["ADMIN", "ORDER"].includes(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = designerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ", details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, code, email } = parsed.data;

  const existing = await prisma.designer3D.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json({ error: "Tên nhân viên đã tồn tại" }, { status: 409 });
  }

  try {
    const designer = await prisma.$transaction(async (tx) => {
      let userId: string | undefined;

      if (email) {
        const userLink = await linkOrCreateUserForDesigner(tx, { email, designerName: name });
        if (userLink.mode === "ERROR") throw new Error(userLink.reason);
        userId = userLink.userId;
      }

      return tx.designer3D.create({
        data: { name, code, isActive: true, ...(userId ? { userId } : {}) },
        select: {
          id: true, name: true, code: true, isActive: true,
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      });
    });

    return NextResponse.json({ data: designer }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "Không thể tạo nhân viên" }, { status: 400 });
  }
}
