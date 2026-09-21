import "server-only";

import { prisma } from "@/app/lib/prisma";
import {
  buildAssignmentBatchMessage,
  buildDesignPriorityChangedMessage,
  buildOvertimeRequestMessage,
  type AssignmentNotice,
} from "@/app/lib/business/notify/chat-message";
import {
  DESIGN_PRIORITY_LABELS,
  designPriorityRank,
  toDesignPriority,
} from "@/app/lib/business/kpi-3d/design-priority";
import { ACTIVE_ASSIGNMENT_STATUSES } from "@/app/lib/business/kpi-3d/assignment";
import { redactWebhookUrl, sendChatMessage, teamChatWebhookUrl } from "@/app/lib/notify/google-chat";
import { appUrl } from "@/app/lib/notify/app-url";
import { configuredCalendarToWorkingCalendar } from "@/app/lib/business/kpi-3d/calendar-adapter";
import { minutesInsideWorkingHours } from "@/app/lib/business/kpi-3d/overtime";

// ─── Điều phối gửi thông báo giao việc 3D ────────────────────────────────────
//
// Gọi SAU KHI transaction đã commit và SAU KHI response đã trả về (qua `after()` của
// next/server). Ba lý do bắt buộc phải như vậy:
//
//   1. Gọi HTTP từ trong transaction sẽ giữ lock DB suốt thời gian gọi mạng ngoài.
//   2. Google Chat chậm/chết thì cả lệnh lưu đơn treo theo, có thể timeout transaction.
//   3. Thông báo thất bại KHÔNG được rollback việc giao — việc giao là thật.
//
// Trên Vercel, một promise "gửi rồi quên" có thể bị cắt khi hàm kết thúc; `after()` mới bảo
// đảm việc chạy sau response nhưng vẫn trong vòng đời hàm. Không dùng nó thì thỉnh thoảng mất
// thông báo mà không ai biết — chạy local tốt, production phập phù, loại lỗi tệ nhất.

/**
 * Link mở màn việc 3D. Thiếu link thì nhân viên phải tự đi tìm việc.
 *
 * Thứ tự ưu tiên biến môi trường (và VÌ SAO VERCEL_URL là đường cuối) nằm ở notify/app-url.ts
 * — một chỗ, vì thông báo phản hồi cũng dùng đúng luật đó.
 */
function workUrl(): string | null {
  return appUrl("/dashboard/design-3d");
}

/**
 * Gửi thông báo cho các lượt giao việc VỪA ĐƯỢC TẠO.
 *
 * KHÔNG bao giờ ném lỗi lên trên: hàm này chạy ngoài luồng request, một lỗi ở đây không được
 * phép ảnh hưởng tới bất cứ thứ gì. Mọi nhánh đều ghi log rồi kết thúc êm.
 */
