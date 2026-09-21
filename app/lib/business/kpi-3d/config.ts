import { z } from "zod";

export const KPI_3D_READ_ROLES = ["ADMIN", "ORDER", "PRODUCTION", "DESIGN_3D"] as const;
export const KPI_3D_ADMIN_ROLES = ["ADMIN"] as const;

export const DEFAULT_WORKING_CALENDAR_SESSIONS = [
  { dayOfWeek: 1, startMinute: 8 * 60, endMinute: 12 * 60, label: "Sáng", sortOrder: 1 },
  { dayOfWeek: 1, startMinute: 13 * 60, endMinute: 15 * 60, label: "Chiều 1", sortOrder: 2 },
  { dayOfWeek: 1, startMinute: 15 * 60 + 10, endMinute: 17 * 60, label: "Chiều 2", sortOrder: 3 },
  { dayOfWeek: 2, startMinute: 8 * 60, endMinute: 12 * 60, label: "Sáng", sortOrder: 1 },
  { dayOfWeek: 2, startMinute: 13 * 60, endMinute: 15 * 60, label: "Chiều 1", sortOrder: 2 },
  { dayOfWeek: 2, startMinute: 15 * 60 + 10, endMinute: 17 * 60, label: "Chiều 2", sortOrder: 3 },
  { dayOfWeek: 3, startMinute: 8 * 60, endMinute: 12 * 60, label: "Sáng", sortOrder: 1 },
  { dayOfWeek: 3, startMinute: 13 * 60, endMinute: 15 * 60, label: "Chiều 1", sortOrder: 2 },
  { dayOfWeek: 3, startMinute: 15 * 60 + 10, endMinute: 17 * 60, label: "Chiều 2", sortOrder: 3 },
  { dayOfWeek: 4, startMinute: 8 * 60, endMinute: 12 * 60, label: "Sáng", sortOrder: 1 },
  { dayOfWeek: 4, startMinute: 13 * 60, endMinute: 15 * 60, label: "Chiều 1", sortOrder: 2 },
  { dayOfWeek: 4, startMinute: 15 * 60 + 10, endMinute: 17 * 60, label: "Chiều 2", sortOrder: 3 },
  { dayOfWeek: 5, startMinute: 8 * 60, endMinute: 12 * 60, label: "Sáng", sortOrder: 1 },
  { dayOfWeek: 5, startMinute: 13 * 60, endMinute: 15 * 60, label: "Chiều 1", sortOrder: 2 },
  { dayOfWeek: 5, startMinute: 15 * 60 + 10, endMinute: 17 * 60, label: "Chiều 2", sortOrder: 3 },
  { dayOfWeek: 6, startMinute: 8 * 60, endMinute: 12 * 60, label: "Sáng", sortOrder: 1 },
  { dayOfWeek: 6, startMinute: 13 * 60, endMinute: 15 * 60, label: "Chiều 1", sortOrder: 2 },
  { dayOfWeek: 6, startMinute: 15 * 60 + 10, endMinute: 17 * 60, label: "Chiều 2", sortOrder: 3 },
] as const;

export const DEFAULT_KPI_3D_GROUPS = [1, 2, 3, 4, 5, 6].map((n) => ({
  code: `GROUP_${n}`,
  name: `Nhóm ${n}`,
  standardMinutes: 0,
  description: "Chưa cấu hình số phút KPI tiêu chuẩn.",
  isActive: false,
}));

export const kpi3DGroupInputSchema = z.object({
  code: z.string().min(1).max(40).trim(),
  name: z.string().min(1).max(100).trim(),
  standardMinutes: z.number().int().min(0),
  description: z.string().max(1000).trim().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const kpi3DGroupPatchSchema = kpi3DGroupInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required",
);

export const workingCalendarSessionInputSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(24 * 60),
  endMinute: z.number().int().min(0).max(24 * 60),
  label: z.string().max(100).trim().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
}).refine((value) => value.endMinute > value.startMinute, {
  message: "endMinute must be greater than startMinute",
  path: ["endMinute"],
});

export const workingCalendarHolidayInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1).max(200).trim(),
});

export const workingCalendarInputSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  timezone: z.string().min(1).max(80).trim().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sessions: z.array(workingCalendarSessionInputSchema).min(1).optional(),
  holidays: z.array(workingCalendarHolidayInputSchema).optional(),
});

export const workingCalendarPatchSchema = workingCalendarInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required",
);

export type Kpi3DGroupInput = z.infer<typeof kpi3DGroupInputSchema>;
export type WorkingCalendarInput = z.infer<typeof workingCalendarInputSchema>;
export type WorkingCalendarActivationInput = {
  isDefault?: boolean;
  isActive?: boolean;
};

export function normalizeKpi3DGroupCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "_");
}

export function toDateOnlyUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function hasKpi3DReadAccess(role: string | undefined): boolean {
  return KPI_3D_READ_ROLES.includes(role as (typeof KPI_3D_READ_ROLES)[number]);
}

export function hasKpi3DAdminAccess(role: string | undefined): boolean {
  return KPI_3D_ADMIN_ROLES.includes(role as (typeof KPI_3D_ADMIN_ROLES)[number]);
}

export function assertDefaultCalendarIsActive(
  input: WorkingCalendarActivationInput,
  current?: { isDefault: boolean; isActive: boolean },
): string | null {
  const nextIsDefault = input.isDefault ?? current?.isDefault ?? false;
  const nextIsActive = input.isActive ?? current?.isActive ?? true;
  if (nextIsDefault && !nextIsActive) {
    return "Default working calendar must be active";
  }
  return null;
}

export function assertNoOverlappingSessions(
  sessions: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>,
): string | null {
  const byDay = new Map<number, Array<{ startMinute: number; endMinute: number }>>();
  for (const session of sessions) {
    const group = byDay.get(session.dayOfWeek) ?? [];
    group.push(session);
    byDay.set(session.dayOfWeek, group);
  }

  for (const [dayOfWeek, group] of byDay) {
    const sorted = group.sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startMinute < sorted[i - 1].endMinute) {
        return `Working calendar sessions overlap on dayOfWeek=${dayOfWeek}`;
      }
    }
  }

  return null;
}
