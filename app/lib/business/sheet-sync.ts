import { stripVersionSuffix, versionOf } from "@/app/lib/business/order-helpers";
import { isLivePsxItem } from "@/app/lib/business/orders/psx-sibling";
import { parseVnDate, toVnYmd, isSameVnDay } from "@/app/lib/utils/vn-date";

// ─────────────────────────────────────────────────────────────────────────────
// Logic nghiệp vụ ĐỒNG BỘ TỪ GOOGLE SHEET — toàn bộ là HÀM THUẦN (không đụng DB, không
// I/O) nên test được độc lập. Route (app/api/import/sheet-sync) chỉ làm: xác thực → nạp
// dữ liệu → gọi buildSyncPlan() → ghi → trả kết quả.
//
// CONFIG-DRIVEN: muốn đồng bộ thêm một cột từ sheet về sau (TL vàng, Loại hột…) chỉ cần
// thêm 1 entry vào SYNC_FIELDS — KHÔNG phải sửa logic khớp/so sánh/cảnh báo bên dưới.
// ─────────────────────────────────────────────────────────────────────────────

/** Một dòng đọc từ Google Sheet (Apps Script gửi lên). */
export interface SheetRow {
  mo: string;
  sku?: string;
  thongTinHt?: string;
  /** Ngày hoàn thành theo sheet — chuỗi thô ("15/07/2026", "15-Jul-26"…). */
  ngay?: string;
}

/** MO trên webapp (đã lọc COMPLETED ở tầng gọi). */
export interface DbItem {
  itemId: string;
  orderId: string;
  moNumber: string;
  /** Cờ hiển thị hậu tố "_1" ngầm định — xem isMoFromWebapp/getMoVersionDisplay. */
  isFromWebapp: boolean;
  /** Giá trị hiện có trong extraData.perItem[itemId] — dùng để so sánh. */
  current: Record<string, unknown>;
}

/**
 * Một MO tồn tại trên webapp — dùng cho tra cứu theo MO GỐC, kể cả MO chưa Hoàn tất.
 *
 * Khác `DbItem` ở chỗ nó KHÔNG mang `current`: chỗ dùng nó chỉ cần biết "MO này có thật, nằm ở
 * đâu", không so sánh giá trị nào cả.
 */
export interface KnownMo {
  orderId: string;
  itemId: string;
  moNumber: string;
  /** Cờ hiển thị hậu tố "_1" ngầm định — xem isMoFromWebapp/getMoVersionDisplay. */
  isFromWebapp: boolean;
}

/** Một MO trên webapp, đủ dữ kiện để xét xem nó có phải bản mà sheet đang nói tới không. */
export interface MoCandidate extends KnownMo {
  zone: string;
  itemStatus: string | null;
  orderStatus: string;
}

/**
 * Với mỗi MO GỐC, bản nào trên webapp là bản mà sheet đang nói tới.
 *
 * 🔴 LỌC TRƯỚC, PHÂN ĐỊNH SAU — VÀ ĐẢO THỨ TỰ NÀY ĐÃ GÂY LỖI THẬT.
 *
 * Bản trước chỉ có một luật: "lấy phiên bản cao nhất". Nó chép từ luật 3 của
 * psx-sibling.ts NHƯNG BỎ MẤT bộ lọc đứng trước — ở đó danh sách ứng viên đã chỉ còn PSX, nên
 * "cao nhất" là phép PHÂN ĐỊNH KHI HOÀ, không phải phép chọn.
 *
 * Hệ quả trên production: "Thiết kế lại" tạo phiên bản MỚI ở PTK trong khi bản đang chạy ngoài
 * xưởng ở lại PSX với phiên bản THẤP hơn.
 *
 *     25.33240    → PSX, đang sản xuất   ← sheet đang nói về bản này
 *     25.33240_4  → PTK, "Chưa thiết kế" ← nhưng "cao nhất" chọn bản này
 *
 * Lời nhắc dẫn người dùng tới một dòng KHÔNG CÓ NÚT HOÀN TẤT để bấm — một ngõ cụt trông y hệt
 * một chỉ dẫn đúng.
 *
 * Ba tầng ưu tiên, xét theo thứ tự:
 *   1. CÒN HIỆU LỰC hơn ĐÃ HUỶ (dùng lại isLivePsxItem — câu hỏi này từng được trả lời khác
 *      nhau ở hai nơi, nên nó có một chỗ ở duy nhất).
 *   2. PSX hơn PTK. Sheet báo XƯỞNG hoàn tất, nên nó nói về bản sản xuất.
 *   3. Hoà thì lấy phiên bản cao nhất.
 *
 * ⚠️ BẢN ĐÃ HUỶ BỊ XẾP CUỐI, KHÔNG BỊ LOẠI HẲN. Loại hẳn thì MO chỉ còn bản huỷ sẽ rơi vào
 * `notFound` — tức webapp nói "không có MO này", một câu SAI. Nó có, và việc sheet báo hoàn tất
 * cho một MO đã huỷ là mâu thuẫn đáng biết chứ không phải thứ nên biến mất.
 */
