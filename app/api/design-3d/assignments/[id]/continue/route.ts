import type { NextRequest } from "next/server";

import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { configuredCalendarToWorkingCalendar } from "@/app/lib/business/kpi-3d/calendar-adapter";
import { calculate3DKpiDeadline } from "@/app/lib/business/kpi-3d-deadline";
import { alreadyCreditedMinutes } from "@/app/lib/business/kpi-3d/hours-ledger";
import { openPause, workedMinutesUntil } from "@/app/lib/business/kpi-3d/pause";
import { isStaleAssignmentError, StaleAssignmentError } from "@/app/lib/business/kpi-3d/stale-state";
import {
  continuationInputSchema,
  continuationNote,
  deniedReasonForContinuation,
  deniedReasonForContinueAt,
} from "@/app/lib/business/kpi-3d/continuation";

// ─── POST /api/design-3d/assignments/[id]/continue ───────────────────────────
//
// ĐÓNG lượt hiện tại và GIAO GIAI ĐOẠN TIẾP THEO thành một lượt riêng.
//
// Dùng cho HAI tình huống, cùng một hình dữ liệu:
//   · mở lại một đơn đang tạm dừng (sang tháng khác, hoặc đổi người);
//   · giao thêm một lượt nữa cho đơn đang làm bình thường — kể cả CHO CHÍNH NGƯỜI ĐÓ.
//
// ⚠️ KHÔNG ĐÒI ĐƠN PHẢI ĐANG TẠM DỪNG. Bản đầu có đòi, và điều đó bịt kín tình huống thứ hai:
// không có cửa nào để giao lần nữa, nên người dùng với lấy "+ Thêm NV 3D" ở sidebar — mà nút đó
// tạo lượt SONG SONG, rồi đụng chốt chặn `usedDesignerIds` ("người này đã được chọn"). "Làm lần
// nữa" luôn là TUẦN TỰ: lượt cũ phải được chốt giờ trước.
//
// Khác DELETE /pause (mở lại tại chỗ, giữ nguyên một lượt và tự dời deadline) — đường đó nay chỉ
// còn để HUỶ một lần tạm dừng bấm nhầm.
//
// ⚠️ NGÂN SÁCH LƯỢT MỚI KHÔNG PHẢI NGUYÊN SUẤT như bên reassign — người làm tiếp KẾ THỪA phần
// đã làm chứ không làm lại từ đầu. Lý do đầy đủ ở kpi-3d/continuation.ts.
//
// Route CỐ Ý MỎNG. Cả chuỗi nằm trong MỘT transaction: đóng lượt cũ mà không mở được lượt mới là
// bỏ rơi một MO không còn ai phụ trách, và không màn hình nào hiện ra điều đó.

