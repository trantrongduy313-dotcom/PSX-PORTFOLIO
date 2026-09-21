import type { NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { getBaseSoNumber } from "@/app/lib/utils/order-helpers";
import { isLivePsxItem } from "@/app/lib/business/orders/psx-sibling";
import { duplicateMoConfirmText } from "@/app/lib/business/orders/duplicate-mo";
import {
  checkPromoteGate,
  effectiveContactName,
  effectivePromoteStatus,
} from "@/app/lib/business/orders/promote-gate";
// generateMoNumber removed — V2 logic: MO# = SO# by default

const promoteSchema = z.object({
  // performedById optional — dùng "system" cho đến khi có auth
  performedById: z.string().min(1).optional(),
  // V2 ref: MO# mặc định = SO# khi chỉ có 1 item; user có thể nhập thủ công
  productionCode: z.string().max(100).optional(),
  workshopCode: z.string().max(50).optional(),
  workshopName: z.string().max(255).optional(),
  supervisorName: z.string().max(255).optional(),
  internalNote: z.string().max(2000).optional(),
  comment: z.string().max(1000).optional(),
  // Per-MO: khi chỉnh sửa MO cụ thể, status được lưu vào OrderItem.itemStatus
  activeItemId: z.string().optional(),
  // Optimistic concurrency
  version: z.number().int().min(1),
  // Force promote: bỏ qua kiểm tra status/KH/Sales khi user xác nhận chủ động
  force: z.boolean().optional(),
  /**
   * Người dùng ĐÃ XÁC NHẬN cho phép cùng một MO có hai phiên bản ở PSX.
   *
   * CỜ RIÊNG, không dùng lại `force`: `force` bỏ qua ba phép kiểm khác (trạng thái, Khách hàng,
   * Sales). Gộp vào là xác nhận một chuyện lại âm thầm bỏ qua ba chuyện khác.
   */
  allowDuplicateMo: z.boolean().optional(),
});

// ─── POST /api/orders/[id]/promote ───────────────────────────────────────────
// Moves an order from PRE_PRODUCTION → MASTER_HUB.
//
// Pre-conditions (enforced):
//   - Order must be in PRE_PRODUCTION zone
//   - Status must be DESIGN_APPROVED
//   - Order must not be suspended
//
// Effects:
//   - zone: MASTER_HUB
//   - status: PENDING_PRODUCTION
//   - Creates ProductionDetail record
//   - Increments version
//   - Appends WorkflowHistory (ZONE_MOVED)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return Errors.forbidden();
  if (!["ADMIN", "ORDER"].includes(user.role)) return Errors.forbidden();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.badRequest("Invalid JSON body");
  }

  const parsed = promoteSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.validationFailed(parsed.error.issues);
  }

  const {
    productionCode: productionCodeInput,
    workshopCode,
    workshopName,
    supervisorName,
    internalNote,
    comment,
    version,
    activeItemId,
    force,
    allowDuplicateMo,
  } = parsed.data;

  // Ghi lại quyết định "cho phép trùng MO" để đưa vào WorkflowHistory sau. Một quyết định ảnh
  // hưởng tới XƯỞNG mà không để dấu thì tháng sau không ai trả lời được "ai cho phép".
  let duplicateAllowed: { existingMoNumber: string; existingOrderNumber: string } | null = null;

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const order = await tx.order.findUnique({
        where: { id, deletedAt: null },
        // V2: cần check NVL của items → include items
        include: { items: true },
      });

      if (!order) return { tag: "NOT_FOUND" } as const;

      if (order.version !== version) {
        return { tag: "CONFLICT" } as const;
      }

      // Per-MO: when activeItemId provided, check that specific item's zone
      const activeItemInOrder = activeItemId
        ? order.items.find((i) => i.id === activeItemId)
        : null;

      if (activeItemId) {
        // Per-MO promote: the item itself must still be in PRE_PRODUCTION
        if (!activeItemInOrder) return { tag: "NOT_FOUND" } as const;
        if ((activeItemInOrder as any).zone !== "PRE_PRODUCTION") {
          return { tag: "WRONG_ZONE", zone: (activeItemInOrder as any).zone } as const;
        }
      } else {
        // Order-level promote: the whole order must be in PRE_PRODUCTION
        if (order.zone !== "PRE_PRODUCTION") {
          return { tag: "WRONG_ZONE", zone: order.zone } as const;
        }
      }

      const activeSpecs = (activeItemInOrder?.specifications ?? {}) as Record<string, unknown>;
      const itemsToPromote = activeItemId ? [activeItemInOrder!] : order.items;

      const effectiveStatus = effectivePromoteStatus(
        activeItemInOrder ? (activeItemInOrder as any).itemStatus : null,
        order.status,
      );

      const blocked = checkPromoteGate({
        effectiveStatus,
        isSuspended: order.isSuspended,
        customerName: activeItemId
          ? effectiveContactName(activeSpecs.customerName, order.customerName)
          : (order.customerName ?? "").trim(),
        salesName: activeItemId
          ? effectiveContactName(activeSpecs.salesName, order.salesName)
          : (order.salesName ?? "").trim(),
        hasNvl: itemsToPromote.some((item) => Boolean(item?.nvl?.trim())),
        force: Boolean(force),
      });
      if (blocked) return blocked;

      // V2 ref: generateMoId() — MO# = SO# khi chỉ có 1 item (mặc định)
      // Strip version suffix từ item.moNumber (26.432113.1 → 26.432113) cho xưởng
      const firstItemMoNumber = order.items[0]?.moNumber;
      const productionCode = productionCodeInput?.trim() ||
        getBaseSoNumber(firstItemMoNumber ?? order.orderNumber);

      // Collision check ở MO# level (không phải SO# level):
      // 26.432113.1 và 26.42432 là 2 MO khác nhau dù cùng SO → không block nhau
      // Chỉ block khi base MO# của item đang promote đã có mặt trong PSX
      const baseMoNumbers = [...new Set(
        order.items.map(item => getBaseSoNumber(item.moNumber ?? order.orderNumber))
      )];
      // Block only when the SAME SO lineage already has the same MO# in PSX.
      // Two completely different SOs can share a MO# without being a collision.
      const currentBaseSo = getBaseSoNumber(order.orderNumber);
      // findMany, KHÔNG findFirst: phải LỌC BẢN HUỶ Ở TẦNG JS bằng đúng vị từ mà huy hiệu dùng
      // (isLivePsxItem). Diễn đạt "(itemStatus ?? orderStatus) != CANCELLED" bằng cú pháp where
      // của Prisma được, nhưng đó là viết lại luật lần thứ hai — và lần lệch đầu tiên chính là
      // cái đang phải sửa ở đây. Tập kết quả nhỏ (cùng một họ MO) nên lọc ở JS không tốn gì.
      const psxCandidates = await tx.orderItem.findMany({
        where: {
          orderId: { not: id },
          order: { zone: "MASTER_HUB", deletedAt: null },
          OR: baseMoNumbers.flatMap(baseMo => [
            { moNumber: baseMo },
            { moNumber: { startsWith: `${baseMo}.` } },
            // ⚠️ HẬU TỐ "_" TỪNG BỊ BỎ QUÊN Ở ĐÂY, và đó là một lỗi thật:
            //
            // Mọi phiên bản MO tạo từ nay đều dùng "_" (NEW_VERSION_SEPARATOR); chỉ dữ liệu cũ
            // dùng ".". Thiếu dòng này thì phép kiểm trùng KHÔNG BAO GIỜ bắt được phiên bản mới,
            // nên 26.42341_1 và 26.42341_2 cùng vào PSX mà không có gì báo — tức ý định "một base
            // MO chỉ một bản trong PSX" của chính route này chưa từng chạy đúng với dữ liệu mới.
            //
            // Cùng lớp lỗi "." vs "_" đã sửa ở tầng hiển thị (getMoVersionDisplay), nhưng chỗ này
            // bị bỏ sót vì nó nằm trong một truy vấn, không nằm ở chỗ ai cũng nhìn.
            { moNumber: { startsWith: `${baseMo}_` } },
          ]),
        },
        select: {
          moNumber: true,
          itemStatus: true,
          order: { select: { orderNumber: true, status: true } },
        },
      });

      // Chỉ tính bản CÒN HIỆU LỰC, và chỉ tính khi CÙNG HỌ SO.
      // Khác SO mà tình cờ trùng MO# thì không phải xung đột.
      const liveDuplicate = psxCandidates.find(
        (it) =>
          isLivePsxItem({ itemStatus: it.itemStatus, orderStatus: it.order!.status }) &&
          getBaseSoNumber(it.order!.orderNumber) === currentBaseSo,
      );

      if (liveDuplicate) {
        const duplicateInfo = {
          existingMoNumber: liveDuplicate.moNumber ?? firstItemMoNumber ?? order.orderNumber,
          existingOrderNumber: liveDuplicate.order!.orderNumber,
        };

        // ─── CHẶN → XÁC NHẬN ────────────────────────────────────────────────
        //
        // Trước đây đây là một lỗi 400 dứt khoát. Nhưng nghiệp vụ có thật: cùng một MO ở hai phiên
        // bản vẫn có thể cùng nằm ở xưởng, và người điều hành cần được QUYẾT, không bị khoá.
        // Đúng học thuyết đã ghi ở psx-sibling.ts và commit "chỉ báo, không khoá".
        //
        // CỜ RIÊNG, KHÔNG DÙNG LẠI `force`: `force` hiện bỏ qua BA phép kiểm khác (trạng thái,
        // Khách hàng, Sales). Gộp vào nghĩa là xác nhận "có bản trùng" ÂM THẦM bỏ luôn ba phép
        // kiểm không liên quan. Một cờ, một nghĩa.
        if (!allowDuplicateMo) {
          return { tag: "DUPLICATE_MO", ...duplicateInfo } as const;
        }

        // KHÔNG kiểm quyền lại ở đây: dòng 64 đã chặn cả route cho ADMIN/ORDER, nên mọi request
        // tới được chỗ này đều đã đủ quyền. Thêm một nhánh nữa là để lại code KHÔNG BAO GIỜ CHẠY,
        // và một nhánh chết còn tệ hơn không có — nó hàm ý một phân biệt không tồn tại.
        // `canAllowDuplicateMo` vẫn dùng ở CLIENT để quyết định có hiện nút "Vẫn chuyển" hay không.
        duplicateAllowed = duplicateInfo;
      }

      // Per-MO independence: check if all items will be in MASTER_HUB after this promote.
      // Only flip order.zone/status when the LAST PTK item is promoted.
      const remainingPtkItems = activeItemId
        ? order.items.filter((i) => i.id !== activeItemId && (i as any).zone === "PRE_PRODUCTION")
        : [];
      const isFullOrderPromote = !activeItemId || remainingPtkItems.length === 0;

      // Set zone = MASTER_HUB for the promoted item(s)
      const itemFilter = activeItemId ? { id: activeItemId } : { orderId: id };
      await tx.orderItem.updateMany({
        where: itemFilter,
        data: {
          zone: "MASTER_HUB",
          // Mixed order (more PTK items remain): track per-item status = IN_PRODUCTION
          // so the PSX tab can display this MO correctly without order-level help.
          // Full promote (all items moving): reset to null — order.status takes over.
          itemStatus: isFullOrderPromote ? null : "IN_PRODUCTION",
        },
      });

      // Khởi tạo / cập nhật ProductionDetail.
      // V2 ref: _promoteChot3DToMasterHub() — tạo dòng mới trong MASTER_HUB.
      // Lưu ý: rollback giờ GIỮ lại ProductionDetail (để bảo toàn dữ liệu Thiết Kế),
      // chỉ xóa dữ liệu sản xuất + setup. Vì vậy khi re-promote PD có thể đã tồn tại
      // nhưng các setup-field (productionCode/workshop/...) đang null → phải SET lại,
      // không được bỏ qua. Nếu chỉ create-when-absent thì đơn re-promote sẽ thiếu MO#.
      const existingDetail = await tx.productionDetail.findUnique({ where: { orderId: id } });
      const setupData = {
        productionCode,
        workshopCode,
        workshopName,
        supervisorName,
        internalNote,
      };
      if (!existingDetail) {
        await tx.productionDetail.create({
          data: { orderId: id, ...setupData },
        });
      } else {
        await tx.productionDetail.update({
          where: { orderId: id },
          data: setupData,
        });
      }
      const updated = await tx.order.update({
        where: { id },
        data: {
          // Only move order to MASTER_HUB when every item is now in PSX.
          // For mixed orders (some PTK items remain), preserve order.zone/status
          // so sibling PTK items continue to display their correct PTK status.
          ...(isFullOrderPromote ? {
            zone: "MASTER_HUB",
            status: "IN_PRODUCTION",
          } : {}),
          version: { increment: 1 },
        },
        include: {
          items: { orderBy: { lineNumber: "asc" } },
          productionDetail: true,
          createdBy: { select: { id: true, name: true, role: true } },
          assignedTo: { select: { id: true, name: true, role: true } },
        },
      });

      await tx.workflowHistory.create({
        data: {
          orderId: id,
          action: "ZONE_MOVED",
          fromStatus: effectiveStatus,
          toStatus: "IN_PRODUCTION",
          fromZone: "PRE_PRODUCTION",
          toZone: isFullOrderPromote ? "MASTER_HUB" : "PRE_PRODUCTION",
          comment,
          performedById: user.dbId,
          metadata: {
            productionCode,
            ...(activeItemId ? { activeItemId, moNumber: activeItemInOrder?.moNumber } : {}),
            ...(force && effectiveStatus !== "DESIGN_APPROVED"
              ? { forcePromote: true, originalStatus: effectiveStatus }
              : {}),
            // Ai cho phép hai phiên bản cùng một MO vào xưởng, và trùng với bản nào. Quyết định
            // này ảnh hưởng tới XƯỞNG; không để dấu thì tháng sau không ai trả lời được "ai cho".
            ...(duplicateAllowed
              ? {
                  duplicateMoAllowed: true,
                  duplicateMoExisting: duplicateAllowed.existingMoNumber,
                  duplicateMoExistingOrder: duplicateAllowed.existingOrderNumber,
                }
              : {}),
          },
        },
      });

      return { tag: "OK", data: updated } as const;
    }, { maxWait: 10_000, timeout: 30_000 });

    switch (result.tag) {
      case "NOT_FOUND":
        return Errors.notFound("Order");
      case "CONFLICT":
        return Errors.conflict(
          "Đơn hàng đã được cập nhật bởi người dùng khác. Vui lòng tải lại."
        );
      case "WRONG_ZONE":
        return Errors.badRequest(
          `Đơn không ở Phòng Thiết Kế (zone: ${result.zone}). Chỉ đơn PRE_PRODUCTION mới được chuyển.`
        );
      case "WRONG_STATUS":
        return Errors.badRequest(
          `Trạng thái hiện tại là '${result.status}'. Cần chuyển trạng thái sang "Chốt 3D — Chuyển xưởng" trước.`
        );
      case "SUSPENDED":
        return Errors.badRequest(
          "Đơn đang TẠM NGƯNG. Giải quyết hết cảnh báo trước khi chuyển xưởng."
        );
      // V2 ref: validate() — KHÁCH HÀNG / SALES / NVL bắt buộc
      case "MISSING_CUSTOMER":
        return Errors.badRequest("Thiếu thông tin Khách hàng — vui lòng điền trước khi chuyển.");
      case "MISSING_SALES":
        return Errors.badRequest("Thiếu thông tin Sales — vui lòng điền trước khi chuyển.");
      case "MISSING_NVL":
        return Errors.badRequest(
          "Chưa nhập NVL cho sản phẩm — vui lòng điền NVL ở Tab 'Sản phẩm' trước khi chuyển."
        );
      case "DUPLICATE_MO":
        // 428, KHÔNG phải 400 và cũng KHÔNG phải 409: đây không còn là "yêu cầu sai" mà là
        // "cần người quyết". Client bắt theo `code` rồi hiện HỘP XÁC NHẬN và gửi lại kèm
        // allowDuplicateMo, thay vì một thông báo đỏ mà người dùng không có đường đi tiếp.
        //
        // ⚠️ 409 trong dự án này đã có nghĩa "đơn vừa bị người khác sửa, tải lại đi", và client bắt
        // nó theo STATUS rồi ném Error("CONFLICT") trần — mượn 409 là người dùng nhận đúng một chữ
        // "CONFLICT" cùng một lời khuyên tải lại chẳng liên quan gì.
        return Errors.preconditionRequired(duplicateMoConfirmText(result), {
          code: "DUPLICATE_MO",
          existingMoNumber: result.existingMoNumber,
          existingOrderNumber: result.existingOrderNumber,
        });
      case "OK":
        return ok(result.data);
    }
  } catch (e) {
    console.error("[POST /api/orders/:id/promote]", e);
    return Errors.internal();
  }
}