export async function notifyNewDesign3DAssignments(assignmentIds: readonly string[]): Promise<void> {
  if (assignmentIds.length === 0) return;

  try {
    const rows = await prisma.design3DAssignment.findMany({
      where: { id: { in: [...assignmentIds] } },
      select: {
        id: true,
        deadlineAt: true,
        standardMinutesSnapshot: true,
        designer3D: { select: { name: true } },
        kpiGroup: { select: { name: true } },
        // CỐ Ý không lấy order.customerName: Space là kênh chung của cả phòng, đây là dữ liệu
        // khách hàng. Muốn thêm chỉ là một dòng, nhưng mặc định chọn phương án kín hơn.
        orderItem: { select: { moNumber: true, productName: true } },
      },
    });

    if (rows.length === 0) return;

    const url = workUrl();
    const notices: AssignmentNotice[] = rows.map((row) => ({
      designerName: row.designer3D?.name ?? "(chưa rõ nhân viên)",
      moNumber: row.orderItem?.moNumber ?? null,
      productName: row.orderItem?.productName ?? null,
      groupName: row.kpiGroup?.name ?? null,
      standardMinutes: row.standardMinutesSnapshot,
      deadlineAt: row.deadlineAt,
      workUrl: url,
    }));

    // Một lần lưu có thể tạo nhiều lượt giao việc (đơn nhiều MO) → gộp thành MỘT tin nhắn,
    // thay vì dồn 5 tin vào Space cùng lúc.
    // Truyền `now` để tin nhắn nêu được "còn 22 giờ" cạnh mốc tuyệt đối — một mốc giờ trơ
    // không nói được gấp hay không, người đọc phải tự trừ trong đầu.
    const payload = buildAssignmentBatchMessage(notices, new Date());
    if (!payload) return;

    const webhook = teamChatWebhookUrl();
    const result = await sendChatMessage(payload, webhook);

    if (result.status === "SENT") {
      // Đóng dấu để sidebar hiện "Đã gửi thông báo lúc…". Không đóng dấu thì Order không phân
      // biệt được "đã gửi" với "gửi thất bại" — mà tưởng nhân viên đã biết là điều tệ nhất.
      await prisma.design3DAssignment.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { notifiedAt: new Date() },
      });
      return;
    }

    // Thất bại: ghi log CÓ id để lần ra được, và che URL vì trong đó có key + token.
    console.error(
      "[notify-design-3d] Không gửi được thông báo:",
      result.reason,
      "| assignments:", rows.map((r) => r.id).join(","),
      "| webhook:", webhook ? redactWebhookUrl(webhook) : "(chưa cấu hình)",
    );
  } catch (error) {
    // Kể cả lỗi truy vấn DB cũng không được thoát ra ngoài — đây là việc chạy hậu kỳ.
    console.error("[notify-design-3d] Lỗi khi gửi thông báo:", error);
  }
}

/**
 * Gửi thông báo cho MỘT khai báo tăng ca vừa được tạo.
 *
 * VÌ SAO KHÔNG GỘP như giao việc: một lần lưu đơn tạo nhiều lượt giao việc cùng lúc (đơn nhiều
 * MO) nên gộp là bắt buộc. Khai báo tăng ca thì mỗi lần một cái, do một người bấm — không có
 * chùm nào để gộp, và gom chờ sẽ làm chậm đúng thứ cần biết sớm.
 *
 * ⚠️ KHÔNG đóng dấu "đã gửi" như `notifiedAt` của lượt giao việc. Ở đó mốc ấy có việc thật: Đặt
 * đơn cần phân biệt "nhân viên đã được báo" với "gửi thất bại" để còn đi nhắc. Ở đây người nhận
 * là quản lý và bằng chứng nằm ngay trong hàng chờ duyệt — thêm một cột chỉ để ghi lại một lần
 * gửi là thêm một thứ phải giữ cho đúng mà không ai đọc.
 *
 * KHÔNG BAO GIỜ ném lỗi lên trên: chạy ngoài luồng request, sau khi khai báo đã được ghi.
 */
export async function notifyNewOvertimeRequest(requestId: string): Promise<void> {
  try {
    const row = await prisma.design3DOvertimeRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        minutes: true,
        reason: true,
        designer3D: { select: { name: true } },
        // CỐ Ý không lấy tên khách hàng — Space là kênh chung của cả phòng. Cùng quyết định với
        // tin giao việc ở trên.
        assignment: { select: { orderItem: { select: { moNumber: true, productName: true } } } },
      },
    });
    if (!row) return;

    const payload = buildOvertimeRequestMessage({
      designerName: row.designer3D?.name ?? "(chưa rõ nhân viên)",
      moNumber: row.assignment?.orderItem?.moNumber ?? null,
      productName: row.assignment?.orderItem?.productName ?? null,
      startAt: row.startAt,
      endAt: row.endAt,
      minutes: row.minutes,
      reason: row.reason,
      // Tính lại ở đây thay vì chuyền từ route: cùng một con số mà đi hai đường thì sớm muộn lệch.
      overlapMinutes: await overlapWithWorkingHours(row.startAt, row.endAt),
      workUrl: workUrl(),
    });

    const webhook = teamChatWebhookUrl();
    const result = await sendChatMessage(payload, webhook);
    if (result.status === "SENT") return;

    console.error(
      "[notify-design-3d] Không gửi được thông báo tăng ca:",
      result.reason,
      "| overtimeRequest:", row.id,
      "| webhook:", webhook ? redactWebhookUrl(webhook) : "(chưa cấu hình)",
    );
  } catch (error) {
    console.error("[notify-design-3d] Lỗi khi gửi thông báo tăng ca:", error);
  }
}

