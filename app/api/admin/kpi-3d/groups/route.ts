import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import {
  hasKpi3DAdminAccess,
  hasKpi3DReadAccess,
  kpi3DGroupInputSchema,
  normalizeKpi3DGroupCode,
} from "@/app/lib/business/kpi-3d/config";

const groupSelect = {
  id: true,
  code: true,
  name: true,
  standardMinutes: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!hasKpi3DReadAccess(user?.role)) return Errors.forbidden();

  const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "true";
  const groups = await prisma.kpi3DGroup.findMany({
    where: includeInactive ? undefined : { isActive: true },
    select: groupSelect,
    orderBy: [{ code: "asc" }],
  });

  return ok(groups);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!hasKpi3DAdminAccess(user?.role)) return Errors.forbidden();

  let body: unknown;
  try { body = await request.json(); } catch { return Errors.badRequest("Invalid JSON"); }

  const parsed = kpi3DGroupInputSchema.safeParse(body);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);

  const data = {
    ...parsed.data,
    code: normalizeKpi3DGroupCode(parsed.data.code),
    description: parsed.data.description || null,
    isActive: parsed.data.isActive ?? true,
  };

  const existing = await prisma.kpi3DGroup.findUnique({ where: { code: data.code } });
  if (existing) return Errors.conflict("Nhóm KPI 3D đã tồn tại");

  const group = await prisma.kpi3DGroup.create({
    data,
    select: groupSelect,
  });

  return ok(group, 201);
}
