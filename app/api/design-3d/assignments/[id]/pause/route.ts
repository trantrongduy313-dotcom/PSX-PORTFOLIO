import type { NextRequest } from "next/server";
import { z } from "zod";

import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { configuredCalendarToWorkingCalendar } from "@/app/lib/business/kpi-3d/calendar-adapter";
import {
  deniedReasonForPause,
  deniedReasonForResume,
  deniedReasonForPauseAt,
  deniedReasonForResumeAt,
  openPause,
  shiftDeadlineByPauses,
  workedMinutesUntil,
} from "@/app/lib/business/kpi-3d/pause";
// `deniedReasonForConfirmedMinutes` không còn dùng ở đây: nó gác số GÕ TAY, mà đường gõ tay
// đã bỏ. Sàn cộng dồn nay xử lý bằng Math.max ngay tại chỗ ghi.
import { alreadyCreditedMinutes } from "@/app/lib/business/kpi-3d/hours-ledger";
import { deniedReasonFor } from "@/app/lib/business/kpi-3d/permissions";

// ─── POST /api/design-3d/assignments/[id]/pause ──────────────────────────────
// ─── DELETE (mở lại) cùng đường dẫn ──────────────────────────────────────────
//
// Admin/Order gác một lượt giao việc để NV 3D nhảy sang đơn gấp hơn. TẠM DỪNG LÀ ĐỘNG TÁC
// DỪNG ĐỒNG HỒ KPI — nó vừa trừ giờ thực tế vừa dời deadline, nên:
//
//   - CHỈ ADMIN/ORDER (PAUSE_ASSIGNMENT). NV 3D tự dừng được thì KPI vô nghĩa.
//   - LÝ DO BẮT BUỘC. Cuối tháng đối chiếu KPI phải trả lời được "vì sao đơn này được trừ giờ".
//
// Route CỐ Ý MỎNG: xác thực → nạp → hỏi module business → ghi. Mọi quy tắc nằm ở kpi-3d/pause.ts.

const pauseInputSchema = z.object({
  reason: z.string().trim().min(1, "Phải nêu lý do tạm dừng.").max(1000),
  // ─── `confirmedMinutes` ĐÃ BỎ KHỎI BODY — server tự đo, không nhận số gõ tay ──────────
  //
  // Giờ đã làm = (mốc tạm dừng) − (lúc NV nhận việc), theo giờ làm việc của lịch và trừ các
  // lần đã dừng trước. Đây là một PHÉP ĐO, và nó chỉ nên có MỘT người đo.
  //
  // Trước đây body nhận số gõ tay, còn màn hình thì điền sẵn chính con số server vừa trả về
  // rồi gửi ngược lại. Tức hai bên cùng giữ một sự thật mà không bên nào biết mình sai khi
  // lệch — và cái lệch đó đi thẳng vào số liệu lương.
  //
  // Bỏ hẳn khỏi schema chứ không chỉ thôi gửi ở client: một field còn được NHẬN mà không ai
  // gửi là một cửa mở không người canh. Muốn sửa số đã chốt thì phải là một thao tác riêng,
  // có tên, có nhật ký — không phải một field lặng lẽ trong body của nút Tạm dừng.
  /**
   * Mốc tạm dừng. Bỏ trống = bây giờ.
   *
   * CHO SỬA vì nó quyết định giờ công chốt vào KPI THÁNG NÀO. Quản lý quên gác đơn ngày 31/8
   * rồi bấm ngày 02/9 thì 20 giờ của tháng 8 chạy sang tháng 9 — sai ở cả hai tháng và không
   * có cách nào chữa nếu mốc bị chốt cứng. Luật chặn ở kpi-3d/pause.ts.
   */
  pausedAt: z.coerce.date().optional(),
});

const resumeInputSchema = z.object({
  note: z.string().trim().max(1000).nullable().optional(),
  /**
   * Mốc mở lại. Bỏ trống = bây giờ.
   *
   * CHO SỬA cùng lý do với pausedAt: nó là mốc bắt đầu đoạn làm việc TIẾP THEO, nên nếu đoạn đó
   * thuộc tháng khác thì mốc này quyết định giờ của tháng nào. Nó còn quyết định deadline được
   * dời bao nhiêu — bấm muộn hai ngày là nhân viên được cho thêm hai ngày không có thật.
   */
  resumedAt: z.coerce.date().optional(),
});

const assignmentSelect = {
  id: true,
  status: true,
  reviewStatus: true,
  // Để chặn gác một việc đã nộp kết quả — xem deniedReasonForPause.
  completedAt: true,
  deadlineAt: true,
  assignedAt: true,
  acknowledgedAt: true,
  workingCalendar: { include: { sessions: true, holidays: true } },
  pauses: { select: { id: true, pausedAt: true, resumedAt: true, confirmedMinutes: true } },
} as const;