/**
 * Gửi thông báo khi ƯU TIÊN THIẾT KẾ của một MO bị đổi.
 *
 * BA ĐIỀU KIỆN, và cả ba đều kiểm ở ĐÂY chứ không ở route:
 *
 *   1. Giá trị THẬT SỰ đổi. Sidebar gửi cả cụm field mỗi lần bấm Lưu, nên "Normal → Normal" tới
 *      đây liên tục. Gửi hết thì Space thành nhiễu và không ai đọc tin nào nữa.
 *   2. MO đó ĐANG có người làm. Xếp ưu tiên lúc chưa giao việc là việc nội bộ của Đặt đơn.
 *   3. Chạy SAU commit (qua `after()` ở route) — cùng lý do với notifyNewDesign3DAssignments.
 *
 * Kiểm ở đây vì route nào rồi cũng có thể đổi field này; luật nằm ở một chỗ thì không có đường
 * nào bỏ sót được.
 *
 * KHÔNG BAO GIỜ ném lỗi lên trên.
 */
export async function notifyDesign3DPriorityChange(params: {
  orderItemId: string;
  fromCode: string | null | undefined;
  toCode: string | null | undefined;
  changedByName: string | null;
}): Promise<void> {
  try {
    const from = toDesignPriority(params.fromCode);
    const to = toDesignPriority(params.toCode);
    if (from === to) return; // điều kiện 1

    const item = await prisma.orderItem.findUnique({
      where: { id: params.orderItemId },
      select: {
        moNumber: true,
        productName: true,
        design3DAssignments: {
          where: { status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] } },
          select: { designer3D: { select: { name: true } } },
        },
      },
    });
    if (!item) return;

    // Cùng một người có thể giữ hai lượt (lần 1 và lần 2) → gộp tên lại, đừng đọc tên hai lần.
    const designerNames = [
      ...new Set(
        item.design3DAssignments
          .map((a) => a.designer3D?.name)
          .filter((n): n is string => !!n),
      ),
    ];
    if (designerNames.length === 0) return; // điều kiện 2

    const payload = buildDesignPriorityChangedMessage({
      designerNames,
      moNumber: item.moNumber,
      productName: item.productName,
      fromLabel: DESIGN_PRIORITY_LABELS[from],
      toLabel: DESIGN_PRIORITY_LABELS[to],
      // Bậc NHỎ hơn là gấp hơn → rank giảm nghĩa là được nâng ưu tiên.
      raised: designPriorityRank(to) < designPriorityRank(from),
      changedByName: params.changedByName,
      workUrl: workUrl(),
    });
    if (!payload) return;

    const webhook = teamChatWebhookUrl();
    const result = await sendChatMessage(payload, webhook);
    if (result.status === "SENT") return;

    console.error(
      "[notify-design-3d] Không gửi được thông báo đổi ưu tiên thiết kế:",
      result.reason,
      "| orderItem:", params.orderItemId,
      "| webhook:", webhook ? redactWebhookUrl(webhook) : "(chưa cấu hình)",
    );
  } catch (error) {
    console.error("[notify-design-3d] Lỗi khi gửi thông báo đổi ưu tiên thiết kế:", error);
  }
}

/** Số phút khai báo rơi vào giờ hành chính — 0 khi chưa cấu hình lịch làm việc. */
async function overlapWithWorkingHours(startAt: Date, endAt: Date): Promise<number> {
  const calendar = await prisma.workingCalendar.findFirst({
    where: { isActive: true },
    include: { sessions: true, holidays: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  if (!calendar) return 0;
  return minutesInsideWorkingHours(startAt, endAt, configuredCalendarToWorkingCalendar(calendar));
}
