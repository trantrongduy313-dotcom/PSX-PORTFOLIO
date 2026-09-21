import type { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import type { Prisma, OrderStatus } from "@/app/generated/prisma/client";
import { ok, Errors } from "@/app/lib/api-response";
import { updateOrderSchema } from "@/app/lib/schemas/order";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { stripVersionSuffix, versionOf, dedupeItemsByMoFamily, NEW_VERSION_SEPARATOR } from "@/app/lib/business/order-helpers";
import { suspendedFlagFor } from "@/app/lib/business/orders/status-transitions";
import { stripMaSoMauForNewVersion } from "@/app/lib/business/orders/ma-so-mau";
import { psxSiblingByMoBase, psxSiblingOf } from "@/app/lib/business/orders/psx-sibling";
import { remapPerItemToVersion } from "@/app/lib/business/version-peritem";
import { canTransition } from "@/app/lib/business/orders/status-transitions";


// ─── PATCH /api/orders/[id] ──────────────────────────────────────────────────
// Body: UpdateOrderInput (see schemas/order.ts)
//
// Conflict detection:
//   Client sends { version: N } — the value it last read.
//   If the DB row has a different version the request is rejected (409).
//   On success the stored version is incremented by 1.
//
// Versioning (Pre-Production):
//   If body includes { createVersion: true }, a full JSON snapshot of the
//   current order is saved to order_versions BEFORE applying changes.

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) return Errors.forbidden();
  if (!["ADMIN", "ORDER"].includes(currentUser.role)) return Errors.forbidden();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.badRequest("Invalid JSON body");
  }

  const parsed = updateOrderSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.validationFailed(parsed.error.issues);
  }

  const {
    version,
    updatedById,
    comment,
    createVersion,
    versionReason,
    activeItemId: scopedItemId,
    status: newStatus,
    ...fields
  } = parsed.data;

  try {
    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Load current order
      const current = await tx.order.findUnique({
        where: { id, deletedAt: null },
        include: { items: true, productionDetail: true },
      });

      if (!current) return null;

      // 2. Optimistic concurrency check
      if (current.version !== version) {
        return "CONFLICT" as const;
      }

      // Block edits on terminal orders/MOs — nhưng mỗi MO độc lập: 1 SO có thể có MO A đã
      // Hoàn tất/Đã hủy trong khi MO B (cùng SO) vẫn đang active. Chặn theo TRẠNG THÁI HIỆU
      // DỤNG của đúng MO đang thao tác (item.itemStatus ?? order.status), không chặn cả SO
      // chỉ vì order.status (kế thừa từ 1 MO khác) đã terminal.
      const scopedItemForGuard = scopedItemId
        ? current.items.find((item: any) => item.id === scopedItemId)
        : null;
      const effectiveStatusForGuard = scopedItemForGuard
        ? (scopedItemForGuard.itemStatus ?? current.status)
        : current.status;
      if (effectiveStatusForGuard === "COMPLETED" || effectiveStatusForGuard === "CANCELLED") {
        return "LOCKED" as const;
      }

      // Validate status transition
      if (newStatus && newStatus !== current.status) {
        if (!canTransition(current.status as string, newStatus, "PRE_PRODUCTION")) {
          return "INVALID_TRANSITION" as const;
        }
      }

      // 3. (Removed) Audit Snapshot Versioning logic has been replaced with V2 Copy-row style.

      // 4. Build update payload — only include explicitly provided fields
      const updateData: Record<string, unknown> = {
        version: { increment: 1 },
      };

      const scalarFields = [
        "donHang3Sao",
        "linkChat",
        "phanLoaiKh",
        "estimatedTotal",
        "depositAmount",
        "finalTotal",
        "designBriefUrl",
        "referenceUrls",
        "assignedToId",
      ] as const;

      for (const key of scalarFields) {
        if (fields[key] !== undefined) {
          updateData[key] = fields[key];
        }
      }

      // Nguồn (SO-wide): đổi nguon phải đồng bộ storeId — storeId là cơ chế phân quyền
      // dữ liệu theo cửa hàng (SALES chỉ thấy đơn thuộc store được gán). Code lạ → 400.
      if (fields.nguon !== undefined && fields.nguon !== current.nguon) {
        const store = await tx.store.findUnique({ where: { code: fields.nguon } });
        if (!store || !store.isActive) return "BAD_NGUON" as const;
        updateData.nguon = fields.nguon;
        updateData.storeId = store.id;
      }

      // 5. Handle status transition
      const fromStatus = current.status;
      let toStatus: OrderStatus = fromStatus as OrderStatus;

      if (newStatus && newStatus !== fromStatus) {
        updateData.status = newStatus;
        toStatus = newStatus;

        const suspendedFlag = suspendedFlagFor(fromStatus, newStatus);
        if (suspendedFlag !== undefined) updateData.isSuspended = suspendedFlag;

        if (newStatus === "COMPLETED") {
          updateData.completedDate = new Date();
        }
      }

      // 6. Apply update hoặc V2-style Copy Row (Tạo phiên bản mới)
      if (createVersion) {
        // V2 ref: WA_QueueBackend.js savePreVersion() — versioning trên MO#, không phải SO#
        // SO# (orderNumber) = từ Odoo, KHÔNG bao giờ thay đổi.
        // MO# của mỗi item mới nhận suffix .N (26.423423 → 26.423423.1 → 26.423423.2)
        //
        // Phát hiện base SO# và version hiện tại:
        //   Chỉ coi last-part là version khi có ≥ 3 phần (YY.main.N)
        //   → tránh parse Odoo 2-part (26.12121312312) thành (base=26, ver=12121312312)
        // ─── SO-level counter: keeps orderNumber unique across all versions of an SO ──
        // Rule: only treat last segment as a version number when the string has ≥ 3 parts
        // (YY.main.N), to avoid misreading Odoo 2-part numbers like "26.12345".
        let baseOrderNumber = current.orderNumber;
        let soVerNum = 0;
        const oParts = current.orderNumber.split(".");
        if (oParts.length >= 3) {
          const last = parseInt(oParts[oParts.length - 1], 10);
          if (!isNaN(last) && String(last) === oParts[oParts.length - 1]) {
            soVerNum = last;
            baseOrderNumber = oParts.slice(0, -1).join(".");
          }
        }

        // Scan ALL orders including soft-deleted — avoids reusing a version number
        // if the prior .N row was soft-deleted (unique constraint would block re-creation).
        const existingSoOrders = await tx.order.findMany({
          where: { orderNumber: { startsWith: `${baseOrderNumber}.` } },
          select: { orderNumber: true },
        });
        for (const ex of existingSoOrders) {
          const p = ex.orderNumber.split(".");
          if (p.length >= 3) {
            const n = parseInt(p[p.length - 1], 10);
            if (!isNaN(n) && String(n) === p[p.length - 1] && n > soVerNum) soVerNum = n;
          }
        }
        const nextSoVer = soVerNum + 1;
        const newOrderNumber = `${baseOrderNumber}.${nextSoVer}`;

        // ─── MO-level counters: each MO tracks its own .1/.2/.3 lineage ─────────────
        // Problem solved: two MOs (e.g. 26.423342 and 26.423343) sharing the same SO
        // each get their own independent counter, so 26.423343's first version is always
        // .1 regardless of how many prior versions exist for other MOs on the same SO.
        //
        // Scan order_items (not orders) and include items from soft-deleted orders —
        // same rationale as SO scan: avoid re-using a MO version number that was deleted.
        // moNumber column has @@index so the LIKE query is index-backed.
        // Gộp theo họ MO TRƯỚC khi nhân bản: đơn gốc có thể chứa nhiều dòng cùng họ (VD
        // "26.36681" và "26.36681.1"), mà mọi dòng cùng họ đều nhận CHUNG một mã mới. Không
        // gộp ở đây thì đơn phiên bản sinh ra các dòng trùng mã — đúng lỗi đã xảy ra ngày
        // 07/08/2026 với đơn 26.10887.1. Chi tiết quy tắc chọn dòng: dedupeItemsByMoFamily.
        const itemsToVersion = dedupeItemsByMoFamily(
          current.items.filter((item: any) => !scopedItemId || item.id === scopedItemId)
        );

        // Dữ liệu CŨ dùng hậu tố "." (VD "26.423343.2"); từ nay CHỈ ghi hậu tố "_" (VD
        // "26.423343_3"). Quét phải bắt được CẢ 2 dạng tiền tố để không đếm sai phiên bản
        // lớn nhất khi 1 MO có lẫn cả bản ghi cũ (".") và mới ("_") — versionOf() đã tự
        // nhận diện cả 2 định dạng, chỉ cần quét theo cả 2 startsWith.
        //
        // QUAN TRỌNG: giới hạn quét theo CÙNG HỌ SO (base orderNumber) — cùng 1 base MO#
        // (VD "26.36864") có thể vô tình bị nhập nhầm/tồn tại ở 2 SO khác nhau (SO A và
        // SO B không liên quan). Quét toàn cục không lọc theo SO sẽ khiến version của MO
        // ở SO B bị "cộng dồn" oan từ các bản version của MO cùng tên ở SO A — sai với
        // nguyên tắc mỗi SO độc lập. Chỉ đếm version trong phạm vi họ SO hiện tại.
        const moNextVerMap = new Map<string, number>();
        for (const item of itemsToVersion) {
          if (!item.moNumber) continue;
          const moBase = stripVersionSuffix(item.moNumber);
          if (moNextVerMap.has(moBase)) continue; // deduplicate — same moBase on multiple items

          const existingMoItems = await tx.orderItem.findMany({
            where: {
              OR: [
                { moNumber: { startsWith: `${moBase}.` } },
                { moNumber: { startsWith: `${moBase}${NEW_VERSION_SEPARATOR}` } },
              ],
              order: {
                OR: [
                  { orderNumber: baseOrderNumber },
                  { orderNumber: { startsWith: `${baseOrderNumber}.` } },
                  { orderNumber: { startsWith: `${baseOrderNumber}_` } },
                ],
              },
            },
            select: { moNumber: true },
          });
          let moVerNum = 0;
          for (const mi of existingMoItems) {
            if (!mi.moNumber) continue;
            const n = versionOf(mi.moNumber);
            if (n > moVerNum) moVerNum = n;
          }
          // MO gốc (bare, chưa từng versioned) được coi là "phiên bản 1 ngầm định" ở tầng
          // hiển thị (xem getMoVersionDisplay/formatMoVersionedDisplay) — nên lần tạo phiên
          // bản ĐẦU TIÊN phải ghi ra "_2", không phải "_1" (tránh trùng hiển thị với bản gốc
          // đã ngầm coi là "_1"). Dùng max(moVerNum, 1) làm sàn thay vì 0 khi tính "+1".
          // Không hồi tố các MO cũ đã lỡ ghi "_1" thật trước khi có rule này.
          moNextVerMap.set(moBase, Math.max(moVerNum, 1) + 1);
        }

        // sortKey = base MO# of the item being versioned — groups this version with its
        // MO family in the sort, independently of other MOs sharing the same SO.
        const scopedItem = scopedItemId
          ? current.items.find((item: any) => item.id === scopedItemId)
          : current.items[0];
        const moSortKey = (scopedItem?.moNumber ? stripVersionSuffix(scopedItem.moNumber) : null)
          ?? baseOrderNumber;

        // Loại bỏ các cột hệ thống, relation, và version-tracking fields khỏi current.
        // baseOrderNumber/versionNumber/sortKey are excluded here and set explicitly below
        // so they always reflect the new order's own lineage — never inherited from the parent.
        const {
          id: _oldId, createdAt: _cAt, updatedAt: _uAt, deletedAt: _dAt,
          items: _items, createdBy: _cb, assignedTo: _at, productionDetail: _pd,
          alerts: _al, workflowHistory: _wh, versions: _vs, _count: _cnt,
          baseOrderNumber: _oldBase, versionNumber: _oldVer, sortKey: _oldSk,
          ...oldData
        } = current as any;

        // Bỏ { version: { increment: 1 } } khỏi updateData
        const { version: _ignoreVersion, ...restUpdateData } = updateData as any;

        // Nếu SO cha đã Hoàn tất/Đã hủy nhưng MO đang version là MO ĐỘC LẬP vẫn active
        // (guard ở trên đã cho qua đúng trường hợp này — effectiveStatus của MO không phải
        // terminal), bản version mới KHÔNG được kế thừa status/zone/completedDate terminal
        // của SO cha qua ...oldData — nếu không, version mới sẽ "ma" xuất hiện ở tab Hoàn
        // tất/Đã hủy dù MO bên trong vẫn đang active. Ép theo đúng trạng thái/zone của MO.
        const soWasTerminal = current.status === "COMPLETED" || current.status === "CANCELLED";
        const terminalOverride = soWasTerminal && scopedItem
          ? {
              status: scopedItem.itemStatus ?? current.status,
              zone: scopedItem.zone,
              completedDate: null,
              isSuspended: false,
            }
          : {};

        // "Ngày tạo" của phiên bản mới = thời điểm bấm Tạo phiên bản (KHÔNG kế thừa ngày của
        // MO gốc). Set ở CẢ item (trường quyết định hiển thị: row.orderDate = item.orderDate ??
        // order.orderDate) LẪN Order (fallback). Chỉ MO được version nhận ngày này — MO/SO gốc
        // & anh em không bị đụng vì luồng này chỉ TẠO MỚI bản ghi, không sửa bản cũ.
        const versionCreatedAt = new Date();

        const newOrder = await tx.order.create({
          data: {
            ...oldData,
            ...restUpdateData,
            ...terminalOverride,
            orderNumber: newOrderNumber,
            version: 1, // Reset optimistic version cho bản ghi mới
            orderDate: versionCreatedAt, // Ngày tạo = hôm nay, không kế thừa từ bản gốc
            // Explicit version lineage — never inherited via ...oldData spread
            baseOrderNumber,          // SO lineage — used for SO-level version scan
            versionNumber: nextSoVer, // SO-level counter — ensures monotonic order within sortKey group
            sortKey:       moSortKey, // base MO# — groups this version with its MO family only
            items: {
              create: itemsToVersion.map((item: any) => {
                const { id: _iId, orderId: _oId, createdAt: _iCAt, updatedAt: _iUAt, ...itemData } = item;
                // MO# uses the per-MO independent counter so each MO's first version
                // is always _1, regardless of other MOs versioned earlier on the same SO.
                // Luôn ghi hậu tố "_" (dữ liệu mới) — kể cả khi MO gốc đang có bản ghi cũ
                // dùng "." (moNextVerMap đã đếm đúng phiên bản lớn nhất qua cả 2 định dạng).
                const moBase = itemData.moNumber ? stripVersionSuffix(itemData.moNumber) : null;
                const moVer  = moBase ? moNextVerMap.get(moBase) : undefined;
                // 🔴 GỠ `masoMau` TƯỜNG MINH. Phép chép `...itemData` mang MỌI cột sang bản
                // mới — đó là tính năng, nhưng mã số mẫu là ngoại lệ: bản mới là một thiết kế
                // khác. Và ô này bị ẨN ở PTK, nên nếu để nó kế thừa thì bản mới mang một mã
                // KHÔNG AI NHÌN THẤY cho tới lúc sang PSX. Xem business/orders/ma-so-mau.ts.
                return {
                  ...stripMaSoMauForNewVersion(itemData as Record<string, unknown>),
                  moNumber: moBase && moVer != null ? `${moBase}${NEW_VERSION_SEPARATOR}${moVer}` : itemData.moNumber,
                  orderDate: versionCreatedAt, // Ngày tạo MO phiên bản = hôm nay (quyết định cột "Ngày tạo")
                };
              })
            }
          },
          include: {
            items: true,
            createdBy: { select: { id: true, name: true, role: true } },
            assignedTo: { select: { id: true, name: true, role: true } },
          },
        });

        // Copy productionDetail (dữ liệu Thiết Kế + Sản Xuất) sang version mới.
        // Trước đây server bỏ qua productionDetail → version mới mất toàn bộ design/
        // production khi user không sửa tab đó. extraData.perItem được key theo item ID
        // → phải remap sang item ID MỚI của version (dò theo base MO#, như client).
        const oldPD = (current as any).productionDetail;
        if (oldPD) {
          // Remap perItem sang item ID mới của version — CHỈ giữ MO thuộc version (MO anh em
          // ở lại SO gốc không copy). Xem remapPerItemToVersion: chống "perItem mồ côi" gây
          // KPI đếm trùng + dòng "Chưa có tên" ở màn Đánh giá Khâu.
          const oldExtra = (oldPD.extraData ?? {}) as Record<string, unknown>;
          const oldPerItem = (oldExtra.perItem as Record<string, unknown> | undefined) ?? {};
          const newPerItem = remapPerItemToVersion(oldPerItem, current.items, newOrder.items);
          const newExtra = { ...oldExtra, perItem: newPerItem };

          // Copy mọi field của PD trừ field hệ thống/unique (id, orderId, productionCode)
          const {
            id: _pdId, orderId: _pdOrderId, productionCode: _pdCode,
            createdAt: _pdCAt, updatedAt: _pdUAt, extraData: _pdExtra,
            ...pdScalars
          } = oldPD as Record<string, unknown>;

          await tx.productionDetail.create({
            data: {
              ...(pdScalars as Prisma.ProductionDetailCreateInput),
              order: { connect: { id: newOrder.id } },
              extraData: newExtra as Prisma.InputJsonValue,
            },
          });
        }

        // Ghi log cho bản cũ
        await tx.workflowHistory.create({
          data: {
            orderId: current.id,
            action: "COMMENT_ADDED",
            comment: `Đã tạo phiên bản mới: ${newOrderNumber} (MO: ${newOrder.items[0]?.moNumber ?? "—"})`,
            performedById: currentUser.dbId,
          }
        });

        // Log cho bản mới
        await tx.workflowHistory.create({
          data: {
            orderId: newOrder.id,
            action: "CREATED",
            comment: `Phiên bản ${nextSoVer} — tạo từ: ${current.orderNumber}`,
            performedById: currentUser.dbId,
          }
        });

        return newOrder;
      }

      // Update in-place (Normal case)
      const result = await tx.order.update({
        where: { id },
        data: updateData,
        include: {
          items: true,
          createdBy: { select: { id: true, name: true, role: true } },
          assignedTo: { select: { id: true, name: true, role: true } },
        },
      });

      // 7. Determine workflow action and append history
      const isStatusChange = toStatus !== fromStatus;
      const action = isStatusChange
        ? toStatus === "SUSPENDED"
          ? "SUSPENDED"
          : fromStatus === "SUSPENDED"
          ? "RESUMED"
          : "STATUS_CHANGED"
        : "FIELD_UPDATED";

      // Audit A+B: ghi giá trị CŨ→MỚI cho các field SO-wide (trước đây chỉ ghi tên field).
      const norm = (v: unknown): string => {
        if (v == null) return "";
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (typeof v === "number") return String(v);
        if (typeof v === "object") {
          // Prisma Decimal (estimatedTotal, depositAmount…) → toString ra số;
          // tránh JSON.stringify thêm dấu " gây so lệch (false positive).
          const s = String(v);
          return /^-?\d+(\.\d+)?$/.test(s) ? s : JSON.stringify(v);
        }
        return String(v);
      };
      const cur = current as Record<string, unknown>;
      const changes: { field: string; old: string; new: string }[] = [];
      for (const k of Object.keys(updateData)) {
        // version/isSuspended là field dẫn xuất — không log nhiễu.
        // storeId là FK đi kèm nguon (đã log nguon dạng human-readable).
        if (k === "version" || k === "isSuspended" || k === "storeId") continue;
        if (norm(cur[k]) !== norm(updateData[k])) {
          changes.push({ field: k, old: norm(cur[k]), new: norm(updateData[k]) });
        }
      }

      // Chỉ ghi lịch sử khi THẬT SỰ có nội dung: field đổi / trạng thái đổi / có ghi chú.
      // Bỏ entry no-op (changes rỗng + status không đổi + không comment) — tránh dòng
      // "Sửa thông tin —" rác. An toàn: thay đổi thật luôn nằm trong changes hoặc status.
      const worthLogging = changes.length > 0 || fromStatus !== toStatus || (!!comment && comment.trim() !== "");
      if (worthLogging) {
        await tx.workflowHistory.create({
          data: {
            orderId: id,
            action,
            fromStatus,
            toStatus,
            comment,
            metadata: changes.length > 0 || action === "FIELD_UPDATED" ? { changes } : undefined,
            performedById: currentUser.dbId,
          },
        });
      }

      return result;
    }, { maxWait: 10_000, timeout: 30_000 });

    if (updated === null) return Errors.notFound("Order");
    if (updated === "CONFLICT") {
      return Errors.conflict(
        "Order was modified by another user. Reload the order and retry."
      );
    }
    if (updated === "LOCKED") {
      return Errors.forbidden("Đơn hàng đã hoàn tất hoặc hủy — không thể chỉnh sửa.");
    }
    if (updated === "INVALID_TRANSITION") {
      return Errors.badRequest("Chuyển trạng thái không hợp lệ.");
    }
    if (updated === "BAD_NGUON") {
      return Errors.badRequest("Nguồn không hợp lệ — không tìm thấy cửa hàng tương ứng.");
    }

    return ok(updated);
  } catch (err) {
    console.error("[PATCH /api/orders/:id]", err);
    return Errors.internal();
  }
}

