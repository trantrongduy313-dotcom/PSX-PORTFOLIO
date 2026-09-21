// Ba nút lọc theo Deadline ở thanh công cụ Đơn hàng. Trước đây nằm THẲNG trong JSX của
// orders-toolbar.tsx và không có test — chỉ có một bản CHÉP trong file test, và bản đó lệch.
// Bẫy đã biết nằm ở tên test: __tests__/orders-deadline-preset.test.ts

export type DeadlinePreset = "week" | "thisWeek" | "overdue" | null;

export type DeadlineRange = {
  requiredDateFrom: string | undefined;
  requiredDateTo: string | undefined;
};

/** Nửa đêm UTC — khớp đúng cách `requiredDate` được lưu trong DB. */
function utcMidnight(now: Date): Date {
  const day = new Date(now);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

const shiftDays = (from: Date, days: number): Date => {
  const moved = new Date(from);
  moved.setUTCDate(from.getUTCDate() + days);
  return moved;
};

/** `null` = bỏ lọc. 🔴 "week" (7 ngày tới) KHÁC "thisWeek" (tuần lịch Thứ 2 → Chủ nhật). */
export function deadlineRangeFor(preset: DeadlinePreset, now: Date): DeadlineRange {
  if (!preset) return { requiredDateFrom: undefined, requiredDateTo: undefined };

  const today = utcMidnight(now);

  if (preset === "week") {
    return {
      requiredDateFrom: today.toISOString(),
      requiredDateTo: shiftDays(today, 7).toISOString(),
    };
  }

  if (preset === "thisWeek") {
    const isoDayOfWeek = today.getUTCDay() || 7; // Chủ nhật (0) → 7
    const monday = shiftDays(today, -(isoDayOfWeek - 1));
    return {
      requiredDateFrom: monday.toISOString(),
      requiredDateTo: shiftDays(monday, 6).toISOString(),
    };
  }

  // Quá hạn: KHÔNG có mốc đầu — mọi deadline trước hôm nay đều tính, dù cũ bao lâu.
  return {
    requiredDateFrom: undefined,
    requiredDateTo: shiftDays(today, -1).toISOString(),
  };
}
