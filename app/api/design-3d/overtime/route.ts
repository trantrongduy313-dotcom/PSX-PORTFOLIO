import type { NextRequest } from "next/server";
import { after } from "next/server";
import type { Prisma } from "@/app/generated/prisma/client";

import { notifyNewOvertimeRequest } from "@/app/lib/notify/notify-design-3d";

import { prisma } from "@/app/lib/prisma";
import { ok, paginated, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { resolveProgressActor } from "@/app/lib/business/kpi-3d/actor";
import { configuredCalendarToWorkingCalendar } from "@/app/lib/business/kpi-3d/calendar-adapter";
import {
  canReadOvertime,
  deniedReasonForOvertimeCreate,
  formatMinutes,
  invalidRangeReason,
  minutesInsideWorkingHours,
  OVERTIME_STATUS_VALUES,
  overtimeCreateSchema,
  overtimeMinutes,
} from "@/app/lib/business/kpi-3d/overtime";

// ─── /api/design-3d/overtime ─────────────────────────────────────────────────
// Khai báo & tra cứu giờ làm thêm (yêu cầu #8).
//
// HOÀN TOÀN TÁCH KHỎI deadline KPI: route này không đụng tới Design3DAssignment.deadlineAt
// hay kpiStatus. Tăng ca chỉ để ghi nhận và tính lương, đúng yêu cầu của khách.

const overtimeSelect = {
  id: true,
  startAt: true,
  endAt: true,
  minutes: true,
  reason: true,
  status: true,
  approvedAt: true,
  createdAt: true,
  designer3D: { select: { id: true, name: true, code: true } },
  requestedBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  assignment: {
    select: {
      id: true,
      order: { select: { id: true, orderNumber: true } },
      orderItem: { select: { id: true, moNumber: true, productName: true } },
    },
  },
} as const;

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canReadOvertime(user.role)) return Errors.forbidden();

  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "50", 10) || 50));
  const status = sp.get("status")?.trim() ?? "";

  const actor = await resolveProgressActor(user);

  // NV 3D chưa gắn hồ sơ → trả rỗng thay vì lộ khai báo của cả phòng.
  if (user.role === "DESIGN_3D" && !actor.designer3DId) {
    return paginated([], { page, limit, total: 0, totalPages: 0 });
  }

  const where: Prisma.Design3DOvertimeRequestWhereInput = {
    // Phạm vi ép ở SERVER: NV 3D luôn chỉ thấy khai báo của chính mình.
    ...(actor.designer3DId ? { designer3DId: actor.designer3DId } : {}),
    ...(OVERTIME_STATUS_VALUES.includes(status as (typeof OVERTIME_STATUS_VALUES)[number])
      ? { status: status as Prisma.Design3DOvertimeRequestWhereInput["status"] }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.design3DOvertimeRequest.count({ where }),
    prisma.design3DOvertimeRequest.findMany({
      where,
      select: overtimeSelect,
      // Chờ duyệt lên đầu để Leader thấy ngay việc cần xử lý.
      orderBy: [{ status: "asc" }, { startAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return paginated(rows, { page, limit, total, totalPages: Math.ceil(total / limit) });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Errors.forbidden();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.badRequest("Invalid JSON");
  }

  const parsed = overtimeCreateSchema.safeParse(body);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);
  const input = parsed.data;

  const assignment = await prisma.design3DAssignment.findUnique({
    where: { id: input.assignmentId },
    select: { id: true, orderId: true, designer3DId: true },
  });
  if (!assignment) return Errors.notFound("Design 3D assignment");

  const actor = await resolveProgressActor(user);
  const denied = deniedReasonForOvertimeCreate(
    { ...actor, userId: user.dbId ?? null },
    assignment,
  );
  if (denied) return Errors.forbidden(denied);

  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  const invalid = invalidRangeReason(startAt, endAt);
  if (invalid) return Errors.badRequest(invalid);

  // Số phút LUÔN tính lại ở server — đây là con số dùng tính lương, không nhận từ client.
  const minutes = overtimeMinutes(startAt, endAt);

  // Cảnh báo (không chặn) nếu khai đè vào giờ hành chính — tăng ca theo định nghĩa là làm
  // NGOÀI giờ. Để Leader soát trước khi duyệt; có ca đặc thù hợp lệ nên không chặn cứng.
  const calendar = await prisma.workingCalendar.findFirst({
    where: { isActive: true },
    include: { sessions: true, holidays: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  const overlapMinutes = calendar
    ? minutesInsideWorkingHours(startAt, endAt, configuredCalendarToWorkingCalendar(calendar))
    : 0;

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.design3DOvertimeRequest.create({
      data: {
        assignmentId: assignment.id,
        designer3DId: assignment.designer3DId,
        requestedById: user.dbId ?? null,
        startAt,
        endAt,
        minutes,
        reason: input.reason?.trim() || null,
        status: "PENDING",
      },
      select: overtimeSelect,
    });

    await tx.workflowHistory.create({
      data: {
        orderId: assignment.orderId,
        performedById: user.dbId ?? null,
        action: "FIELD_UPDATED",
        comment: `Khai báo tăng ca 3D — ${formatMinutes(minutes)} (chờ duyệt)`,
        metadata: {
          source: "DESIGN_3D_OVERTIME",
          overtimeRequestId: row.id,
          minutes,
          ...(overlapMinutes > 0 ? { overlapsWorkingHours: true, overlapMinutes } : {}),
        } as never,
      },
    });

    return row;
  });

  // ─── BÁO CHO NGƯỜI DUYỆT BIẾT, KHÔNG BẮT HỌ TỰ NHỚ ─────────────────────────
  //
  // Đây là kênh DUY NHẤT chạm tới người duyệt khi họ KHÔNG mở app. Huy hiệu trên tab Tăng ca chỉ
  // giúp người đã ở trong màn hình; còn một khai báo nằm chờ vài ngày là tiền lương của nhân viên
  // bị treo vì không ai biết nó tồn tại.
  //
  // SAU khi transaction commit và SAU khi response đã trả — qua `after()`, đúng khuôn của
  // notifyNewDesign3DAssignments: gọi HTTP trong transaction sẽ giữ lock DB suốt thời gian gọi
  // mạng ngoài, và Google Chat chết thì không được phép làm hỏng một khai báo đã ghi thành công.
  after(() => notifyNewOvertimeRequest(created.id));

  return ok(
    overlapMinutes > 0
      ? { ...created, warning: `${formatMinutes(overlapMinutes)} trong khoảng khai báo rơi vào giờ hành chính — vui lòng kiểm tra lại.` }
      : created,
    201,
  );
}
