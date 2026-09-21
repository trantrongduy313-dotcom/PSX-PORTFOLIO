import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import {
  DEFAULT_KPI_3D_GROUPS,
  DEFAULT_WORKING_CALENDAR_SESSIONS,
  hasKpi3DAdminAccess,
} from "@/app/lib/business/kpi-3d/config";

export async function POST() {
  const user = await getCurrentUser();
  if (!hasKpi3DAdminAccess(user?.role)) return Errors.forbidden();

  const result = await prisma.$transaction(async (tx) => {
    const groups = [];
    for (const group of DEFAULT_KPI_3D_GROUPS) {
      groups.push(
        await tx.kpi3DGroup.upsert({
          where: { code: group.code },
          update: {},
          create: group,
        }),
      );
    }

    let calendar = await tx.workingCalendar.findFirst({
      where: { isDefault: true },
      include: { sessions: true, holidays: true },
    });

    if (!calendar) {
      calendar = await tx.workingCalendar.create({
        data: {
          name: "Lịch làm việc tiêu chuẩn",
          timezone: "Asia/Ho_Chi_Minh",
          isDefault: true,
          isActive: true,
          sessions: {
            create: DEFAULT_WORKING_CALENDAR_SESSIONS.map((session) => ({
              dayOfWeek: session.dayOfWeek,
              startMinute: session.startMinute,
              endMinute: session.endMinute,
              label: session.label,
              sortOrder: session.sortOrder,
            })),
          },
        },
        include: { sessions: true, holidays: true },
      });
    }

    return { groups, calendar };
  });

  return ok(result, 201);
}
