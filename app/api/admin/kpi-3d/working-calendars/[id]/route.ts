import type { NextRequest } from "next/server";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import {
  assertDefaultCalendarIsActive,
  assertNoOverlappingSessions,
  hasKpi3DAdminAccess,
  toDateOnlyUtc,
  workingCalendarPatchSchema,
} from "@/app/lib/business/kpi-3d/config";

const calendarInclude: Prisma.WorkingCalendarInclude = {
  sessions: { orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }, { startMinute: "asc" }] },
  holidays: { orderBy: [{ date: "asc" }] },
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!hasKpi3DAdminAccess(user?.role)) return Errors.forbidden();

  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return Errors.badRequest("Invalid JSON"); }

  const parsed = workingCalendarPatchSchema.safeParse(body);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);

  const existingCalendar = await prisma.workingCalendar.findUnique({
    where: { id },
    select: { isDefault: true, isActive: true },
  });
  if (!existingCalendar) return Errors.notFound("Working calendar");

  const defaultError = assertDefaultCalendarIsActive(parsed.data, existingCalendar);
  if (defaultError) return Errors.badRequest(defaultError);

  const sessions = parsed.data.sessions;
  if (sessions) {
    const overlapError = assertNoOverlappingSessions(sessions);
    if (overlapError) return Errors.badRequest(overlapError);
  }

  try {
    const calendar = await prisma.$transaction(async (tx) => {
      if (parsed.data.isDefault) {
        await tx.workingCalendar.updateMany({
          where: { id: { not: id } },
          data: { isDefault: false },
        });
      }

      if (sessions) {
        await tx.workingCalendarSession.deleteMany({ where: { calendarId: id } });
      }

      if (parsed.data.holidays) {
        await tx.workingCalendarHoliday.deleteMany({ where: { calendarId: id } });
      }

      return tx.workingCalendar.update({
        where: { id },
        data: {
          ...(parsed.data.name !== undefined && { name: parsed.data.name }),
          ...(parsed.data.timezone !== undefined && { timezone: parsed.data.timezone }),
          ...(parsed.data.isDefault !== undefined && { isDefault: parsed.data.isDefault }),
          ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
          ...(sessions && {
            sessions: {
              create: sessions.map((session) => ({
                dayOfWeek: session.dayOfWeek,
                startMinute: session.startMinute,
                endMinute: session.endMinute,
                label: session.label || null,
                sortOrder: session.sortOrder ?? 0,
              })),
            },
          }),
          ...(parsed.data.holidays && {
            holidays: {
              create: parsed.data.holidays.map((holiday) => ({
                date: toDateOnlyUtc(holiday.date),
                name: holiday.name,
              })),
            },
          }),
        },
        include: calendarInclude,
      });
    });

    return ok(calendar);
  } catch {
    return Errors.notFound("Working calendar");
  }
}
