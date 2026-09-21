import "server-only";
import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

// ─── Vòng đời & khả năng nhìn thấy của Đơn hàng ──────────────────────────────
//
// Hai TRỤC ĐỘC LẬP (xem cấu trúc đề xuất):
//   1. status  — vòng đời nghiệp vụ; CANCELLED là trạng thái kết thúc HỢP LỆ, luôn giữ
//                trong DB và (mặc định) VẪN vào báo cáo (thợ đã làm thì tính công).
//   2. deletedAt — soft-delete cho bản ghi NHẬP NHẦM/TRÙNG; ẩn khỏi MỌI view + báo cáo,
//                nhưng vẫn lưu trong DB, phục hồi được, có audit. KHÔNG BAO GIỜ xóa cứng.

/**
 * Where-fragment DÙNG CHUNG cho mọi danh sách/báo cáo để quy tắc "nhìn thấy đơn nào"
 * không bị trôi dạt giữa các màn (nguyên nhân lệch KPI 18 vs 17 trước đây).
 *
 *  - Luôn loại đơn đã soft-delete (deletedAt != null).
 *  - includeCancelled (mặc định true): CANCELLED vẫn được tính. Đặt false chỉ khi báo cáo
 *    thực sự muốn loại đơn đã hủy (VD "đơn đang chạy").
 *
 * Dùng trực tiếp cho query Order (`where: orderVisibilityWhere()`) hoặc lồng qua quan hệ
 * (`where: { order: orderVisibilityWhere() }`).
 */
export function orderVisibilityWhere(
  opts: { includeCancelled?: boolean } = {},
): Prisma.OrderWhereInput {
  const { includeCancelled = true } = opts;
  const where: Prisma.OrderWhereInput = { deletedAt: null };
  if (!includeCancelled) where.status = { not: "CANCELLED" };
  return where;
}

// Ghi 1 entry audit vào WorkflowHistory (không thêm enum action mới → không cần migration).
// Dùng FIELD_UPDATED + metadata mô tả thao tác soft-delete/restore, kèm lý do & giá trị cũ→mới
// của deletedAt để soi trong màn Lịch sử thay đổi và phục hồi thủ công nếu cần.
async function logLifecycle(
  tx: Prisma.TransactionClient,
  orderId: string,
  kind: "SOFT_DELETE" | "RESTORE",
  reason: string | null,
  performedById: string | null,
  oldDeletedAt: Date | null,
  newDeletedAt: Date | null,
) {
  await tx.workflowHistory.create({
    data: {
      orderId,
      action: "FIELD_UPDATED",
      performedById,
      comment: reason ?? null,
      metadata: {
        lifecycle: kind,
        reason: reason ?? null,
        changes: [
          {
            field: "deletedAt",
            old: oldDeletedAt ? oldDeletedAt.toISOString() : "",
            new: newDeletedAt ? newDeletedAt.toISOString() : "",
          },
        ],
      } as Prisma.InputJsonValue,
    },
  });
}

/**
 * Ẩn (soft-delete) một đơn — set deletedAt=now, KHÔNG xóa dữ liệu, GIỮ NGUYÊN orderNumber.
 * → Số phiên bản của đơn này VẪN được bộ đếm giữ chỗ (không tái sử dụng). Dùng khi muốn ẩn
 * một đơn THẬT khỏi view nhưng vẫn bảo lưu số thứ tự phiên bản.
 * Khác voidOrder() (xóa nhầm → NHẢ số để tái sử dụng).
 * Idempotent: đơn đã ẩn thì bỏ qua. Trả về đơn sau cập nhật (hoặc null nếu không tồn tại).
 */
export async function softDeleteOrder(
  orderId: string,
  opts: { reason?: string | null; performedById?: string | null } = {},
) {
  const { reason = null, performedById = null } = opts;
  return prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, deletedAt: true } });
    if (!current) return null;
    if (current.deletedAt) return current; // đã ẩn — không làm gì
    const now = new Date();
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { deletedAt: now },
    });
    await logLifecycle(tx, orderId, "SOFT_DELETE", reason, performedById, null, now);
    return updated;
  });
}

/**
 * Phục hồi một đơn đã soft-delete — set deletedAt=null. Idempotent.
 */
export async function restoreOrder(
  orderId: string,
  opts: { reason?: string | null; performedById?: string | null } = {},
) {
  const { reason = null, performedById = null } = opts;
  return prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, deletedAt: true } });
    if (!current) return null;
    if (!current.deletedAt) return current; // đang hiển thị — không làm gì
    const updated = await tx.order.update({
      where: { id: orderId },
      data: { deletedAt: null },
    });
    await logLifecycle(tx, orderId, "RESTORE", reason, performedById, current.deletedAt, null);
    return updated;
  });
}

