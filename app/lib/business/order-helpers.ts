/**
 * order-helpers.ts
 * Logic nghiệp vụ đơn hàng — port từ V2 Apps Script.
 *
 * V2 refs:
 *   - 01_IdGenerator.js  → generateSoId(), generateMoId()
 *   - 02_MasterHub.js    → _generateSoIdFromHub(), createOrderRows(), _calcWeekLabel()
 *   - 07_Portal_Backend.js → getPortalDropdowns() (priority labels)
 */

import type { Prisma } from "@/app/generated/prisma/client";

// ─── Priority ─────────────────────────────────────────────────────────────────

/**
 * Mã ưu tiên — khớp với dropdown V2 ("UT1 — 7 ngày", "UT2 — 14 ngày"…).
 * Lưu trong cột CAP_DO_UU_TIEN của MASTER_HUB.
 */
export type PriorityCode = "UT1" | "UT2" | "Normal" | "SR";

/**
 * Số ngày dương lịch (+N ngày từ ngày tạo đơn) theo từng mức ưu tiên.
 * V2 ref: createOrderRows() → chỉ SR tự tính; V3 tự tính cả 4 mức.
 *
 * UT1 (Cực gấp)  = +7 ngày
 * UT2 (Gấp)      = +14 ngày
 * Normal          = +21 ngày
 * SR  (Đặc biệt) = +30 ngày  ← V2 tính từ ngayChot; V3 tính từ orderDate
 */
export const PRIORITY_SLA_DAYS: Record<PriorityCode, number> = {
  UT1:    7,
  UT2:    14,
  Normal: 21,
  SR:     30,
};

/** Label hiển thị trên UI, khớp với dropdown V2 */
export const PRIORITY_LABEL: Record<PriorityCode, string> = {
  UT1:    "UT1 — Cực gấp",
  UT2:    "UT2 — Gấp",
  Normal: "Normal",
  SR:     "SR — 30 ngày",
};

/**
 * Map PriorityCode → { isPriority, isRush } để tương thích backward với schema V3.
 * UT1: isRush=true (nặng nhất)
 * UT2: isPriority=true
 * Normal/SR: cả hai false (SR khác Normal ở SLA, không phải tính gấp)
 */
export function priorityToFlags(code: PriorityCode): { isPriority: boolean; isRush: boolean } {
  return {
    isPriority: code === "UT1" || code === "UT2",
    isRush:     code === "UT1",
  };
}

/**
 * Tính ngày dự kiến hoàn tất (NGAY_DK_HT) dựa trên mức ưu tiên.
 * Dùng ngày dương lịch — khớp với V2 (không skip Chủ nhật).
 * V2 ref: createOrderRows() → `new Date(ngayChotSx.getTime() + days * 86400000)`
 *
 * @param priorityCode  Mã ưu tiên
 * @param fromDate      Ngày tính từ (thường là orderDate = now())
 */
export function calcRequiredDate(priorityCode: PriorityCode, fromDate: Date): Date {
  const days = PRIORITY_SLA_DAYS[priorityCode];
  // Cộng thẳng bằng mili-giây (đúng theo V2 ref), KHÔNG dùng setDate()/getDate() (đọc/ghi
  // theo giờ LOCAL của máy chạy code — server Vercel chạy UTC trong khi ngày lưu là mốc
  // UTC-midnight của ngày dương lịch, dùng getDate() có thể đọc lệch sang ngày liền kề tùy
  // giờ chạy, gây lệch ±1 ngày). Cộng mili-giây thuần túy không phụ thuộc timezone.
  return new Date(fromDate.getTime() + days * 86_400_000);
}

/**
 * Hậu tố phiên bản MO#/SO# — dữ liệu CŨ dùng dấu "." (VD "26.423343.2"), dữ liệu MỚI
 * (từ nay) chỉ ghi dấu "_" (VD "26.423343_3"). Đọc phải nhận diện được CẢ HAI (dữ liệu cũ
 * không đổi, nằm lẫn với dữ liệu mới); ghi phiên bản mới CHỈ dùng "_".
 * Đây là thay đổi HIỂN THỊ — thuật toán tính "phiên bản lớn nhất + 1" giữ nguyên 100%.
 */