/**
 * GET — số phút hệ thống ĐO ĐƯỢC tới bây giờ, để hộp Tạm dừng điền sẵn vào ô "Giờ đã làm".
 *
 * VÌ SAO LÀ MỘT ENDPOINT chứ không tính ở trình duyệt: phép đo cần lịch làm việc và toàn bộ
 * lịch sử tạm dừng. Tính lại ở client là dựng bộ đi lịch thứ hai, và hai bộ chắc chắn lệch nhau
 * khi ai đó sửa ca. Quan trọng hơn: con số UI HIỆN RA và con số server DÙNG khi ô để trống nay
 * đến từ cùng một chỗ, nên không thể khác nhau.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) return Errors.forbidden();
  if (deniedReasonFor("PAUSE_ASSIGNMENT", { role: currentUser.role, designer3DId: null })) {
    return Errors.forbidden("Chỉ Admin/Đặt đơn xem được số giờ đề xuất khi tạm dừng.");
  }

  try {
    const assignment = await prisma.design3DAssignment.findUnique({
      where: { id },
      select: assignmentSelect,
    });
    if (!assignment) return Errors.notFound("Design3DAssignment");

    const measured = workedMinutesUntil({
      assignedAt: assignment.assignedAt,
      acknowledgedAt: assignment.acknowledgedAt,
      until: new Date(),
      pauses: assignment.pauses,
      calendar: assignment.workingCalendar
        ? configuredCalendarToWorkingCalendar(assignment.workingCalendar)
        : undefined,
    });

    return ok({
      /** Cộng dồn từ lúc nhận việc — đúng đơn vị mà POST mong đợi. */
      suggestedMinutes: measured,
      /** Đã chốt bao nhiêu ở các lần dừng trước, để UI nói rõ phần tăng thêm là bao nhiêu. */
      alreadyCreditedMinutes: alreadyCreditedMinutes(assignment.pauses),
    });
  } catch (err) {
    console.error("[GET /api/design-3d/assignments/:id/pause]", err);
    return Errors.internal();
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) return Errors.forbidden();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.badRequest("Invalid JSON body");
  }
  const parsed = pauseInputSchema.safeParse(body);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);

  try {
    const assignment = await prisma.design3DAssignment.findUnique({
      where: { id },
      select: assignmentSelect,
    });
    if (!assignment) return Errors.notFound("Design3DAssignment");

    const denied = deniedReasonForPause(currentUser.role, {
      status: assignment.status,
      reviewStatus: assignment.reviewStatus,
      completedAt: assignment.completedAt,
      pauses: assignment.pauses,
    });
    if (denied) return Errors.forbidden(denied);

    const now = new Date();
    const pausedAt = parsed.data.pausedAt ?? now;

    const badMoment = deniedReasonForPauseAt({
      pausedAt,
      assignedAt: assignment.assignedAt,
      acknowledgedAt: assignment.acknowledgedAt,
      now,
      pauses: assignment.pauses,
    });
    if (badMoment) return Errors.badRequest(badMoment);

    // LUÔN tự đo — KHÔNG để null. Null nghĩa là "không có mốc chốt", và khi đó giờ công của
    // nhân viên dồn hết về tháng đơn hoàn tất, đúng lỗi mà cả luồng tạm dừng sinh ra để sửa.
    const measured = workedMinutesUntil({
      assignedAt: assignment.assignedAt,
      acknowledgedAt: assignment.acknowledgedAt,
      // Đo tới ĐÚNG mốc dừng, không tới "bây giờ": nếu quản lý lùi mốc về cuối tháng trước thì
      // số giờ phải là số tại thời điểm đó, không gồm mấy ngày sau.
      until: pausedAt,
      pauses: assignment.pauses,
      calendar: assignment.workingCalendar
        ? configuredCalendarToWorkingCalendar(assignment.workingCalendar)
        : undefined,
    });

    // SÀN CỘNG DỒN. `confirmedMinutes` là số CỘNG DỒN từ lúc nhận việc, và hours-ledger đọc nó
    // bằng `max` — một con số thấp hơn lần chốt trước sẽ bị nuốt IM LẶNG, KPI dùng số khác hẳn
    // số vừa ghi.
    //
    // KẸP thay vì trả lỗi: hồi còn gõ tay, số thấp là do người dùng nhập nên báo lỗi để họ sửa
    // là đúng. Nay số do server đo — báo lỗi ở đây là chặn người dùng bằng một lỗi họ KHÔNG có
    // cách nào sửa, chỉ vì hai phép đo của chính hệ thống không khớp nhau. Kẹp giữ sổ đơn điệu
    // và không ai bị kẹt; nếu nó thật sự xảy ra thì dấu vết nằm ở chênh lệch giữa hai lần chốt.
    const confirmedMinutes = Math.max(measured, alreadyCreditedMinutes(assignment.pauses));

    const created = await prisma.design3DPause.create({
      data: {
        assignmentId: id,
        pausedAt,
        reason: parsed.data.reason,
        pausedById: currentUser.dbId,
        confirmedMinutes,
        // Ghi cả khi số do server đo: người bấm nút vẫn là người chịu trách nhiệm cho con số
        // được chốt vào KPI.
        confirmedById: currentUser.dbId ?? null,
      },
      select: { id: true, pausedAt: true, reason: true, confirmedMinutes: true },
    });
    return ok(created, 201);
  } catch (err) {
    // ⚠️ RÀNG BUỘC DB LÀ CHỐT THẬT, phần kiểm ở trên chỉ là để có câu thông báo tử tế.
    //
    // `deniedReasonForPause` chạy trên bản vừa đọc, nên hai request gần nhau (bấm đôi, hoặc Admin
    // và Đặt đơn cùng gác một MO) đều thấy "chưa dừng" và đều đi tới đây. Partial unique index
    // design_3d_pauses_one_open_per_assignment khiến người thứ hai thất bại — và đó là lý do một
    // trạng thái hai-khoảng-cùng-mở nay KHÔNG THỂ tồn tại, chứ không phải "khó xảy ra".
    //
    // Trả 409 với đúng câu chữ của luật: người bấm không làm gì sai, và với họ thì kết quả đúng
    // như mong đợi — đơn đang được gác.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      return Errors.conflict("Lượt giao việc đang tạm dừng rồi — có người vừa gác đơn này.");
    }
    console.error("[POST /api/design-3d/assignments/:id/pause]", err);
    return Errors.internal();
  }
}

