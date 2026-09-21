import "server-only";

import { prisma } from "@/app/lib/prisma";
import { configuredCalendarToWorkingCalendar } from "@/app/lib/business/kpi-3d/calendar-adapter";
import type { WorkingCalendar } from "@/app/lib/business/kpi-3d-deadline";

// ─── Đọc lịch làm việc cho một danh sách lượt giao việc ──────────────────────
//
// Tách khỏi business/kpi-3d/kpi-delta.ts vì file đó phải THUẦN (test được không cần database).
// File này là phần duy nhất chạm prisma.
//
// ⚠️ ĐỌC MỘT LẦN CHO CẢ DANH SÁCH, KHÔNG JOIN THEO TỪNG DÒNG.
//
// Cách hiển nhiên hơn là thêm `workingCalendar: { include: { sessions: true, holidays: true } }`
// vào `select` của route. Nó chạy, nhưng với bảng 200 dòng thì Prisma trả về 200 BẢN SAO của cùng
// một bộ ca — thực tế cả xưởng dùng chung một hai lịch. Đó là vài chục nghìn dòng JSON gửi qua
// mạng cho một thông tin lặp lại.
//
// Lấy tập id (thường là 1–2 phần tử) rồi đọc đúng bấy nhiêu lịch thì chi phí không phụ thuộc số
// dòng của bảng.

/**
 * Tra lịch theo id, đã chuyển sang dạng `WorkingCalendar` mà module business dùng.
 *
 * Id không tìm được (lịch đã bị xoá — quan hệ là `onDelete: SetNull` nên id có thể trỏ vào chỗ
 * trống) thì đơn giản là VẮNG trong Map. Chỗ gọi coi vắng = dùng lịch mặc định, đúng cách nó xử
 * lý lượt cũ chưa gắn lịch. KHÔNG ném lỗi: một lịch bị xoá không được làm cả bảng đơn hàng trắng.
 */
export async function loadWorkingCalendars(
  ids: readonly string[],
): Promise<Map<string, WorkingCalendar>> {
  const out = new Map<string, WorkingCalendar>();
  if (ids.length === 0) return out;

  const rows = await prisma.workingCalendar
    .findMany({
      where: { id: { in: [...ids] } },
      include: { sessions: true, holidays: true },
    })
    // Đọc lịch thất bại KHÔNG được làm mất danh sách: Sớm/Trễ là một cột phụ, còn danh sách việc
    // là thứ người ta mở màn này để xem. Vắng lịch thì rơi về lịch mặc định — số hơi lệch, nhưng
    // màn hình vẫn dùng được.
    .catch(() => []);

  for (const row of rows) out.set(row.id, configuredCalendarToWorkingCalendar(row));
  return out;
}
