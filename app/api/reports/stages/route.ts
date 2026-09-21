import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { orderVisibilityWhere } from "@/app/lib/business/order-lifecycle";
import { stagesInGroup } from "@/app/lib/business/production-stage";
import type {
  CrafterIdentity, NguoiRow, HotRow, TcDayRow, ResinRow, StageReportData,
} from "@/app/lib/types/kpi-report";

// Lọc theo THÁNG ĐỊA PHƯƠNG (VN UTC+7) — đồng bộ với màn Đánh giá Khâu (stage-reviews)
// để KPI và Đánh giá Khâu đếm cùng một tháng. Trước đây dùng giờ máy chủ (UTC) gây lệch:
// bản ghi "30/06 17:00Z" = 1/7 giờ VN bị KPI xếp nhầm vào tháng 6.
// Ba khâu con của nhóm Nguội — lấy từ nguồn khai báo chung, KHÔNG liệt kê tay ở đây.
// Chính việc mỗi file tự khai một danh sách khâu riêng đã khiến TC_NGUOI vắng mặt khỏi cả
// KPI, màn Đánh giá Khâu lẫn Lịch sử thay đổi mà không ai phát hiện.
//
// CHÊNH LỆCH ĐÃ BIẾT với màn Đánh giá Khâu (đo trên production, có chủ ý, KHÔNG phải lỗi):
// màn đánh giá lấy dòng theo `stageStatus === "done"`, còn KPI ở đây đòi phải có TÊN THỢ.
// Hiện có 2 bản ghi Khóa đánh dấu done, có ngày HT nhưng ô thợ rỗng → hiện ở màn đánh giá
// (để người dùng thấy mà điền tên) nhưng không vào KPI (không thể tính công cho người không
// tên). Nếu hai màn lệch nhau vài dòng, hãy kiểm tra các bản ghi thiếu tên thợ trước tiên.
const NHOM_NGUOI = stagesInGroup("NGUOI");

function inMonth(val: string | Date | null | undefined, y: number, m: number): boolean {
  if (!val) return false;
  const base = typeof val === "string" ? new Date(val) : val;
  const d = new Date(base.getTime() + 7 * 3_600 * 1000);
  return d.getUTCFullYear() === y && d.getUTCMonth() + 1 === m;
}

function hrs(start: string | Date | null | undefined, end: string | Date | null | undefined): number {
  if (!start || !end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, parseFloat((ms / 3_600_000).toFixed(2)));
}

