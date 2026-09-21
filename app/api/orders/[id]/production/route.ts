import type { NextRequest } from "next/server";
import { after } from "next/server";
import * as z from "zod";
import { prisma } from "@/app/lib/prisma";
import type { Prisma, OrderStatus } from "@/app/generated/prisma/client";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { STAGE_ORDER } from "@/app/lib/business/production-stage";
import { diffStages, type AuditChange } from "@/app/lib/business/stage-audit";
import { detectClearedFields } from "@/app/lib/business/suspicious-clear";
import { syncDesign3DAssignments } from "@/app/lib/business/kpi-3d/assignment";
import { applyDesign3DPatches, removeDesign3DBlocks } from "@/app/lib/business/kpi-3d/assignment-targets";
import { notifyNewDesign3DAssignments } from "@/app/lib/notify/notify-design-3d";
import { isTerminalLocked, terminalLockReason } from "@/app/lib/business/orders/terminal-lock";
import { canTransition } from "@/app/lib/business/orders/status-transitions";
import { detectAutoPause } from "@/app/lib/business/orders/auto-pause";

// DB-backed stages only — TC_NGUOI và KHOA không có cột DB, lưu qua scopedItemId/perItem
const DB_STAGE_DEFS = [
  { code: "RESIN",  crafterField: "resinCrafter",     startField: "resinStartAt",     doneField: "resinDoneAt"     },
  { code: "DUC",    crafterField: "castingCrafter",   startField: "castingStartAt",   doneField: "castingDoneAt"   },
  { code: "NGUOI",  crafterField: "coldworkCrafter",  startField: "coldworkStartAt",  doneField: "coldworkDoneAt"  },
  { code: "TC_DAY", crafterField: "handcraftCrafter", startField: "handcraftStartAt", doneField: "handcraftDoneAt" },
  { code: "HOT",    crafterField: "settingCrafter",   startField: "settingStartAt",   doneField: "settingDoneAt"   },
  { code: "MOC",    crafterField: "machineCrafter",   startField: "machineStartAt",   doneField: "machineDoneAt"   },
  { code: "DBXM",   crafterField: "platingCrafter",   startField: "platingStartAt",   doneField: "platingDoneAt"   },
  { code: "QC",     crafterField: "qcCrafter",        startField: "qcStartAt",        doneField: "qcDoneAt"        },
] as const;

type DbStageDef = (typeof DB_STAGE_DEFS)[number];
type DbStageCode = DbStageDef["code"];

const DB_STAGE_MAP = Object.fromEntries(DB_STAGE_DEFS.map((s) => [s.code, s])) as Record<DbStageCode, DbStageDef>;

// ─── Schema ───────────────────────────────────────────────────────────────────

