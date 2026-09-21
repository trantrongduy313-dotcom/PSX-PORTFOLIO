import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { resolveVoidedNumber } from "@/app/lib/business/order-lifecycle";

// ─── GET /api/admin/change-history ───────────────────────────────────────────
// Lịch sử thay đổi (WorkflowHistory) cho ADMIN. Phân trang + lọc.
// Query params:
//   search   — tìm theo SO# (orderNumber) hoặc MO# (metadata.moNumber)
//   userId   — lọc theo người thực hiện
//   action   — lọc theo loại thao tác (FIELD_UPDATED, STATUS_CHANGED, …)
//   dateFrom / dateTo — khoảng thời gian (YYYY-MM-DD)
//   page, limit — phân trang (mặc định 1 / 50)

export type ChangeRow = {
  id: string;
  performedAt: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  comment: string | null;
  orderNumber: string;
  moNumber: string | null;
  performedByName: string | null;
  changes: { field: string; old: string; new: string }[];
  // Danh sách MO tạo/thêm cùng thao tác (CREATED, thêm MO vào SO) — null nếu log không có.
  moNumbers: string[] | null;
  addedCount: number | null;
  // Tầng 1: thao tác này có xoá trắng field quan trọng không + danh sách field bị xoá.
  suspiciousClear: boolean;
  clearedFields: string[];
  // "VOID" (xóa nhầm — nhả số phiên bản) | "SOFT_DELETE" | "RESTORE" | null (thao tác thường).
  lifecycle: string | null;
  // Phát hiện: sửa ngày/ưu tiên CẤP SO trên đơn có nhiều MO — ảnh hưởng mọi MO ăn theo SO.
  affectsMultipleMo: boolean;
  affectedMoCount: number | null;
  // Đồng bộ Google Sheet: Ngày HT trên webapp KHÁC ngày trong sheet → cảnh báo để đối soát
  // (hệ thống KHÔNG tự ghi đè giá trị user đã nhập).
  dateMismatch: boolean;
  dateMismatchDetail: { mo: string; webapp: string; sheet: string }[];
};

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const search = sp.get("search")?.trim() ?? "";
  const userId = sp.get("userId")?.trim() ?? "";
  const action = sp.get("action")?.trim() ?? "";
  const dateFrom = sp.get("dateFrom")?.trim() ?? "";
  const dateTo = sp.get("dateTo")?.trim() ?? "";
  const onlyCleared = sp.get("onlyCleared") === "1";
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "50", 10) || 50));

  const where: Prisma.WorkflowHistoryWhereInput = {};

  if (search) {
    where.OR = [
      { order: { orderNumber: { contains: search, mode: "insensitive" } } },
      { metadata: { path: ["moNumber"], string_contains: search } },
    ];
  }
  if (userId) where.performedById = userId;
  if (action) where.action = action as Prisma.WorkflowHistoryWhereInput["action"];
  // Chỉ hiện thao tác xoá trắng field quan trọng (metadata.suspiciousClear === true).
  if (onlyCleared) where.metadata = { path: ["suspiciousClear"], equals: true };
  if (dateFrom || dateTo) {
    const gte = dateFrom ? new Date(dateFrom + "T00:00:00") : undefined;
    const lte = dateTo ? new Date(dateTo + "T23:59:59.999") : undefined;
    where.performedAt = { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
  }

  const [total, rows] = await Promise.all([
    prisma.workflowHistory.count({ where }),
    prisma.workflowHistory.findMany({
      where,
      orderBy: { performedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        performedAt: true,
        action: true,
        fromStatus: true,
        toStatus: true,
        comment: true,
        metadata: true,
        order: { select: { orderNumber: true } },
        performedBy: { select: { name: true } },
      },
    }),
  ]);

  const data: ChangeRow[] = rows.map((r) => {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    const rawChanges = Array.isArray(m.changes) ? (m.changes as Record<string, unknown>[]) : [];
    const changes = rawChanges.map((c) => ({
      field: String(c.field ?? ""),
      old: c.old == null ? "" : String(c.old),
      new: c.new == null ? "" : String(c.new),
    }));
    return {
      id: r.id,
      performedAt: r.performedAt.toISOString(),
      action: r.action as string,
      fromStatus: r.fromStatus as string | null,
      toStatus: r.toStatus as string | null,
      comment: r.comment,
      // Đơn đã "xóa nhầm" (voidOrder) có orderNumber LIVE là chuỗi bia mộ "VOID:<gốc>:<id>"
      // — TẤT CẢ entry của đơn đó (kể cả log CŨ trước khi bị void) phải hiện số GỐC, không
      // bao giờ lộ chuỗi bia mộ ra người xem lịch sử.
      orderNumber: resolveVoidedNumber(r.order?.orderNumber) ?? "—",
      moNumber: resolveVoidedNumber((m.moNumber as string) ?? null),
      performedByName: r.performedBy?.name ?? null,
      changes,
      moNumbers: Array.isArray(m.moNumbers) ? (m.moNumbers as unknown[]).map(String) : null,
      addedCount: typeof m.addedCount === "number" ? m.addedCount : null,
      suspiciousClear: m.suspiciousClear === true,
      clearedFields: Array.isArray(m.clearedFields) ? (m.clearedFields as unknown[]).map(String) : [],
      lifecycle: typeof m.lifecycle === "string" ? m.lifecycle : null,
      affectsMultipleMo: m.affectsMultipleMo === true,
      affectedMoCount: typeof m.affectedMoCount === "number" ? m.affectedMoCount : null,
      dateMismatch: m.dateMismatch === true,
      dateMismatchDetail: Array.isArray(m.dateMismatchDetail)
        ? (m.dateMismatchDetail as { mo: string; webapp: string; sheet: string }[])
        : [],
    };
  });

  return NextResponse.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
}