// Phân loại 1 nhãn loại hột → cột KPI. Dữ liệu thực tế là nhãn tiếng Việt
// (XOÀN / XOÀN LAB / CZ / ĐÁ MÀU / NGỌC TRAI...); giữ thêm fallback mã kỹ thuật cũ.
function stoneCat(type: string | null): "xoan" | "xoanLab" | "cz" | "daMau" | "khac" {
  if (!type) return "khac";
  const t = type.trim().toUpperCase();
  // XOÀN LAB phải xét TRƯỚC XOÀN (vì cùng chứa "XOÀN")
  if (t.includes("LAB") || t === "CVD" || t === "MOISSANITE") return "xoanLab";
  if (t.includes("XOÀN") || t === "NATURAL-DIAMOND") return "xoan";
  if (t === "CZ") return "cz";
  if (t.includes("ĐÁ MÀU") || t === "COLORED") return "daMau";
  return "khac"; // ĐÁ, NGỌC TRAI, PEARL, KHÁC...
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!["ADMIN", "PRODUCTION", "ORDER"].includes(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const year  = parseInt(sp.get("year")  ?? "") || new Date().getFullYear();
  const month = parseInt(sp.get("month") ?? "") || new Date().getMonth() + 1;

  const mStart = new Date(year, month - 1, 1);
  const mEnd   = new Date(year, month, 1);
  const yStart = new Date(year, 0, 1);
  const yEnd   = new Date(year + 1, 0, 1);

  const [pds, craftsmen] = await Promise.all([
    prisma.productionDetail.findMany({
      where: {
        // Loại đơn đã soft-delete (nhập nhầm); VẪN tính đơn CANCELLED (thợ đã làm → tính công).
        order: orderVisibilityWhere(),
        OR: [
          { coldworkDoneAt:  { gte: mStart, lt: mEnd } },
          { settingDoneAt:   { gte: mStart, lt: mEnd } },
          { handcraftDoneAt: { gte: mStart, lt: mEnd } },
          { updatedAt: { gte: yStart, lt: yEnd } },
        ],
      },
      select: {
        coldworkCrafter:   true,
        coldworkStartAt:   true,
        coldworkDoneAt:    true,
        settingCrafter:    true,
        settingStartAt:    true,
        settingDoneAt:     true,
        handcraftCrafter:  true,
        handcraftStartAt:  true,
        handcraftDoneAt:   true,
        extraData:         true,
        order: {
          select: {
            items: { select: { id: true, mainStoneType: true, mainStoneQty: true } },
          },
        },
      },
    }),
    prisma.craftsman.findMany({ select: { name: true, code: true, level: true, levelRank: true } }),
  ]);

  const levelOf = Object.fromEntries(craftsmen.map(c => [c.name, c.level]));
  const codeOf  = Object.fromEntries(craftsmen.map(c => [c.name, c.code]));
  const rankOf  = Object.fromEntries(craftsmen.map(c => [c.name, c.levelRank]));

  // Kiểu TÍCH LUỸ (map keyed theo thợ) — phái sinh bằng Omit từ kiểu TRẢ VỀ trong
  // app/lib/types/kpi-report.ts, chứ không khai báo lại. Nhờ vậy thêm/bớt field ở hợp đồng là
  // `tsc` bắt lỗi ngay tại chỗ tích luỹ, không thể lệch âm thầm giữa API và client.
  // `crafter`/`level` được toRows() gắn vào sau nên bị Omit khỏi accumulator.
  type NRow = Omit<NguoiRow, keyof CrafterIdentity>;
  type HRow = Omit<HotRow, keyof CrafterIdentity>;
  // TC_DAY keyed by "crafter||workGroup" — GIỮ `crafter` trong accumulator vì khoá là ghép đôi,
  // toRows() không dùng được cho nhánh này (xem tcdayRows bên dưới).
  // `code` cũng do nhánh gộp gắn vào sau (như `level`), nên phải loại khỏi accumulator —
  // chỉ `crafter` được giữ, vì khoá của map này là cặp "crafter||workGroup".
  type TRow = Omit<TcDayRow, "level" | "code">;
  type RRow = Omit<ResinRow, keyof CrafterIdentity>;

  const nguoi: Record<string, NRow> = {};
  const hot:   Record<string, HRow> = {};
  const tcday: Record<string, TRow> = {};
  const resin: Record<string, RRow> = {};

  // "Hg Mp" (vd "5g 30p") → số giờ thập phân (cho Số giờ thực tế nhập tay).
  // Phần "g" phải nhận cả số thập phân ("2.5g" — dữ liệu import) chứ không chỉ số nguyên,
  // nếu không regex \d+ sẽ khớp nhầm vào phần lẻ sau dấu chấm (2.5g → bắt "5g" → sai gấp đôi).
  function gioStrToHours(s: string | null | undefined): number {
    if (!s) return 0;
    let total = 0;
    const dh = s.match(/(\d+(?:\.\d+)?)g/); if (dh) total += parseFloat(dh[1]) * 60;
    const dm = s.match(/(\d+)p/); if (dm) total += parseInt(dm[1], 10);
    return total / 60;
  }

  // qPass/qFail/tPass/tFail là SỐ LẦN (cộng theo từng bản ghi). moDelta = số công việc/bản ghi
  // để cộng vào "SL MO thực tế" — đếm theo TỪNG CÔNG VIỆC (khớp màn Đánh giá Khâu + Google Sheet:
  // 1 MO làm 2 lần = 2 dòng). Nhánh dữ liệu cũ (scalar) không truyền → mặc định 1.
  function addN(crafter: string, h: number, kpi: number, qPass: number, qFail: number, tPass: number, tFail: number, moDelta = 1) {
    if (!crafter) return;
    nguoi[crafter] ??= { totalHours: 0, kpiHours: 0, moCount: 0, qualityPass: 0, qualityFail: 0, timePass: 0, timeFail: 0 };
    nguoi[crafter].totalHours += h;
    nguoi[crafter].kpiHours   += kpi;
    nguoi[crafter].moCount    += moDelta;
    nguoi[crafter].qualityPass += qPass;
    nguoi[crafter].qualityFail += qFail;
    nguoi[crafter].timePass    += tPass;
    nguoi[crafter].timeFail    += tFail;
  }

  function ensureHot(crafter: string) {
    hot[crafter] ??= { moCount: 0, xoan: 0, xoanLab: 0, cz: 0, daMau: 0, khac: 0 };
    return hot[crafter];
  }
  // Cộng SL hột theo TỪNG LOẠI (nguồn đúng = stoneQtyByType user nhập ở khâu HỘT).
  // Fallback: stoneType + stoneQty (tách nhãn gộp "XOÀN, ĐÁ MÀU" theo dấu phẩy, chia đều SL).
  // KHÔNG đụng moCount ở đây — moCount đếm 1 lần/thợ/MO do caller quản lý.
  function addHQty(h: HRow, byType: Record<string, number> | null | undefined, stoneType: string | null, qty: number) {
    if (byType && Object.keys(byType).length > 0) {
      for (const [label, n] of Object.entries(byType)) h[stoneCat(label)] += Number(n) || 0;
      return;
    }
    const labels = (stoneType ?? "").split(",").map(x => x.trim()).filter(Boolean);
    if (labels.length <= 1) {
      h[stoneCat(labels[0] ?? null)] += qty;
    } else {
      const per = qty / labels.length; // nhãn gộp không tách SL → chia đều
      for (const l of labels) h[stoneCat(l)] += per;
    }
  }

  function addT(crafter: string, workGroup: string, h: number) {
    if (!crafter) return;
    const key = `${crafter}||${workGroup}`;
    tcday[key] ??= { crafter, workGroup, totalHours: 0, moCount: 0 };
    tcday[key].totalHours += h;
    tcday[key].moCount++;
  }

  function addR(crafter: string, wOk: string | null, qOk: string | null) {
    if (!crafter) return;
    resin[crafter] ??= { moCount: 0, weightPass: 0, weightFail: 0, qualityPass: 0, qualityFail: 0 };
    resin[crafter].moCount++;
    if (wOk === "Đạt") resin[crafter].weightPass++;
    else if (wOk === "Không đạt") resin[crafter].weightFail++;
    if (qOk === "Đạt") resin[crafter].qualityPass++;
    else if (qOk === "Không đạt") resin[crafter].qualityFail++;
  }

  for (const pd of pds) {
    const extra    = (pd.extraData as Record<string, unknown>) ?? {};
    const perItem  = (extra.perItem as Record<string, Record<string, unknown>>) ?? {};
    const hasPerItem = Object.keys(perItem).length > 0;

    if (hasPerItem) {
      for (const [itemId, itemData] of Object.entries(perItem)) {
        const stages = (itemData.stages as Record<string, Record<string, unknown>>) ?? {};
        const item = pd.order.items.find(i => i.id === itemId);

        const rs = stages["RESIN"];
        if (rs?.crafter && inMonth(rs.doneAt as string, year, month)) {
          addR(
            rs.crafter as string,
            (rs.resinWeightOk as string) ?? null,
            (rs.resinQualityOk as string) ?? null,
          );
        }

        // Nhóm Nguội = NGUOI + TC_NGUOI + KHOA. Trước đây chỉ đọc stages["NGUOI"] nên toàn bộ
        // công việc ở hai khâu con biến mất khỏi KPI — không bị tính nhầm sang bảng khác, mà
        // bỏ qua hẳn. Đo trên production: 25 công việc Khóa + 5 TC Nguội bị bỏ sót.
        //
        // Duyệt theo NHÓM lấy từ production-stage.ts thay vì liệt kê tay ở đây: thêm/bớt khâu
        // con sau này chỉ sửa một chỗ, không phải nhớ ra còn file này nữa.
        for (const nguoiCode of NHOM_NGUOI) {
          const ns = stages[nguoiCode];
          if (ns) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const recs = Array.isArray((ns as any).records) ? ((ns as any).records as any[]) : null;
            if (recs && recs.length) {
              // GĐ2: nhiều thợ / nhiều lần → cộng cho ĐÚNG từng thợ; SL MO đếm 1 lần/thợ/MO
              const byC: Record<string, { hours: number; kpi: number; qPass: number; qFail: number; tPass: number; tFail: number; recs: number }> = {};
              for (const r of recs) {
                const c = r.crafter as string;
                if (!c) continue;
                const dt = (r.doneAt as string) ?? (ns.doneAt as string);
                if (!inMonth(dt, year, month)) continue;
                byC[c] ??= { hours: 0, kpi: 0, qPass: 0, qFail: 0, tPass: 0, tFail: 0, recs: 0 };
                const g = byC[c];
                g.recs++; // mỗi bản ghi = 1 công việc → cộng vào SL MO thực tế (khớp Đánh giá Khâu)
                g.hours += gioStrToHours(r.gioThucTe) || hrs(r.startAt as string, r.doneAt as string);
                g.kpi   += parseFloat((r.gioKpi as string) ?? "0") || 0;
                if (r.ketQua === "Đạt") g.qPass++; else if (r.ketQua === "Không đạt") g.qFail++;
                if (r.thoiGianOk === "Đạt") g.tPass++; else if (r.thoiGianOk === "Không đạt") g.tFail++;
              }
              for (const [c, g] of Object.entries(byC)) addN(c, g.hours, g.kpi, g.qPass, g.qFail, g.tPass, g.tFail, g.recs);
            } else if (ns.crafter && inMonth(ns.doneAt as string, year, month)) {
              const kpiH = parseFloat((ns.gioKpi as string) ?? "0") || 0;
              const q = (ns.coldworkQuality as string) ?? null;
              const t = (ns.coldworkTimeOk  as string) ?? null;
              addN(ns.crafter as string, hrs(ns.startAt as string, ns.doneAt as string), kpiH,
                q === "Đạt" ? 1 : 0, q === "Không đạt" ? 1 : 0, t === "Đạt" ? 1 : 0, t === "Không đạt" ? 1 : 0);
            }
          }
        }

        const hs = stages["HOT"];
        if (hs) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const recs = Array.isArray((hs as any).records) ? ((hs as any).records as any[]) : null;
          if (recs && recs.length) {
            // Gom record theo thợ (moCount = 1/thợ/MO), cộng SL theo loại hột THỰC NHẬP ở khâu HỘT
            const seen = new Set<string>();
            for (const r of recs) {
              const c = r.crafter as string;
              if (!c) continue;
              const dt = (r.doneAt as string) ?? (hs.doneAt as string);
              if (!inMonth(dt, year, month)) continue;
              const h = ensureHot(c);
              if (!seen.has(c)) { h.moCount++; seen.add(c); }
              addHQty(h, r.stoneQtyByType as Record<string, number> | null, (r.stoneType as string) ?? null, (r.stoneQty as number) ?? 0);
            }
          } else if (hs.crafter && inMonth(hs.doneAt as string, year, month)) {
            const h = ensureHot(hs.crafter as string);
            h.moCount++;
            addHQty(h, (hs.stoneQtyByType as Record<string, number> | null) ?? null, (hs.stoneType as string) ?? null, (hs.stoneQty as number) ?? 0);
          }
        }

        const ts = stages["TC_DAY"];
        if (ts?.crafter && inMonth(ts.doneAt as string, year, month)) {
          addT(
            ts.crafter as string,
            (ts.workGroup as string) || "—",
            hrs(ts.startAt as string, ts.doneAt as string),
          );
        }
      }
    } else {
      if (pd.coldworkCrafter && inMonth(pd.coldworkDoneAt, year, month)) {
        addN(pd.coldworkCrafter, hrs(pd.coldworkStartAt, pd.coldworkDoneAt), 0, 0, 0, 0, 0);
      }
      if (pd.settingCrafter && inMonth(pd.settingDoneAt, year, month)) {
        // V2 legacy (không có perItem): chỉ còn mainStoneType/Qty cấp item làm nguồn duy nhất
        const first = pd.order.items[0];
        const h = ensureHot(pd.settingCrafter);
        h.moCount++;
        addHQty(h, null, first?.mainStoneType ?? null, first?.mainStoneQty ?? 0);
      }
      if (pd.handcraftCrafter && inMonth(pd.handcraftDoneAt, year, month)) {
        addT(pd.handcraftCrafter, "—", hrs(pd.handcraftStartAt, pd.handcraftDoneAt));
      }
    }
  }

  function toRows<T extends object>(map: Record<string, T>) {
    return Object.entries(map)
      .map(([crafter, data]) => ({ crafter, code: codeOf[crafter] ?? "", level: levelOf[crafter] ?? "", ...data }))
      .sort((a, b) => (rankOf[b.crafter] ?? 0) - (rankOf[a.crafter] ?? 0) || a.crafter.localeCompare(b.crafter));
  }

  // TC_DAY: sort by crafter levelRank then workGroup
  const tcdayRows = Object.values(tcday)
    .map(r => ({ ...r, code: codeOf[r.crafter] ?? "", level: levelOf[r.crafter] ?? "" }))
    .sort((a, b) => (rankOf[b.crafter] ?? 0) - (rankOf[a.crafter] ?? 0) || a.crafter.localeCompare(b.crafter) || a.workGroup.localeCompare(b.workGroup));

  // `satisfies` (không phải `as`) — ép tsc đối chiếu payload với hợp đồng dùng chung mà vẫn
  // giữ nguyên kiểu suy luận. Thiếu field hay sai kiểu là báo lỗi NGAY TẠI ĐÂY, thay vì để
  // client nhận dữ liệu không như khai báo rồi hỏng lúc chạy.
  const payload = {
    year, month,
    nguoi: toRows(nguoi),
    hot:   toRows(hot),
    tcday: tcdayRows,
    resin: toRows(resin),
  } satisfies StageReportData;

  return NextResponse.json(payload);
}