// Xuất để test đọc THẲNG schema này thay vì chép lại: __tests__/production-patch.test.ts
export const productionPatchSchema = z.object({
  version: z.number().int().min(1),
  updatedById: z.string().optional(),
  // ── Order fields (Tab Đơn hàng) ─────────────────────────────────────────
  customerName: z.string().min(1).max(500).optional(),
  salesName: z.string().max(255).optional(),
  requiredDate: z.string().nullable().optional(),
  estimatedDate: z.string().nullable().optional(),
  nguon: z.string().max(100).optional(),
  phanLoaiKh: z.string().max(100).optional(),
  linkChat: z.string().max(1000).nullable().optional(),
  donHang3Sao: z.boolean().optional(),
  priorityCode: z.string().max(20).optional(),
  // ── Tab Sản xuất ───────────────────────────────────────────────────────
  // V2 ref: MO_STATUS — Đang sản xuất / Kiểm tra CL / Hoàn thành / Tạm ngưng / Hủy
  status: z.enum(["IN_PRODUCTION", "PENDING_PRODUCTION", "QUALITY_CHECK", "COMPLETED", "SUSPENDED", "CANCELLED"]).optional(),
  completedDate: z.string().nullable().optional(),
  saleNote: z.string().max(2000).nullable().optional(),
  // ── Tab Tiến độ — ProductionDetail fields ──────────────────────────────
  internalNote: z.string().max(2000).nullable().optional(),
  // V2 ref: saveStageData() — each stage has crafter (thợ) + status
  stages: z.array(z.object({
    code: z.enum(["RESIN", "CHO_DX_NL", "CHO_NL", "DUC", "NGUOI", "TC_DAY", "TC_NGUOI", "KHOA", "HOT", "MOC", "DBXM", "QC", "DUYET_NK"]),
    crafter: z.string().max(100).nullable().optional(),
    stageStatus: z.enum(["pending", "doing", "qc", "done", "cancelled", "hold"]).optional(),
    holdReason: z.enum(["CHO_DX_NL", "CHO_NL"]).optional(),
    startAt:         z.string().nullable().optional(),
    doneAt:          z.string().nullable().optional(),
    durationNote:    z.string().max(100).nullable().optional(),
    coldworkQuality: z.string().max(50).nullable().optional(),
    coldworkTimeOk:  z.string().max(50).nullable().optional(),
    coldworkReason:  z.string().max(500).nullable().optional(),
    bachSP:          z.string().max(20).nullable().optional(),
    gioKpi:          z.string().max(20).nullable().optional(),
    ghiChuNguoi:     z.string().max(500).nullable().optional(),
    workGroup:       z.string().max(50).nullable().optional(),
    settingNote:     z.string().max(500).nullable().optional(),
    ghiChuDuc:       z.string().max(2000).nullable().optional(),
    stoneType:       z.string().max(50).nullable().optional(),
    stoneQty:        z.number().int().min(0).nullable().optional(),
    resinWeightOk:   z.string().max(50).nullable().optional(),
    resinQualityOk:  z.string().max(50).nullable().optional(),
    resinReason:     z.string().max(500).nullable().optional(),
    resinDetailQty:  z.number().int().min(0).nullable().optional(),
    resinWeightRaw:  z.number().min(0).nullable().optional(),
    resinWeightTy:   z.number().min(0).nullable().optional(),
    resinFails: z.array(z.object({
      lan:  z.number().int().min(1),
      ngay: z.string().nullable().optional(),
      lyDo: z.string().max(500).nullable().optional(),
    })).nullable().optional(),
    // Nhiều thợ / nhiều lần trong cùng 1 khâu (Nguội, Hột…). Mỗi phần tử = 1 lần
    // thực hiện của 1 thợ. additive — dữ liệu cũ không có field này vẫn hợp lệ.
    records: z.array(z.object({
      crafter:    z.string().max(100),
      phan:       z.string().max(200).nullable().optional(),
      lan:        z.number().int().min(1).nullable().optional(),
      ketQua:     z.string().max(50).nullable().optional(),
      thoiGianOk: z.string().max(50).nullable().optional(),
      lyDo:       z.string().max(500).nullable().optional(),
      gioKpi:     z.string().max(20).nullable().optional(),
      gioThucTe:  z.string().max(50).nullable().optional(),
      bachSP:     z.string().max(20).nullable().optional(),
      // HỘT per-record: loại hột (CSV nhiều loại) + SL tổng + SL tách theo từng loại.
      // Thiếu 2 field này trước đây khiến Zod strip → chỉ Tổng SL được lưu.
      stoneType:      z.string().max(200).nullable().optional(),
      stoneQty:       z.number().int().min(0).nullable().optional(),
      stoneQtyByType: z.record(z.string(), z.number()).nullable().optional(),
      // RESIN per-record (mỗi lần resin có số liệu riêng)
      resinDetailQty: z.number().int().min(0).nullable().optional(),
      resinWeightRaw: z.number().min(0).nullable().optional(),
      resinWeightTy:  z.number().min(0).nullable().optional(),
      resinWeightOk:  z.string().max(50).nullable().optional(),
      ghiChu:     z.string().max(500).nullable().optional(),
      startAt:    z.string().nullable().optional(),
      doneAt:     z.string().nullable().optional(),
      reviewedAt: z.string().nullable().optional(),
    })).optional(),
  })).optional(),
  // Lý do tạm ngưng — lưu vào extraData.holdReason (Phase 1.7)
  holdReason: z.enum(["", "CHO_DX_NL", "CHO_NL"]).optional(),
  // V2 ref: DATA_JSON — tl3d, tlXuong, qd24k, qdPt, tlThucTeHt, danhGiaTl, pctChenLech,
  //                      thongTinHt, canhBaoDacBiet, tho3d, sku, chiTietKt
  extraData: z.record(z.string(), z.unknown()).optional(),
  // Per-MO isolation: khi set → stages lưu vào extraData.perItem[scopedItemId].stages
  scopedItemId: z.string().optional(),
  // ── Admin Override — sửa dữ liệu trên MO đã Hoàn tất/Hủy ────────────────
  // Chỉ ADMIN. Bắt buộc lý do. KHÔNG cho đổi status/zone qua đường này (dùng REOPEN).
  adminOverride: z.boolean().optional(),
  overrideReason: z.string().max(1000).optional(),
});

// ─── MASTER_HUB status transition rules ──────────────────────────────────────


// ─── POST /api/orders/[id]/production ────────────────────────────────────────
// Cập nhật thông tin sản xuất (stages, extraData) + trường đơn hàng trong MASTER_HUB.
// Một transaction duy nhất để tránh xung đột version.

