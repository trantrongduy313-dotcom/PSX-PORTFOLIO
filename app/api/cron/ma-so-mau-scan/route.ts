import type { NextRequest } from "next/server";

import { prisma } from "@/app/lib/prisma";
import { ok, Errors } from "@/app/lib/api-response";
import { getCurrentUser } from "@/app/lib/auth-helpers";
import { bearerToken, timingSafeSecretMatches } from "@/app/lib/api/timing-safe-secret";
import {
  buildMaSoMauScan,
  currentVnMonth,
  isValidMonth,
  type MaSoMauScanReport,
  type ScanItem,
} from "@/app/lib/business/orders/ma-so-mau-match";

// ─── GET /api/cron/ma-so-mau-scan ────────────────────────────────────────────
//
// Quét các MO HOÀN TẤT trong tháng, đối chiếu `Mã số mẫu` (R&D nhập lúc sản xuất) với mã nhúng
// trong `Thông tin HT` (xưởng gõ lúc hoàn tất). Lệch thì GHI LOG. Không sửa gì.
//
// Route này CỐ Ý MỎNG — cùng khuôn với api/import/sheet-sync: xác thực → nạp → gọi hàm thuần
// (business/orders/ma-so-mau-match.ts) → in kết quả. Mọi luật nằm ở module business để test
// được mà không cần DB.
//
// ⚠️ CHỈ ĐỌC. Không có một lệnh ghi nào trong file này, và điều đó là cố ý: cùng bất biến mà
// sheet-sync giữ cho Ngày HT — "tránh máy ghi đè số liệu người nhập". Máy chỉ được CHỈ RA.
//
// ─── 🔴 LỊCH CHẠY: "0 1 * * *" = 08:00 GIỜ VIỆT NAM, KHÔNG PHẢI 01:00 ────────────────────────
//
// Cron của Vercel chạy theo UTC. Người dùng yêu cầu 08:00 giờ Việt Nam (UTC+7) → 01:00 UTC.
//
// Ghi chú này nằm Ở ĐÂY vì `vercel.json` là JSON và JSON KHÔNG CHO GHI CHÚ. Ai mở file đó ra
// sẽ thấy một con số trần trụi và rất dễ "sửa cho đúng 8h" — thành 15:00 giờ Việt Nam.
//
// Dự án đã trả giá một lần đúng loại lỗi này: `getHours()` chạy local thì đúng, lên Vercel lệch
// 7 tiếng (xem CLAUDE.md mục 4). Đổi giờ chạy thì đổi ở `vercel.json` VÀ đọc lại đoạn này.

// Trần số SO nạp về. Cùng con số với STAGE_FILTER_FETCH_LIMIT ở /api/orders vì cùng lý do:
// dữ liệu cần lọc nằm trong JSON nên phải lọc ở bộ nhớ.
//
// 🔴 MÓN NỢ ĐÃ BIẾT, GHI RA ĐỂ NÓ KHÔNG THÀNH BẤT NGỜ: bộ quét nạp TOÀN BỘ SO có MO đã hoàn
// tất, dù chỉ cần một tháng. Không lọc tháng bằng SQL được — `completedDate` sống trong
// `ProductionDetail.extraData.perItem[itemId]`, Postgres không index vào đó theo cách này.
// Hôm nay ~1885 MO nên không sao; con số này CHỈ TĂNG.
//
// Lối thoát khi chậm (theo thứ tự, đừng làm sớm): thêm cột `completedDate` thật trên OrderItem
// + index → lọc thẳng bằng SQL. Lúc đó `buildMaSoMauScan` không phải đổi một dòng nào, vì nó
// nhận danh sách đã nạp sẵn.
const SCAN_FETCH_LIMIT = 5000;

type LoadResult = { items: ScanItem[]; capHit: boolean };

async function loadCompletedItems(): Promise<LoadResult> {
  const orders = await prisma.order.findMany({
    where: { deletedAt: null, items: { some: { itemStatus: "COMPLETED" } } },
    // Chỉ lấy đúng thứ cần. Panel/danh sách có thể nạp dày; bộ quét thì không có lý do gì.
    select: {
      items: {
        where: { itemStatus: "COMPLETED" },
        select: { id: true, moNumber: true, itemStatus: true, masoMau: true, completedAt: true },
      },
      productionDetail: { select: { extraData: true } },
    },
    take: SCAN_FETCH_LIMIT,
  });

  const items: ScanItem[] = [];
  for (const o of orders) {
    const extra = (o.productionDetail?.extraData ?? {}) as Record<string, unknown>;
    const perItem = (extra.perItem ?? {}) as Record<string, Record<string, unknown>>;

    for (const it of o.items) {
      const ipd = perItem[it.id] ?? {};
      items.push({
        moNumber: it.moNumber ?? "(không có MO#)",
        itemStatus: it.itemStatus,
        // Ngày HT per-MO: user nhập trước, cột `completedAt` là dự phòng — CÙNG thứ tự ưu tiên
        // với /api/orders. Đọc khác thứ tự là hai màn hình nói hai ngày khác nhau.
        completedDateRaw:
          (ipd.completedDate as string | undefined) ?? (it.completedAt ? it.completedAt.toISOString() : null),
        masoMau: it.masoMau,
        thongTinHt: (ipd.thongTinHt as string | undefined) ?? null,
      });
    }
  }

  return { items, capHit: orders.length >= SCAN_FETCH_LIMIT };
}