export const NEW_VERSION_SEPARATOR = "_";

/**
 * Tách "base" + "số phiên bản" khỏi 1 chuỗi MO#/SO#, nhận diện cả 2 định dạng cũ (".")
 * và mới ("_"). Trả về null nếu không có hậu tố phiên bản hợp lệ.
 *
 * "26.423343.2"  → { base: "26.423343", version: 2, sep: "." }   (dữ liệu cũ)
 * "26.423343_3"  → { base: "26.423343", version: 3, sep: "_" }   (dữ liệu mới)
 * "26.12345"     → null   (Odoo 2-phần, KHÔNG phải phiên bản — guard base phải chứa ".")
 */
export function parseVersionSuffix(s: string): { base: string; version: number; sep: "." | "_" } | null {
  const underscoreIdx = s.lastIndexOf("_");
  if (underscoreIdx > 0) {
    const base = s.slice(0, underscoreIdx);
    const tail = s.slice(underscoreIdx + 1);
    const n = parseInt(tail, 10);
    if (!isNaN(n) && String(n) === tail && base.includes(".")) {
      return { base, version: n, sep: "_" };
    }
  }
  // Dữ liệu cũ: ≥3 phần khi tách theo "." (guard chống false-positive với số Odoo 2-phần
  // như "26.12345", nếu không sẽ bị hiểu nhầm base="26", phiên bản=12345).
  const dotParts = s.split(".");
  if (dotParts.length >= 3) {
    const tail = dotParts[dotParts.length - 1];
    const n = parseInt(tail, 10);
    if (!isNaN(n) && String(n) === tail) {
      return { base: dotParts.slice(0, -1).join("."), version: n, sep: "." };
    }
  }
  return null;
}

/**
 * Strips the version suffix from an MO# or SO# — nhận diện cả "." (cũ) và "_" (mới).
 * "26.423343.2" → "26.423343"  |  "26.423343_2" → "26.423343"  |  "26.12345" → "26.12345"
 */
export function stripVersionSuffix(s: string): string {
  return parseVersionSuffix(s)?.base ?? s;
}

/** Số phiên bản hiện tại của 1 MO#/SO# (0 nếu không có hậu tố) — dùng để tính "lớn nhất + 1". */
export function versionOf(s: string): number {
  return parseVersionSuffix(s)?.version ?? 0;
}

// Gộp item theo họ MO khi tạo phiên bản đơn. Test: __tests__/dedupe-mo-family.test.ts
// Lỗi đã xảy ra thật + số liệu chọn dòng nào giữ:
//   docs/04_ENGINEERING_GUIDELINES.md § Gộp item theo họ MO

/** Tập trường tối thiểu cần để gộp — cố ý không nhận nguyên OrderItem để test được độc lập. */
export type MoFamilyItem = {
  moNumber: string | null;
  lineNumber: number;
  specifications?: unknown;
  techClassification?: unknown;
  [key: string]: unknown;
};

/** Các trường scalar được coi là "có thông tin đơn hàng" khi so độ đầy đủ giữa hai dòng. */
const RICHNESS_SCALARS = [
  "nvl", "size", "weightGram", "color", "engraving", "unitPrice",
  "productName", "designImageUrl", "designFileUrl", "techNote", "mainStoneType",
] as const;

const isFilled = (v: unknown): boolean =>
  v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);

/** Đếm lượng thông tin thật của một dòng — dùng để chọn dòng đại diện cho họ MO. */
export function moItemRichness(item: MoFamilyItem): number {
  const spec = item.specifications && typeof item.specifications === "object"
    ? Object.values(item.specifications as Record<string, unknown>).filter(isFilled).length
    : 0;
  const tech = Array.isArray(item.techClassification) ? item.techClassification.length : 0;
  const scalars = RICHNESS_SCALARS.filter((k) => isFilled(item[k])).length;
  return spec + tech + scalars;
}

