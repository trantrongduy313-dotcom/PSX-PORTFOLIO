import { parseVnDate, toVnYmd } from "@/app/lib/utils/vn-date";

// ═══════════════════════════════════════════════════════════════════════════
// ĐỐI CHIẾU "MÃ SỐ MẪU" VỚI MÃ NHÚNG TRONG "THÔNG TIN HT"
//
// 🔴 VÌ SAO CẦN, VÀ VÌ SAO NÓ LÀ MỘT BỘ DÒ CHỨ KHÔNG PHẢI MỘT PHÉP SỬA:
//
// Mã số mẫu tồn tại ở HAI chỗ, ghi bởi HAI người, vào HAI thời điểm:
//
//   · `OrderItem.masoMau` — R&D nhập TRONG lúc sản xuất, một ô riêng
//   · lẫn trong `Thông tin HT` — xưởng gõ KHI hoàn tất, giữa một câu văn tự do:
//         "18KBL: 18KY 59.85gr L10309 Size: 7in"
//                              ^^^^^^
//
// Doctrine của dự án: hai nơi lưu cùng một sự thật thì sớm muộn lệch. Ở đây không tránh được
// bản sao — Thông tin HT là văn bản người ta gõ tay theo thói quen nhiều năm — nên phải có BỘ
// DÒ làm nó lên tiếng.
//
// ⚠️ CHỈ ĐỌC. Module này KHÔNG BAO GIỜ đề xuất ghi đè bên nào. Cùng bất biến mà sheet-sync giữ
// cho Ngày HT: "tránh máy ghi đè số liệu người nhập". Máy chỉ được quyền CHỈ RA chỗ lệch.
//
// 📌 ĐƯỜNG NỐI ĐỂ TÁCH FILE VỀ SAU: hôm nay file này làm hai việc — (1) đọc mã ra khỏi một
// chuỗi, (2) chọn MO nào đáng soi rồi gom kết quả. Hai việc đó nhỏ và đổi cùng nhau nên chưa
// tách. Khi có phép đối chiếu THỨ HAI (VD `sku` với một nguồn khác), cắt đúng giữa (1) và (2).
// ═══════════════════════════════════════════════════════════════════════════

// ─── 1. Đọc mã ra khỏi văn bản tự do ─────────────────────────────────────────

/**
 * Khuôn của một mã số mẫu: MỘT chữ hoa + 5–6 chữ số.
 *
 * 🔴 CỐ Ý KHÔNG CHỐT DANH SÁCH TIỀN TỐ. Tiền tố quan sát được hôm nay là B C D E L O P, nhưng
 * người dùng đã nói rõ "sau này phát sinh sẽ gửi thêm". Một danh sách trắng tiền tố nghĩa là
 * mỗi mã mới sinh ra một lần sửa code — và trong khoảng chờ đó bộ dò IM LẶNG bỏ qua chúng.
 * Nhận mọi chữ A–Z thì tiền tố mới chạy được ngay, không tốn dòng nào.
 *
 * 6 chữ số là CÓ THẬT, không phải nới lỏng cho chắc: `P112701` được người dùng xác nhận đúng.
 *
 * Những thứ TRÔNG như mã nhưng bị loại đúng nhờ khuôn này (đã đối chiếu trên dữ liệu thật):
 *   · `18KY` `14KW` `24K` `18KR`      — bắt đầu bằng SỐ
 *   · `32LRD` `44LFancy` `10MQ(ONY)`  — bắt đầu bằng SỐ
 *   · `PT900` `PT`                    — hai chữ, và chỉ 3 chữ số
 *   · `0.118cts` `6.5in` `45cm` `5khoen` — không khớp
 */
export const SAMPLE_CODE_PATTERN = /\b[A-Z]\d{5,6}\b/g;

/**
 * Mọi mã số mẫu đọc được trong một đoạn Thông tin HT, đã khử trùng, giữ thứ tự xuất hiện.
 *
 * Một MO có thể có NHIỀU mã — hiếm, nhưng người dùng xác nhận là có. Nên trả mảng chứ không
 * trả một giá trị: ép về một cái là tự chọn hộ, và chọn sai thì thành một cảnh báo giả.
 */