const assignmentSelect = {
  id: true,
  orderId: true,
  orderItemId: true,
  status: true,
  reviewStatus: true,
  designer3DId: true,
  designer3D: { select: { name: true } },
  kpiGroupId: true,
  workingCalendarId: true,
  standardMinutesSnapshot: true,
  actualMinutes: true,
  assignedAt: true,
  acknowledgedAt: true,
  pauses: {
    select: { id: true, pausedAt: true, resumedAt: true, confirmedMinutes: true, reason: true },
  },
  workingCalendar: { include: { sessions: true, holidays: true } },
} as const;

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Errors.forbidden();

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.badRequest("Invalid JSON");
  }

  const parsed = continuationInputSchema.safeParse(body);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);
  const input = parsed.data;

  try {
    const assignment = await prisma.design3DAssignment.findUnique({
      where: { id },
      select: assignmentSelect,
    });
    if (!assignment) return Errors.notFound("Design 3D assignment");

    const denied = deniedReasonForContinuation(user.role, assignment);
    if (denied) return Errors.forbidden(denied);

    // Có khoảng dừng đang mở thì đóng nó luôn; KHÔNG có cũng đi tiếp. Đơn đang làm bình thường
    // vẫn giao được lượt tiếp theo — xem chú thích đầu file.
    const open = openPause(assignment.pauses);

    const now = new Date();
    const startedAt = input.startedAt ?? now;

    const badMoment = deniedReasonForContinueAt({
      startedAt,
      previousStartedAt: assignment.assignedAt,
      pausedAt: open?.pausedAt ?? null,
      now,
    });
    if (badMoment) return Errors.badRequest(badMoment);

    const nextDesigner = await prisma.designer3D.findUnique({
      where: { id: input.designer3DId },
      select: { id: true, name: true, isActive: true },
    });
    if (!nextDesigner) return Errors.notFound("Designer3D");
    // Giao cho người đã nghỉ thì đơn rơi vào khoảng không: họ không đăng nhập nữa nên không ai
    // thấy việc, mà lượt vẫn đếm vào tải công việc.
    if (!nextDesigner.isActive) {
      return Errors.badRequest("Nhân viên 3D này đã ngừng hoạt động — chọn người khác.");
    }

    const calendar = assignment.workingCalendar
      ? configuredCalendarToWorkingCalendar(assignment.workingCalendar)
      : undefined;

    // Nhóm KPI của lượt mới. Người giao đổi được — giai đoạn hoàn thiện có thể thuộc nhóm khác
    // hẳn giai đoạn dựng khối. Nhưng số phút thì KHÔNG lấy theo nhóm: nó đến từ ô "giờ còn lại"
    // mà người giao vừa xác nhận, và đó chính là điểm khác biệt của luồng này.
    let kpiGroupId = assignment.kpiGroupId;
    if (input.kpiGroupId && input.kpiGroupId !== assignment.kpiGroupId) {
      const group = await prisma.kpi3DGroup.findUnique({
        where: { id: input.kpiGroupId },
        select: { id: true, isActive: true },
      });
      if (!group) return Errors.notFound("Kpi3DGroup");
      if (!group.isActive) {
        return Errors.badRequest("Nhóm KPI này đã ngừng sử dụng — chọn nhóm khác.");
      }
      kpiGroupId = group.id;
    }

    // ─── CHỐT GIỜ CỦA LƯỢT CŨ ────────────────────────────────────────────────
    //
    // Ưu tiên số đã chốt ở các lần tạm dừng (hours-ledger đã ghi nó vào KPI của đúng tháng).
    // Không có thì ĐO TỚI MỐC ĐÓNG:
    //   · đang bị gác  → mốc dừng. KHÔNG đo tới "bây giờ": lượt cũ ngừng làm từ lúc gác, đo tới
    //     hiện tại là cộng cho người cũ cả quãng họ không đụng vào đơn.
    //   · đang làm     → mốc bắt đầu lượt mới, tức đúng thời điểm họ bàn giao.
    const credited = alreadyCreditedMinutes(assignment.pauses) || workedMinutesUntil({
      assignedAt: assignment.assignedAt,
      acknowledgedAt: assignment.acknowledgedAt,
      until: open?.pausedAt ?? startedAt,
      pauses: assignment.pauses,
      calendar,
    });

    const deadlineAt = calculate3DKpiDeadline(startedAt, input.standardMinutes, calendar);

    const openId = open
      ? assignment.pauses.find(
          (p) => p.resumedAt === null && p.pausedAt.getTime() === open.pausedAt.getTime(),
        )?.id
      : undefined;

    const created = await prisma.$transaction(async (tx) => {
      // 1. Đóng khoảng dừng. Bỏ bước này thì lượt cũ mãi hiện "đang tạm dừng" ở mọi màn hình
      //    đọc theo resumedAt = null, kể cả sau khi nó đã bị đóng hẳn.
      if (openId) {
        await tx.design3DPause.update({
          where: { id: openId },
          data: {
            resumedAt: startedAt,
            resumedById: user.dbId ?? null,
            resumeNote: input.note ?? "Mở lại — giao giai đoạn tiếp theo",
          },
        });
      }

      // 2. Đóng lượt cũ và ĐÓNG BĂNG giờ của nó.
      //
      //    kpiCounted = true, không hỏi: khác hẳn luồng "không duyệt" (ở đó công của người cũ có
      //    thể bị bác nên phải để người quản lý quyết). Ở đây việc bị gác vì một lý do điều hành
      //    và phần đã làm được KẾ THỪA — bàn giao thành quả của ai đó rồi không tính công cho họ
      //    là hai chuyện mâu thuẫn nhau.
      //
      //    reviewStatus KHÔNG đặt thành REWORK: đây không phải một phán quyết về chất lượng.
      //    Nhưng cũng không để PENDING_REVIEW, vì lượt đã đóng mà nằm trong hàng chờ kiểm thì
      //    người duyệt sẽ mở ra một thứ không còn gì để duyệt.
      //    ⚠️ `updateMany` KÈM ĐIỀU KIỆN, không phải `update` theo id. Đây là chốt chống BẤM ĐÔI.
      //
      //    Mọi cửa ghi ở màn 3D đều đọc → kiểm → ghi, mà phần kiểm chạy trên bản đã đọc. Hai
      //    request gần nhau (bấm đôi, hoặc hai người cùng mở một MO) đều thấy lượt cha còn đang
      //    chạy, đều qua cửa, và đều tạo một hậu duệ → MỘT MO CÓ HAI LƯỢT ĐANG CHẠY, hai suất
      //    KPI, cùng trỏ về một lượt cha.
      //
      //    Đưa điều kiện vào chính câu UPDATE thì DB làm trọng tài: câu thứ hai chờ khoá dòng của
      //    câu thứ nhất, thấy status đã thành REASSIGNED, và đếm được 0.
      const closed = await tx.design3DAssignment.updateMany({
        where: {
          id: assignment.id,
          // Đúng những điều kiện deniedReasonForContinuation đã kiểm — nhưng kiểm lại ở thời
          // điểm GHI. Thiếu `reviewStatus` ở đây là để hở đúng luật "đã duyệt là chốt".
          status: { notIn: ["REASSIGNED", "CANCELLED"] },
          reviewStatus: { not: "ACCEPTED" },
        },
        data: {
          status: "REASSIGNED",
          reassignedAt: now,
          kpiCounted: true,
          reassignDecidedById: user.dbId ?? null,
          reviewStatus: null,
          ...(credited > 0 ? { actualMinutes: credited } : {}),
        },
      });
      if (closed.count === 0) throw new StaleAssignmentError();

      // 2b. ĐẬP NHỊP `Order.version` — để form đơn hàng đang mở ở tab khác KHÔNG ghi đè lượt mới.
      //
      //     Form đơn hàng có khoá lạc quan theo `Order.version`, nhưng không cửa nào ở màn 3D đập
      //     nhịp nó, nên nó chỉ chặn được hai lần lưu form với nhau. Một tab mở TRƯỚC lúc giao
      //     lượt tiếp theo vẫn lưu được, và ảnh chụp cũ trong đó ghi đè mốc giao + ngân sách của
      //     lượt vừa tạo (xem chú thích ở syncDesign3DAssignmentBlock).
      //
      //     ⚠️ CHỈ ĐẬP Ở CÁC CỬA ĐỔI CẤU TRÚC (đây và reassign), CỐ Ý KHÔNG ở progress/acknowledge:
      //     10 NV 3D lưu tiến độ suốt ngày, đập nhịp ở đó thì admin đang mở form đơn nào cũng ăn
      //     CONFLICT vài phút một lần — chữa một xung đột thật bằng cách chế ra một xung đột giả
      //     xảy ra hàng chục lần mỗi ngày. Giao lượt tiếp theo thì vài lần một ngày, và nó chính
      //     là sự kiện làm ảnh chụp 3D của form hết hạn.
      await tx.order.update({
        where: { id: assignment.orderId },
        data: { version: { increment: 1 } },
      });

      // 3. Mở lượt mới nối vào lượt cũ.
      return tx.design3DAssignment.create({
        data: {
          orderId: assignment.orderId,
          orderItemId: assignment.orderItemId,
          designer3DId: nextDesigner.id,
          kpiGroupId,
          workingCalendarId: assignment.workingCalendarId,
          assignedById: user.dbId ?? null,
          reassignedFromId: assignment.id,
          // Nói ĐÚNG vì sao có lượt này: mở lại sau gác, hay chỉ là giao thêm một lượt nữa. Ghi
          // cứng PAUSE_RESUME cho cả hai sẽ khiến lịch sử kể một chuyện không xảy ra.
          continuationReason: open ? "PAUSE_RESUME" : "MANUAL_REASSIGN",
          assignedAt: startedAt,
          standardMinutesSnapshot: input.standardMinutes,
          deadlineAt,
          status: "ASSIGNED",
          reviewNote: continuationNote({
            fromDesignerName: assignment.designer3D?.name ?? "nhân viên trước",
            creditedMinutes: credited,
            pauseReason: assignment.pauses.find((p) => p.id === openId)?.reason ?? null,
          }),
        },
        select: { id: true, deadlineAt: true, designer3DId: true, standardMinutesSnapshot: true },
      });
    });

    return ok(
      {
        ...created,
        /** Giờ đã đóng băng cho người cũ — UI nói lại để người bấm thấy quyết định của mình. */
        previousCreditedMinutes: credited,
      },
      201,
    );
  } catch (err) {
    if (isStaleAssignmentError(err)) return Errors.conflict((err as Error).message);
    console.error("[POST /api/design-3d/assignments/:id/resume-continuation]", err);
    return Errors.internal();
  }
}
