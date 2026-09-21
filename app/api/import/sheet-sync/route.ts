import type { NextRequest } from "next/server";
import * as z from "zod";
import { prisma } from "@/app/lib/prisma";
import { timingSafeSecretMatches } from "@/app/lib/api/timing-safe-secret";
import { ok, Errors } from "@/app/lib/api-response";
import { isMoFromWebapp, stripVersionSuffix } from "@/app/lib/business/order-helpers";
import { vnYmdToUtcMidnight } from "@/app/lib/utils/vn-date";
import {
  buildSyncPlan, groupByOrder, indexKnownMos, SYNC_FIELDS,
  type DbItem, type MoCandidate, type SheetRow,
} from "@/app/lib/business/sheet-sync";
import { bumpOrderVersion } from "@/app/lib/db/order-version";
import { buildNoticePayload } from "@/app/lib/business/orders/sync-notice";

// ─── POST /api/import/sheet-sync ─────────────────────────────────────────────
// Nhận dữ liệu ĐẨY TỪ Google Apps Script (tab "HT<MM>.<YY>" của sheet TỔNG SPHT NHẬP KHO)
// để cập nhật Mã SKU / Thông tin HT / Ngày HT cho các MO đã Hoàn tất.
//
// VÌ SAO "ĐẨY" CHỨ KHÔNG "KÉO": policy Google Workspace của công ty chặn cả service account
// lẫn OAuth app ngoài đọc sheet. Apps Script chạy BẰNG TÀI KHOẢN user (vốn đã có quyền đọc)
// nên chủ động gửi sang đây — webapp không cần bất kỳ quyền Google nào.
//
// Route này CỐ Ý MỎNG: xác thực → nạp dữ liệu → gọi buildSyncPlan (hàm thuần ở
// app/lib/business/sheet-sync.ts) → ghi → trả kết quả. Mọi quy tắc nghiệp vụ nằm ở module
// business để test được mà không cần DB.

const bodySchema = z.object({
  dryRun: z.boolean().optional().default(true),
  /**
   * Tháng của tab sheet đã đọc, dạng "YYYY-MM".
   *
   * ⚠️ TUỲ CHỌN CÓ CHỦ Ý. Apps Script nằm NGOÀI repo và được cập nhật bằng tay; bắt buộc
   * trường này là làm mẻ đồng bộ đang chạy tốt đổ ngay khi deploy, trước khi ai kịp dán bản
   * script mới. Thiếu nó thì chỉ mất phần LỜI NHẮC VIỆC — đồng bộ dữ liệu vẫn nguyên vẹn.
   *
   * Route KHÔNG tự đoán tháng từ dữ liệu: các dòng trong tab tháng 7 vẫn có thể mang ngày của
   * tháng khác, và đoán sai thì ảnh chụp ghi đè nhầm tháng — một lỗi im lặng.
   */
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  rows: z.array(z.object({
    mo:         z.string().min(1).max(100),
    sku:        z.string().max(200).optional(),
    thongTinHt: z.string().max(2000).optional(),
    ngay:       z.string().max(50).optional(),
  })).min(1).max(5000),
});

/** Field nào là ngày → giá trị ghi xuống DB phải là Date UTC-midnight, không phải chuỗi. */
const DATE_TARGETS = new Set(SYNC_FIELDS.filter((f) => f.compare === "date").map((f) => f.target));

