import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { ok, Errors } from "@/app/lib/api-response";
import { orderItemCreateSchema } from "@/app/lib/schemas/order";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { stripVersionSuffix, versionOf, NEW_VERSION_SEPARATOR } from "@/app/lib/business/order-helpers";

const bodySchema = z.object({
  items: z.array(orderItemCreateSchema).min(1),
});

// POST /api/orders/[id]/items
// Thêm sản phẩm mới vào đơn hàng đã có — dùng khi cùng SO# muốn thêm MO ngày hôm sau.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) return Errors.forbidden();
  if (!["ADMIN", "ORDER", "PRODUCTION"].includes(currentUser.role)) return Errors.forbidden();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.badRequest("Invalid JSON body");
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Errors.validationFailed(parsed.error.issues);
  }

  const { items } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const order = await tx.order.findUnique({
        where: { id, deletedAt: null },
      });

      if (!order) return { tag: "NOT_FOUND" } as const;

      // Đơn đã Hoàn tất/Đã hủy vẫn cho THÊM MO mới để sản xuất tiếp — không đụng gì tới
      // MO cũ (không UPDATE, chỉ INSERT dòng mới). Chỉ chặn SỬA MO cũ (các route PATCH khác
      // vẫn giữ nguyên chặn terminal).
      const isTerminalOrder = order.status === "COMPLETED" || order.status === "CANCELLED";
      // 1 SO có thể được lưu thành NHIỀU Order row riêng biệt (mỗi row mang 1 hậu tố phiên
      // bản CẤP SO — VD "26.424991", "26.424991.1", "26.424991.2"...), nên tính "số thứ tự
      // sản phẩm tiếp theo" (dùng để sinh MO# tự động) phải quét lineNumber LỚN NHẤT trên
      // TẤT CẢ Order row cùng gốc SO — không chỉ row hiện tại — để không sinh trùng số thứ
      // tự giữa các row khác nhau của cùng 1 SO thực tế.
      const soBase = stripVersionSuffix(order.orderNumber);
      const siblingItems = await tx.orderItem.findMany({
        where: {
          order: {
            deletedAt: null,
            OR: [
              { orderNumber: soBase },
              { orderNumber: { startsWith: `${soBase}.` } },
              { orderNumber: { startsWith: `${soBase}_` } },
            ],
          },
        },
        select: { lineNumber: true },
      });
      const maxLineNumber = siblingItems.reduce((max, i) => Math.max(max, i.lineNumber), 0);

      // Nếu base MO# (đã gõ tay hoặc auto-sinh) TRÙNG với 1 MO đã tồn tại trong cùng họ SO
      // (kể cả bản đã hủy/hoàn tất — VD user tạo lại MO sau khi hủy bản cũ) → phải gán hậu
      // tố phiên bản kế tiếp, không được ghi bare (bare sẽ hiển thị ngầm định "_1", trùng
      // với bản cũ). Bare được coi là "phiên bản 1 ngầm định" ở tầng hiển thị → phiên bản
      // MỚI đầu tiên phải là "_2" (cùng quy tắc với luồng "Tạo phiên bản mới khi lưu").
      const rawMoList = items.map((item, idx) => {
        const lineNum = maxLineNumber + idx + 1;
        const autoMoNumber = lineNum === 1 ? order.orderNumber : `${order.orderNumber}-${lineNum}`;
        return (item.moNumber?.trim() || autoMoNumber);
      });
      const moNextVerMap = new Map<string, number>();
      for (const rawMo of rawMoList) {
        const moBase = stripVersionSuffix(rawMo);
        if (moNextVerMap.has(moBase)) continue; // dedupe — nhiều item cùng base trong 1 lần thêm
        const existingMoItems = await tx.orderItem.findMany({
          where: {
            OR: [
              { moNumber: moBase },
              { moNumber: { startsWith: `${moBase}.` } },
              { moNumber: { startsWith: `${moBase}${NEW_VERSION_SEPARATOR}` } },
            ],
            order: {
              OR: [
                { orderNumber: soBase },
                { orderNumber: { startsWith: `${soBase}.` } },
                { orderNumber: { startsWith: `${soBase}_` } },
              ],
            },
          },
          select: { moNumber: true },
        });
        if (existingMoItems.length === 0) continue; // chưa từng tồn tại → giữ bare như cũ
        let moVerNum = 0;
        for (const mi of existingMoItems) {
          if (!mi.moNumber) continue;
          const n = versionOf(mi.moNumber);
          if (n > moVerNum) moVerNum = n;
        }
        moNextVerMap.set(moBase, Math.max(moVerNum, 1) + 1);
      }

      const created = await Promise.all(
        items.map((item, idx) => {
          const lineNum = maxLineNumber + idx + 1;
          const rawMo = rawMoList[idx];
          const moBase = stripVersionSuffix(rawMo);
          const nextVer = moNextVerMap.get(moBase);
          const finalMoNumber = nextVer != null ? `${moBase}${NEW_VERSION_SEPARATOR}${nextVer}` : rawMo;

          // Zone của MO mới theo ĐÚNG lựa chọn PSX/PTK user chọn lúc thêm (item.zone) —
          // không ép theo zone hiện tại của SO. Không chọn gì → như cũ (ăn theo SO).
          const itemZone = item.zone ?? order.zone;
          // MO mới phải có itemStatus RIÊNG (không để null tự suy theo order.status) khi:
          // (a) SO đã Hoàn tất/Đã hủy — tránh MO mới hiện sai tab theo trạng thái SO cũ, hoặc
          // (b) zone của MO khác zone của SO — 1 SO giờ có thể "pha trộn" PTK + PSX, MO mới
          //     không nên kế thừa status của zone khác (VD trạng thái PTK vô nghĩa với MO PSX).
          const zoneDiffersFromOrder = itemZone !== order.zone;
          const newItemStatus = (isTerminalOrder || zoneDiffersFromOrder)
            ? (itemZone === "MASTER_HUB" ? "IN_PRODUCTION" as const : "DRAFT" as const)
            : null;

          // Per-MO scheduling & priority: dùng giá trị user gõ cho MO này nếu có,
          // bỏ trống thì kế thừa giá trị hiện tại của SO. Không đụng vào Order → MO cũ không đổi.
          const priorityCode = item.priorityCode || order.priorityCode;
          const { isPriority, isRush } = priorityCode === order.priorityCode
            ? { isPriority: order.isPriority, isRush: order.isRush }
            : { isPriority: priorityCode === "UT1" || priorityCode === "UT2", isRush: priorityCode === "UT1" };

          // Ghi đè riêng cho MO này (Khách hàng/Sales/3 Sao/Link chat) — lưu vào specifications.
          // customerName/salesName dùng đúng key mà sidebar đã dùng sẵn cho Sales per-MO.
          // Nguồn KHÔNG có override — luôn dùng chung giá trị của SO.
          const specs: Record<string, unknown> = { ...(item.specifications ?? {}) };
          if (item.customerNameOverride !== undefined) specs.customerName = item.customerNameOverride;
          if (item.salesNameOverride !== undefined) specs.salesName = item.salesNameOverride;
          if (item.donHang3SaoOverride !== undefined) specs.donHang3SaoOverride = item.donHang3SaoOverride;
          if (item.linkChatOverride !== undefined) specs.linkChatOverride = item.linkChatOverride;
          // Route này CHỈ được gọi khi user thêm MO qua webapp (kể cả vào SO import cũ có
          // Order.createdById = null) — đánh dấu PER-MO để hiển thị "_1" ngầm định nhận đúng
          // MO này, không phụ thuộc vào nguồn gốc của Order cha.
          specs.createdViaWebapp = true;

          const estimatedDateVal = item.estimatedDate ? new Date(item.estimatedDate) : null;
          // Client giờ luôn gửi ĐÚNG giá trị đang hiển thị trên form (dù auto-tính hay tự
          // gõ tay) — không cần server tự bịa ra ngày nữa. Không nhận được (VD tab Phòng
          // Thiết Kế xóa sạch ngày) → lưu blank (null), đúng ý user "không chọn thì để trống".
          const requiredDateVal = item.requiredDate ? new Date(item.requiredDate) : null;

          return tx.orderItem.create({
            data: {
              orderId: id,
              lineNumber: lineNum,
              moNumber: finalMoNumber,
              // Ngày tạo RIÊNG cho MO mới (không set → null → UI fallback về order.orderDate,
              // tức ngày tạo của SO gốc — sai khi thêm MO vào 1 SO đã tạo từ trước).
              orderDate: new Date(),
              zone: itemZone,
              itemStatus: newItemStatus,
              productName: item.productName,
              nvl: item.nvl ?? null,
              quantity: item.quantity ?? 1,
              weightGram: item.weightGram,
              size: item.size ?? null,
              platingType: item.platingType ?? null,
              mainStoneType: item.mainStoneType ?? null,
              mainStoneSize: item.mainStoneSize ?? null,
              techNote: item.techNote ?? null,
              designFileUrl: item.designFileUrl ?? null,
              specifications: (Object.keys(specs).length > 0 ? specs : null) as Prisma.InputJsonValue,
              // Mỗi MO có Ngày Chốt SX / Ngày DK HT ĐỘC LẬP — không kế thừa order.estimatedDate/
              // requiredDate (giá trị cấp SO, "đóng băng" từ lúc MO đầu tiên tạo SO, có thể đã
              // lỗi thời so với MO mới). Không nhập estimatedDate → để trống; không nhập
              // requiredDate → server tự tính theo SLA (xem requiredDateVal ở trên).
              estimatedDate: estimatedDateVal,
              requiredDate: requiredDateVal,
              saleNote: item.saleNote ?? order.saleNote ?? null,
              priorityCode,
              isPriority,
              isRush,
            },
          });
        })
      );

      // Bump version for optimistic concurrency
      await tx.order.update({
        where: { id },
        data: { version: { increment: 1 } },
      });

      await tx.workflowHistory.create({
        data: {
          orderId: id,
          action: "FIELD_UPDATED",
          performedById: currentUser.dbId,
          metadata: {
            addedCount: items.length,
            moNumbers: created.map((i) => i.moNumber),
          },
        },
      });

      return { tag: "OK", items: created } as const;
    });

    if (result.tag === "NOT_FOUND") return Errors.notFound("Đơn hàng không tồn tại");

    return ok({ items: result.items }, 201);
  } catch (err) {
    console.error("[POST /api/orders/[id]/items]", err);
    return Errors.internal();
  }
}
