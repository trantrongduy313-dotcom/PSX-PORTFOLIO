import { NextRequest } from "next/server";
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import {
  assertDefaultCalendarIsActive,
  assertNoOverlappingSessions,
  DEFAULT_WORKING_CALENDAR_SESSIONS,
  hasKpi3DAdminAccess,
  hasKpi3DReadAccess,
  toDateOnlyUtc,
  workingCalendarInputSchema,
} from "@/app/lib/business/kpi-3d/config";

const calendarInclude: Prisma.WorkingCalendarInclude = {
  sessions: { orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }, { startMinute: "asc" }] },
  holidays: { orderBy: [{ date: "asc" }] },
};

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!hasKpi3DReadAccess(user?.role)) return Errors.forbidden();

  const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "true";
  const calendars = await prisma.workingCalendar.findMany({
    where: includeInactive ? undefined : { isActive: true },
    include: calendarInclude,
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });

  return ok(calendars);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!hasKpi3DAdminAccess(user?.role)) return Errors.forbidden();

  let body: unknown;
  try { body = await request.json(); } catch { return Errors.badRequest("Invalid JSON"); }

  const parsed = workingCalendarInputSchema.safeParse(body);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);

  const defaultError = assertDefaultCalendarIsActive(parsed.data);
  if (defaultError) return Errors.badRequest(defaultError);

  const sessions = parsed.data.sessions ?? [...DEFAULT_WORKING_CALENDAR_SESSIONS];
  const overlapError = assertNoOverlappingSessions(sessions);
  if (overlapError) return Errors.badRequest(overlapError);

  const calendar = await prisma.$transaction(async (tx) => {
    if (parsed.data.isDefault) {
      await tx.workingCalendar.updateMany({ data: { isDefault: false } });
    }

    return tx.workingCalendar.create({
      data: {
        name: parsed.data.name,
        timezone: parsed.data.timezone ?? "Asia/Ho_Chi_Minh",
        isDefault: parsed.data.isDefault ?? false,
        isActive: parsed.data.isActive ?? true,
        sessions: {
          create: sessions.map((session) => ({
            dayOfWeek: session.dayOfWeek,
            startMinute: session.startMinute,
            endMinute: session.endMinute,
            label: session.label || null,
            sortOrder: session.sortOrder ?? 0,
          })),
        },
        holidays: {
          create: (parsed.data.holidays ?? []).map((holiday) => ({
            date: toDateOnlyUtc(holiday.date),
            name: holiday.name,
          })),
        },
      },
      include: calendarInclude,
    });
  });

  return ok(calendar, 201);
}