/**
 * ⚠️ KHÔNG CÒN MÀN HÌNH NÀO GỌI ĐƯỜNG NÀY.
 *
 * Nút "Mở lại việc" nay đi qua POST .../resume-continuation: tạm dừng là động tác CHỐT kết quả
 * và số giờ cho nhân viên đó, nên mở lại luôn sinh một khối Nhân viên 3D mới — kể cả khi người
 * làm tiếp vẫn là người cũ. Mở lại vào chính lượt cũ sẽ bắt một dòng mang hai lần chốt.
 *
 * GIỮ LẠI vì nó là đường duy nhất HUỶ một lần tạm dừng bấm nhầm mà không dựng ra một lượt ma:
 * nó chỉ đóng khoảng dừng và trả deadline về đúng chỗ. Nếu về sau thêm nút "Huỷ tạm dừng" thì
 * đây chính là endpoint của nút đó. Đừng gộp nó vào resume-continuation — hai đường ghi ra hai
 * hình dữ liệu khác nhau.
 *
 * Mở lại — và ĐÂY LÀ CHỖ DỜI DEADLINE.
 *
 * Dời ngay lúc mở lại chứ không tính lúc hiển thị: deadline là con số NV 3D nhìn vào để quyết
 * định làm gì trước. Một deadline tự trôi mỗi lần mở màn hình thì không ai lập kế hoạch được.
 *
 * Dời đúng bằng số PHÚT LÀM VIỆC của khoảng vừa dừng — không phải mili-giây trôi qua, nếu không
 * deadline sẽ rơi vào Chủ nhật hoặc giữa đêm. Xem shiftDeadlineByPauses.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) return Errors.forbidden();

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // Mở lại không bắt buộc ghi chú — body rỗng là hợp lệ.
  }
  const parsed = resumeInputSchema.safeParse(body ?? {});
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);

  try {
    const assignment = await prisma.design3DAssignment.findUnique({
      where: { id },
      select: assignmentSelect,
    });
    if (!assignment) return Errors.notFound("Design3DAssignment");

    const denied = deniedReasonForResume(currentUser.role, { pauses: assignment.pauses });
    if (denied) return Errors.forbidden(denied);

    const open = openPause(assignment.pauses);
    if (!open) return Errors.badRequest("Lượt giao việc này không đang tạm dừng.");

    const now = new Date();
    const resumedAt = parsed.data.resumedAt ?? now;

    const badMoment = deniedReasonForResumeAt({ resumedAt, pausedAt: open.pausedAt, now });
    if (badMoment) return Errors.badRequest(badMoment);

    const calendar = assignment.workingCalendar
      ? configuredCalendarToWorkingCalendar(assignment.workingCalendar)
      : undefined;

    // Dời deadline theo ĐÚNG khoảng vừa đóng. Cố ý KHÔNG tính lại trên toàn bộ lịch sử dừng:
    // các khoảng trước đã dời deadline ở lần mở lại của chúng rồi — tính lại là dời hai lần.
    const closed = [{ pausedAt: open.pausedAt, resumedAt }];
    const newDeadline = shiftDeadlineByPauses(
      assignment.deadlineAt,
      closed,
      open.pausedAt,
      resumedAt,
      calendar,
    );

    const openId = assignment.pauses.find(
      (p) => p.resumedAt === null && p.pausedAt.getTime() === open.pausedAt.getTime(),
    )?.id;

    const result = await prisma.$transaction(async (tx) => {
      await tx.design3DPause.update({
        where: { id: openId },
        data: { resumedAt, resumedById: currentUser.dbId, resumeNote: parsed.data.note ?? null },
      });
      return tx.design3DAssignment.update({
        where: { id },
        data: { deadlineAt: newDeadline },
        select: { id: true, deadlineAt: true },
      });
    });

    return ok(result);
  } catch (err) {
    console.error("[DELETE /api/design-3d/assignments/:id/pause]", err);
    return Errors.internal();
  }
}
