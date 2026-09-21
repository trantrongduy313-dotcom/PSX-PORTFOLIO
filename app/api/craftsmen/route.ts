import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { craftsmanInputSchema, levelRankOf } from "@/app/lib/business/craftsman";


export async function GET() {
  const craftsmen = await prisma.craftsman.findMany({
    where: { isActive: true },
    orderBy: [{ levelRank: "desc" }, { name: "asc" }],
    select: { id: true, name: true, code: true, level: true, khau: true, levelRank: true },
  });
  return NextResponse.json({ data: craftsmen });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!["ADMIN", "ORDER"].includes(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = craftsmanInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ", details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, level, khau, code } = parsed.data;

  const existing = await prisma.craftsman.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json({ error: "Tên thợ đã tồn tại" }, { status: 409 });
  }

  const craftsman = await prisma.craftsman.create({
    data: { name, code, level, khau, levelRank: levelRankOf(level) },
    select: { id: true, name: true, code: true, level: true, khau: true, levelRank: true, isActive: true },
  });

  return NextResponse.json({ data: craftsman }, { status: 201 });
}