/**
 * Mỗi họ MO chỉ giữ MỘT dòng đại diện — dòng nhiều dữ liệu nhất.
 *
 * Thứ tự ưu tiên khi chọn: (1) nhiều dữ liệu hơn, (2) phiên bản THẤP hơn — dòng gốc thường là
 * dòng chính, (3) lineNumber nhỏ hơn — để kết quả tất định, chạy bao nhiêu lần cũng như nhau.
 *
 * Dòng không có moNumber được GIỮ NGUYÊN hết: không có mã thì không thuộc họ nào, gộp chúng
 * lại sẽ làm mất sản phẩm thật.
 */
export function dedupeItemsByMoFamily<T extends MoFamilyItem>(items: T[]): T[] {
  const best = new Map<string, T>();
  const noMo: T[] = [];

  for (const item of items) {
    if (!item.moNumber) { noMo.push(item); continue; }
    const base = stripVersionSuffix(item.moNumber);
    const cur = best.get(base);
    if (!cur) { best.set(base, item); continue; }

    const dRich = moItemRichness(item) - moItemRichness(cur);
    if (dRich > 0) { best.set(base, item); continue; }
    if (dRich < 0) continue;

    const dVer = versionOf(item.moNumber) - versionOf(cur.moNumber!);
    if (dVer < 0) { best.set(base, item); continue; }
    if (dVer > 0) continue;

    if (item.lineNumber < cur.lineNumber) best.set(base, item);
  }

  // Trả về theo đúng thứ tự lineNumber ban đầu để đơn phiên bản không bị xáo dòng.
  return [...best.values(), ...noMo].sort((a, b) => a.lineNumber - b.lineNumber);
}

/**
 * Định dạng HIỂN THỊ (màn hình/PDF) — hậu tố phiên bản dạng cũ "." được hiện lại bằng "_"
 * cho đồng nhất giao diện. KHÔNG đổi giá trị gốc trong DB, chỉ dùng lúc render.
 * "26.423343.2" → "26.423343_2" (hiển thị)  |  "26.423343_2" → giữ nguyên  |  không có
 * hậu tố phiên bản → giữ nguyên.
 *
 * KHÔNG CẦN CỜ `isFromWebapp` — và đó chính là lý do hàm này dùng được ở MỌI nơi:
 * nó chỉ ĐỔI DẤU của hậu tố đã có sẵn trong chuỗi, không bịa thêm hậu tố nào. Chỉ riêng
 * luật "phiên bản 1 ngầm định" (thêm "_1" vào MO chưa có hậu tố) mới cần biết MO đến từ
 * webapp hay từ Google Sheet — luật đó nằm ở formatMoVersionedDisplay().
 *
 * → Màn hình nào có sẵn cờ thì dùng formatMoVersionedDisplay (đầy đủ hơn); màn hình nào
 *   API không chở cờ thì dùng hàm này. Cả hai LUÔN đồng ý với nhau về dấu phân cách, vì
 *   cùng gọi getMoVersionDisplay bên dưới.
 */
export function formatVersionedDisplay(s: string | null | undefined): string {
  if (!s) return "";
  // Uỷ quyền thay vì chép lại luật tách hậu tố. Trước đây hai hàm tự cài luật riêng —
  // hai nơi đọc cùng một sự thật, sớm muộn lệch. `false` = bỏ qua luật "_1 ngầm định",
  // đúng phần chung của cả hai hàm.
  const { base, verSuffix } = getMoVersionDisplay(s, false);
  return verSuffix ? `${base}${verSuffix}` : base;
}

/**
 * Regex nhận diện MO#/SO# dạng số thuần "YY.NNNNN[...]" — dùng để guard rule "phiên bản 1
 * ngầm định" bên dưới, tránh áp nhầm lên các mã KHÁC dùng chung hàm hiển thị nhưng không
 * phải MO# thật (VD ProductionDetail.productionCode dạng "MO-2605-0001").
 */
const NUMERIC_MO_PATTERN = /^\d+(\.\d+)+$/;