export function indexKnownMos(
  candidates: readonly MoCandidate[],
  bases: ReadonlySet<string>,
): Map<string, KnownMo> {
  // Ba tầng gộp thành MỘT vector so sánh theo thứ tự từ điển — thêm tầng ưu tiên về sau chỉ là
  // thêm một phần tử, không phải viết lại vòng lặp.
  const rank = (c: MoCandidate): number[] => [
    isLivePsxItem({ itemStatus: c.itemStatus, orderStatus: c.orderStatus }) ? 1 : 0,
    c.zone === "MASTER_HUB" ? 1 : 0,
    versionOf(c.moNumber),
  ];
  const better = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return true; // hoà tuyệt đối → giữ bản gặp sau, như hành vi cũ
  };

  const out = new Map<string, KnownMo>();
  const ranks = new Map<string, number[]>();
  for (const c of candidates) {
    const base = stripVersionSuffix(c.moNumber);
    // Luật 1 của psx-sibling: KHÔNG tin startsWith của truy vấn — "26.1234" khớp nhầm "26.12345".
    if (!bases.has(base)) continue;

    const r = rank(c);
    const cur = ranks.get(base);
    if (cur && !better(r, cur)) continue;
    ranks.set(base, r);
    out.set(base, { orderId: c.orderId, itemId: c.itemId, moNumber: c.moNumber, isFromWebapp: c.isFromWebapp });
  }
  return out;
}

type CompareKind = "text" | "date";

interface SyncFieldDef {
  /** Khoá trong payload gửi từ Apps Script. */
  key: keyof SheetRow & string;
  /** Nhãn tiếng Việt — dùng trong log/Lịch sử thay đổi. */
  label: string;
  /** Tên field đích trong extraData.perItem[itemId]. */
  target: string;
  compare: CompareKind;
  /**
   * date + fillIfEmpty: đích đang TRỐNG → tự điền từ sheet.
   * date + warnIfDifferent: đích ĐÃ CÓ và khác sheet → CHỈ cảnh báo, KHÔNG ghi đè
   *   (giữ bất biến "Ngày HT chỉ đổi khi user cố ý", tránh máy ghi đè số liệu người nhập).
   */
  fillIfEmpty?: boolean;
  warnIfDifferent?: boolean;
}

export const SYNC_FIELDS: SyncFieldDef[] = [
  { key: "sku",        label: "Mã SKU",       target: "sku",           compare: "text" },
  { key: "thongTinHt", label: "Thông tin HT", target: "thongTinHt",    compare: "text" },
  {
    key: "ngay", label: "Ngày HT", target: "completedDate", compare: "date",
    fillIfEmpty: true,      // webapp trống → lấy theo sheet
    warnIfDifferent: true,  // webapp đã có mà lệch → cảnh báo, không ghi đè
  },
];

export interface PlannedUpdate {
  itemId: string;
  orderId: string;
  moNumber: string;
  target: string;
  label: string;
  from: string;
  /** Giá trị sẽ ghi: chuỗi "YYYY-MM-DD" với field date, hoặc text thô. */
  to: string;
}

