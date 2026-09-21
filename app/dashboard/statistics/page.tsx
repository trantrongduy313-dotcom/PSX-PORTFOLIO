import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { requireUser } from "@/app/lib/auth-helpers";
import { landingPathForRole } from "@/app/lib/business/auth/landing";
import { prisma } from "@/app/lib/prisma";
import { StatisticsClient } from "./_components/statistics-client";
import type { StatisticsData, CrossTabData, MonthRow, PsxSegmentData } from "./_components/statistics-client";

export const metadata = { title: "Thống kê — Jewelry ERP" };

// ─── Product category mapping ──────────────────────────────────────────────────

const PRODUCT_CAT: Record<string, string> = {
  "Vỏ nhẫn xoàn": "RI", "Vỏ nhẫn trơn": "RI", "Nhẫn band xoàn": "RI", "Nhẫn band trơn": "RI",
  "Vỏ mặt xoàn": "PD", "Vỏ mặt trơn": "PD", "Mặt dây xoàn": "PD", "Mặt dây trơn": "PD",
  "Vỏ bông tai xoàn": "ER", "Vỏ bông tai trơn": "ER", "Bông tai xoàn": "ER", "Bông tai trơn": "ER",
  "Vỏ lắc xoàn": "BL", "Vỏ lắc trơn": "BL",
  "Lắc tay xoàn": "BL-TAY", "Lắc tay trơn": "BL-TAY",
  "Vỏ vòng xoàn": "BG", "Vỏ vòng trơn": "BG",
  "Vòng tay xoàn": "BG-TAY",
  "Dây chuyền": "CH",
  "Dây chuyền tay": "CH-TAY",
  "Vỏ vòng cổ xoàn": "NL", "Vỏ vòng cổ trơn": "NL", "Vòng cổ xoàn": "NL", "Vòng cổ trơn": "NL",
  "Phụ kiện": "ACC", "Charm": "ACC",
  "Khoen mũi": "H",
};

const CAT_LABEL: Record<string, string> = {
  RI: "Nhẫn", PD: "Mặt dây", ER: "Bông tai",
  BL: "Lắc (vỏ)", "BL-TAY": "Lắc tay",
  BG: "Vòng (vỏ)", "BG-TAY": "Vòng tay",
  CH: "Dây chuyền", "CH-TAY": "Dây chuyền tay",
  NL: "Vòng cổ", ACC: "Phụ kiện", H: "Khoen mũi", O: "Khác",
};

const CAT_ORDER = ["RI", "PD", "ER", "BL", "BL-TAY", "BG", "BG-TAY", "CH", "CH-TAY", "NL", "ACC", "H", "O"];
// Mã hợp lệ của field Loại SP thật (specifications.loaiSp, user tự chọn tay ở sidebar) —
// khớp LOAI_SP_OPTIONS trong order-detail-panel.tsx.
const VALID_LOAI_SP = new Set(CAT_ORDER);

// Fixed columns — always shown even when count = 0
const FIXED_PSX_COLS = ["CH1", "CH2", "CH3", "ADM1", "ADM2"];
const FIXED_PTK_COLS = ["CH1", "CH2", "CH3", "ADM1", "ADM2", "VVS"];

// ─── Helpers ───────────────────────────────────────────────────────────────────

// Ưu tiên field Loại SP thật (đã gán tay/import — đáng tin hơn) — chỉ đoán từ tên sản phẩm
// khi MO CHƯA có loaiSp (dữ liệu cũ chưa migrate). `assigned=false` đánh dấu các MO thuộc
// diện "chưa gán", để tách riêng khỏi nhóm "Khác" thật sự (2 khái niệm khác nhau).
function catOf(productName: string | null, loaiSp: string | null | undefined): { code: string; assigned: boolean } {
  const real = (loaiSp ?? "").trim().toUpperCase();
  if (real && VALID_LOAI_SP.has(real)) return { code: real, assigned: true };
  const guessed = productName ? PRODUCT_CAT[productName] : undefined;
  return { code: guessed ?? "O", assigned: false };
}

type ItemBucket = "active" | "completed" | "cancelled";

function classifyItem(itemStatus: string | null, orderStatus: string): ItemBucket {
  // Dùng explicit itemStatus nếu có; fallback sang orderStatus chỉ cho COMPLETED
  // CANCELLED không dùng fallback — tránh đếm items của CANCELLED order chưa được xử lý riêng
  if (itemStatus === "CANCELLED") return "cancelled";
  if (itemStatus === "COMPLETED") return "completed";
  if (itemStatus === null && orderStatus === "COMPLETED") return "completed";
  if (itemStatus === null && orderStatus === "CANCELLED") return "active";
  return "active";
}

