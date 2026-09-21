import type { NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { checkActionRateLimit, rateLimitMessage } from "@/app/lib/rate-limit";

// ─── Action schemas (discriminated union) ────────────────────────────────────

const base = {
  performedById: z.string().min(1).optional(),
  version: z.number().int().min(1),
  comment: z.string().max(1000).optional(),
};

const resolveActionSchema = z.discriminatedUnion("action", [
  // Hủy đơn — any non-terminal status
  z.object({
    ...base,
    action: z.literal("CANCEL"),
    reason: z.string().min(1).max(1000),
  }),

  // Xin duyệt thiết kế — IN_DESIGN → DESIGN_REVIEW
  z.object({
    ...base,
    action: z.literal("SUBMIT_FOR_REVIEW"),
  }),

  // Duyệt thiết kế — DESIGN_REVIEW → DESIGN_APPROVED
  z.object({
    ...base,
    action: z.literal("APPROVE_DESIGN"),
  }),

  // Từ chối thiết kế — DESIGN_REVIEW → IN_DESIGN
  z.object({
    ...base,
    action: z.literal("REJECT_DESIGN"),
    reason: z.string().min(1).max(1000),
  }),

  // Phát sinh cảnh báo (CRITICAL → auto-suspend)
  z.object({
    ...base,
    action: z.literal("RAISE_ALERT"),
    alertType: z.enum([
      "SPECIAL",
      "MATERIAL_SHORTAGE",
      "RUSH_ORDER",
      "QUALITY_ISSUE",
      "DESIGN_CHANGE",
      "CUSTOMER_COMPLAINT",
    ]),
    alertSeverity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    alertTitle: z.string().min(1).max(255),
    alertDescription: z.string().max(2000).optional(),
  }),

  // Giải quyết cảnh báo
  z.object({
    ...base,
    action: z.literal("RESOLVE_ALERT"),
    alertId: z.string().min(1),
    resolvedNote: z.string().max(1000).optional(),
  }),

  // Tiếp tục sau tạm ngưng — V2 parity: convertToShowroom chuyển đơn thành Hàng Showroom
  z.object({
    ...base,
    action: z.literal("RESUME"),
    convertToShowroom: z.boolean().optional().default(false),
  }),

  // Chuyển xưởng — MASTER_HUB only
  z.object({
    ...base,
    action: z.literal("CHANGE_WORKSHOP"),
    workshopCode: z.string().max(50).optional(),
    workshopName: z.string().min(1).max(255),
    supervisorName: z.string().max(255).optional(),
    reason: z.string().max(1000).optional(),
  }),

  // QC đạt — QUALITY_CHECK → COMPLETED
  z.object({
    ...base,
    action: z.literal("MARK_QC_PASS"),
    qcNote: z.string().max(1000).optional(),
  }),

  // QC không đạt → rework (QUALITY_CHECK → IN_PRODUCTION)
  z.object({
    ...base,
    action: z.literal("MARK_QC_FAIL"),
    qcNote: z.string().min(1).max(1000),
  }),

  // Mở lại đơn đã Hoàn tất / Đã hủy — ADMIN/ORDER đưa MO về PSX hoặc PTK để chỉnh sửa.
  // GIỮ NGUYÊN mọi dữ liệu (chỉ đổi trạng thái + zone). Bắt buộc lý do để truy vết.
  z.object({
    ...base,
    action: z.literal("REOPEN"),
    target: z.enum(["PTK", "PSX"]),
    reason: z.string().min(1).max(1000),
    scopedItemId: z.string().min(1).optional(),
  }),
]);

type ResolveActionInput = z.infer<typeof resolveActionSchema>;

// ─── POST /api/orders/[id]/resolve-action ────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.badRequest("Invalid JSON body");
  }

  const parsed = resolveActionSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.validationFailed(parsed.error.issues);
  }

  const user = await getCurrentUser();
  if (!user) return Errors.forbidden();
  const { action } = parsed.data;
  const ADMIN_ORDER_ONLY = ["CANCEL", "APPROVE_DESIGN", "REJECT_DESIGN", "RESUME", "REOPEN"];
  const ADMIN_ORDER_PRODUCTION = ["MARK_QC_PASS", "MARK_QC_FAIL"];
  if (ADMIN_ORDER_ONLY.includes(action) && !["ADMIN", "ORDER"].includes(user.role)) {
    return Errors.forbidden();
  }
  if (ADMIN_ORDER_PRODUCTION.includes(action) && !["ADMIN", "ORDER", "PRODUCTION"].includes(user.role)) {
    return Errors.forbidden();
  }

  // Rate limit: CANCEL action — max 5 per hour per user
  if (parsed.data.action === "CANCEL" && user.dbId) {
    const rl = await checkActionRateLimit(user.dbId, "CANCEL_ORDER");
    if (!rl.allowed) return Errors.badRequest(rateLimitMessage("CANCEL_ORDER", rl.retryAfterMs ?? 0));
  }

  // Override performedById with the authenticated user — ignore client-provided value
  const inputWithUser = { ...parsed.data, performedById: user.dbId };

  try {
    const result = await prisma.$transaction(
      (tx: Prisma.TransactionClient) => handleAction(tx, id, inputWithUser),
      { maxWait: 10_000, timeout: 30_000 }
    );

    switch (result.tag) {
      case "NOT_FOUND":
        return Errors.notFound("Order");
      case "CONFLICT":
        return Errors.conflict(
          "Order was modified by another user. Reload and retry."
        );
      case "BAD_REQUEST":
        return Errors.badRequest(result.message);
      case "ALERT_NOT_FOUND":
        return Errors.notFound("Alert");
      case "OK":
        return ok(result.data);
    }
  } catch (e) {
    console.error("[POST /api/orders/:id/resolve-action]", e);
    return Errors.internal();
  }
}