export function extractSampleCodes(text: string | null | undefined): string[] {
  const s = String(text ?? "");
  if (!s.trim()) return [];
  // `matchAll` thay vì `.exec` lặp: regex có cờ `g` mang trạng thái `lastIndex`, dùng lại giữa
  // hai lời gọi là bỏ sót kết quả một cách ngẫu nhiên — một lỗi im lặng kinh điển.
  return [...new Set([...s.matchAll(SAMPLE_CODE_PATTERN)].map((m) => m[0]))];
}

// ─── 2. So một MO ────────────────────────────────────────────────────────────

/**
 * Kết quả đối chiếu MỘT MO.
 *
 * ⚠️ `NO_CODE_FOUND` TÁCH KHỎI `MISMATCH` DÙ CẢ HAI ĐỀU LÀ CẢNH BÁO. Người dùng chốt luật
 * "cả hai trường có dữ liệu mà không khớp thì cảnh báo", và cả hai nhánh này đều thoả — nhưng
 * chúng dẫn tới HAI hành động khác nhau:
 *
 *   MISMATCH      → người nhập sai, đi sửa dữ liệu
 *   NO_CODE_FOUND → nhiều khả năng BỘ TÁCH chưa biết một khuôn mới, đi sửa code
 *
 * Gộp làm một là biến lỗi của bộ tách thành lỗi của người nhập — và họ sẽ đi sửa dữ liệu vốn
 * đang đúng. Đây cũng là chỗ tiền tố lạ TỰ LỘ RA, không cần ai nhớ báo.
 */
export type MaSoMauVerdict =
  /** Thiếu một trong hai trường → bỏ qua hoàn toàn: không quét, không cảnh báo. */
  | "SKIPPED"
  | "MATCH"
  | "MISMATCH"
  | "NO_CODE_FOUND";

export type MaSoMauComparison = {
  verdict: MaSoMauVerdict;
  /** Mã đọc được từ Thông tin HT. Rỗng khi SKIPPED hoặc NO_CODE_FOUND. */
  codes: string[];
};

/**
 * So `masoMau` với các mã nhúng trong Thông tin HT.
 *
 * Khớp = `masoMau` NẰM TRONG tập mã đọc được (không phải "bằng mã đầu tiên"): một MO nhiều mã
 * thì mã của R&D chỉ cần là một trong số đó.
 *
 * So không phân biệt hoa thường và bỏ khoảng trắng hai đầu — dữ liệu thật có cả `"E10900 "`.
 */
export function compareMaSoMau(
  masoMau: string | null | undefined,
  thongTinHt: string | null | undefined,
): MaSoMauComparison {
  const code = String(masoMau ?? "").trim();
  const ht = String(thongTinHt ?? "").trim();
  if (!code || !ht) return { verdict: "SKIPPED", codes: [] };

  const codes = extractSampleCodes(ht);
  if (codes.length === 0) return { verdict: "NO_CODE_FOUND", codes: [] };

  const hit = codes.some((c) => c.toUpperCase() === code.toUpperCase());
  return { verdict: hit ? "MATCH" : "MISMATCH", codes };
}

// ─── 3. Chọn MO nào đáng soi, rồi gom kết quả ────────────────────────────────

/** Một MO đã nạp sẵn. KHÔNG phải kiểu Prisma — module này thuần, chỗ gọi tự ánh xạ vào đây. */
export type ScanItem = {
  moNumber: string;
  itemStatus: string | null;
  /**
   * Ngày HT THÔ, chưa chuẩn hoá.
   *
   * ⚠️ Ô này có HAI ĐỊNH DẠNG trong dữ liệu thật, vì nó có hai nguồn (xem /api/orders):
   *   · `"2026-08-15"`                — user nhập tay, hoặc sheet-sync ghi
   *   · `"2026-08-15T00:00:00.000Z"`  — dự phòng từ cột `OrderItem.completedAt`
   * Cùng một ô trên màn hình, hai định dạng bên dưới. `toCompletedYmd` quy về một.
   */
  completedDateRaw: string | null;
  masoMau: string | null;
  thongTinHt: string | null;
};

