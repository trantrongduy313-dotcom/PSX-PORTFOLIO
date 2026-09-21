import type { NextRequest } from "next/server";
import type { Prisma } from "@/app/generated/prisma/client";

import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { resolveProgressActor } from "@/app/lib/business/kpi-3d/actor";
import { canReadProgress } from "@/app/lib/business/kpi-3d/progress";
import { pendingOvertimeScope } from "@/app/lib/business/kpi-3d/overtime";
import { freshnessSignature } from "@/app/lib/business/kpi-3d/freshness";

// ─── GET /api/design-3d/assignments/meta ─────────────────────────────────────
//
// "Có gì mới không" — trả về một CHỮ KÝ NHẸ để màn Việc thiết kế 3D poll, thay vì kéo lại cả
// danh sách 200 lượt kèm progressLogs / pauses / tài liệu MO mỗi 20 giây.
//
// Bản tương ứng của `fetchOrdersMeta` bên danh sách đơn hàng, cố ý cùng khuôn: hai cách làm cùng
// một việc trong một app là nơi lỗi sẽ mọc.
//
// PHẠM VI ĐƯỢC ÉP Ở SERVER, KHÔNG TIN THAM SỐ CLIENT — và phải giống HỆT route danh sách. Nếu
// heartbeat rộng hơn danh sách thì NV 3D sẽ thấy màn hình tự tải lại vì việc của người khác;
// nếu hẹp hơn thì bỏ sót đúng thứ cần thấy.
//
// NĂM bảng, không phải một: xem chú thích ở kpi-3d/freshness.ts. `assignment.updatedAt` một mình
// không phát hiện được "lưu ghi chú tiến độ", "tạo khoảng tạm dừng", "sửa MO" (ưu tiên/NVL/size…)
// hay "đổi Yêu cầu thiết kế" — bốn thao tác đều làm bảng 3D phải đổi.

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canReadProgress(user.role)) return Errors.forbidden();

  const designerFilter = request.nextUrl.searchParams.get("designer3DId")?.trim() ?? "";

  const actor = await resolveProgressActor(user);

  // NV 3D chưa gắn hồ sơ → phạm vi rỗng, đúng như route danh sách trả [].
  if (user.role === "DESIGN_3D" && !actor.designer3DId) {
    return ok({
      // Giữ ĐÚNG hình dữ liệu của nhánh chính: thiếu khoá ở một nhánh thì chỗ đọc phải nhớ rằng
      // đôi khi nó vắng mặt, và ngày nào đó sẽ có người quên.
      pendingOvertime: 0,
      signature: freshnessSignature({
        assignmentCount: 0, assignmentUpdatedAt: null,
        progressLogCount: 0, progressLogLatestAt: null,
        pauseCount: 0, pauseLatestAt: null,
        orderItemCount: 0, orderItemUpdatedAt: null,
        productionDetailUpdatedAt: null,
      }),
    });
  }

  // CỐ Ý KHÔNG lọc theo `status`: heartbeat trả lời "phạm vi của tôi có gì đổi", còn lọc trạng
  // thái là việc của giao diện. Ép luôn bộ lọc vào đây thì đổi bộ lọc là đổi chữ ký, và màn hình
  // sẽ tự tải lại mỗi lần người dùng bấm một chip lọc.
  const where: Prisma.Design3DAssignmentWhereInput = actor.designer3DId
    ? { designer3DId: actor.designer3DId }
    : designerFilter
      ? { designer3DId: designerFilter }
      : {};

  // ─── TĂNG CA CHỜ DUYỆT ─────────────────────────────────────────────────────
  //
  // ⚠️ CỐ Ý KHÔNG ĐƯA VÀO `signature`. Chữ ký trả lời đúng một câu: "DANH SÁCH lượt giao việc có
  // đổi không". Nhét tăng ca vào đó thì mỗi khai báo tăng ca sẽ bắt MỌI màn hình đang mở kéo lại
  // 200 lượt kèm progressLogs/pauses/tài liệu MO — trả một cái giá rất nặng cho một con số.
  //
  // Đi cùng chuyến với heartbeat 20 giây nên KHÔNG thêm vòng poll nào; huy hiệu vẫn tự già đi.
  const otScope = pendingOvertimeScope({ role: user.role, userId: user.dbId ?? null });

  try {
    const [assignments, progressLogs, pauses, orderItems, productionDetails, pendingOvertime] = await Promise.all([
      prisma.design3DAssignment.aggregate({
        where,
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
      prisma.design3DProgressLog.aggregate({
        where: { assignment: where },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      // Design3DPause KHÔNG có cột updatedAt, nên mở lại một khoảng dừng không làm `createdAt`
      // mới hơn. Nhưng mở lại LUÔN ghi deadlineAt hoặc đóng lượt, tức chạm vào assignment và
      // được bắt qua `_max.updatedAt` ở trên — nên count + createdAt ở đây là đủ.
      prisma.design3DPause.aggregate({
        where: { assignment: where },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      // ─── MO (OrderItem) — BẢNG THỨ TƯ, TRƯỚC ĐÂY BỊ BỎ SÓT ────────────────
      //
      // Màn 3D đọc từ OrderItem: ưu tiên thiết kế, NVL, size, trọng lượng, xi mạ, đá chủ, ghi chú
      // kỹ thuật, tài liệu tham khảo. Không có nó trong chữ ký thì mọi thay đổi ở đây đều VÔ HÌNH
      // với heartbeat — màn hình không bao giờ tự kéo lại, mà vẫn trông như đang cập nhật đầy đủ.
      //
      // Hậu quả nặng nhất KHÔNG phải cái chip ưu tiên: Đặt đơn sửa NVL của một MO đang được dựng
      // thì NV 3D vẫn thấy NVL cũ cả buổi và dựng theo nó.
      //
      // `some: where` giữ ĐÚNG phạm vi của ba câu trên — chỉ những MO mà lượt giao việc trong
      // phạm vi đang trỏ tới. Không có nó thì sửa một MO chẳng liên quan gì tới 3D cũng bắt mọi
      // màn hình kéo lại 200 lượt.
      prisma.orderItem.aggregate({
        where: { design3DAssignments: { some: where } },
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
      // ─── PRODUCTIONDETAIL — nơi ở của "Yêu cầu thiết kế" ──────────────────
      //
      // Trường đó (Làm INFO / TK mới / Chỉnh size…) nằm trong `extraData` JSON của bảng này, chứ
      // không phải cột của OrderItem hay assignment. Thiếu ở đây thì Đặt đơn đổi yêu cầu mà bảng
      // 3D đứng im — đúng lỗi vừa vá cho cột ưu tiên, lặp lại lần thứ hai.
      //
      // Chỉ lấy MỐC: ProductionDetail 1-1 với Order, còn đơn rời khỏi phạm vi đã được
      // `assignmentCount` bắt.
      prisma.productionDetail.aggregate({
        where: { order: { design3DAssignments: { some: where } } },
        _max: { updatedAt: true },
      }),
      // Phạm vi CỦA RIÊNG NÓ, không dùng `where` ở trên: `where` giới hạn theo NV 3D đang lọc,
      // còn hàng chờ duyệt tăng ca là của cả phòng — lọc theo một nhân viên sẽ giấu mất khai báo
      // của những người khác đúng lúc người duyệt cần thấy tất cả.
      otScope.visible
        ? prisma.design3DOvertimeRequest.count({
            where: {
              status: "PENDING",
              ...(otScope.excludeRequestedById
                ? { NOT: { requestedById: otScope.excludeRequestedById } }
                : {}),
            },
          })
        : Promise.resolve(0),
    ]);

    return ok({
      pendingOvertime,
      signature: freshnessSignature({
        assignmentCount: assignments._count._all,
        assignmentUpdatedAt: assignments._max.updatedAt,
        progressLogCount: progressLogs._count._all,
        progressLogLatestAt: progressLogs._max.createdAt,
        pauseCount: pauses._count._all,
        pauseLatestAt: pauses._max.createdAt,
        orderItemCount: orderItems._count._all,
        orderItemUpdatedAt: orderItems._max.updatedAt,
        productionDetailUpdatedAt: productionDetails._max.updatedAt,
      }),
    });
  } catch (err) {
    console.error("[GET /api/design-3d/assignments/meta]", err);
    return Errors.internal();
  }
}
