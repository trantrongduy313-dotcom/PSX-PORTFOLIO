import type { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import {
  hasKpi3DAdminAccess,
  kpi3DGroupPatchSchema,
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!hasKpi3DAdminAccess(user?.role)) return Errors.forbidden();

  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return Errors.badRequest("Invalid JSON"); }

  const parsed = kpi3DGroupPatchSchema.safeParse(body);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);

  const data = {
    ...(parsed.data.code !== undefined && { code: normalizeKpi3DGroupCode(parsed.data.code) }),
    ...(parsed.data.name !== undefined && { name: parsed.data.name }),
    ...(parsed.data.standardMinutes !== undefined && { standardMinutes: parsed.data.standardMinutes }),
    ...(parsed.data.description !== undefined && { description: parsed.data.description || null }),
    ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
  };

  try {
    const group = await prisma.kpi3DGroup.update({
      where: { id },
      data,
      select: groupSelect,
    });
    return ok(group);
  } catch {
    return Errors.notFound("KPI 3D group");
  }
}
