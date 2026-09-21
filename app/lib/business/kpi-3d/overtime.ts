import { z } from "zod";

import type { WorkingCalendar } from "@/app/lib/business/kpi-3d-deadline";
import { deniedReasonFor, hasCapability, type Kpi3DActor } from "@/app/lib/business/kpi-3d/permissions";
import { fromVnWall, toVnWall } from "@/app/lib/utils/vn-date";

// ─── Làm ngoài giờ của Nhân viên Thiết kế 3D (yêu cầu #8) ────────────────────
// "Không tính vào thuật toán Deadline KPI. Chỉ phục vụ ghi nhận thời gian làm thêm và tính
//  lương tăng ca. Nhân viên phải khai báo. Việc ghi nhận phải được Leader/Giám sát phê duyệt."
//
// Tách khỏi hoàn toàn luồng tính deadline: không hàm nào ở đây được gọi trong
// calculate3DKpiDeadline, nên tăng ca KHÔNG THỂ vô tình ảnh hưởng KPI.
//
// Hàm thuần (không import prisma) để test được không cần DB — cùng pattern với progress.ts.

export const OVERTIME_STATUS_VALUES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type OvertimeStatus = (typeof OVERTIME_STATUS_VALUES)[number];

export const OVERTIME_STATUS_LABELS: Record<OvertimeStatus, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  CANCELLED: "Đã hủy",
};

/** Trạng thái đã chốt — không sửa được nữa. */
const TERMINAL_STATUSES: readonly OvertimeStatus[] = ["APPROVED", "REJECTED", "CANCELLED"];

/** Chặn khai báo phi lý (gõ nhầm năm, để hở ca qua nhiều ngày). */
export const MAX_OVERTIME_MINUTES = 16 * 60;

export const overtimeCreateSchema = z
  .object({
    assignmentId: z.string().min(1),
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
    reason: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => new Date(v.endAt) > new Date(v.startAt), {
    message: "Giờ kết thúc phải sau giờ bắt đầu",
    path: ["endAt"],
  });

export type OvertimeCreateInput = z.infer<typeof overtimeCreateSchema>;

export const overtimeDecisionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "CANCEL"]),
  reason: z.string().trim().max(2000).nullable().optional(),
});

export type OvertimeDecision = z.infer<typeof overtimeDecisionSchema>;

/**
 * Số phút tăng ca — LUÔN tính lại ở server từ startAt/endAt, không nhận từ client.
 * Đây là con số dùng để tính lương nên không được để client tự khai.
 */
export function overtimeMinutes(startAt: Date, endAt: Date): number {
  return Math.round((endAt.getTime() - startAt.getTime()) / 60_000);
}

/** Vì sao khoảng thời gian khai báo không hợp lệ — null nếu hợp lệ. */
export function invalidRangeReason(startAt: Date, endAt: Date): string | null {
  const minutes = overtimeMinutes(startAt, endAt);
  if (minutes <= 0) return "Giờ kết thúc phải sau giờ bắt đầu.";
  if (minutes > MAX_OVERTIME_MINUTES) {
    return `Một lần khai báo không quá ${MAX_OVERTIME_MINUTES / 60} giờ. Hãy tách thành nhiều lần.`;
  }
  return null;
}

// ─── Phân quyền ──────────────────────────────────────────────────────────────
// Danh sách role KHÔNG khai ở đây nữa — xem CAPABILITIES trong kpi-3d/permissions.ts
// (DECLARE_OVERTIME, APPROVE_OVERTIME). Trước đây khai ở cả hai nơi nên có thể lệch nhau.

export type OvertimeActor = Kpi3DActor & {
  /** User.id — để chặn tự duyệt đơn của chính mình. */
  userId: string | null;
};

export type OvertimeSnapshot = {
  id: string;
  designer3DId: string;
  requestedById: string | null;
  status: OvertimeStatus;
};

// Quy tắc THẬT nằm ở kpi-3d/permissions.ts. Trước đây hàm dưới tự viết lại ba bước kiểm tra
// sở hữu y như progress.ts — cùng một quy tắc bảo mật tồn tại hai bản, sửa một bản quên bản
// kia là ra lỗ phân quyền. Nay chỉ còn lớp mỏng gọi vào nguồn duy nhất.

export function canReadOvertime(role: string | undefined): boolean {
  return hasCapability("DECLARE_OVERTIME", role);
}

export function isOvertimeApprover(role: string | undefined): boolean {
  return hasCapability("APPROVE_OVERTIME", role);
}

/** Vì sao KHÔNG được khai báo tăng ca cho assignment này — null nếu được phép. */
export function deniedReasonForOvertimeCreate(
  actor: OvertimeActor,
  assignment: { designer3DId: string },
): string | null {
  return deniedReasonFor("DECLARE_OVERTIME", actor, assignment);
}

/**
 * Vì sao KHÔNG thực hiện được quyết định (duyệt/từ chối/hủy) — null nếu được phép.
 *
 * Hai quy tắc quan trọng:
 *  - Không tự duyệt đơn của chính mình (yêu cầu của khách: phải có Leader/Giám sát duyệt).
 *  - Đơn đã chốt thì không đổi được nữa, tránh sửa lại số liệu đã dùng tính lương.
 */
