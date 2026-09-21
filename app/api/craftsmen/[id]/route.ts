import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { craftsmanInputSchema, levelRankOf } from "@/app/lib/business/craftsman";


async function checkAuth() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  return ["ADMIN", "ORDER"].includes(role);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAuth()) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = craftsmanInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ", details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, level, khau, code } = parsed.data;

  const conflict = await prisma.craftsman.findFirst({ where: { name, NOT: { id } } });
  if (conflict) {
    return NextResponse.json({ error: "Tên thợ đã tồn tại" }, { status: 409 });
  }

  const craftsman = await prisma.craftsman.update({
    where: { id },
    data: { name, code, level, khau, levelRank: levelRankOf(level) },
    select: { id: true, name: true, code: true, level: true, khau: true, levelRank: true, isActive: true },
  });

  return NextResponse.json({ data: craftsman });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAuth()) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const isActive = typeof body?.isActive === "boolean" ? body.isActive : undefined;
  if (isActive === undefined) {
    return NextResponse.json({ error: "Thiếu trường isActive" }, { status: 400 });
  }

  const craftsman = await prisma.craftsman.update({
    where: { id },
    data: { isActive },
    select: { id: true, name: true, code: true, level: true, khau: true, levelRank: true, isActive: true },
  });

  return NextResponse.json({ data: craftsman });
}