export interface DateMismatch {
  itemId: string;
  orderId: string;
  moNumber: string;
  isFromWebapp: boolean;
  label: string;
  /** Ngày đang lưu trên webapp (YYYY-MM-DD). */
  webapp: string;
  /** Ngày theo Google Sheet (YYYY-MM-DD). */
  sheet: string;
}

/**
 * MO có trên webapp nhưng CHƯA Hoàn tất.
 *
 * ⚠️ MANG THEO `orderId` VÀ `itemId`, KHÔNG chỉ số MO. Đây là tín hiệu "Đặt đơn quên chuyển
 * MO" và nó cần dẫn tới ĐÚNG MO (xem business/orders/sync-notice.ts). Chỉ có `orderId` thì
 * panel mở ở cấp đơn hàng và hiện `MO# —` — đã xảy ra thật, người dùng báo "nó hiện SO chứ
 * không hiện MO". Hợp đồng của panel là HAI tham số: `?orderId=` + `?activeItemId=`.
 *
 * 🔴 `mo` LÀ `moNumber` CỦA WEBAPP, KHÔNG PHẢI CHUỖI TRONG SHEET. Hai thứ này gần giống nhau
 * nên rất dễ dùng nhầm — nhưng chỉ số của webapp mới được phép đưa qua
 * formatMoVersionedDisplay ở tầng hiển thị, VÀ chỉ kèm đúng cờ `isFromWebapp` của chính nó.
 */
export interface NotCompletedMo {
  mo: string;
  orderId: string;
  itemId: string;
  isFromWebapp: boolean;
}

export interface SyncPlan {
  updates: PlannedUpdate[];
  mismatches: DateMismatch[];
  /** MO có trong sheet nhưng không tồn tại trên webapp. */
  notFound: string[];
  /** MO có trên webapp nhưng CHƯA Hoàn tất → bỏ qua ở lần này. */
  notCompleted: NotCompletedMo[];
  /** Ngày trong sheet không đọc được (sai định dạng) — bỏ qua, không đoán bừa. */
  badDate: string[];
}

/** Chuẩn hoá giá trị hiện có về chuỗi để so sánh (text). */
function currentText(current: Record<string, unknown>, target: string): string {
  const v = current[target];
  return v == null ? "" : String(v).trim();
}

/**
 * Ngày hiện có trên webapp cho field date → "YYYY-MM-DD" (hoặc "" nếu trống).
 * Giá trị lưu có thể là ISO đầy đủ hoặc đã là YMD → quy hết về YMD theo giờ VN.
 */
function currentDateYmd(current: Record<string, unknown>, target: string): string {
  const raw = current[target];
  if (raw == null || String(raw).trim() === "") return "";
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? "" : toVnYmd(d);
}

/**
 * Lập KẾ HOẠCH đồng bộ — thuần tuý so sánh, KHÔNG ghi gì.
 *
 * @param rows     dòng đọc từ sheet (tab tháng hiện tại)
 * @param dbItems  MO trên webapp ĐÃ lọc COMPLETED
 * @param knownMoIndex  MO gốc tồn tại trên webapp → MO đó trên webapp (kể cả khi chưa Hoàn
 *                      tất). Vừa để phân biệt "không có MO này" với "có nhưng chưa Hoàn tất",
 *                      vừa để lời nhắc việc dẫn được tới đúng MO. Trước đây là `Set<string>`
 *                      (biết tồn tại, không biết thuộc đơn nào), rồi `Map<base, orderId>`
 *                      (tới được đơn, không tới được MO).
 */
