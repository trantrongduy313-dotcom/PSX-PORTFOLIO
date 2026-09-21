import { describe, expect, it } from "vitest";
import {
  assertDefaultCalendarIsActive,
  assertNoOverlappingSessions,
  DEFAULT_KPI_3D_GROUPS,
  DEFAULT_WORKING_CALENDAR_SESSIONS,
  normalizeKpi3DGroupCode,
} from "@/app/lib/business/kpi-3d/config";

describe("kpi 3d config", () => {
  it("seeds KPI groups as inactive shells until admin configures minutes", () => {
    expect(DEFAULT_KPI_3D_GROUPS).toHaveLength(6);
    expect(DEFAULT_KPI_3D_GROUPS.map((group) => group.code)).toEqual([
      "GROUP_1",
      "GROUP_2",
      "GROUP_3",
      "GROUP_4",
      "GROUP_5",
      "GROUP_6",
    ]);
    expect(DEFAULT_KPI_3D_GROUPS.every((group) => group.standardMinutes === 0 && !group.isActive)).toBe(true);
  });

  it("defines the default working calendar from Monday through Saturday only", () => {
    // Set<number> chứ không để suy ra Set<1|2|3|4|5|6>: chính phép kiểm tra "không có Chủ nhật"
    // cần hỏi has(0), mà 0 lại nằm ngoài kiểu hẹp đó nên TypeScript báo lỗi.
    const days = new Set<number>(DEFAULT_WORKING_CALENDAR_SESSIONS.map((session) => session.dayOfWeek));
    expect(days.has(0)).toBe(false);
    expect([...days].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("keeps lunch and afternoon break out of the default sessions", () => {
    const monday = DEFAULT_WORKING_CALENDAR_SESSIONS.filter((session) => session.dayOfWeek === 1);
    expect(monday.map((session) => [session.startMinute, session.endMinute])).toEqual([
      [480, 720],
      [780, 900],
      [910, 1020],
    ]);
  });

  it("detects overlapping calendar sessions", () => {
    expect(assertNoOverlappingSessions([
      { dayOfWeek: 1, startMinute: 480, endMinute: 720 },
      { dayOfWeek: 1, startMinute: 700, endMinute: 900 },
    ])).toContain("dayOfWeek=1");
  });

  it("keeps the default working calendar active", () => {
    expect(assertDefaultCalendarIsActive({ isDefault: true, isActive: false })).toBe(
      "Default working calendar must be active",
    );
    expect(assertDefaultCalendarIsActive({ isActive: false }, { isDefault: true, isActive: true })).toBe(
      "Default working calendar must be active",
    );
    expect(assertDefaultCalendarIsActive({ isDefault: true })).toBeNull();
  });

  it("normalizes KPI group codes", () => {
    expect(normalizeKpi3DGroupCode(" nhom 1 ")).toBe("NHOM_1");
  });
});