// Tiền tố "bia mộ": đánh dấu một giá trị đã bị void và nhả số gốc. Bộ đếm phiên bản quét
// theo startsWith("<base>." / "<base>_") nên chuỗi mang tiền tố này KHÔNG khớp → tự động
// bị loại khỏi việc tính phiên bản (số được tái sử dụng).
export const VOID_PREFIX = "VOID:";

// Thuần: dựng chuỗi bia mộ nhúng số gốc + id duy nhất → vừa nhả số, vừa truy vết được số cũ.
function tombstone(original: string, uniqueId: string): string {
  return `${VOID_PREFIX}${original}:${uniqueId}`;
}

// Thuần: một orderNumber/moNumber đã bị void chưa? (tránh void 2 lần).
function isVoided(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(VOID_PREFIX);
}

/**
 * Tách số GỐC ra khỏi chuỗi bia mộ "VOID:<gốc>:<id>" — id (cuid) không chứa dấu ":" nên số
 * gốc luôn nằm giữa prefix và dấu ":" cuối cùng. Trả về nguyên văn nếu KHÔNG phải bia mộ.
 * Dùng ở nơi hiển thị (VD Lịch sử thay đổi) để không bao giờ lộ chuỗi bia mộ ra người dùng —
 * kể cả các entry log CŨ (trước khi metadata.originalOrderNumber được thêm vào voidOrder()).
 */
export function resolveVoidedNumber(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  if (!isVoided(value)) return value;
  const rest = value.slice(VOID_PREFIX.length);
  const lastColon = rest.lastIndexOf(":");
  return lastColon === -1 ? rest : rest.slice(0, lastColon);
}

/**
 * "Xóa nhầm" (void) một đơn nhập DƯ — KHÁC softDelete (giữ số) và KHÁC hủy (status=CANCELLED,
 * giữ số). Coi như đơn CHƯA TỪNG tồn tại về mặt đánh số phiên bản:
 *   - Đổi orderNumber + moNumber sang "bia mộ" → NHẢ số gốc cho bộ đếm tái sử dụng, đồng thời
 *     giải phóng ràng buộc unique để có thể tạo lại đúng số đó.
 *   - set deletedAt → ẩn khỏi mọi danh sách/báo cáo.
 *   - Ghi audit kèm số gốc + lý do → vẫn giữ vĩnh viễn, phục hồi/đối chiếu được.
 * Idempotent: đơn đã void (orderNumber mang tiền tố VOID:) → bỏ qua.
 */
export async function voidOrder(
  orderId: string,
  opts: { reason?: string | null; performedById?: string | null } = {},
) {
  const { reason = null, performedById = null } = opts;
  return prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNumber: true, deletedAt: true, items: { select: { id: true, moNumber: true } } },
    });
    if (!current) return null;
    if (isVoided(current.orderNumber)) return current; // đã void — không làm gì

    const now = new Date();
    const originalOrderNumber = current.orderNumber;
    const originalMoNumbers = current.items.map((i) => i.moNumber).filter((m): m is string => !!m);

    // 1. Đổi tên đơn → bia mộ (nhả số orderNumber) + ẩn.
    await tx.order.update({
      where: { id: orderId },
      data: { orderNumber: tombstone(originalOrderNumber, current.id), deletedAt: now },
    });

    // 2. Đổi tên từng MO → bia mộ (nhả số moNumber).
    for (const it of current.items) {
      if (!it.moNumber || isVoided(it.moNumber)) continue;
      await tx.orderItem.update({ where: { id: it.id }, data: { moNumber: tombstone(it.moNumber, it.id) } });
    }

    // 3. Audit — giữ số gốc để truy vết/phục hồi.
    await tx.workflowHistory.create({
      data: {
        orderId,
        action: "FIELD_UPDATED",
        performedById,
        comment: reason ?? null,
        metadata: {
          lifecycle: "VOID",
          reason: reason ?? null,
          originalOrderNumber,
          originalMoNumbers,
          // Cột "SO / MO" trong Lịch sử thay đổi đọc metadata.moNumber trực tiếp — set ở đây
          // để hiện MO GỐC đã xóa (thay vì orderNumber LIVE lúc này đã là chuỗi bia mộ).
          moNumber: originalMoNumbers[0] ?? null,
          changes: [
            { field: "orderNumber", old: originalOrderNumber, new: "(đã xóa nhầm — nhả số phiên bản)" },
            { field: "deletedAt", old: "", new: now.toISOString() },
          ],
        } as Prisma.InputJsonValue,
      },
    });

    return { id: current.id, originalOrderNumber, originalMoNumbers };
  });
}