export function buildSyncPlan(
  rows: SheetRow[],
  dbItems: DbItem[],
  knownMoIndex: Map<string, KnownMo>,
): SyncPlan {
  const plan: SyncPlan = { updates: [], mismatches: [], notFound: [], notCompleted: [], badDate: [] };

  // Gom MO đã Hoàn tất theo MO GỐC. stripVersionSuffix hiểu cả 2 định dạng phiên bản
  // (".1" cũ và "_2" mới) và giữ nguyên hậu tố CHỮ (".3A" là sản phẩm khác, không phải version).
  const completedByBase = new Map<string, DbItem[]>();
  for (const it of dbItems) {
    const base = stripVersionSuffix(it.moNumber);
    const list = completedByBase.get(base) ?? [];
    list.push(it);
    completedByBase.set(base, list);
  }

  for (const row of rows) {
    const mo = String(row.mo ?? "").trim();
    if (!mo) continue;
    const base = stripVersionSuffix(mo);

    const targets = completedByBase.get(base);
    if (!targets || targets.length === 0) {
      // 🔴 "LẦN CHẠY SAU TỰ XÉT LẠI" LÀ MỘT GIẢ ĐỊNH ĐÃ TỪNG SAI. Nó chỉ đúng nếu lần chạy sau
      // vẫn đọc CÙNG những dòng đó — mà Apps Script đọc tab theo tháng, nên sang tháng mới thì
      // không bao giờ đọc lại. Nay có hai lớp chống: cửa sổ chồng lấn ở Apps Script, và lời
      // nhắc việc dựng từ chính danh sách này (business/orders/sync-notice.ts).
      const known = knownMoIndex.get(base);
      // Lấy `known.moNumber` chứ KHÔNG lấy `mo` của sheet: hai chuỗi thường bằng nhau, nhưng
      // chỉ chuỗi của webapp mới là thứ tầng hiển thị được phép coi là "từ webapp".
      if (known) plan.notCompleted.push({
        mo: known.moNumber, orderId: known.orderId, itemId: known.itemId,
        isFromWebapp: known.isFromWebapp,
      });
      else plan.notFound.push(mo);
      continue;
    }

    for (const t of targets) {
      for (const f of SYNC_FIELDS) {
        const rawIn = row[f.key];
        const incoming = rawIn == null ? "" : String(rawIn).trim();
        if (!incoming) continue; // sheet trống → KHÔNG ghi đè dữ liệu đang có bằng rỗng

        if (f.compare === "text") {
          const cur = currentText(t.current, f.target);
          if (cur === incoming) continue;
          plan.updates.push({
            itemId: t.itemId, orderId: t.orderId, moNumber: t.moNumber,
            target: f.target, label: f.label, from: cur, to: incoming,
          });
          continue;
        }

        // ── compare === "date" ──
        const sheetYmd = parseVnDate(incoming);
        if (!sheetYmd) { plan.badDate.push(`${mo}: "${incoming}"`); continue; }
        const curYmd = currentDateYmd(t.current, f.target);

        if (!curYmd) {
          // Webapp trống → tự điền theo sheet (chỉ khi field khai báo fillIfEmpty).
          if (!f.fillIfEmpty) continue;
          plan.updates.push({
            itemId: t.itemId, orderId: t.orderId, moNumber: t.moNumber,
            target: f.target, label: f.label, from: "", to: sheetYmd,
          });
          continue;
        }

        if (isSameVnDay(curYmd, sheetYmd)) continue; // khớp → không làm gì

        // Webapp đã có mà LỆCH → chỉ cảnh báo, TUYỆT ĐỐI không ghi đè số liệu người nhập.
        if (f.warnIfDifferent) {
          plan.mismatches.push({
            itemId: t.itemId, orderId: t.orderId, moNumber: t.moNumber,
            isFromWebapp: t.isFromWebapp,
            label: f.label, webapp: curYmd, sheet: sheetYmd,
          });
        }
      }
    }
  }

  return plan;
}

/** Gom kế hoạch theo đơn — mỗi đơn ghi 1 lần (extraData lưu theo orderId). */
export function groupByOrder(plan: SyncPlan): Map<string, { updates: PlannedUpdate[]; mismatches: DateMismatch[] }> {
  const map = new Map<string, { updates: PlannedUpdate[]; mismatches: DateMismatch[] }>();
  const slot = (orderId: string) => {
    const cur = map.get(orderId) ?? { updates: [], mismatches: [] };
    map.set(orderId, cur);
    return cur;
  };
  for (const u of plan.updates) slot(u.orderId).updates.push(u);
  for (const m of plan.mismatches) slot(m.orderId).mismatches.push(m);
  return map;
}