export type MaSoMauWarning = {
  moNumber: string;
  masoMau: string;
  /** Mã đọc được từ Thông tin HT — rỗng nghĩa là không đọc được mã nào. */
  codes: string[];
  reason: Extract<MaSoMauVerdict, "MISMATCH" | "NO_CODE_FOUND">;
  /** Thông tin HT nguyên văn, CẮT NGẮN — để người đọc log tự nhìn thấy vì sao. */
  thongTinHt: string;
};

export type MaSoMauScanReport = {
  /** Tháng đã quét, dạng "YYYY-MM". */
  month: string;
  /** Số MO thoả ĐỦ điều kiện và đã được so (không tính MO bỏ qua). */
  scanned: number;
  matched: number;
  warnings: MaSoMauWarning[];
};

/** Bao nhiêu ký tự Thông tin HT giữ lại trong cảnh báo. Đủ để nhìn ra vấn đề, không tràn log. */
const HT_EXCERPT_LIMIT = 160;

/**
 * Ngày HT thô → `"YYYY-MM-DD"` theo giờ Việt Nam, hoặc `null` nếu không đọc được.
 *
 * `parseVnDate` hiểu `"2026-08-15"`, `"15/08/2026"`, `"15-Aug-26"` — nhưng KHÔNG hiểu ISO có
 * kèm giờ, vì regex của nó neo `^…$` vào đúng phần ngày. Nên phải có nhánh thứ hai.
 * `sheet-sync` gặp đúng ca này và giải bằng `new Date(...)` + `toVnYmd`; dùng lại nguyên cách đó.
 */
export function toCompletedYmd(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const direct = parseVnDate(s);
  if (direct) return direct;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : toVnYmd(d);
}

/**
 * MO này có đáng soi trong tháng `month` không.
 *
 * BỐN điều kiện, người dùng chốt từng cái:
 *   1. đang ở tab Hoàn Tất (`itemStatus === "COMPLETED"`)
 *   2. CÓ Ngày HT — không có thì bỏ qua, không đếm, không cảnh báo
 *   3. Ngày HT thuộc đúng tháng đang quét
 *   4. CẢ HAI trường có dữ liệu — thiếu một là bỏ qua (điều kiện 4 do `compareMaSoMau` lo)
 *
 * ⚠️ Điều kiện 2 có một hệ quả người dùng đã biết và chấp nhận: MO hoàn tất mà KHÔNG có Ngày HT
 * (hệ thống cố ý không tự đóng dấu ngày) sẽ không bao giờ được soi. Đó là một QUYẾT ĐỊNH.
 */
export function isInScanScope(item: ScanItem, month: string): boolean {
  if (item.itemStatus !== "COMPLETED") return false;
  const ymd = toCompletedYmd(item.completedDateRaw);
  if (!ymd) return false;
  return ymd.slice(0, 7) === month;
}

/**
 * Quét một tháng — HÀM THUẦN, nhận MO đã nạp sẵn.
 *
 * Cùng khuôn với `buildSyncPlan`: không đụng DB, không I/O, nên test được mà không cần Prisma.
 * Route chỉ làm phần nó phải làm — xác thực, nạp, gọi hàm này, in kết quả.
 */
export function buildMaSoMauScan(items: readonly ScanItem[], month: string): MaSoMauScanReport {
  const report: MaSoMauScanReport = { month, scanned: 0, matched: 0, warnings: [] };

  for (const it of items) {
    if (!isInScanScope(it, month)) continue;

    const { verdict, codes } = compareMaSoMau(it.masoMau, it.thongTinHt);
    if (verdict === "SKIPPED") continue; // thiếu một trong hai → im lặng, đúng yêu cầu

    report.scanned += 1;
    if (verdict === "MATCH") {
      report.matched += 1;
      continue;
    }

    report.warnings.push({
      moNumber: it.moNumber,
      masoMau: String(it.masoMau ?? "").trim(),
      codes,
      reason: verdict,
      thongTinHt: String(it.thongTinHt ?? "").trim().slice(0, HT_EXCERPT_LIMIT),
    });
  }

  return report;
}

/** Tháng hiện tại theo giờ Việt Nam, dạng "YYYY-MM". */
export function currentVnMonth(now: Date): string {
  return toVnYmd(now).slice(0, 7);
}

/** `"2026-08"` — chốt định dạng ở một chỗ để route và test không tự đoán mỗi nơi một kiểu. */
export function isValidMonth(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}