/**
 * In báo cáo ra log.
 *
 * Một dòng tóm tắt + MỘT DÒNG MỖI MO LỆCH. Không gộp cảnh báo vào một dòng JSON khổng lồ:
 * log Vercel cắt dòng dài, và thứ bị cắt luôn là phần cuối — tức là những MO xếp sau.
 */
function logReport(report: MaSoMauScanReport, capHit: boolean): void {
  const tag = "[ma-so-mau-scan]";
  console.log(
    `${tag} tháng=${report.month} đã_soi=${report.scanned} khớp=${report.matched} cảnh_báo=${report.warnings.length}`,
  );

  // 🔴 KHÔNG CẮT BỚT ÂM THẦM. Chạm trần nghĩa là báo cáo này KHÔNG đầy đủ, và một con số
  // "0 cảnh báo" trong ca đó là một lời nói dối.
  if (capHit) {
    console.warn(`${tag} ⚠️ CHẠM TRẦN ${SCAN_FETCH_LIMIT} SO — kết quả CHƯA đầy đủ, cần chuyển sang lọc bằng SQL`);
  }

  for (const w of report.warnings) {
    const ly_do = w.reason === "MISMATCH" ? "LỆCH" : "KHÔNG TÌM THẤY MÃ";
    console.warn(
      `${tag} ${ly_do} | MO=${w.moNumber} | masoMau=${w.masoMau} | mã_trong_HT=[${w.codes.join(", ")}] | HT="${w.thongTinHt}"`,
    );
  }
}

export async function GET(request: NextRequest) {
  // ── Hai cửa vào ─────────────────────────────────────────────────────────────
  //
  //   1. Vercel Cron → `Authorization: Bearer ${CRON_SECRET}`
  //   2. ADMIN đang đăng nhập → mở thẳng URL kèm `?month=2026-08`
  //
  // 📌 Cửa thứ hai KHÔNG PHẢI tiện nghi. Log Vercel không phải nơi người ta chủ động vào xem,
  // và runtime log giữ rất ngắn. Không có nó thì "thông báo qua log" trên thực tế là không ai
  // đọc — đúng số phận của thông báo giao việc 3D khi webhook chưa được đặt.
  const secret = process.env.CRON_SECRET;
  const authorizedByCron = !!secret && timingSafeSecretMatches(bearerToken(request.headers.get("authorization")), secret);

  if (!authorizedByCron) {
    // ⚠️ THIẾU BIẾN THÌ NÓI RA. Lặng lẽ 401 là cách một tác vụ hẹn giờ chết suốt nhiều tuần mà
    // không ai biết — đúng chuyện đang xảy ra với GOOGLE_CHAT_WEBHOOK_URL.
    if (!secret) console.error("[ma-so-mau-scan] CRON_SECRET chưa được đặt — cron sẽ luôn bị từ chối.");
    const user = await getCurrentUser();
    if (user?.role !== "ADMIN") return Errors.forbidden();
  }

  const raw = request.nextUrl.searchParams.get("month");
  // Không tháng → tháng HIỆN TẠI theo giờ Việt Nam. Cron chạy 01:00 UTC = 08:00 giờ VN, nên
  // ngày 1 hàng tháng nó vẫn quét đúng tháng mới.
  const month = raw ?? currentVnMonth(new Date());
  if (!isValidMonth(month)) return Errors.badRequest('Tháng phải có dạng "YYYY-MM".');

  try {
    const { items, capHit } = await loadCompletedItems();
    const report = buildMaSoMauScan(items, month);
    logReport(report, capHit);
    return ok({ ...report, capHit, fetchLimit: SCAN_FETCH_LIMIT });
  } catch (e) {
    console.error("[ma-so-mau-scan] quét thất bại:", e);
    return Errors.internal("Quét đối chiếu Mã số mẫu thất bại.");
  }
}
