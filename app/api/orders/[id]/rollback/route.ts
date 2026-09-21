import type { NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/app/lib/prisma";
import type { Prisma, OrderStatus } from "@/app/generated/prisma/client";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { checkActionRateLimit, rateLimitMessage } from "@/app/lib/rate-limit";
import {
  assertNoKpiLeftBehind,
  requireCarryTarget,
} from "@/app/lib/business/orders/rollback-kpi-carry";

// ─── Production reset ─────────────────────────────────────────────────────────
// Khi rollback về PTK: xóa toàn bộ dữ liệu SẢN XUẤT (stage columns, setup, QC,
// shipping...) nhưng GIỮ ProductionDetail row để bảo toàn dữ liệu Thiết Kế trong
// extraData. productionCode set null → re-promote sẽ gán lại MO# (xem promote route).
const PRODUCTION_COLUMNS_RESET = {
  productionCode: null,
  workshopCode: null,
  workshopName: null,
  supervisorName: null,
  resinStartAt: null,     resinDoneAt: null,     resinCrafter: null,
  castingStartAt: null,   castingDoneAt: null,   castingCrafter: null,
  handcraftStartAt: null, handcraftDoneAt: null, handcraftCrafter: null,
  coldworkStartAt: null,  coldworkDoneAt: null,  coldworkCrafter: null,
  polishingStartAt: null, polishingDoneAt: null, polishingCrafter: null,
  settingStartAt: null,   settingDoneAt: null,   settingCrafter: null,
  machineStartAt: null,   machineDoneAt: null,   machineCrafter: null,
  platingStartAt: null,   platingDoneAt: null,   platingCrafter: null,
  qcStartAt: null,        qcDoneAt: null,        qcCrafter: null,
  packagingDoneAt: null,
  materialReceived: false,
  materialNote: null,
  qcResult: null,
  qcNote: null,
  reworkCount: 0,
  shippingCarrier: null,
  trackingNumber: null,
  deliveredAt: null,
  internalNote: null,
} satisfies Prisma.ProductionDetailUpdateInput;

// Rút gọn extraData về đúng shape của một đơn PTK gốc: chỉ giữ dữ liệu Thiết Kế
// (design shared, tho3d, và perItem[*].design). Loại bỏ mọi dữ liệu sản xuất
// (stages, stageStatuses, holdReason, isChangeApproved, weights, kết quả HT, ...).
function buildDesignOnlyExtra(extra: unknown): Prisma.InputJsonValue {
  const e = (extra ?? {}) as Record<string, unknown>;
  const kept: Record<string, unknown> = {};
  if (e.tho3d != null) kept.tho3d = e.tho3d;
  if (e.design != null) kept.design = e.design;
  const perItem = (e.perItem as Record<string, unknown> | undefined) ?? null;
  if (perItem) {
    const keptPerItem: Record<string, unknown> = {};
    for (const [itemId, val] of Object.entries(perItem)) {
      const v = (val as Record<string, unknown> | null) ?? {};
      const keptItem: Record<string, unknown> = {};
      if (v.design != null) keptItem.design = v.design;
      // Thợ 3D độc lập theo MO — phải giữ per-item, không chỉ root, nếu không
      // rollback sẽ làm mất giá trị riêng và quay lại dùng chung cấp SO.
      if (v.tho3d != null) keptItem.tho3d = v.tho3d;
      if (Object.keys(keptItem).length > 0) keptPerItem[itemId] = keptItem;
    }
    if (Object.keys(keptPerItem).length > 0) kept.perItem = keptPerItem;
  }
  return kept as Prisma.InputJsonValue;
}

const rollbackSchema = z.object({
  performedById: z.string().min(1).optional(),
  version: z.number().int().min(1),
  reason: z.string().min(1).max(1000),
  comment: z.string().max(1000).optional(),
  // V2 ref: rollback về PRE_PRODUCTION với trạng thái do user chọn
  // Mặc định "IN_DESIGN" = "Đang thiết kế" (khớp V2 default khi chuyển về thiết kế)
  targetStatus: z
    .enum(["DRAFT", "PENDING_DESIGN", "IN_DESIGN", "DESIGN_REVIEW"])
    .optional()
    .default("IN_DESIGN"),
  // Snapshot the Master Hub state before discarding it
  createSnapshot: z.boolean().optional().default(true),
  // Per-MO rollback: chỉ rollback item này, không ảnh hưởng MO khác cùng SO
  activeItemId: z.string().optional(),
});

// ─── POST /api/orders/[id]/rollback ──────────────────────────────────────────
// Sends an order (or a single MO within a multi-item order) back to PRE_PRODUCTION.
//
// V2 ref: rollbackToPreProduction(moId) in 02_MasterHub.js
//   - Each MO was a separate row; rollback = delete from MASTER_HUB, append to PRE_PRODUCTION
//   - Fields preserved: SALES_FORM_COLS (customer/product info)
//   - Fields cleared: production data (stages, TL, QĐ, etc.)
//   - Status reset to "Chưa thiết kế"
//
// V3 implementation:
//   - If activeItemId provided AND order has multiple items:
//       → Create new Order in PRE_PRODUCTION with just that item (V2 row-per-MO equivalent)
//       → Delete item from original MASTER_HUB order
//   - Otherwise (single item, or no activeItemId):
//       → Change order.zone to PRE_PRODUCTION, delete ProductionDetail

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return Errors.forbidden();
  if (!["ADMIN", "ORDER"].includes(user.role)) return Errors.forbidden();

  if (user.dbId) {
    const rl = await checkActionRateLimit(user.dbId, "ROLLBACK_ORDER");
    if (!rl.allowed) return Errors.badRequest(rateLimitMessage("ROLLBACK_ORDER", rl.retryAfterMs ?? 0));
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.badRequest("Invalid JSON body");
  }

  const parsed = rollbackSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.validationFailed(parsed.error.issues);
  }

  const { version, reason, comment, targetStatus, createSnapshot, activeItemId } = parsed.data;
  const dbUserId = user.dbId;

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const order = await tx.order.findUnique({
        where: { id, deletedAt: null },
        include: { items: true, productionDetail: true },
      });

      if (!order) return { tag: "NOT_FOUND" } as const;
      if (order.version !== version) return { tag: "CONFLICT" } as const;
      const hasAnyPsxItem = order.items.some((i) => (i as any).zone === "MASTER_HUB");
      if (order.zone !== "MASTER_HUB" && !hasAnyPsxItem) {
        return { tag: "WRONG_ZONE", zone: order.zone } as const;
      }
      // Per-MO: if activeItemId given, verify that specific item is in MASTER_HUB
      if (activeItemId) {
        const targetItem = order.items.find((i) => i.id === activeItemId);
        if (targetItem && (targetItem as any).zone !== "MASTER_HUB") {
          return { tag: "WRONG_ZONE", zone: (targetItem as any).zone } as const;
        }
      }

      // ─── Terminal status check (per-item or per-order) ─────────────────────
      if (activeItemId) {
        const activeItem = order.items.find((i) => i.id === activeItemId);
        if (!activeItem) return { tag: "ITEM_NOT_FOUND" } as const;
        const eff = (activeItem as any).itemStatus ?? order.status;
        if (eff === "COMPLETED" || eff === "CANCELLED") {
          return { tag: "TERMINAL_STATUS", status: eff } as const;
        }
      } else {
        if (order.status === "COMPLETED" || order.status === "CANCELLED") {
          return { tag: "TERMINAL_STATUS", status: order.status } as const;
        }
      }

      // ─── Per-MO rollback (multi-item): tách MO về PTK riêng ────────────────
      if (activeItemId) {
        const activeItem = order.items.find((i) => i.id === activeItemId)!;
        const otherItems = order.items.filter((i) => i.id !== activeItemId);

        if (otherItems.length > 0) {
          // V2 ref: "delete row from MASTER_HUB, append to PRE_PRODUCTION"
          // V3: create new Order in PRE_PRODUCTION with just this item, then remove from original

          // Tìm số version tiếp theo cho orderNumber của order mới
          let baseOrderNumber = order.orderNumber;
          const oParts = order.orderNumber.split(".");
          if (oParts.length >= 3) {
            const last = parseInt(oParts[oParts.length - 1], 10);
            if (!isNaN(last) && String(last) === oParts[oParts.length - 1]) {
              baseOrderNumber = oParts.slice(0, -1).join(".");
            }
          }

          const existingVersioned = await tx.order.findMany({
            where: { orderNumber: { startsWith: `${baseOrderNumber}.` }, deletedAt: null },
            select: { orderNumber: true },
          });

          let maxVer = 0;
          if (oParts.length >= 3) {
            const currN = parseInt(oParts[oParts.length - 1], 10);
            if (!isNaN(currN)) maxVer = currN;
          }
          for (const ex of existingVersioned) {
            const exParts = ex.orderNumber.split(".");
            if (exParts.length >= 3) {
              const n = parseInt(exParts[exParts.length - 1], 10);
              if (!isNaN(n) && String(n) === exParts[exParts.length - 1] && n > maxVer) {
                maxVer = n;
              }
            }
          }
          const newOrderNumber = `${baseOrderNumber}.${maxVer + 1}`;

          // Chuẩn bị item data (bỏ các cột DB-managed)
          const { id: _iid, orderId: _oId, createdAt: _icAt, updatedAt: _iuAt, ...itemData } =
            activeItem as any;

          // V2 ref: SALES_FORM_COLS — giữ thông tin KH/SP, xóa dữ liệu sản xuất
          const newOrder = await tx.order.create({
            data: {
              orderNumber: newOrderNumber,
              orderDate:   order.orderDate,
              zone:        "PRE_PRODUCTION",
              status:      targetStatus as OrderStatus,
              version:     1,
              isSuspended: false,
              completedDate: null,
              // Thông tin KH + Sales (preserved — V2 SALES_FORM_COLS)
              customerName:  order.customerName,
              customerPhone: order.customerPhone,
              customerEmail: order.customerEmail,
              salesName:     order.salesName,
              nguon:         order.nguon,
              phanLoaiKh:    order.phanLoaiKh,
              donHang3Sao:   order.donHang3Sao,
              linkChat:      order.linkChat,
              saleNote:      order.saleNote,
              priorityCode:  order.priorityCode,
              isPriority:    order.isPriority,
              isRush:        order.isRush,
              requiredDate:  order.requiredDate,
              estimatedDate: order.estimatedDate,
              storeId:       order.storeId,
              createdById:   order.createdById,
              assignedToId:  order.assignedToId,
              designBriefUrl: order.designBriefUrl,
              referenceUrls:  order.referenceUrls,
              // Dữ liệu sản xuất KHÔNG copy sang (cleared on rollback)
              // productionDetail sẽ được tạo mới khi promote lần sau
              items: {
                create: [{
                  ...itemData,
                  zone: "PRE_PRODUCTION",
                  itemStatus: null,
                }],
              },
            },
            include: {
              items: { orderBy: { lineNumber: "asc" } },
              createdBy: { select: { id: true, name: true, role: true } },
              assignedTo: { select: { id: true, name: true, role: true } },
              _count: { select: { versions: true } },
            },
          });

          // Bảo toàn dữ liệu Thiết Kế cho đơn PTK mới: tạo ProductionDetail chỉ chứa
          // design + tho3d (shared + của item này), remap key perItem từ item cũ → item mới.
          // Cùng pattern với version-copy. KHÔNG copy stages/columns sản xuất.
          // tho3d per-item phải giữ riêng — nếu không sẽ mất giá trị độc lập của MO này.
          const srcExtra = (order.productionDetail?.extraData ?? null) as Record<string, unknown> | null;
          if (srcExtra) {
            const newItemId = newOrder.items[0]?.id;
            const srcPerItem = (srcExtra.perItem as Record<string, unknown> | undefined) ?? {};
            const srcItemData = (srcPerItem[activeItemId] as Record<string, unknown> | undefined) ?? {};
            const srcItemDesign = srcItemData.design;
            const srcItemTho3d = srcItemData.tho3d;
            const newExtra: Record<string, unknown> = {};
            if (srcExtra.tho3d != null) newExtra.tho3d = srcExtra.tho3d;
            if (srcExtra.design != null) newExtra.design = srcExtra.design;
            if (newItemId && (srcItemDesign != null || srcItemTho3d != null)) {
              newExtra.perItem = {
                [newItemId]: {
                  ...(srcItemDesign != null ? { design: srcItemDesign } : {}),
                  ...(srcItemTho3d != null ? { tho3d: srcItemTho3d } : {}),
                },
              };
            }
            if (Object.keys(newExtra).length > 0) {
              await tx.productionDetail.create({
                data: { orderId: newOrder.id, extraData: newExtra as Prisma.InputJsonValue },
              });
            }
          }

          // ── Lịch sử KPI 3D phải ĐI THEO MO, không được cascade mất ──────────────
          //
          // Quan hệ duy nhất trỏ tới OrderItem là Design3DAssignment (schema.prisma:741) với
          // onDelete: Cascade, và từ đó cascade tiếp xuống ProgressLog / Pause / Overtime. Nên
          // lệnh xoá ngay dưới ĐÃ TỪNG thổi bay toàn bộ chuỗi chấm công của MO này — âm thầm,
          // không phục hồi được, và chỉ lộ ra ở kỳ lương.
          //
          // Lùi khâu KHÔNG huỷ công việc: MO sống tiếp ở đơn PTK mới. Nên chuyển các lượt sang
          // đơn/dòng hàng mới là cách vừa giữ dữ liệu vừa giữ đúng nghĩa. Nó còn khiến
          // `kpi3DAssignmentId` vốn được COPY sang extraData của đơn mới trỏ đúng trở lại —
          // trước đây id đó tham chiếu một dòng vừa bị xoá.
          const carryItemId = requireCarryTarget(newOrder.items[0]?.id, activeItem.moNumber ?? null);
          await tx.design3DAssignment.updateMany({
            where: { orderItemId: activeItemId },
            data:  { orderId: newOrder.id, orderItemId: carryItemId },
          });

          // Chốt chặn cuối: ĐỔI LỖI ÂM THẦM LẤY LỖI ỒN ÀO. Còn sót dòng nào bám vào item cũ thì
          // dừng cả giao dịch, thay vì để Postgres lặng lẽ cascade.
          assertNoKpiLeftBehind(
            await tx.design3DAssignment.count({ where: { orderItemId: activeItemId } }),
            activeItem.moNumber ?? null,
          );

          // Xóa item khỏi order gốc (V2: deleteRow from MASTER_HUB)
          await tx.orderItem.delete({ where: { id: activeItemId } });

          // Tăng version order gốc để invalidate cache client
          await tx.order.update({
            where: { id },
            data: { version: { increment: 1 } },
          });

          // Resolve any unresolved alert that was associated with this specific item
          const rollbackSuspendEntry = await tx.workflowHistory.findFirst({
            where: {
              orderId: id,
              action: "SUSPENDED",
              metadata: { path: ["scopedItemId"], equals: activeItemId },
            },
            orderBy: { performedAt: "desc" },
            select: { metadata: true },
          });
          const rollbackAlertId = (rollbackSuspendEntry?.metadata as Record<string, unknown>)?.alertId as string | undefined;
          if (rollbackAlertId) {
            await tx.alert.update({
              where: { id: rollbackAlertId },
              data: { isResolved: true, resolvedAt: new Date(), resolvedNote: "Auto-resolved: Thiết kế lại" },
            });
          } else {
            // Fallback: resolve all unresolved alerts for this order (legacy)
            await tx.alert.updateMany({
              where: { orderId: id, isResolved: false },
              data: { isResolved: true, resolvedAt: new Date(), resolvedNote: "Auto-resolved: Thiết kế lại" },
            });
          }

          // Audit: order gốc
          await tx.workflowHistory.create({
            data: {
              orderId: id,
              action: "COMMENT_ADDED",
              comment: `MO ${(activeItem as any).moNumber ?? activeItemId} đã tách về PTK (${newOrderNumber}). Lý do: ${reason}`,
              performedById: dbUserId,
            },
          });

          // Audit: order mới (PTK)
          await tx.workflowHistory.create({
            data: {
              orderId:    newOrder.id,
              action:     "ZONE_MOVED",
              fromStatus: order.status as OrderStatus,
              toStatus:   targetStatus as OrderStatus,
              fromZone:   "MASTER_HUB",
              toZone:     "PRE_PRODUCTION",
              comment:    comment ?? reason,
              metadata:   { reason, isReturnedFromProduction: true, sourceOrderId: id },
              performedById: dbUserId,
            },
          });

          return { tag: "OK", data: newOrder } as const;
        }
        // Single item — fall through to order-level rollback below
      }

      // ─── Standard order-level rollback ────────────────────────────────────
      // (cả order chuyển về PRE_PRODUCTION — dùng khi không có activeItemId
      //  hoặc khi activeItemId là item duy nhất trong order)

      // 1. Snapshot trạng thái MASTER_HUB trước khi discard
      if (createSnapshot) {
        const latestVersion = await tx.orderVersion.findFirst({
          where: { orderId: id },
          orderBy: { versionNumber: "desc" },
          select: { versionNumber: true },
        });
        await tx.orderVersion.create({
          data: {
            orderId: id,
            versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
            snapshot: {
              ...order,
              items: order.items,
              productionDetail: order.productionDetail,
            },
            changesSummary: `Rollback from MASTER_HUB. Reason: ${reason}`,
            reason,
            createdById: dbUserId,   // null-safe: undefined → NULL khi virtual admin
          },
        });
      }

      // 2. GIỮ ProductionDetail nhưng xóa dữ liệu sản xuất, bảo toàn dữ liệu Thiết Kế.
      // (Trước đây delete cả row → mất sạch Thiết Kế. Đơn PTK vốn vẫn có PD vì tab
      //  Thiết Kế ghi design vào extraData, nên giữ row là đúng shape PTK.)
      if (order.productionDetail) {
        await tx.productionDetail.update({
          where: { orderId: id },
          data: {
            ...PRODUCTION_COLUMNS_RESET,
            extraData: buildDesignOnlyExtra(order.productionDetail.extraData),
          },
        });
      }

      // 2b. Reset all items' zone to PRE_PRODUCTION
      await tx.orderItem.updateMany({
        where: { orderId: id },
        data: { zone: "PRE_PRODUCTION", itemStatus: null },
      });

      // 2c. Resolve all unresolved alerts for this order (full rollback = all issues addressed)
      await tx.alert.updateMany({
        where: { orderId: id, isResolved: false },
        data: { isResolved: true, resolvedAt: new Date(), resolvedNote: "Auto-resolved: Thiết kế lại" },
      });

      // 3. Chuyển zone + reset status
      const updated = await tx.order.update({
        where: { id },
        data: {
          zone: "PRE_PRODUCTION",
          status: targetStatus,
          isSuspended: false,
          version: { increment: 1 },
        },
        include: {
          items: { orderBy: { lineNumber: "asc" } },
          createdBy: { select: { id: true, name: true, role: true } },
          assignedTo: { select: { id: true, name: true, role: true } },
          _count: { select: { versions: true } },
        },
      });

      // 4. Audit
      await tx.workflowHistory.create({
        data: {
          orderId: id,
          action: "ZONE_MOVED",
          fromStatus: order.status,
          toStatus: targetStatus,
          fromZone: "MASTER_HUB",
          toZone: "PRE_PRODUCTION",
          comment: comment ?? reason,
          metadata: { reason, snapshotCreated: createSnapshot },
          performedById: dbUserId,
        },
      });

      return { tag: "OK", data: updated } as const;
    }, { maxWait: 10_000, timeout: 30_000 });

    switch (result.tag) {
      case "NOT_FOUND":
        return Errors.notFound("Order");
      case "CONFLICT":
        return Errors.conflict(
          "Order was modified by another user. Reload and retry."
        );
      case "WRONG_ZONE":
        return Errors.badRequest(
          `Order is in ${result.zone}, not MASTER_HUB. Only Master Hub orders can be rolled back.`
        );
      case "TERMINAL_STATUS":
        return Errors.badRequest(
          `Order/Item is already ${result.status} and cannot be rolled back.`
        );
      case "ITEM_NOT_FOUND":
        return Errors.notFound("OrderItem");
      case "OK":
        return ok(result.data);
    }
  } catch (e) {
    console.error("[POST /api/orders/:id/rollback]", e);
    return Errors.internal();
  }
}