function buildCrossTab(
  items: Array<{ productName: string | null; loaiSp: string | null | undefined; colKey: string }>,
  fixedCols: string[]
): CrossTabData {
  const counts: Record<string, Record<string, number>> = {};
  const colSet = new Set<string>(fixedCols);
  let unassignedCount = 0;

  for (const item of items) {
    const { code: cat, assigned } = catOf(item.productName, item.loaiSp);
    if (!assigned) unassignedCount++;
    const col = item.colKey;
    colSet.add(col);
    if (!counts[cat]) counts[cat] = {};
    counts[cat][col] = (counts[cat][col] ?? 0) + 1;
  }

  // Fixed cols first, then extras sorted by count desc
  const extraCols = Array.from(colSet).filter(c => !fixedCols.includes(c));
  const extraColCounts: Record<string, number> = {};
  for (const col of extraCols) {
    extraColCounts[col] = items.filter(i => i.colKey === col).length;
  }
  const sortedCols = [
    ...fixedCols,
    ...extraCols.sort((a, b) => (extraColCounts[b] ?? 0) - (extraColCounts[a] ?? 0)),
  ];

  const rows: CrossTabData["rows"] = [];
  for (const code of CAT_ORDER) {
    const byCols = counts[code] ?? {};
    const total = Object.values(byCols).reduce((s, v) => s + v, 0);
    if (total === 0) continue;
    rows.push({ code, label: CAT_LABEL[code] ?? code, byCols, total });
  }

  const colTotals: Record<string, number> = {};
  for (const col of sortedCols) colTotals[col] = 0;
  for (const byCols of Object.values(counts)) {
    for (const [col, n] of Object.entries(byCols)) {
      if (col in colTotals) colTotals[col] += n;
    }
  }

  return { cols: sortedCols, rows, colTotals, grandTotal: items.length, unassignedCount };
}

function buildSimpleCount(
  items: Array<{ productName: string | null; loaiSp: string | null | undefined }>
): Array<{ code: string; label: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const { code: cat } = catOf(item.productName, item.loaiSp);
    counts[cat] = (counts[cat] ?? 0) + 1;
  }
  return CAT_ORDER
    .filter(code => (counts[code] ?? 0) > 0)
    .map(code => ({ code, label: CAT_LABEL[code] ?? code, count: counts[code] }));
}

type PsxRawItem = {
  productName: string | null;
  itemStatus: string | null;
  specifications: unknown;
  order: { status: string; nguon: string | null; phanLoaiKh: string | null };
};

function loaiSpOf(specifications: unknown): string | null {
  const specs = (specifications ?? null) as Record<string, unknown> | null;
  const v = specs?.loaiSp;
  return typeof v === "string" ? v : null;
}

function buildPsxSegment(items: PsxRawItem[], bucket: ItemBucket): PsxSegmentData {
  const srItems: Array<{ productName: string | null; loaiSp: string | null; colKey: string }> = [];
  const khItems: Array<{ productName: string | null; loaiSp: string | null; colKey: string }> = [];
  const pkItems: Array<{ productName: string | null; loaiSp: string | null }> = [];

  for (const item of items) {
    const b = classifyItem(item.itemStatus, item.order.status);
    if (b !== bucket) continue;

    const nguon = item.order.nguon?.trim() || "Khác";
    const pkh = (item.order.phanLoaiKh ?? "").trim().toUpperCase();
    const loaiSp = loaiSpOf(item.specifications);

    if (pkh === "SR") {
      srItems.push({ productName: item.productName, loaiSp, colKey: nguon });
    } else if (pkh === "PK") {
      pkItems.push({ productName: item.productName, loaiSp });
    } else {
      khItems.push({ productName: item.productName, loaiSp, colKey: nguon });
    }
  }

  return {
    sr: buildCrossTab(srItems, FIXED_PSX_COLS),
    kh: buildCrossTab(khItems, FIXED_PSX_COLS),
    pk: buildSimpleCount(pkItems),
    total: srItems.length + khItems.length + pkItems.length,
  };
}

// ─── Cached data fetcher (5 phút) — tránh re-query mỗi lần navigate vào trang ─

