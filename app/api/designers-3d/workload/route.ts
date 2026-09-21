import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";
import { classifyDbError } from "@/app/lib/db-error";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { deniedReasonFor } from "@/app/lib/business/kpi-3d/permissions";
import {
  isOpenAssignment,
  isOverdueAssignment,
  summarizeDesignerWorkload,
  type WorkloadAssignment,
} from "@/app/lib/business/kpi-3d/workload";

// ─── GET /api/designers-3d/workload ──────────────────────────────────────────
// Tải công việc hiện tại của từng NV 3D, để Order thấy ngay lúc chọn người giao việc.
//
// VÌ SAO LÀ ENDPOINT RIÊNG, KHÔNG NHÉT VÀO /api/designers-3d:
// panel đơn hàng cache endpoint đó với staleTime 1 TIẾNG. Danh sách tên thì cache vậy hợp lý
// (hiếm khi đổi), nhưng số việc đang làm mà cache 1 tiếng thì Order vừa giao xong 3 việc vẫn
// thấy con số của một tiếng trước — tệ hơn là không hiện gì, vì nó trông như số thật.
// Tách ra để mỗi loại dữ liệu có nhịp làm mới của riêng nó.

/** Số việc kèm theo cho mỗi người. Đủ để trả lời "đang làm cái gì", không nuốt cả bảng. */
const MAX_ITEMS_PER_DESIGNER = 5;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Errors.forbidden();

  const denied = deniedReasonFor("READ_WORKLOAD", { role: user.role, designer3DId: null });
  if (denied) return Errors.forbidden(denied);

  try {
    const designers = await prisma.designer3D.findMany({
      where: { isActive: true },
      orderBy: [{ code: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        code: true,
        // Lọc lượt ĐÃ ĐÓNG ngay ở DB. Lượt đã hoàn tất vẫn phải lấy về: isOpenAssignment cần
        // completedAt để loại chúng, và lọc sẵn ở đây sẽ khiến hai nơi cùng quyết định một
        // việc — đúng thứ file workload.ts sinh ra để tránh.
        assignments: {
          where: { status: { notIn: ["REASSIGNED", "CANCELLED"] } },
          orderBy: { deadlineAt: "asc" },
          select: {
            id: true,
            status: true,
            completedAt: true,
            deadlineAt: true,
            acknowledgedAt: true,
            standardMinutesSnapshot: true,
            orderItem: { select: { moNumber: true, productName: true } },
          },
        },
      },
    });

    const now = new Date();

    const data = designers.map((d) => {
      const all: (WorkloadAssignment & { id: string; orderItem: { moNumber: string | null; productName: string | null } | null })[] =
        d.assignments;
      const open = all.filter(isOpenAssignment);

      return {
        id: d.id,
        name: d.name,
        code: d.code,
        workload: summarizeDesignerWorkload(all, now),
        // Danh sách đã sắp theo deadline gần nhất (orderBy ở trên) — việc gấp nhất đứng đầu,
        // đúng thứ Order cần cân nhắc trước khi giao thêm.
        items: open.slice(0, MAX_ITEMS_PER_DESIGNER).map((a) => ({
          id: a.id,
          moNumber: a.orderItem?.moNumber ?? null,
          productName: a.orderItem?.productName ?? null,
          deadlineAt: a.deadlineAt.toISOString(),
          isOverdue: isOverdueAssignment(a, now),
          acknowledged: !!a.acknowledgedAt,
        })),
        // Còn bao nhiêu việc không kèm trong `items`. Nói ra để "5 việc" không trông như đã
        // liệt kê hết trong khi thực tế còn nữa.
        moreCount: Math.max(0, open.length - MAX_ITEMS_PER_DESIGNER),
      };
    });

    return ok(data, 200);
  } catch (error) {
    const classified = classifyDbError(error);
    console.error("[designers-3d/workload] DB error:", classified.kind, error);
    if (classified.kind === "UNKNOWN") return Errors.internal();
    return Errors.serviceUnavailable(classified.message);
  }
}
