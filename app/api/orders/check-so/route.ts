import type { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { Errors } from "@/app/lib/api-response";

// GET /api/orders/check-so?number=26.10680
// Returns { exists: false } or { exists: true, orderId: "..." }
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Errors.forbidden();

  const number = request.nextUrl.searchParams.get("number")?.trim();

  if (!number) {
    return Response.json({ exists: false });
  }

  try {
    // Khớp theo orderNumber HOẶC baseOrderNumber (đơn cũ có thể còn lưu dạng "SO.N").
    // Ưu tiên bản CHƯA HỦY, mới nhất — để "Thêm sản phẩm" gắn MO vào đúng đơn hiện hành.
    // Chỉ khi KHÔNG có bản nào chưa hủy mới rơi về bản đã hủy (user vẫn được phép thêm MO
    // mới vào SO đã hủy/đã hoàn tất để sản xuất tiếp — không còn chặn ở bước tạo item).
    const matchWhere = { deletedAt: null, OR: [{ orderNumber: number }, { baseOrderNumber: number }] };
    const orderBy = [{ versionNumber: "desc" as const }, { createdAt: "desc" as const }];
    const select = {
      id: true,
      customerName: true,
      salesName: true,
      nguon: true,
      donHang3Sao: true,
      linkChat: true,
      status: true,
      _count: { select: { items: true } },
    };

    let order = await prisma.order.findFirst({
      where: { ...matchWhere, status: { not: "CANCELLED" as const } },
      orderBy,
      select,
    });
    if (!order) {
      order = await prisma.order.findFirst({ where: matchWhere, orderBy, select });
    }

    if (!order) {
      return Response.json({ exists: false });
    }

    return Response.json({
      exists: true,
      orderId: order.id,
      customerName: order.customerName,
      salesName: order.salesName,
      nguon: order.nguon,
      donHang3Sao: order.donHang3Sao,
      linkChat: order.linkChat,
      itemCount: order._count.items,
      status: order.status,
    });
  } catch (e) {
    console.error("[GET /api/orders/check-so]", e);
    return Errors.internal();
  }
}
