import type { NextRequest } from "next/server";
import { after } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";
import { updateOrderItemSchema } from "@/app/lib/schemas/order";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { detectClearedFields } from "@/app/lib/business/suspicious-clear";
import { notifyDesign3DPriorityChange } from "@/app/lib/notify/notify-design-3d";
import { canEditMaSoMau, maSoMauWriteAttempted } from "@/app/lib/business/orders/ma-so-mau";
import { canRoleWriteField, pickWritableItemColumns } from "@/app/lib/business/orders/item-writable-fields";
import { describeDbError } from "@/app/lib/business/db-error";

// ─── PATCH /api/orders/[id]/items/[itemId] ───────────────────────────────────
// Cập nhật các trường sản phẩm từ sidebar (V2: Tab Sản phẩm + Kỹ thuật)
// Body: UpdateOrderItemInput
//
// Các trường V2 → V3:
//   TEN_SP        → productName
//   NVL           → nvl
//   XI_MA         → platingType
//   SIZE          → size
//   TRONG_LUONG_YC→ weightGram
//   LOAI_HOT_CHU  → mainStoneType
//   DA_CHU        → mainStoneSize
//   ANH_FILE_3D   → designFileUrl
//   GHI_CHU_SP    → specifications.ghiChuSp
//   CHI_TIET_DA_TAM → specifications.chiTietDaTam

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id, itemId } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) return Errors.forbidden();
  // RND vào được route này để nhập ĐÚNG MỘT cột. Tầng thứ hai — `pickWritableItemColumns` với
  // vai của họ — quyết định cột nào thật sự được ghi; xem business/orders/item-writable-fields.ts.
  if (!["ADMIN", "ORDER", "PRODUCTION", "RND"].includes(currentUser.role)) return Errors.forbidden();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Errors.badRequest("Invalid JSON body");
  }

  const parsed = updateOrderItemSchema.safeParse(body);
  if (!parsed.success) {
    return Errors.validationFailed(parsed.error.issues);
  }

  // ── Ưu tiên thiết kế 3D: chỉ ADMIN/ORDER được đặt ───────────────────────────
  //
  // Route này mở cho cả PRODUCTION (họ sửa NVL, xi mạ, ghi chú kỹ thuật…). Nhưng ưu tiên thiết kế
  // là quyết định ĐIỀU PHỐI — ai làm trước ai — nên chỉ quản lý và Đặt đơn đặt được.
  //
  // Chặn ở đây, TRƯỚC transaction, và CHỈ khi field có mặt: nếu chặn cả request thì PRODUCTION
  // mất luôn quyền sửa những field họ vốn được sửa. Giao diện đã ẩn ô chọn với họ, nhưng ẩn ở
  // trình duyệt không phải chốt chặn — một request tự dựng vẫn tới được đây.
  if (parsed.data.design3DPriorityCode !== undefined && !["ADMIN", "ORDER"].includes(currentUser.role)) {
    return Errors.forbidden("Chỉ Quản lý hoặc Đặt đơn được điều chỉnh Ưu tiên thiết kế 3D.");
  }

  // ── Đổi TRẠNG THÁI MO: TỪ CHỐI, không lọc âm thầm ───────────────────────────
  //
  // 🔴 KHÁC HẲN CÁC CỘT KHÁC, VÀ CÓ LÝ DO. Với cột dữ liệu thuần, lọc là đủ: field bị bỏ, phần
  // còn lại lưu bình thường, không ai bị chặn oan. Với `itemStatus` thì KHÔNG: bên dưới có một
  // loạt nhánh đọc THẲNG `parsed.data.itemStatus` — hủy MO, gỡ tạm ngưng, hoàn tất cả SO, ghi
  // WorkflowHistory. Lọc khỏi `updateData` chỉ chặn được phép ghi cột; các side effect vẫn chạy.
  //
  // Tức là lọc ở đây sẽ tạo ra đúng thứ tệ nhất: MO bị hủy bởi một vai không có quyền hủy, và
  // API trả 200. Đổi một lỗi im lặng thành một lỗi lên tiếng.
  if (parsed.data.itemStatus !== undefined && !canRoleWriteField(currentUser.role, "itemStatus")) {
    return Errors.forbidden("Vai này không được đổi trạng thái MO.");
  }

  // ── Mã số mẫu: chỉ ở PSX ────────────────────────────────────────────────────
  //
  // Ràng buộc theo ZONE, không theo vai — vai đã được bảng cột trả lời. Kiểm ở đây, TRƯỚC
  // transaction. Giao diện ẩn ô ở PTK, nhưng ẩn không phải chặn.
  //
  // 🔴 GÁC THEO THAY ĐỔI, KHÔNG THEO SỰ CÓ MẶT — bản trước hỏi `!== undefined` và đã chặn người
  // dùng thật: sidebar gửi CẢ CỤM field mỗi lần Lưu, nên một MO ở PTK (ô bị ẩn, giá trị rỗng)
  // vẫn gửi `masoMau: null` và cả lần lưu hỏng vì một ô họ không nhìn thấy. Xem
  // maSoMauWriteAttempted.
  if (parsed.data.masoMau !== undefined) {
    const item = await prisma.orderItem.findFirst({
      where: { id: itemId, orderId: id },
      select: { zone: true, masoMau: true },
    });
    if (!item) return Errors.notFound("Không tìm thấy MO này trong đơn hàng.");
    if (
      maSoMauWriteAttempted(parsed.data.masoMau, item.masoMau) &&
      !canEditMaSoMau(currentUser.role, item.zone)
    ) {
      return Errors.forbidden("Mã số mẫu chỉ nhập được khi MO đã chuyển sang Phòng Sản Xuất.");
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Kiểm tra item thuộc đơn hàng này
      const existing = await tx.orderItem.findFirst({
        where: { id: itemId, orderId: id },
      });
      if (!existing) return { tag: "ITEM_NOT_FOUND" } as const;

      // 2. Lấy thông tin order đi kèm
      const order = await tx.order.findUnique({
        where: { id, deletedAt: null },
      });
      if (!order) return { tag: "ORDER_NOT_FOUND" } as const;

      // Block edits on terminal MO — theo TRẠNG THÁI HIỆU DỤNG của đúng item đang sửa
      // (existing.itemStatus ?? order.status), không chặn cả SO chỉ vì order.status (kế
      // thừa từ 1 MO KHÁC cùng SO) đã Hoàn tất/Đã hủy. Mỗi MO độc lập — MO đang active
      // (VD DRAFT) trong 1 SO đã COMPLETED do MO khác vẫn phải sửa/hủy được bình thường.
      const effectiveItemStatus = (existing as any).itemStatus ?? order.status;
      const isAdminOverride = parsed.data.adminOverride === true && currentUser.role === "ADMIN";
      if ((effectiveItemStatus === "COMPLETED" || effectiveItemStatus === "CANCELLED") && !isAdminOverride) {
        return { tag: "ORDER_LOCKED" } as const;
      }

      // Optimistic concurrency: reject if client has a stale version
      const { version, specifications: specPatch, ...scalarFields } = parsed.data;
      if (version !== undefined && order.version !== version) {
        return { tag: "CONFLICT" } as const;
      }

      // ⚠️ NĂM FIELD DƯỚI ĐÂY ĐI VÒNG QUA `pickWritableItemColumns` — chúng được destructure ra
      // để biến đổi trước khi ghi. Suốt thời gian đó KHÔNG AI GÁC CHÚNG. Vô hại khi mọi vai vào
      // được route đều có quyền đầy đủ; vai RND biến nó thành lỗ thật.
      // Nay mỗi nhóm hỏi cùng một bảng mà các cột khác đang hỏi.
      const mayWrite = (field: string) => canRoleWriteField(currentUser.role, field);

      // Merge specifications JSON — giữ nguyên các key cũ, chỉ cập nhật key mới
      let mergedSpecs: Record<string, unknown> | null =
        (existing.specifications as Record<string, unknown> | null) ?? null;
      if (specPatch && Object.keys(specPatch).length > 0 && mayWrite("specifications")) {
        mergedSpecs = { ...(mergedSpecs ?? {}), ...specPatch };
      }

      // Chỉ gửi các field được cung cấp (không undefined)
      const updateData: Record<string, unknown> = {};
      // Ngày HT do user TỰ NHẬP + lưu per-MO (extraData.perItem[id].completedDate).
      // KHÔNG tự đóng dấu completedAt=now khi Hoàn tất — nếu user không nhập thì để TRỐNG
      // (phương án b: MO vẫn sang tab Hoàn tất nhưng KPI/lọc theo Ngày HT không tính).
      // Vẫn xoá completedAt khi rời trạng thái terminal (VD resume) để không còn ngày cũ.
      if (parsed.data.itemStatus !== undefined && parsed.data.itemStatus !== "COMPLETED") {
        updateData.completedAt = null;
      }
      // Per-MO date/priority fields need special handling; exclude from generic loop
      const { estimatedDate: edRaw, requiredDate: rdRaw, saleNote: snRaw, priorityCode: pcRaw } = scalarFields as Record<string, unknown>;

      // ⚠️ DANH SÁCH TRẮNG, KHÔNG PHẢI "MỌI FIELD CÒN LẠI".
      //
      // Bản trước chép mọi field còn lại của payload vào đây. Payload có cả FIELD ĐIỀU KHIỂN
      // (`statusReason`, `adminOverride`) — chúng KHÔNG phải cột của order_items, nên Prisma ném
      // `Unknown argument` → 500 "An unexpected error occurred". Hủy MO thì dialog bắt buộc nhập
      // lý do nên `statusReason` LUÔN có mặt: hủy từng MO hỏng 100%, và không ai lần ra được vì
      // thông báo lỗi không nói gì.
      //
      // Danh sách + lý do đầy đủ ở business/orders/item-writable-fields.ts, có unit test riêng.
      //
      // Truyền VAI: danh sách trắng có hai tầng — route gác AI vào được (ngay đầu hàm), bảng
      // theo vai gác VÀO RỒI THÌ GHI ĐƯỢC CỘT NÀO. Vai không bị hạn chế nhận danh sách đầy đủ,
      // nên dòng này không đổi hành vi của ADMIN/ORDER/PRODUCTION.
      Object.assign(updateData, pickWritableItemColumns(scalarFields as Record<string, unknown>, currentUser.role));
      // Per-MO fields: estimatedDate, requiredDate, saleNote, priorityCode
      if (edRaw !== undefined && mayWrite("estimatedDate")) {
        updateData.estimatedDate = edRaw ? new Date(edRaw as string) : null;
      }
      if (rdRaw !== undefined && mayWrite("requiredDate")) {
        updateData.requiredDate = rdRaw ? new Date(rdRaw as string) : null;
      }
      if (snRaw !== undefined && mayWrite("saleNote")) {
        updateData.saleNote = snRaw;
      }
      if (pcRaw !== undefined && mayWrite("priorityCode")) {
        updateData.priorityCode = pcRaw;
        updateData.isPriority = pcRaw === "UT1" || pcRaw === "UT2";
        updateData.isRush = pcRaw === "UT1";
      }
      if (specPatch !== undefined && mayWrite("specifications")) {
        updateData.specifications = mergedSpecs;
      }

      const updated = await tx.orderItem.update({
        where: { id: itemId },
        data: updateData,
      });

      // ── Audit A+B: nhật ký thay đổi field PER-MO có giá trị CŨ→MỚI ──
      // Ghi cho MỌI field sửa (nvl, ngày, ưu tiên, specifications…) để truy vết
      // "ai đổi MO nào, field gì, từ gì → thành gì" và phục hồi được khi ghi sai.
      // itemStatus không log ở đây (đã có STATUS_CHANGED riêng).
      {
        const norm = (v: unknown): string => {
          if (v === null || v === undefined) return "";
          if (v instanceof Date) return v.toISOString().slice(0, 10);
          if (typeof v === "number") return String(v);
          if (typeof v === "object") {
            // Prisma Decimal (weightGram, unitPrice…) có toString ra chuỗi số → dùng luôn,
            // tránh JSON.stringify thêm dấu " gây so lệch "12" vs 12 (false positive).
            const s = String(v);
            return /^-?\d+(\.\d+)?$/.test(s) ? s : JSON.stringify(v);
          }
          return String(v);
        };
        const ex = existing as Record<string, unknown>;
        const changes: { field: string; old: string; new: string }[] = [];
        for (const [key, val] of Object.entries(updateData)) {
          if (key === "itemStatus" || key === "completedAt" || key === "isPriority" || key === "isRush") continue;
          if (key === "specifications") {
            // So từng key spec đã đổi
            const oldSpec = (ex.specifications as Record<string, unknown> | null) ?? {};
            const newSpec = (val as Record<string, unknown> | null) ?? {};
            for (const sk of Object.keys(newSpec)) {
              if (norm(oldSpec[sk]) !== norm(newSpec[sk])) changes.push({ field: `spec.${sk}`, old: norm(oldSpec[sk]), new: norm(newSpec[sk]) });
            }
            continue;
          }
          if (norm(ex[key]) !== norm(val)) changes.push({ field: key, old: norm(ex[key]), new: norm(val) });
        }
        if (changes.length > 0) {
          // Tầng 1: gắn cờ khi field quan trọng bị xoá trắng (có→rỗng) — gồm override
          // KH/Sale ghi dạng "spec.customerName"/"spec.salesName".
          const clearedFields = detectClearedFields(changes);
          await tx.workflowHistory.create({
            data: {
              orderId: id,
              action: "FIELD_UPDATED",
              performedById: currentUser.dbId,
              metadata: {
                itemId,
                moNumber: (existing as any).moNumber ?? null,
                ...(clearedFields.length ? { suspiciousClear: true, clearedFields } : {}),
                changes,
              },
            },
          });
        }
      }

      // Khi đánh dấu isShowroom=true trong PSX → cập nhật productionCode để thêm -SR
      if (specPatch?.isShowroom === true && order.zone === "MASTER_HUB") {
        const detail = await tx.productionDetail.findUnique({ where: { orderId: id } });
        if (detail?.productionCode && !detail.productionCode.endsWith("-SR")) {
          await tx.productionDetail.update({
            where: { orderId: id },
            data: { productionCode: `${detail.productionCode}-SR` },
          });
        }
      }

      // ── HỦY MỘT MO: ghi lại DẤU VẾT (ngày + lý do) ──────────────────────────
      //
      // Trước đây hủy per-MO KHÔNG để lại gì: workflowHistory chỉ được tạo ở khối
      // "auto-complete/cancel" phía dưới, mà khối đó chỉ chạy khi TOÀN BỘ MO đã terminal.
      // Hủy 1 MO trong SO 3 MO thì không có bản ghi nào → không có ngày hủy, không có lý do.
      // Còn `completedDate` thì bị set null khi hủy, nên cũng không dùng làm mốc được.
      //
      // Ghi vào workflowHistory thay vì thêm cột `cancelledAt`/`cancelReason` vào OrderItem:
      // KHÔNG CẦN MIGRATION trên DB production, và đây đã là nơi lưu dấu vết của mọi hành
      // động khác (SUSPENDED, RESUMED, STATUS_CHANGED) — thêm cột mới sẽ là nguồn thứ hai
      // cho cùng một loại dữ liệu.
      //
      // `scopedItemId` là khoá để đọc ngược ra đúng MO — cùng quy ước với entry SUSPENDED
      // mà route list đang dùng để nối alert về từng item.
      // Dùng lại `effectiveItemStatus` đã tính ở trên thay vì đọc lại existing.itemStatus: nó
      // chính là trạng thái hiệu dụng của MO này. Điều kiện "chưa CANCELLED" chặn ghi trùng
      // khi ADMIN dùng adminOverride hủy lại một MO đã hủy.
      if (parsed.data.itemStatus === "CANCELLED" && effectiveItemStatus !== "CANCELLED") {
        await tx.workflowHistory.create({
          data: {
            orderId: id,
            action: "STATUS_CHANGED",
            fromStatus: effectiveItemStatus,
            toStatus: "CANCELLED",
            // Lý do là chuỗi người dùng gõ. Không có thì để null — KHÔNG bịa một câu mặc
            // định như "Đã hủy", vì bảng sẽ hiện nó y như một lý do thật do người ghi.
            comment: parsed.data.statusReason?.trim() || null,
            metadata: {
              scopedItemId: itemId,
              moNumber: existing.moNumber ?? null,
              reason: parsed.data.statusReason?.trim() || null,
            },
            performedById: currentUser.dbId,
          },
        });
      }

      // ── Per-item alert auto-resolve: khi item SUSPENDED → any non-SUSPENDED status ──
      // NOTE: itemStatus=null is a valid "cleared/resumed" state (Showroom uses it).
      // The condition must NOT exclude null — otherwise Showroom action leaves alert unresolved.
      if (
        parsed.data.itemStatus !== undefined &&
        parsed.data.itemStatus !== "SUSPENDED" &&
        (existing as any).itemStatus === "SUSPENDED"
      ) {
        // Find the specific alert that suspended THIS item via workflowHistory metadata
        const suspendEntry = await tx.workflowHistory.findFirst({
          where: {
            orderId: id,
            action: "SUSPENDED",
            metadata: { path: ["scopedItemId"], equals: itemId },
          },
          orderBy: { performedAt: "desc" },
          select: { metadata: true },
        });
        const alertId = (suspendEntry?.metadata as Record<string, unknown>)?.alertId as string | undefined;

        const resolvedNote = parsed.data.itemStatus === "COMPLETED"
          ? "Auto-resolved: MO hoàn tất"
          : parsed.data.itemStatus === "CANCELLED"
          ? "Auto-resolved: MO đã hủy"
          : parsed.data.itemStatus === null
          ? "Auto-resolved: MO được xử lý (Showroom/Resume)"
          : "Auto-resolved: MO tiếp tục sản xuất";

        if (alertId) {
          // Resolve only the specific alert for this item.
          //
          // `updateMany` CHỨ KHÔNG PHẢI `update`, và đó là chốt chặn chứ không phải thói quen:
          // alertId đọc từ metadata của một bản ghi lịch sử CŨ, nên nó có thể trỏ tới một alert
          // đã bị xoá. `update` sẽ ném P2025 → cả transaction rollback → 500, và người dùng chỉ
          // thấy "An unexpected error occurred" khi đổi trạng thái một MO từng bị tạm ngưng.
          // Không có alert để đóng thì đó không phải lỗi — chỉ là không có gì để làm.
          await tx.alert.updateMany({
            where: { id: alertId },
            data: { isResolved: true, resolvedAt: new Date(), resolvedNote },
          });
        } else {
          // No specific alert found (legacy data) → resolve all unresolved
          await tx.alert.updateMany({
            where: { orderId: id, isResolved: false },
            data: { isResolved: true, resolvedAt: new Date(), resolvedNote },
          });
        }
      }

      // ── Smart SO sync: reset khi TẤT CẢ MO đã được xử lý (không còn null/SUSPENDED) ──
      if (
        parsed.data.itemStatus !== undefined &&
        parsed.data.itemStatus !== null &&
        parsed.data.itemStatus !== "SUSPENDED" &&
        order.isSuspended
      ) {
        const allItems = await tx.orderItem.findMany({
          where: { orderId: id },
          select: { id: true, itemStatus: true },
        });
        const allResolved = allItems.every((it) => {
          const eff = it.id === itemId ? parsed.data.itemStatus : (it as any).itemStatus;
          return eff !== null && eff !== "SUSPENDED";
        });
        if (allResolved) {
          await tx.order.update({
            where: { id },
            data: { isSuspended: false, status: "IN_PRODUCTION", version: { increment: 1 } },
          });
          await tx.workflowHistory.create({
            data: {
              orderId: id,
              action: "RESUMED",
              fromStatus: "SUSPENDED",
              toStatus: "IN_PRODUCTION",
              comment: "Tất cả MO đã được xử lý",
            },
          });
        }
      }

      // ── Auto-complete/cancel order when ALL items reach a terminal state ──
      if (parsed.data.itemStatus === "COMPLETED" || parsed.data.itemStatus === "CANCELLED") {
        const allItems = await tx.orderItem.findMany({
          where: { orderId: id },
          select: { id: true, itemStatus: true },
        });
        const effectiveStatuses = allItems.map((it) =>
          it.id === itemId ? parsed.data.itemStatus : ((it as any).itemStatus ?? null)
        );
        const allDone = effectiveStatuses.every(
          (s) => s === "COMPLETED" || s === "CANCELLED"
        );
        if (allDone) {
          // All cancelled → order is cancelled; any completed → order is completed
          const allCancelled = effectiveStatuses.every((s) => s === "CANCELLED");
          const finalStatus = allCancelled ? "CANCELLED" : "COMPLETED";
          await tx.order.update({
            where: { id },
            data: {
              status: finalStatus,
              completedDate: finalStatus === "COMPLETED" ? new Date() : null,
              isSuspended: false,
              version: { increment: 1 },
            },
          });
          await tx.workflowHistory.create({
            data: {
              orderId: id,
              action: "STATUS_CHANGED",
              fromStatus: order.status,
              toStatus: finalStatus,
              comment: allCancelled ? "Tất cả MO đã hủy" : "Tất cả MO đã hoàn tất",
            },
          });
        }
      }

      // updatedAt bump: always — heartbeat uses updatedAt to detect changes for other users.
      // version intentionally NOT incremented here — item edits should not create conflicts
      // between users editing different MOs in the same SO. Order.version only changes via
      // Order PATCH (SO-level fields: status, linkChat, donHang3Sao).
      await tx.order.update({
        where: { id },
        data: { updatedAt: new Date() },
      });

      return {
        tag: "OK",
        data: updated,
        // Bậc ưu tiên thiết kế TRƯỚC lần ghi này — đọc từ `existing`, tức bản đã nạp TRONG
        // transaction. Đọc lại sau commit thì đã là giá trị mới và không còn gì để so.
        // undefined nghĩa là request không đụng tới field này → không có gì phải thông báo.
        prevDesignPriority: parsed.data.design3DPriorityCode !== undefined
          ? ((existing as Record<string, unknown>).design3DPriorityCode as string | null ?? null)
          : undefined,
      } as const;
    });

    if (result.tag === "CONFLICT") return Errors.conflict("Đơn hàng đã được cập nhật bởi người dùng khác. Vui lòng tải lại.");
    if (result.tag === "ITEM_NOT_FOUND") return Errors.notFound("OrderItem");
    if (result.tag === "ORDER_NOT_FOUND") return Errors.notFound("Order");
    if (result.tag === "ORDER_LOCKED") return Errors.forbidden("Đơn hàng đã hoàn tất hoặc hủy — không thể chỉnh sửa.");

    // Thông báo cho NV 3D đang làm MO này biết thứ tự vừa đổi. SAU commit và SAU response —
    // `after()` chứ không phải promise thả trôi, vì trên Vercel promise thả trôi có thể bị cắt
    // khi hàm kết thúc (mất thông báo mà không ai biết). Hàm được gọi tự kiểm ba điều kiện
    // (giá trị thật sự đổi / MO đang có người làm / không ném lỗi) — xem notify-design-3d.ts.
    if (result.prevDesignPriority !== undefined) {
      const prev = result.prevDesignPriority;
      after(() =>
        notifyDesign3DPriorityChange({
          orderItemId: itemId,
          fromCode: prev,
          toCode: parsed.data.design3DPriorityCode,
          changedByName: currentUser.name ?? null,
        }),
      );
    }

    return ok(result.data);
  } catch (err) {
    // Log NGUYÊN VĂN để còn lần ra được — client chỉ nhận câu đã dịch, vì lỗi Prisma có tên
    // bảng, tên cột và đôi khi cả giá trị đang ghi.
    console.error("[PATCH /api/orders/:id/items/:itemId]", err);
    // Một câu "An unexpected error occurred" cho mọi loại thất bại chính là thứ đã giữ lỗi hủy
    // MO nằm im trên production: người dùng không biết mình làm sai gì, người sửa không biết tìm
    // ở đâu. Xem business/db-error.ts.
    // 503 cho lỗi hạ tầng (thử lại có thể được), 500 cho phần còn lại — lỗi vẫn ở phía hệ thống,
    // KHÔNG dùng 400: 400 nghĩa là "người dùng gửi sai", và đẩy lỗi của mình sang cho họ thì log
    // lẫn cảnh báo đều mất nghĩa.
    const info = describeDbError(err);
    return info.retryable ? Errors.serviceUnavailable(info.message) : Errors.internal(info.message);
  }
}