export function deniedReasonForOvertimeDecision(
  actor: OvertimeActor,
  request: OvertimeSnapshot,
  action: OvertimeDecision["action"],
): string | null {
  if (TERMINAL_STATUSES.includes(request.status)) {
    return `Yêu cầu đã ở trạng thái "${OVERTIME_STATUS_LABELS[request.status]}" — không thể thay đổi.`;
  }

  if (action === "CANCEL") {
    const isOwner = !!actor.designer3DId && actor.designer3DId === request.designer3DId;
    if (isOwner || actor.role === "ADMIN") return null;
    return "Chỉ người khai báo hoặc quản trị viên được hủy yêu cầu.";
  }

  if (!isOvertimeApprover(actor.role)) {
    return "Chỉ Leader/Giám sát được phê duyệt tăng ca.";
  }
  if (actor.userId && request.requestedById && actor.userId === request.requestedById) {
    return "Không thể tự phê duyệt yêu cầu do chính mình khai báo.";
  }
  return null;
}

/**
 * Con số "tăng ca chờ duyệt" hiện cho ai, và đếm những gì.
 *
 * VÌ SAO CẦN: khai báo tăng ca là luồng DUY NHẤT cần người duyệt mà không phát ra tín hiệu nào.
 * Giao việc mới thì đẩy Google Chat; kết quả chờ kiểm thì có thẻ đếm ngay trên màn 3D. Tăng ca
 * thì quản lý phải tự nhớ mà bấm vào tab — không nhớ thì khai báo nằm đó không ai biết.
 *
 * ⚠️ TRỪ ĐI YÊU CẦU DO CHÍNH MÌNH KHAI. `deniedReasonForOvertimeDecision` cấm tự phê duyệt, nên
 * đếm cả những cái đó sẽ tạo ra một con số KHÔNG BẤM ĐƯỢC: người dùng thấy "1 việc cần bạn", mở
 * ra, không làm gì được, và lần sau họ bỏ qua con số đó — kể cả khi nó là thật. Một huy hiệu
 * không thể xoá bằng cách làm việc thì tệ hơn không có huy hiệu.
 *
 * Hàm THUẦN, trả về ý định để route dịch sang câu truy vấn — luật nằm ở đây và có test, chỗ gọi
 * chỉ việc thi hành.
 */
export function pendingOvertimeScope(actor: {
  role: string | undefined;
  /** User.id của người đang xem — dùng để loại yêu cầu của chính họ. */
  userId: string | null;
}): { visible: false } | { visible: true; excludeRequestedById: string | null } {
  // NV 3D không duyệt được nên với họ đây là con số vô nghĩa: nó chỉ nói "sếp chưa duyệt", một
  // thông tin họ không hành động được và cũng không nên phải nhìn mỗi ngày.
  if (!isOvertimeApprover(actor.role)) return { visible: false };
  return { visible: true, excludeRequestedById: actor.userId };
}

/** Trạng thái sau khi thực hiện quyết định. */
export function statusAfterDecision(action: OvertimeDecision["action"]): OvertimeStatus {
  return action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "CANCELLED";
}

// ─── Đối chiếu với giờ hành chính ────────────────────────────────────────────

function parseClock(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

// Đọc theo giờ tường VN (getUTC* trên Date đã dịch offset) — không phụ thuộc giờ máy chủ.
// Cùng lớp lỗi đã sửa ở kpi-3d-deadline.ts: dùng getDay/setHours sẽ cho kết quả khác nhau
// giữa máy dev (giờ VN) và Vercel (UTC).
function dateKey(wall: Date): string {
  return `${wall.getUTCFullYear()}-${String(wall.getUTCMonth() + 1).padStart(2, "0")}-${String(wall.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Số phút của khoảng khai báo RƠI VÀO giờ hành chính.
 *
 * Tăng ca theo định nghĩa là làm NGOÀI giờ hành chính. Nếu người dùng khai nhầm cả khung giờ
 * làm việc bình thường, số này > 0 → cảnh báo cho Leader biết mà soát trước khi duyệt.
 * CỐ Ý chỉ cảnh báo, không chặn: có ca đặc thù hợp lệ, quyết định cuối thuộc về Leader.
 *
 * Chỉ xét trong phạm vi khoảng khai báo (đã chặn tối đa 16 giờ nên vòng lặp luôn hữu hạn).
 */
export function minutesInsideWorkingHours(
  startAt: Date,
  endAt: Date,
  calendar: WorkingCalendar,
): number {
  let overlap = 0;

  // Làm việc trong không gian giờ tường VN; so sánh vẫn theo mốc thời gian thật nên chỉ cần
  // quy đổi hai biên của mỗi ca về lại mốc thật trước khi cắt khoảng.
  const startWall = toVnWall(startAt);
  const cursor = new Date(startWall);
  cursor.setUTCHours(0, 0, 0, 0);

  const endWallMs = toVnWall(endAt).getTime();

  while (cursor.getTime() <= endWallMs) {
    const isDayOff =
      calendar.weeklyDaysOff.includes(cursor.getUTCDay()) || calendar.holidays.includes(dateKey(cursor));

    if (!isDayOff) {
      for (const session of calendar.sessions) {
        if (session.dayOfWeek !== undefined && session.dayOfWeek !== cursor.getUTCDay()) continue;

        const sStart = fromVnWall(new Date(cursor.getTime() + parseClock(session.start) * 60_000));
        const sEnd = fromVnWall(new Date(cursor.getTime() + parseClock(session.end) * 60_000));

        const from = Math.max(startAt.getTime(), sStart.getTime());
        const to = Math.min(endAt.getTime(), sEnd.getTime());
        if (to > from) overlap += Math.round((to - from) / 60_000);
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return overlap;
}

/** "2 giờ 30 phút" — dùng chung cho UI và nội dung ghi Lịch sử thay đổi. */
export function formatMinutes(minutes: number): string {
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return [h > 0 ? `${h} giờ` : "", m > 0 ? `${m} phút` : ""].filter(Boolean).join(" ") || "0 phút";
}
