import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { orderVisibilityWhere } from "@/app/lib/business/order-lifecycle";
import {
  aggregateKpi3DRows,
  extractLegacyRecords,
  mergeKpi3DSources,
  type AssignmentInput,
} from "@/app/lib/business/kpi-3d/report";

// Báo cáo KPI 3D — gộp DỮ LIỆU CŨ (extraData JSON) với BẢNG MỚI (Design3DAssignment).
//
// Trước đây chỉ đọc JSON cũ, nên giờ hoàn tất và kết quả Đúng/Trễ hạn mà luồng giao việc mới
// ghi vào bảng riêng hoàn toàn không hiện lên báo cáo — đơn kẹt ở "Tồn đơn" vĩnh viễn.
// Mọi quy tắc gộp/cộng dồn nằm ở app/lib/business/kpi-3d/report.ts và có unit test riêng;
// route này chỉ xác thực, nạp dữ liệu và trả kết quả.

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!["ADMIN", "ORDER", "PRODUCTION"].includes(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const month = parseInt(searchParams.get("month") ?? String(now.getMonth() + 1), 10);
  const year  = parseInt(searchParams.get("year")  ?? String(now.getFullYear()),    10);
  const prefix = `${year}-${String(month).padStart(2, "0")}`; // "2026-02"

  const [designers, pds, assignments] = await Promise.all([
    prisma.designer3D.findMany({
      where: { isActive: true },
      orderBy: [{ code: "asc" }, { name: "asc" }],
      select: { id: true, name: true, code: true },
    }),
    prisma.productionDetail.findMany({
      // Thống nhất quy tắc: loại đơn soft-delete, vẫn tính đơn CANCELLED (công đã làm được ghi nhận).
      where: { order: orderVisibilityWhere() },
      select: { orderId: true, extraData: true },
    }),
    // KHÔNG lọc theo tháng: cột "Tồn đơn" tính tất cả thời gian, và đơn giao tháng trước
    // hoàn tất tháng này vẫn phải đếm vào tháng này.
    // Bỏ lượt đã hủy và PHẦN LỚN lượt đã giao lại — chúng chỉ là lịch sử.
    //
    // NGOẠI LỆ DUY NHẤT: lượt bị lấy đơn qua luồng "không duyệt → đổi người" mà người duyệt
    // chọn VẪN tính KPI cho người cũ. Công sức có thật thì phải thấy được; lọc mất là xoá
    // trắng giờ làm của một người vì một quyết định điều hành.
    //
    // `reassignedAt: { not: null }` là bản lề: lượt bị đóng qua form sửa đơn hàng (đường có
    // từ trước bản này) không có mốc đó, nên vẫn bị loại y như cũ. Thiếu điều kiện này thì
    // MỌI lượt giao lại trong lịch sử đột ngột hiện lên và số KPI của các tháng ĐÃ CHỐT đổi
    // ngược — kpiCounted mặc định true nên một mình nó không chặn được.
    prisma.design3DAssignment.findMany({
      where: {
        order: orderVisibilityWhere(),
        status: { not: "CANCELLED" },
        OR: [
          { status: { not: "REASSIGNED" } },
          { status: "REASSIGNED", reassignedAt: { not: null }, kpiCounted: true },
        ],
      },
      select: {
        id: true,
        orderItemId: true,
        assignedAt: true,
        completedAt: true,
        kpiStatus: true,
        actualMinutes: true,
        reassignedAt: true,
        designer3D: { select: { name: true } },
        // TOÀN BỘ lịch sử dừng, không phải `take: 1` như bản trước.
        //
        // Bản trước chỉ hỏi "có khoảng nào chưa mở lại không" nên lấy 1 dòng cho nhẹ. Nay còn
        // cần MỌI mốc chốt giờ để chia giờ công theo tháng (kpi-3d/hours-ledger.ts) — thiếu
        // một mốc là giờ của tháng đó biến mất. Không thể select cùng một quan hệ hai lần với
        // hai điều kiện khác nhau, nên lấy hết rồi suy ra cả hai thứ ở dưới.
        pauses: {
          select: { pausedAt: true, resumedAt: true, confirmedMinutes: true },
          orderBy: { pausedAt: "asc" },
        },
      },
    }),
  ]);

  const legacyRecords = pds.flatMap((pd) =>
    extractLegacyRecords(pd.orderId, pd.extraData as Record<string, unknown> | null),
  );

  const assignmentInputs: AssignmentInput[] = assignments
    .filter((a) => a.designer3D?.name)
    .map((a) => ({
      id: a.id,
      orderItemId: a.orderItemId,
      designerName: a.designer3D!.name,
      assignedAt: a.assignedAt,
      completedAt: a.completedAt,
      kpiStatus: a.kpiStatus as "ON_TIME" | "LATE" | null,
      actualMinutes: a.actualMinutes,
      // "Đang bị gác" = có khoảng chưa mở lại. Suy ra tại đây thay vì lọc ở truy vấn — xem
      // chú thích ở select.
      isPaused: a.pauses.some((p) => p.resumedAt === null),
      reassignedAt: a.reassignedAt,
      confirmedPauses: a.pauses,
    }));

  const data = aggregateKpi3DRows(
    mergeKpi3DSources(assignmentInputs, legacyRecords),
    designers,
    prefix,
  );

  return NextResponse.json({ data, month, year });
}