const getStatisticsData = unstable_cache(
  async (currentYear: number): Promise<StatisticsData> => {
    const now = new Date();

    // 1. Summary counts
    const [activeCount, overdueCount, completedCount, cancelledCount] = await Promise.all([
      prisma.orderItem.count({
        where: {
          order: { deletedAt: null, status: { notIn: ["COMPLETED", "CANCELLED"] } },
          OR: [{ itemStatus: null }, { itemStatus: { notIn: ["COMPLETED", "CANCELLED"] } }],
        },
      }),
      prisma.orderItem.count({
        where: {
          order: { deletedAt: null },
          OR: [
            { itemStatus: null, order: { status: { notIn: ["COMPLETED", "CANCELLED"] }, requiredDate: { lt: now } } },
            { itemStatus: { notIn: ["COMPLETED", "CANCELLED"] }, requiredDate: { lt: now } },
          ],
        },
      }),
      prisma.orderItem.count({
        where: {
          order: { deletedAt: null },
          OR: [{ itemStatus: "COMPLETED" }, { itemStatus: null, order: { status: "COMPLETED" } }],
        },
      }),
      prisma.orderItem.count({
        where: { order: { deletedAt: null }, itemStatus: "CANCELLED" },
      }),
    ]);

    // 2. PSX items
    const psxItems = await prisma.orderItem.findMany({
      where: { order: { deletedAt: null, zone: "MASTER_HUB" } },
      select: {
        productName: true,
        itemStatus: true,
        specifications: true,
        order: { select: { status: true, nguon: true, phanLoaiKh: true } },
      },
    });

    // 3. PTK items (active only)
    const ptkItems = await prisma.orderItem.findMany({
      where: {
        order: {
          deletedAt: null,
          zone: "PRE_PRODUCTION",
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        OR: [{ itemStatus: null }, { itemStatus: { notIn: ["COMPLETED", "CANCELLED"] } }],
      },
      select: {
        productName: true,
        itemStatus: true,
        specifications: true,
        order: { select: { status: true, nguon: true, phanLoaiKh: true } },
      },
    });

    // 4. Hoàn tất theo tháng (PSX) — gom nhóm theo NGÀY HT THẬT (per-MO), giờ VN.
    // Trước đây gom theo order.orderDate (NGÀY TẠO) → sai hoàn toàn (VD MO hoàn thành
    // tháng 7 nhưng tạo tháng 1 bị đếm vào tháng 1). Nay đếm per-MO đã hoàn tất, bucket
    // theo Ngày HT hiệu dụng = perItem.completedDate ?? completedAt ?? order.completedDate
    // — đúng nguồn mà cột "Ngày HT" và bộ lọc danh sách đang dùng.
    const completedPsxItems = await prisma.orderItem.findMany({
      where: {
        zone: "MASTER_HUB",
        order: { deletedAt: null },
        OR: [{ itemStatus: "COMPLETED" }, { itemStatus: null, order: { status: "COMPLETED" } }],
      },
      select: {
        id: true,
        completedAt: true,
        order: { select: { completedDate: true, productionDetail: { select: { extraData: true } } } },
      },
    });

    // ── Aggregate ──────────────────────────────────────────────────────────────
    const psxActiveData    = buildPsxSegment(psxItems, "active");
    const psxCompletedData = buildPsxSegment(psxItems, "completed");
    const ptkActiveItems   = ptkItems.map(item => ({
      productName: item.productName,
      loaiSp: loaiSpOf(item.specifications),
      colKey: item.order.nguon?.trim() || "Khác",
    }));

    // Tháng/năm theo giờ VN (UTC+7) để khớp bộ lọc "Ngày HT" ở danh sách (parse +07:00).
    const vnMonthYear = (iso: string): { m: number; y: number } | null => {
      const t = new Date(iso);
      if (isNaN(t.getTime())) return null;
      const vn = new Date(t.getTime() + 7 * 3600 * 1000);
      return { m: vn.getUTCMonth(), y: vn.getUTCFullYear() };
    };
    const monthCounts: number[] = Array(12).fill(0);
    for (const it of completedPsxItems) {
      const perItemCd = ((it.order.productionDetail?.extraData as Record<string, unknown> | null)?.perItem as
        Record<string, { completedDate?: string }> | undefined)?.[it.id]?.completedDate;
      // Ngày HT hiệu dụng: perItem.completedDate (date-only) → completedAt → order.completedDate.
      const raw = perItemCd
        ?? (it.completedAt ? it.completedAt.toISOString() : null)
        ?? (it.order.completedDate ? it.order.completedDate.toISOString() : null);
      if (!raw) continue;
      // Date-only ("2026-07-13") → neo giờ VN; ISO đầy đủ (Z) → dùng như UTC rồi +7 trong vnMonthYear.
      const iso = raw.length === 10 ? `${raw}T00:00:00+07:00` : raw;
      const my = vnMonthYear(iso);
      if (!my || my.y !== currentYear) continue;
      monthCounts[my.m]++;
    }

    const monthlyCompleted: MonthRow[] = monthCounts.map((count, i) => ({
      label: `Tháng ${i + 1}`,
      month: i + 1,
      year: currentYear,
      count,
    }));

    return {
      summary: { active: activeCount, overdue: overdueCount, completed: completedCount, cancelled: cancelledCount },
      psxActive: psxActiveData,
      psxCompleted: psxCompletedData,
      ptkActive: buildCrossTab(ptkActiveItems, FIXED_PTK_COLS),
      monthlyCompleted,
    };
  },
  ["statistics-page-data"],
  { revalidate: 5 * 60 }, // 5 phút
);

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function StatisticsPage() {
  const user = await requireUser();
  // SALES không xem Thống kê — đá về nhà của họ. Dùng landingPathForRole thay vì viết cứng một
  // đường dẫn: đích cũ ở đây là /dashboard/stores, và khi trang đó bị xoá thì dòng này là chỗ
  // thứ hai phải nhớ sửa. Đọc từ bảng thì không còn chỗ thứ hai nào để quên.
  if (user.role === "SALES") redirect(landingPathForRole(user.role));

  const statisticsData = await getStatisticsData(new Date().getFullYear());
  return <StatisticsClient data={statisticsData} />;
}
