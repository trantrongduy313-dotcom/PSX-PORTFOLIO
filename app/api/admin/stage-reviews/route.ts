import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { orderVisibilityWhere } from "@/app/lib/business/order-lifecycle";
import {
  buildReviewRows, buildOutsideGroupRows, craftersOfGroup, makeInViewMonth,
  resolveStageCodes, type PdLite,
} from "@/app/lib/business/stage-review-rows";
import type { Prisma } from "@/app/generated/prisma/client";
import { bumpOrderVersion } from "@/app/lib/db/order-version";

// ═══════════════════════════════════════════════════════════════════════════
// Đánh giá Khâu (stage-reviews) — mỗi hàm một nhiệm vụ (SRP):
//   • Đọc  (GET): dựng danh sách dòng đánh giá theo tháng/khâu.
//   • Ghi  (PATCH/PUT): áp đánh giá vào record + AUDIT (P1) + ghi người đánh giá (P3).
// Dữ liệu đánh giá nuôi trực tiếp KPI thợ → mọi thay đổi PHẢI truy vết được.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Các trường đánh giá sửa được + ánh xạ sang key trong record ─────────────
const EDITABLE_FIELDS = [
  "coldworkQuality", "coldworkTimeOk", "coldworkReason",
  "bachSP", "gioKpi", "ghiChuNguoi", "durationNote",
] as const;
type EditableFields = Partial<Record<typeof EDITABLE_FIELDS[number], string | null>>;

// field "scalar" (snapshot) → field trong record JSON.
const FIELD_TO_RECORD: Record<string, string> = {
  coldworkQuality: "ketQua", coldworkTimeOk: "thoiGianOk", coldworkReason: "lyDo",
  bachSP: "bachSP", gioKpi: "gioKpi", ghiChuNguoi: "ghiChu", durationNote: "gioThucTe",
};

// Nhãn tiếng Việt cho audit — để Lịch sử thay đổi hiển thị dễ đọc (KPI-relevant).
const REVIEW_FIELD_LABELS: Record<string, string> = {
  coldworkQuality: "Kết quả", coldworkTimeOk: "Thời gian đạt", coldworkReason: "Lý do",
  bachSP: "Bậc SP", gioKpi: "Giờ KPI", ghiChuNguoi: "Ghi chú", durationNote: "Giờ thực tế",
};

// Snapshot = ảnh chụp giá trị các trường đánh giá tại một thời điểm (để diff old→new).
type ReviewSnapshot = Record<typeof EDITABLE_FIELDS[number], string | null>;

const reviewerName = (u: Awaited<ReturnType<typeof getCurrentUser>>): string | null =>
  u?.name ?? null;

// ─── Đọc-phía (pure, không side-effect) ──────────────────────────────────────

// Nhiệm vụ: phân tích query → {month, year, stageCode}.
function parseReviewQuery(url: string): { month: number; year: number; stageCode: string } {
  const { searchParams } = new URL(url);
  const now = new Date();
  return {
    month: parseInt(searchParams.get("month") ?? String(now.getMonth() + 1), 10),
    year:  parseInt(searchParams.get("year")  ?? String(now.getFullYear()),   10),
    stageCode: searchParams.get("stage") ?? "NGUOI",
  };
}

