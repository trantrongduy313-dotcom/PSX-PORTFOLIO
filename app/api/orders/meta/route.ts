import type { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser, getUserStoreIds } from "@/app/lib/auth-helpers";
import { mergeChangedOrders, latestStamp } from "@/app/lib/business/orders/meta-changes";

// GET /api/orders/meta
// Lightweight endpoint — only COUNT + MAX(updatedAt), no pagination/sort/joins.
// Used by the heartbeat query to detect changes without fetching full order data.
// Accepts: zone, status, history (tab-level params only)

export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return Errors.forbidden();

  const raw = Object.fromEntries(request.nextUrl.searchParams);
  const zone         = raw.zone as string | undefined;
  const status       = raw.status as string | undefined;
  const history      = raw.history === "true";
  const changedSince = raw.changedSince ? new Date(raw.changedSince) : null;
  const storeId      = raw.storeId as string | undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { deletedAt: null };

  if (storeId) {
    if (currentUser.role === "SALES") {
      const storeIds = await getUserStoreIds(currentUser.id);
      if (!storeIds.includes(storeId)) return Errors.forbidden();
    }
    where.storeId = storeId;
  } else if (currentUser.role === "SALES") {
    const storeIds = await getUserStoreIds(currentUser.id);
    if (storeIds.length === 0) return ok({ total: 0, lastUpdatedAt: null });
    where.storeId = { in: storeIds };
  }

  if (zone === "PRE_PRODUCTION") {
    where.zone = "PRE_PRODUCTION";
  } else if (zone === "MASTER_HUB") {
    where.items = { some: { zone: "MASTER_HUB" } };
  }

  if (history) {
    if (status === "COMPLETED" || status === "CANCELLED") {
      where.OR = [{ status }, { items: { some: { itemStatus: status } } }];
      // Hoàn tất: ẩn đơn đã hủy hoàn toàn (nhưng vẫn hiện đơn có MO hủy riêng lẻ)
      // Đã hủy: KHÔNG ẩn đơn COMPLETED — đơn COMPLETED có thể có MO hủy riêng lẻ
      if (status === "COMPLETED") {
        where.NOT = { status: "CANCELLED" };
      }
    } else {
      where.status = { in: ["COMPLETED", "CANCELLED"] };
    }
  } else if (!zone) {
    // "Tất cả" tab: non-terminal only
    where.status = { notIn: ["COMPLETED", "CANCELLED"] };
  }
  // For zone-only tabs (PRE_PRODUCTION, MASTER_HUB): no status filter — all orders in that zone

  // changedCount/changedOrders intentionally ignore zone filter so we detect
  // when orders LEAVE a zone (e.g. full-order promote causes order.zone → MASTER_HUB,
  // removing it from the PRE_PRODUCTION set before the next heartbeat tick).
  const whereChanges = { ...where };
  delete whereChanges.zone;
  delete whereChanges.items;

  const [total, latest, changedOrdersRaw, latest3D, changed3D] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findFirst({
      where,
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    changedSince
      ? prisma.order.findMany({
          where: { ...whereChanges, updatedAt: { gt: changedSince } },
          orderBy: { updatedAt: "desc" },
          take: 20,
          select: {
            id: true,
            orderNumber: true,
            store: { select: { name: true } },
            items: {
              where: { updatedAt: { gt: changedSince } },
              select: { id: true, moNumber: true },
            },
          },
        })
      : Promise.resolve([]),

    // ─── LƯỢT GIAO VIỆC 3D — BẢNG BỊ BỎ SÓT KHỎI CHỮ KÝ ───────────────────────
    //
    // ⚠️ HAI HÀNH ĐỘNG CỦA NV 3D KHÔNG CHẠM TỚI `Order` HAY `OrderItem`:
    //
    //   · acknowledge (nhận việc) — không update Order/OrderItem;
    //   · progress   (cập nhật tiến độ / gửi kết quả) — cũng không.
    //
    // Chỉ `review` (Đặt đơn duyệt) mới bump Order. Nên chữ ký chỉ theo `Order.updatedAt` là
    // MÙ HOÀN TOÀN với việc NV 3D làm: không nháy dòng, không tín hiệu, và sidebar của Đặt đơn
    // hiện một trạng thái đóng băng trong khi vẫn trông như đang cập nhật đầy đủ.
    //
    // Đây ĐÚNG bài học đã ghi ở kpi-3d/freshness.ts, chiếu ngược lại: "trường đó nằm ở bảng nào
    // thì bảng đó PHẢI có mặt trong chữ ký". Lần đó màn 3D thiếu OrderItem; lần này màn đơn hàng
    // thiếu Design3DAssignment.
    //
    // ⚠️ VÌ SAO KHÔNG CHO acknowledge/progress TỰ BUMP `Order.version`: nghe rẻ hơn nhưng nó biến
    // một THÔNG TIN thành một RÀO CẢN — mọi tab Đặt đơn đang mở sẽ bị CONFLICT khi lưu chỉ vì
    // NV 3D bấm nhận việc. Sửa ở chữ ký thì thông tin đi tới mà không chặn ai.
    prisma.design3DAssignment.findFirst({
      where: { order: where },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    changedSince
      ? prisma.design3DAssignment.findMany({
          where: { updatedAt: { gt: changedSince }, order: whereChanges },
          orderBy: { updatedAt: "desc" },
          take: 20,
          select: {
            orderItemId: true,
            order: { select: { id: true, orderNumber: true, store: { select: { name: true } } } },
            orderItem: { select: { moNumber: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  // Gộp + chọn mốc mới nhất: luật (và lý do) ở business/orders/meta-changes.ts, có test riêng.
  const changedOrders = mergeChangedOrders(changedOrdersRaw, changed3D);
  const lastUpdatedAt = latestStamp(latest?.updatedAt, latest3D?.updatedAt);

  return ok({
    total,
    lastUpdatedAt,
    changedCount: changedOrders.length,
    changedOrders,
  });
}