/**
 * MO này có do WEBAPP tạo ra không — cờ nuôi rule 3 của `getMoVersionDisplay`.
 *
 * Hai nguồn, HOẶC: `specifications.createdViaWebapp` (MO thêm qua route items/[id]) hoặc
 * `Order.createdById != null` (script import không set). Test ở mo-version-separator.
 */
export function isMoFromWebapp(input: {
  specifications: unknown;
  orderCreatedById: string | null | undefined;
}): boolean {
  const specs = (input.specifications ?? {}) as Record<string, unknown>;
  return specs.createdViaWebapp === true || input.orderCreatedById != null;
}

/**
 * Tách base + suffix hiển thị của một MO#, cho nơi cần tô màu riêng phần suffix.
 *
 * Ba nguồn suffix: phiên bản thật, "sản phẩm thứ N trong SO", và "_1" NGẦM ĐỊNH cho MO do webapp
 * tạo mà chưa từng nâng phiên bản. MO import từ Google Sheet giữ nguyên dạng bare — nhầm hai thứ
 * này là hiển thị một phiên bản không tồn tại.
 *
 * Chỉ đổi HIỂN THỊ, không đổi cách đếm phiên bản thật (`versionOf`/`parseVersionSuffix`).
 */
export function getMoVersionDisplay(mo: string, isFromWebapp: boolean): { base: string; verSuffix: string | null } {
  const parsed = parseVersionSuffix(mo);
  if (parsed) return { base: parsed.base, verSuffix: `${NEW_VERSION_SEPARATOR}${parsed.version}` };

  const productIndexMatch = mo.match(/^(.+\.\d+)-(\d+)$/);
  if (productIndexMatch) return { base: productIndexMatch[1], verSuffix: `${NEW_VERSION_SEPARATOR}${productIndexMatch[2]}` };

  if (isFromWebapp && NUMERIC_MO_PATTERN.test(mo)) return { base: mo, verSuffix: `${NEW_VERSION_SEPARATOR}1` };

  return { base: mo, verSuffix: null };
}

/**
 * formatVersionedDisplay() dành riêng cho MO# — thêm rule "phiên bản 1 ngầm định" (xem
 * getMoVersionDisplay), chỉ áp dụng khi `isFromWebapp = true`. CHỈ dùng cho hiển thị MO#,
 * KHÔNG dùng cho SO#/orderNumber (SO# tiếp tục dùng formatVersionedDisplay() như cũ).
 */
export function formatMoVersionedDisplay(s: string | null | undefined, isFromWebapp: boolean): string {
  if (!s) return "";
  const { base, verSuffix } = getMoVersionDisplay(s, isFromWebapp);
  return verSuffix ? `${base}${verSuffix}` : base;
}

/**
 * Sinh các biến thể dấu phân cách phiên bản của 1 chuỗi tìm kiếm — dùng để so khớp
 * moNumber bất kể user gõ "." hay "_", và bất kể DB đang lưu MO đó ở dạng nào (dữ liệu
 * CŨ lưu ".", dữ liệu MỚI lưu "_" — xem parseVersionSuffix/NEW_VERSION_SEPARATOR).
 * CHỈ đổi dấu phân cách CUỐI CÙNG (hậu tố phiên bản) — đổi TẤT CẢ sẽ phá luôn dấu "."
 * gốc giữa năm/số thứ tự (VD "26.09341.2" → "26_09341_2" nếu đổi hết, sai hoàn toàn).
 * Dùng chung cho cả server (order-search.ts) và client (orders-client.tsx) để 2 nơi
 * không lệch logic với nhau.
 *
 * "26.37283_1" → ["26.37283_1", "26.37283.1", "26.37283"]  (thêm bare — "_1" có thể là
 *                 "phiên bản 1 ngầm định" của MO chưa từng tạo phiên bản, xem
 *                 getMoVersionDisplay/formatMoVersionedDisplay — DB lưu bare, không suffix)
 * "26.37283.1" → ["26.37283.1", "26.37283_1"]
 * "26.37283"   → ["26.37283"]               (không có hậu tố phiên bản → không sinh biến thể)
 */