export async function GET(req: NextRequest) {
  const reviewer = await getCurrentUser();
  if (!reviewer || !["ADMIN", "ORDER"].includes(reviewer.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { month, year, stageCode } = parseReviewQuery(req.url);
  const inView = makeInViewMonth(year, month);

  const pds = await prisma.productionDetail.findMany({
    where: { order: orderVisibilityWhere() },
    select: {
      id: true,
      extraData: true,
      order: {
        select: {
          id: true, orderNumber: true, createdById: true,
          items: { select: { id: true, moNumber: true, productName: true, specifications: true } },
        },
      },
    },
  });

  // `stageCode` từ query là mã NHÓM — mở ra thành các khâu con (Nguội → NGUOI+TC_NGUOI+KHOA).
  const stageCodes = resolveStageCodes(stageCode);
  const groupRows = buildReviewRows(pds as PdLite[], stageCodes, inView);

  // Công của chính những thợ này ở các khâu NGOÀI nhóm — chỉ ghi nhận Ngày HT + Thời gian HT,
  // không đánh giá. Danh sách thợ suy ra từ groupRows (xem craftersOfGroup) nên tự đúng theo
  // từng tháng: ai tháng đó có làm Nguội mới được xét, không cần cấu hình tay.
  const outsideRows = buildOutsideGroupRows(
    pds as PdLite[], stageCodes, craftersOfGroup(groupRows), inView,
  );

  return NextResponse.json({
    rows: [...groupRows, ...outsideRows], month, year, stageCode, stageCodes,
    counts: { inGroup: groupRows.length, outside: outsideRows.length },
  });
}

// ─── Ghi-phía: áp đánh giá + audit ───────────────────────────────────────────

// Nhiệm vụ: đọc snapshot hiện tại của các trường đánh giá (KHÔNG mutate) — để diff old→new.
function readReviewSnapshot(entry: Record<string, unknown>, recordIndex: number | undefined): ReviewSnapshot {
  const src = (typeof recordIndex === "number" && recordIndex >= 0 && Array.isArray(entry.records))
    ? ((entry.records as Record<string, unknown>[])[recordIndex] ?? {})
    : entry;
  const isRecord = typeof recordIndex === "number" && recordIndex >= 0;
  const read = (key: typeof EDITABLE_FIELDS[number]): string | null => {
    const raw = isRecord ? src[FIELD_TO_RECORD[key]] : src[key];
    return (raw as string | null) ?? null;
  };
  return {
    coldworkQuality: read("coldworkQuality"), coldworkTimeOk: read("coldworkTimeOk"),
    coldworkReason: read("coldworkReason"), bachSP: read("bachSP"),
    gioKpi: read("gioKpi"), ghiChuNguoi: read("ghiChuNguoi"), durationNote: read("durationNote"),
  };
}

// Nhiệm vụ DUY NHẤT: áp đánh giá vào 1 entry (mutate in-place clone) + gắn người đánh giá (P3).
// recordIndex >= 0 → ghi vào records[recordIndex]; ngược lại (-1) → ghi scalar (dữ liệu cũ).
function applyReviewToEntry(
  entry: Record<string, unknown>,
  recordIndex: number | undefined,
  reviewedAt: string | null | undefined,
  hasReviewedAt: boolean,
  fields: EditableFields | undefined,
  reviewer: { name: string | null } | null,
) {
  const isRecord = typeof recordIndex === "number" && recordIndex >= 0;
  const target = isRecord
    ? (() => {
        const records = Array.isArray(entry.records) ? [...(entry.records as Record<string, unknown>[])] : [];
        const rec = { ...(records[recordIndex!] ?? {}) };
        records[recordIndex!] = rec;
        entry.records = records;
        return rec;
      })()
    : entry;

  if (hasReviewedAt) {
    target.reviewedAt = reviewedAt;
    // P3: ghi người đánh giá cùng thời điểm đánh giá (chỉ khi thực sự đánh giá, không xoá).
    if (reviewedAt) target.reviewedBy = reviewer?.name ?? null;
  }
  if (fields) {
    for (const key of EDITABLE_FIELDS) {
      if (!(key in fields)) continue;
      target[isRecord ? FIELD_TO_RECORD[key] : key] = fields[key] ?? null;
    }
  }

  return readReviewSnapshot(entry, recordIndex);
}

// Nhiệm vụ: diff 2 snapshot → danh sách thay đổi (nhãn VN, chuỗi hoá) cho audit.
function diffReviewSnapshots(before: ReviewSnapshot, after: ReviewSnapshot): { field: string; old: string; new: string }[] {
  const norm = (v: string | null): string => v ?? "";
  const changes: { field: string; old: string; new: string }[] = [];
  for (const key of EDITABLE_FIELDS) {
    if (norm(before[key]) !== norm(after[key])) {
      changes.push({ field: REVIEW_FIELD_LABELS[key] ?? key, old: norm(before[key]), new: norm(after[key]) });
    }
  }
  return changes;
}

// Nhiệm vụ: ghi 1 entry audit vào WorkflowHistory (chỉ khi có thay đổi thật).
async function writeReviewAudit(
  tx: Prisma.TransactionClient,
  params: {
    orderId: string; itemId: string; moNumber: string | null; stageCode: string;
    recordIndex: number; changes: { field: string; old: string; new: string }[];
    performedById: string | undefined;
  },
) {
  if (params.changes.length === 0) return;
  await tx.workflowHistory.create({
    data: {
      orderId: params.orderId,
      action: "FIELD_UPDATED",
      performedById: params.performedById ?? null,
      metadata: {
        source: "STAGE_REVIEW",     // đến từ màn Đánh giá Khâu (phân biệt với sửa qua sidebar)
        itemId: params.itemId,
        moNumber: params.moNumber,
        stageCode: params.stageCode,
        recordIndex: params.recordIndex,
        changes: params.changes,
      } as Prisma.InputJsonValue,
    },
  });
}

// Nhiệm vụ: áp 1 lượt đánh giá vào perItem của 1 pd đã nạp + trả snapshot before/after + entry mới.
// Tách riêng để PATCH (đơn) và PUT (hàng loạt) dùng chung — không lặp logic ghép JSON.
function applyReviewOntoPerItem(
  extra: Record<string, unknown>,
  target: { itemId: string; stageCode: string; recordIndex?: number },
  reviewedAt: string | null | undefined,
  hasReviewedAt: boolean,
  fields: EditableFields | undefined,
  reviewer: { name: string | null } | null,
): { nextExtra: Record<string, unknown>; before: ReviewSnapshot; after: ReviewSnapshot } {
  const perItem = { ...((extra.perItem as Record<string, unknown>) ?? {}) };
  const itemData = { ...((perItem[target.itemId] as Record<string, unknown>) ?? {}) };
  const stages = { ...((itemData.stages as Record<string, unknown>) ?? {}) };
  const entry = { ...((stages[target.stageCode] as Record<string, unknown>) ?? {}) };

  const before = readReviewSnapshot(entry, target.recordIndex);
  const after = applyReviewToEntry(entry, target.recordIndex, reviewedAt, hasReviewedAt, fields, reviewer);

  stages[target.stageCode] = entry;
  itemData.stages = stages;
  perItem[target.itemId] = itemData;
  return { nextExtra: { ...extra, perItem }, before, after };
}

export async function PATCH(req: NextRequest) {
  const reviewer = await getCurrentUser();
  if (!reviewer || !["ADMIN", "ORDER"].includes(reviewer.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json() as {
    pdId: string; itemId: string; stageCode: string;
    recordIndex?: number; reviewedAt?: string | null; fields?: EditableFields;
  };
  const { pdId, itemId, stageCode, recordIndex } = body;
  if (!pdId || !itemId || !stageCode) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const pd = await tx.productionDetail.findUnique({
      where: { id: pdId },
      select: { orderId: true, extraData: true, order: { select: { items: { select: { id: true, moNumber: true } } } } },
    });
    if (!pd) return { tag: "NOT_FOUND" as const };

    const extra = (pd.extraData as Record<string, unknown>) ?? {};
    const { nextExtra, before, after } = applyReviewOntoPerItem(
      extra, { itemId, stageCode, recordIndex }, body.reviewedAt, "reviewedAt" in body, body.fields,
      { name: reviewerName(reviewer) },
    );

    await tx.productionDetail.update({ where: { id: pdId }, data: { extraData: nextExtra as Prisma.InputJsonValue } });
    // Vừa ghi đè cả khối extraData — mọi tab Tiến độ đang mở của đơn này giờ giữ bản cũ.
    // Không tăng version thì lần Lưu tiếp theo của họ ghi đè mất phê duyệt vừa xong.
    await bumpOrderVersion(tx, pd.orderId);

    const moNumber = pd.order.items.find((i) => i.id === itemId)?.moNumber ?? null;
    await writeReviewAudit(tx, {
      orderId: pd.orderId, itemId, moNumber, stageCode, recordIndex: recordIndex ?? -1,
      changes: diffReviewSnapshots(before, after), performedById: reviewer.dbId,
    });

    // Snapshot trả về cho client cập nhật cache: các field đánh giá (after) + reviewedAt/By
    // CHỈ khi lượt này có đổi reviewedAt (tránh ghi đè reviewedAt của row bằng undefined).
    const updated: Record<string, unknown> = { ...after };
    if ("reviewedAt" in body) {
      updated.reviewedAt = body.reviewedAt ?? null;
      updated.reviewedBy = body.reviewedAt ? reviewerName(reviewer) : null;
    }
    return { tag: "OK" as const, updated };
  }, { maxWait: 10_000, timeout: 30_000 });

  if (result.tag === "NOT_FOUND") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, updated: result.updated });
}