export async function PATCH(
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

  const parsed = productionPatchSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.validationFailed(parsed.error.issues);
  }

  const user = await getCurrentUser();
  if (!user) return Errors.forbidden();
  if (!["ADMIN", "PRODUCTION", "ORDER"].includes(user.role)) return Errors.forbidden();

  const {
    version,
    updatedById,
    status: newStatus,
    completedDate,
    saleNote,
    internalNote,
    stages,
    extraData,
    customerName,
    salesName,
    requiredDate,
    estimatedDate,
    nguon,
    phanLoaiKh,
    linkChat,
    donHang3Sao,
    priorityCode,
    scopedItemId,
    holdReason,
    adminOverride,
    overrideReason,
  } = parsed.data;

  // Phân loại KH / Nguồn: chỉ ADMIN và Bộ phận đặt đơn (ORDER) được sửa —
  // Nguồn gắn storeId (phân quyền dữ liệu theo cửa hàng), không cho PRODUCTION đổi.
  if ((nguon !== undefined || phanLoaiKh !== undefined) && !["ADMIN", "ORDER"].includes(user.role)) {
    return Errors.forbidden("Chỉ Admin/Bộ phận đặt đơn được sửa Phân loại KH / Nguồn.");
  }

  // ── Admin Override — sửa dữ liệu trên MO đã Hoàn tất/Hủy ─────────────────
  // Chỉ ADMIN, bắt buộc lý do, và KHÔNG cho đổi status qua đường này — đổi
  // trạng thái/zone của MO đã chốt phải dùng "Mở lại đơn" (REOPEN) để có state
  // machine đầy đủ; override chỉ dùng để sửa lại dữ liệu nhập sai, giữ nguyên trạng thái.
  if (adminOverride) {
    if (user.role !== "ADMIN") return Errors.forbidden("Chỉ Admin được sửa dữ liệu MO đã chốt.");
    if (!overrideReason?.trim()) return Errors.badRequest("Vui lòng nhập lý do chỉnh sửa.");
    if (newStatus !== undefined) {
      return Errors.badRequest("Không thể đổi trạng thái qua Sửa dữ liệu (Admin) — dùng \"Mở lại đơn\" nếu cần đổi trạng thái.");
    }
  }

  // Cảnh báo cấu hình KPI 3D (nếu có) — gán bên trong transaction, đọc sau khi commit để
  // đính kèm vào response. Transaction rollback thì response là lỗi, cảnh báo không dùng tới.
  let kpi3DWarning: string | null = null;
  // Lượt giao việc 3D vừa được TẠO trong lần lưu này — gửi thông báo Google Chat sau khi
  // transaction commit, qua after(). Chỉ những cái vừa tạo, không phải mọi lần bấm Lưu.
  const newAssignmentIds: string[] = [];

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const order = await tx.order.findUnique({
        where: { id, deletedAt: null },
        include: { productionDetail: true, items: { select: { id: true, zone: true, itemStatus: true, moNumber: true } } },
      });

      if (!order) return { tag: "NOT_FOUND" } as const;
      if (order.version !== version) return { tag: "CONFLICT" } as const;
      // Mixed-zone: accept orders where at least one item is in MASTER_HUB
      type ItemInfo = { id: string; zone: string; itemStatus: string | null; moNumber: string | null };
      const orderItems = (order as any).items as ItemInfo[];
      const isMixedZone = order.zone !== "MASTER_HUB";

      // Design-only update: no status change, no stages — allowed for PRE_PRODUCTION orders
      const isDesignOnlyUpdate = !newStatus && !stages?.length && extraData !== undefined;

      // ⚠️ HAI NHÁNH, MỘT LUẬT. Trước đây mỗi nhánh tự viết lại điều kiện terminal, và chúng
      // ĐO Ở HAI CẤP KHÁC NHAU: nhánh trên theo MO, nhánh dưới theo SO. Nay cả hai gọi
      // `isTerminalLocked` — luật + lý do đầy đủ ở business/orders/terminal-lock.ts.
      if (scopedItemId) {
        const scopedItem = orderItems.find((i) => i.id === scopedItemId);
        const isScopedDesignOnlyUpdate = isDesignOnlyUpdate && scopedItem?.zone === "PRE_PRODUCTION";
        if (!scopedItem || (scopedItem.zone !== "MASTER_HUB" && !isScopedDesignOnlyUpdate)) {
          return { tag: "WRONG_ZONE", zone: scopedItem?.zone ?? order.zone } as const;
        }
        if (isTerminalLocked({ itemStatus: scopedItem.itemStatus, orderStatus: order.status, adminOverride })) {
          return {
            tag: "LOCKED",
            itemStatus: scopedItem.itemStatus,
            orderStatus: order.status,
            moNumber: scopedItem.moNumber,
          } as const;
        }
      } else {
        const hasAnyPsxItem = orderItems.some((i) => i.zone === "MASTER_HUB");
        if (order.zone !== "MASTER_HUB" && !hasAnyPsxItem && !isDesignOnlyUpdate) {
          return { tag: "WRONG_ZONE", zone: order.zone } as const;
        }
        // KHÔNG có MO cụ thể → chỉ còn trạng thái SO để dựa vào. `itemStatus: null` nói ra điều
        // đó tường minh, thay vì để một lời gọi trông như đã xét cấp MO.
        if (isTerminalLocked({ itemStatus: null, orderStatus: order.status, adminOverride })) {
          return { tag: "LOCKED", itemStatus: null, orderStatus: order.status, moNumber: null } as const;
        }
      }

      if (!order.productionDetail && !isDesignOnlyUpdate) return { tag: "NO_PRODUCTION_DETAIL" } as const;

      // Validate status transition
      if (newStatus) {
        const curStatus = (isMixedZone && scopedItemId)
          ? ((orderItems.find((i) => i.id === scopedItemId)?.itemStatus ?? order.status) as string)
          : (order.status as string);
        if (newStatus !== curStatus) {
          if (!canTransition(curStatus, newStatus, "MASTER_HUB")) {
            return { tag: "INVALID_TRANSITION" } as const;
          }
        }
      }

      const now = new Date();

      // ── Auto-pause detection ────────────────────────────────────────────────
      const prevSaleNote = (order.saleNote ?? "").trim();
      const newSaleNote = (saleNote !== undefined ? (saleNote ?? "") : prevSaleNote).trim();
      const effectiveStatusForAutoPause = (isMixedZone && scopedItemId)
        ? ((orderItems.find((i) => i.id === scopedItemId)?.itemStatus ?? order.status) as string)
        : (order.status as string);
      const existingExtra = (order.productionDetail?.extraData as Record<string, unknown>) ?? {};

      const autoPause = detectAutoPause({
        saleNoteIncluded: saleNote !== undefined,
        newSaleNote,
        prevSaleNote,
        customerName,
        prevCustomerName: order.customerName,
        salesName,
        prevSalesName: order.salesName,
        estimatedDate,
        prevEstimatedDate: order.estimatedDate,
        effectiveStatus: effectiveStatusForAutoPause,
        isChangeApproved: existingExtra.isChangeApproved === true,
      }, new Date());

      const newStatusToApply = autoPause ? "SUSPENDED" : newStatus;
      const finalSaleNote   = autoPause ? autoPause.note : saleNote;

      // ── Build productionDetail update ─────────────────────────────────────
      const pdUpdate: Record<string, unknown> = {};

      if (internalNote !== undefined) {
        pdUpdate.internalNote = internalNote;
      }

      // V2 ref: saveStageData() — cập nhật crafter + timestamps theo stageStatus
      // Khi scopedItemId set → stages lưu vào perItem (xử lý bên dưới), KHÔNG ghi shared columns
      if (stages && stages.length > 0 && !scopedItemId) {
        const existing = order.productionDetail as Record<string, unknown>;

        for (const stage of stages) {
          // TC_NGUOI và KHOA không có cột DB — chỉ lưu qua scopedItemId/perItem path
          const def = DB_STAGE_MAP[stage.code as DbStageCode];
          if (!def) continue;

          const curStartAt = existing[def.startField] as Date | null;
          const curDoneAt  = existing[def.doneField]  as Date | null;

          if (stage.crafter !== undefined) {
            pdUpdate[def.crafterField] = stage.crafter;
          }

          // Dates: use client-provided value when present; otherwise keep existing DB value.
          // Status no longer auto-clears dates — managers may set dates independently of status.
          const newStartAt = stage.startAt !== undefined ? (stage.startAt ?? null) : curStartAt;
          const newDoneAt  = stage.doneAt  !== undefined ? (stage.doneAt  ?? null) : curDoneAt;
          pdUpdate[def.startField] = newStartAt;
          pdUpdate[def.doneField]  = newDoneAt;
        }
      }

      // Audit khâu (Option A) — điền trong block scoped stages, gộp vào changes ở phần audit
      let stageAudit: AuditChange[] = [];

      // V2 ref: DATA_JSON — merge extraData + lưu stageStatuses cho "Hủy"
      {
        const existingExtra = (order.productionDetail?.extraData as Record<string, unknown>) ?? {};
        let mergedExtra = { ...existingExtra };

        if (extraData && Object.keys(extraData).length > 0) {
          // Deep merge perItem so editing one MO doesn't overwrite sibling MOs' data
          const { perItem: incomingPerItem, ...restExtraData } = extraData as { perItem?: Record<string, unknown>; [key: string]: unknown };
          if (incomingPerItem) {
            const existingPerItem = (mergedExtra.perItem as Record<string, unknown>) ?? {};
            mergedExtra = { ...mergedExtra, ...restExtraData, perItem: { ...existingPerItem, ...incomingPerItem } };
          } else {
            mergedExtra = { ...mergedExtra, ...extraData };
          }
        }

        // Ngày HT (completedDate) per-MO được phép lưu TỰ DO — kể cả khi MO chưa Hoàn tất
        // (user có thể ghi ngày trước, chưa muốn chuyển sang tab Hoàn tất). Lưu tại
        // extraData.perItem[id].completedDate; per-MO, không đụng MO anh em cùng SO.

        // Per-MO stage independence: khi scopedItemId set → lưu stages vào perItem[id].stages
        if (stages && stages.length > 0 && scopedItemId) {
          const existingPerItem = (mergedExtra.perItem as Record<string, unknown>) ?? {};
          const existingItemData = (existingPerItem[scopedItemId] as Record<string, unknown>) ?? {};
          const existingItemStages = (existingItemData.stages as Record<string, unknown>) ?? {};
          const updatedStages = { ...existingItemStages };

          for (const stage of stages) {
            const cur = (existingItemStages[stage.code] as Record<string, unknown>) ?? {};
            const curStartAt = (cur.startAt as string | null) ?? null;
            const curDoneAt  = (cur.doneAt  as string | null) ?? null;
            // Client-provided values take priority; fall back to existing, then auto-stamp
            const clientStartAt = stage.startAt !== undefined ? (stage.startAt ?? null) : undefined;
            const clientDoneAt  = stage.doneAt  !== undefined ? (stage.doneAt  ?? null) : undefined;
            // Dates: client-provided value takes priority; fall back to existing.
            // Status no longer auto-clears dates — managers may set dates independently of status.
            const startAt = clientStartAt !== undefined ? clientStartAt : curStartAt;
            const doneAt  = clientDoneAt  !== undefined ? clientDoneAt  : curDoneAt;

            const curDurationNote    = (cur.durationNote    as string | null) ?? null;
            const curColdworkQuality = (cur.coldworkQuality as string | null) ?? null;
            const curColdworkTimeOk  = (cur.coldworkTimeOk  as string | null) ?? null;
            const curColdworkReason  = (cur.coldworkReason  as string | null) ?? null;
            const curBachSP          = (cur.bachSP          as string | null) ?? null;
            const curGioKpi          = (cur.gioKpi          as string | null) ?? null;
            const curGhiChuNguoi     = (cur.ghiChuNguoi     as string | null) ?? null;
            const curWorkGroup       = (cur.workGroup       as string | null) ?? null;
            const curSettingNote     = (cur.settingNote     as string | null) ?? null;
            const curGhiChuDuc       = (cur.ghiChuDuc       as string | null) ?? null;
            const curStoneType       = (cur.stoneType       as string | null) ?? null;
            const curStoneQty        = (cur.stoneQty        as number | null) ?? null;
            const curResinWeightOk   = (cur.resinWeightOk   as string | null) ?? null;
            const curResinQualityOk  = (cur.resinQualityOk  as string | null) ?? null;
            const curResinReason     = (cur.resinReason     as string | null) ?? null;
            const curResinDetailQty  = (cur.resinDetailQty  as number | null) ?? null;
            const curResinWeightRaw  = (cur.resinWeightRaw  as number | null) ?? null;
            const curResinWeightTy   = (cur.resinWeightTy   as number | null) ?? null;
            const curResinFails      = (cur.resinFails as unknown[] | undefined);
            const curRecords         = (cur.records as unknown[] | undefined);
            updatedStages[stage.code] = {
              stageStatus: stage.stageStatus,
              crafter: stage.crafter !== undefined ? stage.crafter : ((cur.crafter as string) ?? ""),
              startAt,
              doneAt,
              durationNote:    stage.durationNote    !== undefined ? stage.durationNote    : curDurationNote,
              coldworkQuality: stage.coldworkQuality !== undefined ? stage.coldworkQuality : curColdworkQuality,
              coldworkTimeOk:  stage.coldworkTimeOk  !== undefined ? stage.coldworkTimeOk  : curColdworkTimeOk,
              coldworkReason:  stage.coldworkReason  !== undefined ? stage.coldworkReason  : curColdworkReason,
              bachSP:          stage.bachSP          !== undefined ? stage.bachSP          : curBachSP,
              gioKpi:          stage.gioKpi          !== undefined ? stage.gioKpi          : curGioKpi,
              ghiChuNguoi:     stage.ghiChuNguoi     !== undefined ? stage.ghiChuNguoi     : curGhiChuNguoi,
              workGroup:       stage.workGroup       !== undefined ? stage.workGroup       : curWorkGroup,
              settingNote:     stage.settingNote     !== undefined ? stage.settingNote     : curSettingNote,
              ghiChuDuc:       stage.ghiChuDuc       !== undefined ? stage.ghiChuDuc       : curGhiChuDuc,
              stoneType:       stage.stoneType       !== undefined ? stage.stoneType       : curStoneType,
              stoneQty:        stage.stoneQty        !== undefined ? stage.stoneQty        : curStoneQty,
              resinWeightOk:   stage.resinWeightOk   !== undefined ? stage.resinWeightOk   : curResinWeightOk,
              resinQualityOk:  stage.resinQualityOk  !== undefined ? stage.resinQualityOk  : curResinQualityOk,
              resinReason:     stage.resinReason     !== undefined ? stage.resinReason     : curResinReason,
              resinDetailQty:  stage.resinDetailQty  !== undefined ? stage.resinDetailQty  : curResinDetailQty,
              resinWeightRaw:  stage.resinWeightRaw   !== undefined ? stage.resinWeightRaw  : curResinWeightRaw,
              resinWeightTy:   stage.resinWeightTy    !== undefined ? stage.resinWeightTy   : curResinWeightTy,
              ...(stage.resinFails !== undefined ? { resinFails: stage.resinFails } : (curResinFails !== undefined ? { resinFails: curResinFails } : {})),
              // Nhiều thợ / nhiều lần — giữ records cũ nếu client không gửi
              ...(stage.records !== undefined ? { records: stage.records } : (curRecords !== undefined ? { records: curRecords } : {})),
              ...(stage.stageStatus === "hold" && stage.holdReason ? { holdReason: stage.holdReason } : {}),
            };
          }

          // Auto-advance: khi stage được đánh dấu "done", tự tạo entry "pending" cho stage kế tiếp
          // nếu stage đó chưa có entry nào (implicit → explicit, giúp filter & display chính xác hơn)
          for (const stage of stages) {
            if (stage.stageStatus === "done") {
              const idx = (STAGE_ORDER as readonly string[]).indexOf(stage.code);
              if (idx >= 0 && idx + 1 < STAGE_ORDER.length) {
                const nextCode = STAGE_ORDER[idx + 1];
                if (!updatedStages[nextCode]) {
                  updatedStages[nextCode] = { stageStatus: "pending", crafter: "", startAt: null, doneAt: null };
                }
              }
            }
          }

          // Audit: diff khâu OLD → MỚI, chỉ các khâu user vừa gửi (bỏ khâu auto-advance).
          // ĐỌC OLD TỪ DB GỐC (existingExtra) — KHÔNG dùng existingItemStages vì nó lấy từ
          // mergedExtra đã bị moFields ghi đè (mất stages) → old rỗng → log toàn "(trống)".
          const dbPerItem = (existingExtra.perItem as Record<string, unknown>) ?? {};
          const dbItemData = (dbPerItem[scopedItemId] as Record<string, unknown>) ?? {};
          const oldStagesFromDb = (dbItemData.stages as Record<string, Record<string, unknown>>) ?? {};
          stageAudit = diffStages(
            oldStagesFromDb,
            updatedStages as Record<string, Record<string, unknown>>,
            stages.map((s) => s.code),
          );

          mergedExtra.perItem = {
            ...existingPerItem,
            [scopedItemId]: { ...existingItemData, stages: updatedStages },
          };
        }

        // Lưu trạng thái "Hủy" vào stageStatuses — chỉ khi KHÔNG scoped theo MO
        // (per-item stages đã lưu stageStatus trực tiếp trong perItem[id].stages[code])
        if (stages && stages.length > 0 && !scopedItemId) {
          const existingSS = (existingExtra.stageStatuses as Record<string, string>) ?? {};
          const newSS = { ...existingSS };
          for (const s of stages) {
            if (s.stageStatus === "cancelled") {
              newSS[s.code] = "cancelled";
            } else if (s.stageStatus !== undefined) {
              delete newSS[s.code];
            }
          }
          mergedExtra.stageStatuses = newSS;
        }

        if (autoPause) {
          mergedExtra.isChangeApproved = false;
        }

        // holdReason: lưu lý do tạm ngưng (CHO_DX_NL / CHO_NL / "" = xóa)
        if (holdReason !== undefined) {
          if (holdReason === "") {
            delete mergedExtra.holdReason;
          } else {
            mergedExtra.holdReason = holdReason;
          }
        }

        // Đồng bộ lượt giao việc 3D cho MỌI MO có đủ 4 ô giao việc trong payload.
        //
        // KHÔNG còn phụ thuộc `scopedItemId`: điều kiện cũ `scopedItemId && isDesignOnlyUpdate`
        // khiến luồng lưu từ tab Thiết kế (vốn không gửi trường này) bị bỏ qua âm thầm — cả
        // tính năng chưa từng chạy đúng một lần nào qua giao diện. Nay server tự suy ra danh
        // sách MO từ chính extraData.perItem, nên mọi luồng lưu đều hoạt động.
        //
        // syncDesign3DAssignments tự thoát sớm khi không có MO nào đủ điều kiện, nên gọi ở
        // đây không thêm chi phí cho các lần lưu không liên quan tới thiết kế 3D.
        const kpiSync = await syncDesign3DAssignments(tx, {
          orderId: id,
          extraData: mergedExtra,
          // Payload THÔ, KHÔNG phải mergedExtra: dùng để biết lần lưu này có nói gì về phần thiết
          // kế hay không, trước khi dám coi một khối vắng mặt là "đã bị xoá". Tab Sản xuất gửi
          // perItem[id] = moFields (có tho3d, KHÔNG có design/designers) — nếu xét theo
          // mergedExtra thì cửa chặn luôn mở và một lần lưu Sản xuất sẽ huỷ sạch KPI của MO.
          incomingExtraData: extraData ?? null,
          validItemIds: orderItems.map((it) => it.id),
          assignedById: user.dbId ?? null,
        });

        // Không chặn lưu (các field khác vẫn phải được ghi), nhưng phải trả lý do về cho
        // client hiện toast — im lặng chính là thứ đã làm lỗi này sống sót lâu như vậy.
        if (kpiSync.warnings.length > 0) kpi3DWarning = kpiSync.warnings.join(" · ");

        // CHỈ ghi nhận id để gửi thông báo SAU KHI transaction commit. Gọi HTTP từ trong
        // transaction sẽ giữ lock DB suốt thời gian gọi mạng, và Google Chat chậm là cả lệnh
        // lưu đơn treo theo. Việc giao là thật; thông báo chỉ là phép lịch sự.
        newAssignmentIds.push(...kpiSync.createdAssignmentIds);

        // Một MO có thể có nhiều NV 3D → nhiều bản vá, mỗi bản vá mang `slot` chỉ đúng khối
        // của nó. Việc ghép nằm ở module thuần (test được), không viết tay tại đây nữa.
        mergedExtra = applyDesign3DPatches(mergedExtra, kpiSync.patches);

        // RÚT các khối bị TỪ CHỐI VĨNH VIỄN trước khi ghi.
        //
        // LỖI ĐANG SỬA: trước đây `mergedExtra` được ghi nguyên vẹn dù đồng bộ trả về BLOCKED,
        // nên sidebar vẫn hiện khối "Nhân viên 3D #2" với người vừa chọn — kể cả sau khi tải lại
        // trang — dù KHÔNG có lượt giao việc nào được tạo. Người dùng thấy một cảnh báo rồi thấy
        // dữ liệu vẫn nằm đó, và kết luận hợp lý là "chắc vẫn lưu được".
        //
        // CHỈ rút loại chặn không bao giờ hợp lệ được (MO đã duyệt, cùng người hai khối). Chặn vì
        // thiếu cấu hình thì GIỮ NGUYÊN ô đã điền — nó sẽ hợp lệ ngay khi admin bật cấu hình, và
        // xoá đi là bắt người dùng nhập lại từ đầu.
        mergedExtra = removeDesign3DBlocks(mergedExtra, kpiSync.rejected);

        pdUpdate.extraData = mergedExtra;
      }

      if (Object.keys(pdUpdate).length > 0) {
        if (order.productionDetail) {
          await tx.productionDetail.update({ where: { orderId: id }, data: pdUpdate });
        } else {
          await tx.productionDetail.create({ data: { orderId: id, ...pdUpdate } });
        }
      }

      // Bump OrderItem.updatedAt when stages are saved for a specific MO so that
      // changedItemIds in the meta endpoint correctly identifies this item as changed.
      if (scopedItemId && stages && stages.length > 0) {
        await tx.orderItem.update({ where: { id: scopedItemId }, data: { updatedAt: now } });
      }

      // ── Build order update ─────────────────────────────────────────────────
      const orderUpdate: Record<string, unknown> = {
        version: { increment: 1 },
      };

      const scalarFieldMap: Record<string, unknown> = {
        customerName,
        salesName,
        nguon,
        phanLoaiKh,
        linkChat,
        donHang3Sao,
        saleNote: finalSaleNote,
      };
      for (const [k, v] of Object.entries(scalarFieldMap)) {
        if (v !== undefined) orderUpdate[k] = v;
      }

      // Guard: requiredDate/estimatedDate/priorityCode là field PER-MO (lưu ở OrderItem, sửa
      // qua route items/[itemId]). Khi đang sửa MỘT MO cụ thể (scopedItemId), route này KHÔNG
      // được phép ghi các field này lên cấp SO — nếu không, ngày/ưu tiên của MO đang sửa sẽ
      // "rò" sang mọi MO khác trong SO đang ăn theo giá trị SO (order.estimatedDate ??).
      // Chặn cứng tại server (không phụ thuộc client tuân thủ) — bỏ qua field, không lỗi cứng,
      // để không chặn các field khác cùng payload.
      const blockOrderLevelDateFields = !!scopedItemId;

      if (!blockOrderLevelDateFields && requiredDate !== undefined) {
        orderUpdate.requiredDate = requiredDate ? new Date(requiredDate) : null;
      }

      if (!blockOrderLevelDateFields && estimatedDate !== undefined) {
        orderUpdate.estimatedDate = estimatedDate ? new Date(estimatedDate) : null;
      }

      if (!blockOrderLevelDateFields && priorityCode !== undefined) {
        orderUpdate.priorityCode = priorityCode;
        orderUpdate.isPriority = priorityCode === "UT1" || priorityCode === "UT2";
        orderUpdate.isRush = priorityCode === "UT1";
      }

      // Phát hiện: thay đổi field cấp SO (không scoped) trên đơn có NHIỀU MO — ảnh hưởng tới
      // tất cả MO đang ăn theo giá trị SO. Không chặn (đây có thể là thao tác đúng ý — sửa
      // chung cho cả SO), chỉ ĐÁNH DẤU để soát trong Lịch sử thay đổi.
      const soLevelDateFieldsChanged = !blockOrderLevelDateFields
        && (requiredDate !== undefined || estimatedDate !== undefined || priorityCode !== undefined);
      const affectsMultipleMo = soLevelDateFieldsChanged && orderItems.length > 1;

      // Sync storeId when nguon changes (store.code matches CH1/CH2/… values)
      if (nguon !== undefined && nguon !== order.nguon) {
        const matchedStore = await tx.store.findFirst({ where: { code: nguon } });
        if (matchedStore) orderUpdate.storeId = matchedStore.id;
      }

      const scopedItemForStatus = (isMixedZone && scopedItemId)
        ? (orderItems.find((i) => i.id === scopedItemId) ?? null)
        : null;
      const fromStatus = (scopedItemForStatus?.itemStatus ?? order.status) as OrderStatus;
      let toStatus: OrderStatus = fromStatus;

      if (newStatusToApply && newStatusToApply !== (fromStatus as string)) {
        toStatus = newStatusToApply as OrderStatus;
        if (scopedItemForStatus) {
          // Mixed-zone: update item.itemStatus instead of order.status to avoid
          // overwriting the PRE_PRODUCTION status used by sibling PTK items
          await tx.orderItem.update({
            where: { id: scopedItemId! },
            data: { itemStatus: newStatusToApply as any },
          });
        } else {
          orderUpdate.status = newStatusToApply;
        }
        // For per-MO status changes (scopedItemForStatus), suspension is tracked via
        // item.itemStatus only — do NOT set order.isSuspended, which would lock sibling PTK items.
        if (!scopedItemForStatus) {
          if (newStatusToApply === "SUSPENDED") {
            orderUpdate.isSuspended = true;
          } else if ((fromStatus as string) === "SUSPENDED") {
            orderUpdate.isSuspended = false;
          }
        }
        if (newStatusToApply === "COMPLETED") {
          orderUpdate.completedDate = completedDate ? new Date(completedDate) : now;
          // Hoàn tất đơn → auto-resolve tất cả alerts còn mở
          await tx.alert.updateMany({
            where: { orderId: id, isResolved: false },
            data: { isResolved: true, resolvedAt: now, resolvedNote: "Auto-resolved: Đơn hàng hoàn tất" },
          });
        }
      } else if (completedDate !== undefined) {
        // Cho lưu Ngày HT cấp SO tự do (chỉ dùng khi KHÔNG chỉnh 1 MO cụ thể — panel đã
        // KHÔNG gửi completedDate top-level khi edit per-MO để tránh ghi đè order cấp SO).
        orderUpdate.completedDate = completedDate ? new Date(completedDate) : null;
      }

      const updated = await tx.order.update({
        where: { id },
        data: orderUpdate,
        include: {
          items: { orderBy: { lineNumber: "asc" } },
          productionDetail: true,
          createdBy: { select: { id: true, name: true, role: true } },
          assignedTo: { select: { id: true, name: true, role: true } },
          _count: { select: { versions: true } },
        },
      });

      // ── Create Alert if auto-suspended ────────────────────────────────────
      if (autoPause) {
        await tx.alert.create({
          data: {
            orderId: id,
            type: "SPECIAL",
            severity: "CRITICAL",
            title: autoPause.type === "MANUAL_NOTE" ? "Cảnh báo đặc biệt" : "Yêu cầu thay đổi thiết kế",
            description: autoPause.note,
            raisedById: user.dbId,
            isResolved: false,
            autoSuspended: true,
          },
        });
      }

      // ── Audit log ──────────────────────────────────────────────────────────
      const isStatusChange = toStatus !== fromStatus;
      // Admin Override (adminOverride=true) không đổi status (chặn ở validation phía trên)
      // → nếu có, luôn gắn action ADMIN_OVERRIDE để tách riêng khỏi FIELD_UPDATED thường,
      // phục vụ soát cuối tháng "MO đã chốt nhưng bị Admin sửa lại".
      const action = adminOverride
        ? "ADMIN_OVERRIDE"
        : isStatusChange
        ? toStatus === "SUSPENDED" ? "SUSPENDED"
          : (fromStatus as string) === "SUSPENDED" ? "RESUMED"
          : "STATUS_CHANGED"
        : "FIELD_UPDATED";

      // ── Audit A+B: ghi MO + giá trị CŨ→MỚI của MỌI field sửa qua route này ──
      // Tính `changes` LUÔN LUÔN (kể cả khi kèm đổi status) để không bỏ sót field
      // khi user vừa đổi field vừa đổi status trong cùng một lần lưu.
      const norm = (v: unknown): string => {
        if (v == null) return "";
        if (typeof v === "number") return String(v);
        if (typeof v === "object") {
          // Prisma Decimal → toString ra số; tránh JSON.stringify thêm dấu " gây so lệch.
          const s = String(v);
          return /^-?\d+(\.\d+)?$/.test(s) ? s : JSON.stringify(v);
        }
        return String(v);
      };
      const normDate = (v: unknown): string => {
        if (v == null || v === "") return "";
        const d = v instanceof Date ? v : new Date(v as string);
        return isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
      };
      const oldRoot = (order.productionDetail?.extraData as Record<string, unknown>) ?? {};
      const incoming = scopedItemId
        ? (((extraData as any)?.perItem?.[scopedItemId]) ?? {})
        : ((extraData as any) ?? {});
      const oldScoped = scopedItemId
        ? (((oldRoot.perItem as any)?.[scopedItemId]) ?? {})
        : oldRoot;
      const changes: { field: string; old: string; new: string }[] = [];
      for (const k of Object.keys(incoming)) {
        if (k === "perItem") continue;
        if (norm((oldScoped as any)[k]) !== norm(incoming[k])) changes.push({ field: k, old: norm((oldScoped as any)[k]), new: norm(incoming[k]) });
      }
      // Order-level & ProductionDetail fields — đọc giá trị CŨ THẬT từ `order`
      // (trước đây hard-code rỗng → log sai; nay so old→new đúng để truy vết/phục hồi).
      const oldPd = order.productionDetail as Record<string, unknown> | null;
      const orderFieldChecks: { field: string; included: boolean; old: string; new: string }[] = [
        { field: "customerName",  included: customerName  !== undefined, old: norm(order.customerName),        new: norm(customerName) },
        { field: "salesName",     included: salesName     !== undefined, old: norm(order.salesName),           new: norm(salesName) },
        { field: "nguon",         included: nguon         !== undefined, old: norm(order.nguon),               new: norm(nguon) },
        { field: "phanLoaiKh",    included: phanLoaiKh    !== undefined, old: norm(order.phanLoaiKh),          new: norm(phanLoaiKh) },
        { field: "linkChat",      included: linkChat      !== undefined, old: norm(order.linkChat),            new: norm(linkChat) },
        { field: "donHang3Sao",   included: donHang3Sao   !== undefined, old: norm(order.donHang3Sao),         new: norm(donHang3Sao) },
        { field: "priorityCode",  included: priorityCode  !== undefined, old: norm(order.priorityCode),        new: norm(priorityCode) },
        { field: "saleNote",      included: saleNote      !== undefined, old: norm(order.saleNote),            new: norm(finalSaleNote) },
        { field: "requiredDate",  included: requiredDate  !== undefined, old: normDate(order.requiredDate),    new: normDate(requiredDate) },
        { field: "estimatedDate", included: estimatedDate !== undefined, old: normDate(order.estimatedDate),   new: normDate(estimatedDate) },
        { field: "internalNote",  included: internalNote  !== undefined, old: norm(oldPd?.internalNote),       new: norm(internalNote) },
      ];
      for (const c of orderFieldChecks) {
        if (c.included && c.old !== c.new) changes.push({ field: c.field, old: c.old, new: c.new });
      }
      // Diff field-level trong khâu (Option A) — SL hột, ngày khâu, records từng thợ…
      changes.push(...stageAudit);
      const scopedMo = scopedItemId
        ? ((await tx.orderItem.findUnique({ where: { id: scopedItemId }, select: { moNumber: true } }))?.moNumber ?? null)
        : null;
      // Chỉ ghi lịch sử khi THẬT SỰ có nội dung: có field đổi HOẶC có đổi trạng thái.
      // Không ghi entry no-op (changes rỗng + trạng thái không đổi) — tránh dòng "Sửa
      // thông tin —" rác (VD luồng lưu luôn gọi patchProduction dù tab SX không đổi gì).
      // An toàn: mọi thay đổi thật đều đã nằm trong `changes` (gồm stageAudit) hoặc
      // fromStatus !== toStatus, nên không bao giờ bỏ sót log thật.
      // Admin Override: chỉ ghi log khi THẬT có field đổi (yêu cầu — không tạo log rỗng
      // chỉ vì admin bấm vào chế độ sửa rồi không đổi gì). Status không đổi được trong
      // luồng override (chặn ở validation) nên worthLogging ở đây tương đương changes.length > 0.
      const worthLogging = adminOverride
        ? changes.length > 0
        : changes.length > 0 || fromStatus !== toStatus;
      if (worthLogging) {
        // Tầng 1: gắn cờ khi field quan trọng bị xoá trắng (có→rỗng) để soát/khôi phục.
        const clearedFields = detectClearedFields(changes);
        await tx.workflowHistory.create({
          data: {
            orderId: id,
            action,
            fromStatus,
            toStatus,
            performedById: user.dbId,
            comment: adminOverride ? overrideReason : undefined,
            metadata: {
              scopedItemId: scopedItemId ?? null,
              moNumber: scopedMo,
              ...(stages?.length ? { stagesChanged: true } : {}),
              ...(clearedFields.length ? { suspiciousClear: true, clearedFields } : {}),
              // Phát hiện: sửa ngày/ưu tiên cấp SO trên đơn nhiều MO — ảnh hưởng mọi MO ăn
              // theo giá trị SO. Soát trong Lịch sử thay đổi (không phải lỗi, chỉ cảnh báo).
              ...(affectsMultipleMo ? { affectsMultipleMo: true, affectedMoCount: orderItems.length } : {}),
              // MO đã Hoàn tất/Hủy nhưng bị Admin sửa lại dữ liệu — cờ để lọc riêng trong
              // trang Lịch sử thay đổi (audit cuối tháng).
              ...(adminOverride ? { overriddenTerminalStatus: true, reason: overrideReason } : {}),
              changes,
            } as any,
          },
        });
      }

      return { tag: "OK", data: updated } as const;
    }, { maxWait: 10_000, timeout: 30_000 });

    switch (result.tag) {
      case "NOT_FOUND":
        return Errors.notFound("Order");
      case "CONFLICT":
        return Errors.conflict("Đơn hàng đã được cập nhật bởi người dùng khác. Vui lòng tải lại.");
      case "WRONG_ZONE":
        return Errors.badRequest(`Đơn không ở Xưởng sản xuất (zone: ${result.zone}).`);
      case "NO_PRODUCTION_DETAIL":
        return Errors.badRequest("Chưa có dữ liệu sản xuất cho đơn này.");
      case "LOCKED":
        return Errors.forbidden(terminalLockReason({
          moNumber: result.moNumber,
          itemStatus: result.itemStatus,
          orderStatus: result.orderStatus,
        }));
      case "INVALID_TRANSITION":
        return Errors.badRequest("Chuyển trạng thái không hợp lệ.");
      case "OK":
        // Thông báo Google Chat chạy SAU KHI response đã trả về: transaction đã commit nên
        // không giữ lock DB, và Chat chậm cũng không làm người dùng phải chờ. after() bảo đảm
        // việc vẫn chạy trong vòng đời hàm — promise "gửi rồi quên" có thể bị Vercel cắt.
        if (newAssignmentIds.length > 0) {
          after(() => notifyNewDesign3DAssignments(newAssignmentIds));
        }
        // Đính kèm cảnh báo cấu hình (nếu có) — client hiện toast, KHÔNG coi là lỗi lưu.
        return ok(kpi3DWarning ? { ...result.data, kpi3DWarning } : result.data);
    }
  } catch (err) {
    console.error("[PATCH /api/orders/:id/production]", err);
    return Errors.internal();
  }
}