export function moSearchVariants(s: string): string[] {
  const variants = new Set<string>([s]);
  const lastUnderscoreIdx = s.lastIndexOf("_");
  if (lastUnderscoreIdx > 0) {
    const base = s.slice(0, lastUnderscoreIdx);
    const tail = s.slice(lastUnderscoreIdx + 1);
    variants.add(base + "." + tail);
    // "_1" hiển thị có thể là "phiên bản 1 ngầm định" (MO chưa từng tạo phiên bản thật,
    // DB lưu bare không suffix) — thêm bare base để tìm ra cả trường hợp này.
    if (tail === "1") variants.add(base);
  }
  const lastDotIdx = s.lastIndexOf(".");
  if (lastDotIdx > 0) {
    variants.add(s.slice(0, lastDotIdx) + "_" + s.slice(lastDotIdx + 1));
  }
  return Array.from(variants);
}

/**
 * Tính nhãn "Tuần N" từ một Date — port từ _calcWeekLabel() trong V2.
 * Hiển thị ở cột TUAN_DU_KIEN.
 */
export function calcWeekLabel(date: Date): string {
  const firstDay  = new Date(date.getFullYear(), 0, 1);
  const pastDays  = (date.getTime() - firstDay.getTime()) / 86_400_000;
  const week      = Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
  return `Tuần ${week}`;
}

// ─── SO# Generator ────────────────────────────────────────────────────────────

/**
 * Sinh SO# trong một DB transaction (an toàn với concurrent requests).
 *
 * Format : YY.XXXXX
 * Ví dụ  : 26.00001  (năm 2026, đơn thứ 1)
 *
 * Counter reset theo năm (YY).
 * Race-condition safety: SELECT xảy ra bên trong cùng transaction với INSERT
 * nên Postgres serialization đảm bảo không duplicate.
 *
 * V2 ref: _generateSoIdFromHub() — Format V2: "26.00001" (YY.XXXXX, counter theo năm)
 */
export async function generateSoNumber(tx: Prisma.TransactionClient): Promise<string> {
  const now    = new Date();
  const yy     = now.getFullYear().toString().slice(-2); // "26"
  const prefix = `${yy}.`;                               // "26."

  // Lấy SO# lớn nhất trong năm → tăng thêm 1
  const last = await tx.order.findFirst({
    where:   { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: "desc" },
    select:  { orderNumber: true },
  });

  let seq = 1;
  if (last) {
    const tail = last.orderNumber.slice(prefix.length); // "00001"
    const n    = parseInt(tail, 10);
    if (!isNaN(n)) seq = n + 1;
  }

  // V2 ref: 5 chữ số (00001..99999)
  return `${prefix}${seq.toString().padStart(5, "0")}`;
}

// ─── MO# Generator ────────────────────────────────────────────────────────────

/**
 * Sinh MO# trong một DB transaction.
 * Chỉ được gọi khi đơn được Promote sang MASTER_HUB.
 *
 * Format : MO-YYMM-XXXX
 * Ví dụ  : MO-2605-0001
 *
 * Counter reset theo tháng (YYMM). Counter độc lập với SO#.
 *
 * V2 ref: generateMoId() trong 01_IdGenerator.js
 *         V2 dùng SO# làm MO# khi chỉ có 1 item (MO# = SO#).
 *         V3 tách riêng để rõ ràng hơn.
 */
export async function generateMoNumber(tx: Prisma.TransactionClient): Promise<string> {
  const now    = new Date();
  const yy     = now.getFullYear().toString().slice(-2);
  const mm     = (now.getMonth() + 1).toString().padStart(2, "0");
  const prefix = `MO-${yy}${mm}-`;

  const last = await tx.productionDetail.findFirst({
    where:   { productionCode: { startsWith: prefix } },
    orderBy: { productionCode: "desc" },
    select:  { productionCode: true },
  });

  let seq = 1;
  if (last?.productionCode) {
    const tail = last.productionCode.slice(prefix.length);
    const n    = parseInt(tail, 10);
    if (!isNaN(n)) seq = n + 1;
  }

  return `${prefix}${seq.toString().padStart(4, "0")}`;
}