// ─── PUT: đánh giá HÀNG LOẠT nhiều bản ghi cùng lúc (gom theo pdId) ──────────────
export async function PUT(req: NextRequest) {
  const reviewer = await getCurrentUser();
  if (!reviewer || !["ADMIN", "ORDER"].includes(reviewer.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json() as {
    targets: Array<{ pdId: string; itemId: string; stageCode: string; recordIndex?: number }>;
    fields?: EditableFields; reviewedAt?: string | null;
  };
  const targets = Array.isArray(body.targets) ? body.targets : [];
  if (targets.length === 0) return NextResponse.json({ error: "No targets" }, { status: 400 });
  const hasReviewedAt = "reviewedAt" in body;

  // Gom theo pdId — nhiều MO có thể cùng 1 ProductionDetail (cùng SO). Ghi 1 lần/pdId.
  const byPd = new Map<string, typeof targets>();
  for (const t of targets) {
    if (!t.pdId || !t.itemId || !t.stageCode) continue;
    byPd.set(t.pdId, [...(byPd.get(t.pdId) ?? []), t]);
  }

  const results: Array<Record<string, unknown>> = [];

  await prisma.$transaction(async (tx) => {
    for (const [pdId, ts] of byPd) {
      const pd = await tx.productionDetail.findUnique({
        where: { id: pdId },
        select: { orderId: true, extraData: true, order: { select: { items: { select: { id: true, moNumber: true } } } } },
      });
      if (!pd) continue;

      let extra = (pd.extraData as Record<string, unknown>) ?? {};
      const moById = new Map(pd.order.items.map((i) => [i.id, i.moNumber ?? null]));

      for (const t of ts) {
        const { nextExtra, before, after } = applyReviewOntoPerItem(
          extra, t, body.reviewedAt, hasReviewedAt, body.fields, { name: reviewerName(reviewer) },
        );
        extra = nextExtra;
        await writeReviewAudit(tx, {
          orderId: pd.orderId, itemId: t.itemId, moNumber: moById.get(t.itemId) ?? null,
          stageCode: t.stageCode, recordIndex: t.recordIndex ?? -1,
          changes: diffReviewSnapshots(before, after), performedById: reviewer.dbId,
        });
        const one: Record<string, unknown> = {
          pdId: t.pdId, itemId: t.itemId, stageCode: t.stageCode, recordIndex: t.recordIndex ?? -1,
          ...after,
        };
        if (hasReviewedAt) {
          one.reviewedAt = body.reviewedAt ?? null;
          one.reviewedBy = body.reviewedAt ? reviewerName(reviewer) : null;
        }
        results.push(one);
      }

      await tx.productionDetail.update({ where: { id: pdId }, data: { extraData: extra as Prisma.InputJsonValue } });
      await bumpOrderVersion(tx, pd.orderId);
    }
  }, { maxWait: 10_000, timeout: 30_000 });

  return NextResponse.json({ ok: true, updated: results });
}