export async function POST(request: NextRequest) {
  const expected = process.env.SHEET_SYNC_SECRET;
  if (!expected) return Errors.forbidden("Sync chưa được cấu hình trên server.");
  const provided = request.headers.get("x-sync-secret") ?? "";
  if (!provided || !timingSafeSecretMatches(provided, expected)) return Errors.forbidden();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Errors.badRequest("Invalid JSON body");
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return Errors.validationFailed(parsed.error.issues);
  const { dryRun, rows, month } = parsed.data;

  try {
    // ── Nạp dữ liệu CÓ MỤC TIÊU (không quét toàn bảng) ────────────────────────
    // Lọc thô ở SQL bằng startsWith theo các MO gốc có trong payload, rồi đối chiếu CHÍNH
    // XÁC bằng stripVersionSuffix ở bộ nhớ — cùng pattern đã dùng cho psxSibling ở
    // /api/orders. Cần re-check vì "26.1234" startsWith cũng khớp nhầm "26.12345".
    const bases = [...new Set(rows.map((r) => stripVersionSuffix(String(r.mo ?? "").trim())).filter(Boolean))];
    if (bases.length === 0) {
      return ok({ dryRun, totalRows: rows.length, updates: 0, mismatches: 0, notFound: [], notCompleted: [], badDate: [], changes: [] });
    }

    const items = await prisma.orderItem.findMany({
      where: {
        order: { deletedAt: null },
        OR: bases.map((b) => ({ moNumber: { startsWith: b } })),
      },
      select: {
        id: true, moNumber: true, orderId: true, itemStatus: true,
        // `zone` + `specifications` nuôi phép CHỌN MO và cờ hiển thị — xem indexKnownMos.
        zone: true, specifications: true,
        // `orderNumber` chỉ để HIỂN THỊ (SO nhỏ dưới MO trong popup nhắc việc) — không tham gia
        // khớp dòng. Giữ nó ở route thay vì đẩy xuống sheet-sync.ts: tầng luật không có lý do
        // nào để biết đến SO.
        order: {
          select: {
            orderNumber: true, status: true, createdById: true,
            productionDetail: { select: { extraData: true } },
          },
        },
      },
    });

    const baseSet = new Set(bases);
    const orderNumberById = new Map<string, string>();
    const candidates: MoCandidate[] = [];
    const dbItems: DbItem[] = [];
    for (const it of items) {
      if (!it.moNumber) continue;
      const base = stripVersionSuffix(it.moNumber);
      if (!baseSet.has(base)) continue; // loại false-positive của startsWith
      orderNumberById.set(it.orderId, it.order.orderNumber);

      const isFromWebapp = isMoFromWebapp({
        specifications: it.specifications,
        orderCreatedById: it.order.createdById,
      });
      candidates.push({
        orderId: it.orderId, itemId: it.id, moNumber: it.moNumber, isFromWebapp,
        zone: it.zone, itemStatus: it.itemStatus, orderStatus: it.order.status,
      });

      const eff = it.itemStatus ?? it.order.status;
      if (eff !== "COMPLETED") continue;
      const extra = (it.order.productionDetail?.extraData ?? {}) as Record<string, unknown>;
      const perItem = (extra.perItem as Record<string, Record<string, unknown>>) ?? {};
      dbItems.push({
        itemId: it.id, orderId: it.orderId, moNumber: it.moNumber, isFromWebapp,
        current: perItem[it.id] ?? {},
      });
    }

    // ── Lập kế hoạch (hàm thuần) ──────────────────────────────────────────────
    // Phép CHỌN MO nằm ở tầng luật, không ở đây: nó từng inline trong route và đã chọn sai (bản
    // PTK thay vì bản đang chạy ngoài xưởng) mà không test nào bắt được. Xem indexKnownMos.
    const plan = buildSyncPlan(rows as SheetRow[], dbItems, indexKnownMos(candidates, baseSet));

    const summary = {
      dryRun,
      totalRows: rows.length,
      updates: plan.updates.length,
      mismatches: plan.mismatches.length,
      notFound: plan.notFound,
      // ⚠️ TRẢ VỀ MẢNG CHUỖI, dù bên trong nay là object. Apps Script đang `.join(", ")` danh
      // sách này để ghi log; đổi hình dạng là log biến thành "[object Object]" ở một script
      // nằm NGOÀI repo, không có gì kiểm và không ai sửa cho tới khi có người đọc log.
      notCompleted: plan.notCompleted.map((x) => x.mo),
      badDate: plan.badDate,
      changes: plan.updates.map((u) => ({ mo: u.moNumber, field: u.label, from: u.from, to: u.to })),
      dateMismatches: plan.mismatches.map((m) => ({ mo: m.moNumber, webapp: m.webapp, sheet: m.sheet })),
    };

    if (dryRun) return ok({ ...summary, noticeSaved: null, noticeError: null });

    // ── Ghi thật — mỗi đơn 1 transaction ──────────────────────────────────────
    // Cố ý KHÔNG gộp tất cả vào 1 transaction: 1 đơn lỗi không kéo đổ cả mẻ đồng bộ hằng ngày.
    const byOrder = groupByOrder(plan);
    const pds = await prisma.productionDetail.findMany({
      where: { orderId: { in: [...byOrder.keys()] } },
      select: { orderId: true, extraData: true },
    });
    const pdByOrder = new Map(pds.map((p) => [p.orderId, p.extraData]));

    for (const [orderId, work] of byOrder) {
      await prisma.$transaction(async (tx) => {
        if (work.updates.length > 0) {
          const extra = JSON.parse(JSON.stringify(pdByOrder.get(orderId) ?? {})) as Record<string, unknown>;
          const perItem = (extra.perItem as Record<string, Record<string, unknown>>) ?? {};
          for (const u of work.updates) {
            const cur = { ...(perItem[u.itemId] ?? {}) };
            // Field ngày lưu Date UTC-midnight (đúng chuẩn lưu trữ toàn hệ thống); còn lại lưu text.
            cur[u.target] = DATE_TARGETS.has(u.target)
              ? (vnYmdToUtcMidnight(u.to)?.toISOString() ?? u.to)
              : u.to;
            perItem[u.itemId] = cur;
          }
          extra.perItem = perItem;
          await tx.productionDetail.update({ where: { orderId }, data: { extraData: extra as never } });
          // Mẻ đồng bộ chạy nền, không ai ngồi canh — nên nó là người ghi ĐÈ dễ gây mất dữ
          // liệu nhất: ai đang mở tab Tiến độ lúc mẻ chạy sẽ ghi đè ngược lại mà không biết.
          // CHỈ tăng khi thật sự có ghi: mẻ không đổi gì mà vẫn tăng thì mỗi sáng lại đá văng
          // toàn bộ tab đang mở vì một thay đổi không tồn tại.
          await bumpOrderVersion(tx, orderId);
        }

        // 1 dòng Lịch sử thay đổi cho mỗi đơn — cờ dateMismatch để màn Lịch sử thay đổi
        // hiện badge cảnh báo (KHÔNG tạo Alert: tránh nhiễu tab Cảnh báo và rủi ro
        // CRITICAL auto-suspend đơn đã hoàn tất).
        const parts: string[] = [];
        if (work.updates.length) parts.push(`cập nhật ${work.updates.length} trường`);
        if (work.mismatches.length) parts.push(`${work.mismatches.length} MO lệch Ngày HT`);
        await tx.workflowHistory.create({
          data: {
            orderId,
            action: "FIELD_UPDATED",
            comment: `Đồng bộ Google Sheet — ${parts.join(", ")}`,
            metadata: {
              source: "GOOGLE_SHEET",
              ...(work.mismatches.length ? {
                dateMismatch: true,
                dateMismatchDetail: work.mismatches.map((m) => ({ mo: m.moNumber, webapp: m.webapp, sheet: m.sheet })),
              } : {}),
              changes: work.updates.map((u) => ({ field: `${u.moNumber} · ${u.label}`, old: u.from, new: u.to })),
            } as never,
          },
        });
      }, { maxWait: 10_000, timeout: 30_000 });
    }

    // ── Ảnh chụp NHẮC VIỆC — và BÁO VỀ chuyện gì đã xảy ra với nó ─────────────
    //
    // Ghi ĐÈ trọn ảnh chụp của tháng: đó là cách lời nhắc TỰ ĐÓNG. Đặt đơn chuyển MO sang Hoàn
    // tất hôm nay → mẻ 17h mai không còn MO đó trong payload → nhắc việc biến mất. Không có
    // `isResolved`, không có vòng đời nào để lệch.
    //
    // 🔴 BỌC RIÊNG, KHÔNG NÉM RA NGOÀI: nhắc việc là thứ PHỤ. Nó hỏng thì mẻ đồng bộ — việc
    // chính, đã ghi xong ở trên — vẫn phải báo thành công.
    //
    // 🔴 BA LẦN LIÊN TIẾP TÍNH NĂNG NÀY HỎNG IM LẶNG, VÀ CẢ BA LẦN ĐỀU DO CÙNG MỘT KIỂU CODE:
    // một nhánh `if` không có `else`, một `catch` chỉ ghi log server. Người vận hành nhìn thấy
    // "đồng bộ thành công" và không có gì nói rằng một nửa việc đã không xảy ra.
    //
    // Nay MỌI kết cục đều được trả về cho bên gọi: đã ghi, thiếu `month`, hay ném lỗi. Log
    // Vercel không ai đọc hằng ngày — Execution log của Apps Script thì người ta đang mở sẵn.
    let noticeSaved = false;
    let noticeError: string | null = null;

    // 🔴 THIẾU `month` THÌ PHẢI NÓI RA. Trường này tuỳ chọn để bản script cũ không bị đổ — nhưng
    // "tuỳ chọn" không có nghĩa là "im lặng". Lần triển khai đầu tiên đã mất ba lượt hỏi qua lại
    // chỉ để phát hiện script chưa được dán bản mới, vì không có một dòng nào nói điều đó.
    if (!month) {
      noticeError = "Payload thiếu `month` — Apps Script đang chạy bản cũ (thiếu hàm thangTuTenTab_).";
      console.warn("[sheet-sync] " + noticeError);
    }

    if (month) {
      try {
        // `so` gắn ở ĐÂY chứ không ở buildSyncPlan: nó thuần tuý để hiển thị, và `itemId` thì
        // cả hai nhóm đều đã có sẵn — nhóm lệch ngày mang nó từ đầu, chỉ là trước đây không
        // được chuyển qua.
        const payload = buildNoticePayload(
          plan.notCompleted.map((x) => ({ ...x, so: orderNumberById.get(x.orderId) })),
          plan.mismatches.map((m) => ({
            mo: m.moNumber, orderId: m.orderId, itemId: m.itemId,
            so: orderNumberById.get(m.orderId), isFromWebapp: m.isFromWebapp,
            webapp: m.webapp, sheet: m.sheet,
          })),
        );
        await prisma.syncNotice.upsert({
          where: { month },
          create: { month, payload, syncedAt: new Date() },
          update: { payload, syncedAt: new Date() },
        });
        noticeSaved = true;
      } catch (e) {
        // ⚠️ TRẢ CÂU LỖI VỀ, không chỉ ghi console. Nghi phạm phổ biến nhất ở đây là Prisma
        // Client cũ trên Vercel (`prisma.syncNotice` không tồn tại) — và không có câu lỗi thì
        // nó trông y hệt "không có việc nào để nhắc".
        noticeError = e instanceof Error ? e.message : String(e);
        console.error("[sheet-sync] ghi nhắc việc thất bại (đồng bộ vẫn thành công):", e);
      }
    }

    return ok({ ...summary, noticeSaved, noticeError });
  } catch (err) {
    console.error("[POST /api/import/sheet-sync]", err);
    return Errors.internal();
  }
}