// ─── Action handler (runs inside transaction) ────────────────────────────────

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

type ActionResult =
  | { tag: "NOT_FOUND" }
  | { tag: "CONFLICT" }
  | { tag: "BAD_REQUEST"; message: string }
  | { tag: "ALERT_NOT_FOUND" }
  | { tag: "OK"; data: unknown };

// Xuất ra để test được — bơm `tx` giả: __tests__/resolve-action-handler.test.ts
export async function handleAction(
  tx: TxClient,
  id: string,
  input: ResolveActionInput
): Promise<ActionResult> {
  const order = await tx.order.findUnique({
    where: { id, deletedAt: null },
    include: { productionDetail: true },
  });

  if (!order) return { tag: "NOT_FOUND" };
  if (order.version !== input.version) return { tag: "CONFLICT" };

  const { performedById: rawPerformedById, comment } = input;
  // performedById là nullable FK trong WorkflowHistory
  // Dùng null khi là "system" hoặc "VIRTUAL_ADMIN" (không tồn tại trong bảng users)
  const performedById =
    !rawPerformedById || rawPerformedById === "system" || rawPerformedById === "VIRTUAL_ADMIN"
      ? null
      : rawPerformedById;

  switch (input.action) {
    // ── CANCEL ──────────────────────────────────────────────────────────────
    // V2 parity: resolveMasterHubAction(moId, 'CANCEL_HANDOVER')
    // Hủy đơn, giải quyết tất cả cảnh báo đặc biệt, ghi nhận trọng lượng vàng cần thu hồi.
    case "CANCEL": {
      if (order.status === "COMPLETED" || order.status === "CANCELLED") {
        return {
          tag: "BAD_REQUEST",
          message: `Cannot cancel an order that is already ${order.status}.`,
        };
      }

      // Auto-resolve tất cả cảnh báo đặc biệt chưa xử lý
      await tx.alert.updateMany({
        where: { orderId: id, isResolved: false },
        data: { isResolved: true, resolvedAt: new Date(), resolvedNote: "Auto-resolved: Đơn hàng bị hủy" },
      });

      // V2 parity: Lấy trọng lượng vàng xưởng (tlXuong) từ extraData để ghi nhận thu hồi
      let cancelSaleNote = input.reason;
      if (order.productionDetail) {
        const extra = (order.productionDetail.extraData as Record<string, unknown>) ?? {};
        const tlXuong = extra.tlXuong ?? "0";
        cancelSaleNote = `Hủy — Trả vàng ${tlXuong}g về xưởng`;
      }

      const updated = await tx.order.update({
        where: { id },
        data: {
          status: "CANCELLED",
          isSuspended: false,
          saleNote: cancelSaleNote,
          version: { increment: 1 },
        },
      });
      // Đồng bộ itemStatus: set tất cả items chưa có terminal status thành CANCELLED
      // để Statistics và Orders tab đều đếm nhất quán (không còn "implicit cancel")
      await tx.orderItem.updateMany({
        where: { orderId: id, itemStatus: null },
        data: { itemStatus: "CANCELLED" },
      });
      await tx.workflowHistory.create({
        data: {
          orderId: id,
          action: "STATUS_CHANGED",
          fromStatus: order.status,
          toStatus: "CANCELLED",
          comment: comment ?? cancelSaleNote,
          metadata: { reason: input.reason, cancelSaleNote },
          performedById,
        },
      });
      return { tag: "OK", data: updated };
    }

    // ── SUBMIT_FOR_REVIEW ────────────────────────────────────────────────────
    case "SUBMIT_FOR_REVIEW": {
      if (order.zone !== "PRE_PRODUCTION" || order.status !== "IN_DESIGN") {
        return {
          tag: "BAD_REQUEST",
          message: `SUBMIT_FOR_REVIEW requires zone=PRE_PRODUCTION and status=IN_DESIGN. Got zone=${order.zone}, status=${order.status}.`,
        };
      }
      const updated = await tx.order.update({
        where: { id },
        data: { status: "DESIGN_REVIEW", version: { increment: 1 } },
      });
      await tx.workflowHistory.create({
        data: {
          orderId: id,
          action: "STATUS_CHANGED",
          fromStatus: "IN_DESIGN",
          toStatus: "DESIGN_REVIEW",
          comment,
          performedById,
        },
      });
      return { tag: "OK", data: updated };
    }

    // ── APPROVE_DESIGN ───────────────────────────────────────────────────────
    case "APPROVE_DESIGN": {
      if (order.zone !== "PRE_PRODUCTION" || order.status !== "DESIGN_REVIEW") {
        return {
          tag: "BAD_REQUEST",
          message: `APPROVE_DESIGN requires zone=PRE_PRODUCTION and status=DESIGN_REVIEW. Got zone=${order.zone}, status=${order.status}.`,
        };
      }
      const updated = await tx.order.update({
        where: { id },
        data: { status: "DESIGN_APPROVED", version: { increment: 1 } },
      });
      await tx.workflowHistory.create({
        data: {
          orderId: id,
          action: "STATUS_CHANGED",
          fromStatus: "DESIGN_REVIEW",
          toStatus: "DESIGN_APPROVED",
          comment,
          performedById,
        },
      });
      return { tag: "OK", data: updated };
    }

    // ── REJECT_DESIGN ────────────────────────────────────────────────────────
    case "REJECT_DESIGN": {
      if (order.zone !== "PRE_PRODUCTION" || order.status !== "DESIGN_REVIEW") {
        return {
          tag: "BAD_REQUEST",
          message: `REJECT_DESIGN requires zone=PRE_PRODUCTION and status=DESIGN_REVIEW. Got zone=${order.zone}, status=${order.status}.`,
        };
      }
      const updated = await tx.order.update({
        where: { id },
        data: { status: "IN_DESIGN", version: { increment: 1 } },
      });
      await tx.workflowHistory.create({
        data: {
          orderId: id,
          action: "STATUS_CHANGED",
          fromStatus: "DESIGN_REVIEW",
          toStatus: "IN_DESIGN",
          comment: comment ?? input.reason,
          metadata: { reason: input.reason },
          performedById,
        },
      });
      return { tag: "OK", data: updated };
    }

    // ── RAISE_ALERT ──────────────────────────────────────────────────────────
    case "RAISE_ALERT": {
      const isCritical = input.alertSeverity === "CRITICAL";

      let raisedById = rawPerformedById;
      if (!raisedById || raisedById === "system") {
        const fallbackUser = await tx.user.findFirst({ select: { id: true } });
        if (fallbackUser) {
          raisedById = fallbackUser.id;
        } else {
          const systemUser = await tx.user.create({
            data: {
              email: "system@jewelry.vn",
              name: "System User",
              role: "ADMIN",
            },
            select: { id: true },
          });
          raisedById = systemUser.id;
        }
      }

      const alert = await tx.alert.create({
        data: {
          orderId: id,
          type: input.alertType,
          severity: input.alertSeverity,
          title: input.alertTitle,
          description: input.alertDescription,
          autoSuspended: isCritical,
          raisedById: raisedById,
        },
      });

      // Always log the alert being raised
      await tx.workflowHistory.create({
        data: {
          orderId: id,
          action: "ALERT_RAISED",
          fromStatus: order.status,
          toStatus: isCritical ? "SUSPENDED" : order.status,
          comment,
          metadata: {
            alertId: alert.id,
            severity: input.alertSeverity,
            type: input.alertType,
          },
          performedById,
        },
      });

      // CRITICAL: auto-suspend the order
      if (isCritical && !order.isSuspended) {
        await tx.order.update({
          where: { id },
          data: {
            status: "SUSPENDED",
            isSuspended: true,
            version: { increment: 1 },
          },
        });
        await tx.workflowHistory.create({
          data: {
            orderId: id,
            action: "SUSPENDED",
            fromStatus: order.status,
            toStatus: "SUSPENDED",
            comment: `Auto-suspended due to CRITICAL alert: ${input.alertTitle}`,
            metadata: { alertId: alert.id, auto: true },
            performedById,
          },
        });
      } else {
        // Non-critical: just increment version for concurrency tracking
        await tx.order.update({
          where: { id },
          data: { version: { increment: 1 } },
        });
      }

      const updated = await tx.order.findUnique({
        where: { id },
        include: {
          alerts: { where: { isResolved: false }, orderBy: { createdAt: "desc" } },
        },
      });
      return { tag: "OK", data: updated };
    }

    // ── RESOLVE_ALERT ────────────────────────────────────────────────────────
    case "RESOLVE_ALERT": {
      const alert = await tx.alert.findFirst({
        where: { id: input.alertId, orderId: id },
      });
      if (!alert) return { tag: "ALERT_NOT_FOUND" };
      if (alert.isResolved) {
        return { tag: "BAD_REQUEST", message: "Alert is already resolved." };
      }

      await tx.alert.update({
        where: { id: input.alertId },
        data: {
          isResolved: true,
          resolvedAt: new Date(),
          resolvedNote: input.resolvedNote,
        },
      });

      await tx.workflowHistory.create({
        data: {
          orderId: id,
          action: "ALERT_RESOLVED",
          fromStatus: order.status,
          toStatus: order.status,
          comment: input.resolvedNote ?? comment,
          metadata: { alertId: input.alertId },
          performedById,
        },
      });

      await tx.order.update({
        where: { id },
        data: { version: { increment: 1 } },
      });

      const updated = await tx.order.findUnique({
        where: { id },
        include: {
          alerts: { where: { isResolved: false }, orderBy: { createdAt: "desc" } },
        },
      });
      return { tag: "OK", data: updated };
    }

    // ── RESUME ───────────────────────────────────────────────────────────────
    case "RESUME": {
      if (!order.isSuspended) {
        return { tag: "BAD_REQUEST", message: "Order is not suspended." };
      }

      // Auto-resolve tất cả alerts khi resume — bất kể qua sidebar hay Alerts page.
      const resolvedNote = input.convertToShowroom
        ? "Auto-resolved: Chuyển thành Hàng Showroom"
        : "Auto-resolved: Tiếp tục sản xuất";
      await tx.alert.updateMany({
        where: { orderId: id, isResolved: false },
        data: { isResolved: true, resolvedAt: new Date(), resolvedNote },
      });

      // Clear per-item suspension respecting per-MO independence.
      // Find if the latest SUSPENDED entry has a scopedItemId (per-item alert).
      // If so, only clear that specific item. Otherwise clear all suspended items.
      const latestSuspend = await tx.workflowHistory.findFirst({
        where: { orderId: id, action: "SUSPENDED" },
        orderBy: { performedAt: "desc" },
        select: { metadata: true },
      });
      const suspendedItemId = (latestSuspend?.metadata as Record<string, unknown>)?.scopedItemId as string | undefined;

      if (suspendedItemId) {
        // Per-item: only clear the specific suspended item
        await tx.orderItem.update({
          where: { id: suspendedItemId },
          data: { itemStatus: null },
        });
      } else {
        // Full-order: clear all suspended items
        await tx.orderItem.updateMany({
          where: { orderId: id, itemStatus: "SUSPENDED" },
          data: { itemStatus: null },
        });
      }

      // Restore to status before suspension via WorkflowHistory
      const suspendEntry = await tx.workflowHistory.findFirst({
        where: { orderId: id, action: "SUSPENDED" },
        orderBy: { performedAt: "desc" },
        select: { fromStatus: true },
      });
      // V2 parity: Khi chuyển showroom luôn đưa về IN_PRODUCTION
      const resumeStatus = input.convertToShowroom
        ? "IN_PRODUCTION"
        : (suspendEntry?.fromStatus ?? "IN_DESIGN");

      // Mở khóa cho phép chỉnh sửa bằng cách set isChangeApproved = true trong extraData
      if (order.productionDetail) {
        const existingExtra = (order.productionDetail.extraData as Record<string, unknown>) ?? {};
        const newExtra = {
          ...existingExtra,
          isChangeApproved: true,
        };
        await tx.productionDetail.update({
          where: { orderId: id },
          data: { extraData: newExtra },
        });
      }

      // V2 parity: Khi convertToShowroom, đổi thông tin khách hàng thành Hàng Showroom
      const orderUpdateData: Record<string, unknown> = {
        status: resumeStatus,
        isSuspended: false,
        version: { increment: 1 },
      };

      if (input.convertToShowroom) {
        orderUpdateData.customerName = "HÀNG SHOWROOM";
        orderUpdateData.phanLoaiKh = "SR";
        orderUpdateData.saleNote = "Chuyển thành Hàng Showroom — Đang sản xuất";

        // Thêm -SR suffix vào moNumber của tất cả items
        const items = await tx.orderItem.findMany({
          where: { orderId: id },
          select: { id: true, moNumber: true },
        });
        for (const item of items) {
          if (item.moNumber && !item.moNumber.endsWith("-SR")) {
            await tx.orderItem.update({
              where: { id: item.id },
              data: { moNumber: `${item.moNumber}-SR` },
            });
          }
        }

        // Thêm -SR suffix vào productionCode nếu có
        if (order.productionDetail?.productionCode && !order.productionDetail.productionCode.endsWith("-SR")) {
          await tx.productionDetail.update({
            where: { orderId: id },
            data: { productionCode: `${order.productionDetail.productionCode}-SR` },
          });
        }
      }

      const updated = await tx.order.update({
        where: { id },
        data: orderUpdateData,
      });

      await tx.workflowHistory.create({
        data: {
          orderId: id,
          action: "RESUMED",
          fromStatus: "SUSPENDED",
          toStatus: resumeStatus,
          comment: input.convertToShowroom
            ? (comment ?? "Duyệt tiếp tục — Chuyển thành Hàng Showroom")
            : comment,
          metadata: input.convertToShowroom
            ? { convertedToShowroom: true }
            : undefined,
          performedById,
        },
      });

      return { tag: "OK", data: updated };
    }

    // ── CHANGE_WORKSHOP ──────────────────────────────────────────────────────
    case "CHANGE_WORKSHOP": {
      if (order.zone !== "MASTER_HUB") {
        return {
          tag: "BAD_REQUEST",
          message: "CHANGE_WORKSHOP is only available for MASTER_HUB orders.",
        };
      }
      if (!order.productionDetail) {
        return {
          tag: "BAD_REQUEST",
          message: "Order has no ProductionDetail. Promote the order first.",
        };
      }

      const previousWorkshop = order.productionDetail.workshopName;

      await tx.productionDetail.update({
        where: { orderId: id },
        data: {
          workshopCode: input.workshopCode,
          workshopName: input.workshopName,
          supervisorName: input.supervisorName,
        },
      });

      const updated = await tx.order.update({
        where: { id },
        data: { version: { increment: 1 } },
        include: { productionDetail: true },
      });

      await tx.workflowHistory.create({
        data: {
          orderId: id,
          action: "FIELD_UPDATED",
          fromStatus: order.status,
          toStatus: order.status,
          comment: comment ?? input.reason,
          metadata: {
            field: "workshop",
            oldValue: previousWorkshop,
            newValue: input.workshopName,
          },
          performedById,
        },
      });

      return { tag: "OK", data: updated };
    }

    // ── MARK_QC_PASS ─────────────────────────────────────────────────────────
    case "MARK_QC_PASS": {
      if (order.zone !== "MASTER_HUB" || order.status !== "QUALITY_CHECK") {
        return {
          tag: "BAD_REQUEST",
          message: `MARK_QC_PASS requires zone=MASTER_HUB and status=QUALITY_CHECK. Got zone=${order.zone}, status=${order.status}.`,
        };
      }

      if (order.productionDetail) {
        await tx.productionDetail.update({
          where: { orderId: id },
          data: {
            qcResult: "PASS",
            qcNote: input.qcNote,
            qcDoneAt: new Date(),
          },
        });
      }

      const updated = await tx.order.update({
        where: { id },
        data: {
          status: "COMPLETED",
          completedDate: new Date(),
          version: { increment: 1 },
        },
        include: { productionDetail: true },
      });

      await tx.workflowHistory.create({
        data: {
          orderId: id,
          action: "STATUS_CHANGED",
          fromStatus: "QUALITY_CHECK",
          toStatus: "COMPLETED",
          comment: comment ?? input.qcNote,
          metadata: { qcResult: "PASS" },
          performedById,
        },
      });

      return { tag: "OK", data: updated };
    }

    // ── MARK_QC_FAIL ─────────────────────────────────────────────────────────
    case "MARK_QC_FAIL": {
      if (order.zone !== "MASTER_HUB" || order.status !== "QUALITY_CHECK") {
        return {
          tag: "BAD_REQUEST",
          message: `MARK_QC_FAIL requires zone=MASTER_HUB and status=QUALITY_CHECK. Got zone=${order.zone}, status=${order.status}.`,
        };
      }

      if (order.productionDetail) {
        await tx.productionDetail.update({
          where: { orderId: id },
          data: {
            qcResult: "FAIL",
            qcNote: input.qcNote,
            reworkCount: { increment: 1 },
          },
        });
      }

      const updated = await tx.order.update({
        where: { id },
        data: {
          status: "IN_PRODUCTION",
          version: { increment: 1 },
        },
        include: { productionDetail: true },
      });

      await tx.workflowHistory.create({
        data: {
          orderId: id,
          action: "STATUS_CHANGED",
          fromStatus: "QUALITY_CHECK",
          toStatus: "IN_PRODUCTION",
          comment: input.qcNote,
          metadata: { qcResult: "FAIL", reworkNote: input.qcNote },
          performedById,
        },
      });

      return { tag: "OK", data: updated };
    }

    // ── REOPEN ───────────────────────────────────────────────────────────────
    // Mở lại đơn/MO đã Hoàn tất/Đã hủy về PSX (IN_PRODUCTION) hoặc PTK (IN_DESIGN).
    // GIỮ NGUYÊN mọi dữ liệu — chỉ đổi itemStatus + zone; recompute order cấp SO.
    // Per-MO: chỉ đổi đúng MO (scopedItemId), không đụng MO anh em cùng SO.
    case "REOPEN": {
      const targetIsPsx = input.target === "PSX";
      const newItemStatus = targetIsPsx ? "IN_PRODUCTION" : "IN_DESIGN";
      const newZone = targetIsPsx ? "MASTER_HUB" : "PRE_PRODUCTION";

      const items = await tx.orderItem.findMany({
        where: { orderId: id },
        select: { id: true, itemStatus: true, zone: true },
      });
      const isTerminal = (s: string | null) => s === "COMPLETED" || s === "CANCELLED";

      if (input.scopedItemId) {
        const it = items.find((i) => i.id === input.scopedItemId);
        if (!it) return { tag: "BAD_REQUEST", message: "MO không tồn tại trong đơn." };
        const eff = it.itemStatus ?? order.status;
        if (!isTerminal(eff)) {
          return { tag: "BAD_REQUEST", message: "Chỉ mở lại được MO đã Hoàn tất hoặc Đã hủy." };
        }
        await tx.orderItem.update({
          where: { id: input.scopedItemId },
          data: { itemStatus: newItemStatus, zone: newZone },
        });
        it.itemStatus = newItemStatus;
        it.zone = newZone;
      } else {
        if (!isTerminal(order.status)) {
          return { tag: "BAD_REQUEST", message: "Chỉ mở lại được đơn đã Hoàn tất hoặc Đã hủy." };
        }
        await tx.orderItem.updateMany({
          where: { orderId: id },
          data: { itemStatus: newItemStatus, zone: newZone },
        });
        items.forEach((i) => { i.itemStatus = newItemStatus; i.zone = newZone; });
      }

      // Recompute cấp SO từ item (per-MO độc lập). GIỮ NGUYÊN order.completedDate (không xoá).
      const anyActive = items.some((i) => !isTerminal(i.itemStatus ?? order.status));
      const anyMasterHub = items.some((i) => i.zone === "MASTER_HUB");
      const newOrderStatus = anyActive
        ? (anyMasterHub ? "IN_PRODUCTION" : "IN_DESIGN")
        : order.status;
      const newOrderZone = anyActive
        ? (anyMasterHub ? "MASTER_HUB" : "PRE_PRODUCTION")
        : order.zone;
      const orderData: Prisma.OrderUpdateInput = { version: { increment: 1 } };
      if (anyActive) {
        orderData.status = newOrderStatus;
        orderData.zone = newOrderZone;
        orderData.isSuspended = false;
      }
      const updated = await tx.order.update({
        where: { id },
        data: orderData,
        include: { productionDetail: true },
      });

      await tx.workflowHistory.create({
        data: {
          orderId: id,
          action: "STATUS_CHANGED",
          fromStatus: order.status,
          toStatus: newOrderStatus,
          fromZone: order.zone,
          toZone: newOrderZone,
          comment: `Mở lại đơn → ${targetIsPsx ? "PSX" : "PTK"}${input.scopedItemId ? " (MO)" : ""} — ${input.reason}`,
          metadata: {
            lifecycle: "REOPEN",
            reopenTarget: input.target,
            scopedItemId: input.scopedItemId ?? null,
            reason: input.reason,
          },
          performedById,
        },
      });

      return { tag: "OK", data: updated };
    }
  }
}
