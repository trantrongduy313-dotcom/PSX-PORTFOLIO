import type { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { z } from "zod";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/users/[id]/stores — list stores assigned to a user
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "ADMIN") return Errors.forbidden();

  const { id: userId } = await params;

  const user = await prisma.user.findUnique({ where: { id: userId, deletedAt: null } });
  if (!user) return Errors.notFound("User not found");

  const assignments = await prisma.userStore.findMany({
    where: { userId },
    include: { store: { select: { id: true, code: true, name: true, isActive: true } } },
    orderBy: { store: { code: "asc" } },
  });

  return ok(assignments.map((a) => ({ ...a.store, assignedAt: a.assignedAt })));
}

export const putStoresSchema = z.object({
  storeIds: z.array(z.string()).min(0),
});

// PUT /api/users/[id]/stores — replace store assignments for a user
// Body: { storeIds: string[] }
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "ADMIN") return Errors.forbidden();

  const { id: userId } = await params;

  const user = await prisma.user.findUnique({ where: { id: userId, deletedAt: null } });
  if (!user) return Errors.notFound("User not found");

  let body: unknown;
  try { body = await request.json(); } catch { return Errors.badRequest("Invalid JSON"); }

  const parsed = putStoresSchema.safeParse(body);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);

  const { storeIds } = parsed.data;

  // Validate that all provided storeIds exist
  if (storeIds.length > 0) {
    const storeCount = await prisma.store.count({ where: { id: { in: storeIds } } });
    if (storeCount !== storeIds.length) return Errors.badRequest("One or more storeIds not found");
  }

  await prisma.$transaction([
    prisma.userStore.deleteMany({ where: { userId } }),
    ...(storeIds.length > 0
      ? [prisma.userStore.createMany({
          data: storeIds.map((storeId) => ({ userId, storeId })),
          skipDuplicates: true,
        })]
      : []),
  ]);

  const updated = await prisma.userStore.findMany({
    where: { userId },
    include: { store: { select: { id: true, code: true, name: true, isActive: true } } },
    orderBy: { store: { code: "asc" } },
  });

  return ok(updated.map((a) => ({ ...a.store, assignedAt: a.assignedAt })));
}