// ─── GET /api/orders/[id] ────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const viewer = await getCurrentUser();
  if (!viewer) return Errors.forbidden();

  try {
    const order = await prisma.order.findUnique({
      where: { id, deletedAt: null },
      include: {
        items: { orderBy: { lineNumber: "asc" } },
        productionDetail: true,
        // Lượt giao việc 3D — NGUỒN SỰ THẬT cho ngày hoàn tất / kết quả KPI / trạng thái kiểm.
        // Trước đây sidebar đọc mấy trường này từ bản sao JSON trong extraData, mà bản sao đó
        // lại do chính form điều khiển: server ghi vào, form tính lại rồi ghi đè. Đọc thẳng
        // từ đây thì chỉ còn MỘT nguồn, và MO cũ hiện đúng ngay mà không cần backfill.
        design3DAssignments: {
          // KHÔNG còn lọc bỏ REASSIGNED/CANCELLED ở đây.
          //
          // Sidebar cần CẢ LỊCH SỬ để hiện "MO này làm mấy lần và vì sao" — lọc ở tầng truy vấn
          // thì lượt cũ không bao giờ tới được client và chuỗi liên kết (reassignedFromId) trở
          // thành dữ liệu chết. Không thể select cùng một quan hệ hai lần với hai điều kiện, nên
          // lấy hết và lọc ở chỗ dùng.
          //
          // ⚠️ MỌI chỗ dựng KHỐI TRƯỜNG theo từng NV 3D phải gọi activeAttempts() trước, nếu
          // không sidebar sẽ mọc thêm một khối cho mỗi lượt đã đóng.
          // TĂNG dần: thứ tự tạo chính là thứ tự các ô NV 3D trên panel (người thứ nhất trước).
          // Trước đây giảm dần vì panel chỉ lấy phần tử đầu làm "lượt hiện hành"; nay panel
          // dựng một khối cho MỖI người nên thứ tự phải khớp với thứ tự hiển thị.
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            orderItemId: true,
            status: true,
            assignedAt: true,
            deadlineAt: true,
            completedAt: true,
            kpiStatus: true,
            // `kpiDeltaMinutes` CỐ Ý KHÔNG lấy. Panel này không hiển thị Sớm/Trễ (chỉ hiện nhãn
            // Đúng hạn/Trễ hạn), và cột đó là giá trị đã đóng dấu — mọi lượt xong trước bản sửa
            // lỗi trộn đơn vị vẫn giữ số đo bằng giờ tường. Trả một con số hỏng ra API là để sẵn
            // một cái bẫy cho người đầu tiên quyết định hiện nó lên.
            // Cần Sớm/Trễ thì suy ra: business/kpi-3d/kpi-delta.ts.
            standardMinutesSnapshot: true,
            acknowledgedAt: true,
            notifiedAt: true,
            reviewStatus: true,
            reviewNote: true,
            reworkCount: true,
            // Hai trường dựng nên chuỗi "lần 1 → lần 2 → lần 3" và nhãn vì sao có lần đó.
            reassignedFromId: true,
            continuationReason: true,
            // Một MO có thể có NHIỀU NV 3D cùng làm. Không có tên ở đây thì panel không dựng
            // nổi khối theo từng người — nó chỉ biết "có mấy lượt", không biết của ai.
            actualMinutes: true,
            designer3DId: true,
            designer3D: { select: { id: true, name: true, code: true } },
            // Tên nhóm KPI để ô "Nhóm KPI 3D" của khối đọc được thông số THẬT của lượt.
            // Thiếu nó, ô đó chỉ có thể đọc từ JSON — và JSON không đổi khi hệ thống tự tạo một
            // lượt mới (mở lại sau tạm dừng), nên form hiện thông số của lượt CŨ.
            kpiGroup: { select: { id: true, name: true } },
            // Khoảng bị tạm dừng — BẮT BUỘC cho phép tính giờ thực tế, không phải để trang trí.
            // Thiếu nó, toDesign3DAssignmentView nhận `pauses = []` mặc định và KHÔNG trừ thời
            // gian bị gác, trong khi màn Việc thiết kế 3D thì trừ. Cùng một lượt ra hai con số.
            // TĂNG dần để hours-ledger đọc các lần chốt đúng thứ tự thời gian.
            pauses: {
              orderBy: { pausedAt: "asc" },
              select: {
                id: true,
                pausedAt: true,
                resumedAt: true,
                confirmedMinutes: true,
                reason: true,
              },
            },
            // Link File Render lấy từ dòng tiến độ mới nhất có link — không chiếu sang JSON nữa.
            progressLogs: {
              where: { renderInfoUrl: { not: null } },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { renderInfoUrl: true, createdAt: true },
            },
            // ─── GIỜ TĂNG CA ĐÃ DUYỆT ─────────────────────────────────────
            //
            // ⚠️ CHỈ `APPROVED`. Bản chờ duyệt mà lọt ra đây thì nhân viên tự dựng được một khối
            // "đã làm thêm 2 giờ" trên đơn hàng chỉ bằng cách bấm khai báo — tức tự cấp cho mình
            // một dòng công mà chưa ai đồng ý. Bản bị từ chối thì lại càng không.
            //
            // Lọc ở TẦNG TRUY VẤN, không phải ở client: dữ liệu lương không nên rời khỏi server
            // rồi mới được lọc. Xem thêm VIEW_OVERTIME_RECORD — ai được nhìn khối này.
            //
            // Tăng ca gắn với LƯỢT GIAO VIỆC nên nó tự biết thuộc MO nào và của ai; không có chỗ
            // nào phải chọn lại hay đoán.
            overtimeRequests: {
              where: { status: "APPROVED" },
              orderBy: { startAt: "asc" },
              select: {
                id: true,
                startAt: true,
                endAt: true,
                minutes: true,
                reason: true,
                designer3D: { select: { id: true, name: true } },
                approvedBy: { select: { name: true } },
              },
            },
          },
        },
        createdBy: { select: { id: true, name: true, role: true } },
        assignedTo: { select: { id: true, name: true, role: true } },
        alerts: {
          where: { isResolved: false },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        workflowHistory: {
          orderBy: { performedAt: "desc" },
          take: 20,
          include: {
            performedBy: { select: { id: true, name: true, role: true } },
          },
        },
        _count: { select: { versions: true } },
      },
    });

    if (!order) return Errors.notFound("Order");

    // ─── MO NÀY ĐÃ CÓ BẢN ANH EM BÊN PSX CHƯA ─────────────────────────────────
    //
    // Bảng Danh sách đơn hàng đã hiện huy hiệu này từ lâu, SIDEBAR THÌ KHÔNG — route chi tiết
    // trước đây không hề tính nó. Hậu quả: người ở PTK mở một MO đã chuyển sang sản xuất và
    // không có gì nói cho họ biết; họ sửa, tưởng mình đang sửa cái đang chạy ngoài xưởng.
    //
    // CHỈ BÁO, KHÔNG KHOÁ: bản PTK là một phiên bản riêng, sửa nó là hợp lệ. Cái thiếu chỉ là
    // để người dùng biết mình đang sửa bản nào.
    //
    // `startsWith` là bộ lọc THÔ cho nhanh — "26.1234" khớp nhầm cả "26.12345". Đối chiếu lại
    // bằng stripVersionSuffix nằm trong psxSiblingByMoBase, không lặp ở đây.
    const moBases = new Set(
      order.items.map((it) => (it.moNumber ? stripVersionSuffix(it.moNumber) : null)).filter((b): b is string => !!b),
    );
    let itemsWithSibling = order.items as Array<Record<string, unknown>>;
    if (moBases.size > 0) {
      const psxItems = await prisma.orderItem.findMany({
        where: { zone: "MASTER_HUB", OR: [...moBases].map((b) => ({ moNumber: { startsWith: b } })) },
        select: { moNumber: true, itemStatus: true, order: { select: { orderNumber: true, status: true } } },
      });
      const byBase = psxSiblingByMoBase(
        psxItems.map((it) => ({
          moNumber: it.moNumber,
          itemStatus: it.itemStatus,
          orderStatus: it.order.status,
          orderNumber: it.order.orderNumber,
        })),
        moBases,
      );
      itemsWithSibling = order.items.map((it) => ({
        ...it,
        psxSibling: psxSiblingOf({ moNumber: it.moNumber, zone: it.zone }, byBase),
      }));
    }

    return ok({ ...order, items: itemsWithSibling });
  } catch (e) {
    console.error("[GET /api/orders/:id]", e);
    return Errors.internal();
  }
}
