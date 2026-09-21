// ─────────────────────────────────────────────────────────────────────────────
// NGUỒN DUY NHẤT cho mọi phép tính ngày theo múi giờ VIỆT NAM (Asia/Ho_Chi_Minh).
//
// VÌ SAO GOM VỀ ĐÂY: trước đây 3 helper cùng mục đích nằm rải 3 nơi, trong đó 2 nơi bị
// khoá trong client component nên server KHÔNG dùng lại được:
//     toLocalYMD  → app/lib/utils/order-helpers.ts   (private, không export)
//     vnDayNum    → orders-client.tsx                ("use client")
//     todayVnYmd  → date-input.tsx                   ("use client")
// Mỗi lần cần dùng ở chỗ mới lại phải chép thêm một bản — đúng lớp lỗi đã gây ra bug lệch
// 1 ngày (bộ lọc so timestamp thô) và bug công thức trùng lặp (fix-production-weights.ts).
//
// NGUYÊN TẮC: KHÔNG BAO GIỜ dùng getFullYear/getMonth/getDate (đọc theo giờ máy). Code
// chạy ở 3 môi trường khác múi giờ — SSR Vercel (UTC), máy user (thường +7 nhưng không
// đảm bảo), và Apps Script — nên mọi phép đọc ngày phải NEO CỨNG về VN.
//
// CHUẨN LƯU TRỮ: mọi cột ngày trong DB lưu ở "UTC-midnight của ngày lịch VN"
// (VD 15/07/2026 → 2026-07-15T00:00:00.000Z), đã chuẩn hoá toàn bộ dữ liệu cũ về dạng này.
// ─────────────────────────────────────────────────────────────────────────────

const VN_TZ = "Asia/Ho_Chi_Minh";
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

// ─── Giờ tường Việt Nam ───────────────────────────────────────────────────────
// Dùng cho các thuật toán cần ĐỌC/GHI giờ-phút theo giờ VN (VD khung giờ làm việc
// 08:00–17:00), không chỉ so sánh ngày.
//
// Cách làm: dịch mốc thời gian đi +7 giờ rồi đọc/ghi bằng các hàm getUTC*/setUTC*.
// Các hàm UTC không phụ thuộc múi giờ máy chủ, nên kết quả giống hệt nhau ở mọi nơi —
// máy dev (giờ VN), Vercel (UTC), hay trình duyệt của user ở múi giờ bất kỳ.
//
// Việt Nam KHÔNG có giờ mùa hè nên độ lệch +7 là hằng số, dùng offset cố định là chính xác
// tuyệt đối (khác với các múi giờ có DST — ở đó buộc phải dùng Intl).

/** Mốc thời gian thật → Date "giờ tường VN": đọc bằng getUTC* sẽ ra đúng giờ Việt Nam. */
export function toVnWall(d: Date): Date {
  return new Date(d.getTime() + VN_OFFSET_MS);
}

/** Date "giờ tường VN" → mốc thời gian thật. Nghịch đảo của toVnWall. */
export function fromVnWall(wall: Date): Date {
  return new Date(wall.getTime() - VN_OFFSET_MS);
}

/**
 * "YYYY-MM-DD" + "HH:mm" (giờ VN) → mốc thời gian thật. Trả null nếu không hợp lệ.
 *
 * ⚠️ GIỜ TRỐNG LÀ KHÔNG HỢP LỆ, KHÔNG PHẢI 08:00.
 *
 * Bản trước có `(hm || "08:00")` ngay trong hàm này. Nó vô hại khi mọi màn hình còn dùng một ô
 * `datetime-local` gộp — giá trị khi đó hoặc đủ hoặc rỗng hẳn. Nhưng từ khi tách thành cặp ô ngày
 * + giờ, xuất hiện một trạng thái MỚI: NGÀY đã điền mà GIỜ còn trống. Lúc đó hàm trả về một mốc
 * TRÔNG HOÀN TOÀN HỢP LỆ, nên mọi chốt chặn phía trên đều thấy "có giá trị rồi" và cho đi tiếp —
 * hệ thống ghi 08:00, một con số người dùng không hề gõ. Ở form khai báo tăng ca, hai mốc như vậy
 * quyết định thẳng số giờ tính lương.
 *
 * Chỗ DUY NHẤT thật sự muốn mặc định 08:00 là parseWallDateTime (calendar-adapter), và nó đã tự
 * viết `time || "08:00"` ở chỗ gọi — tường minh, đọc là thấy. Một mặc định giấu trong hàm dùng
 * chung thì mọi chỗ gọi đều được hưởng mà không ai biết.
 */
export function vnWallToInstant(ymd: string, hm: string): Date | null {
  const md = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  const mt = /^(\d{1,2}):(\d{2})$/.exec(String(hm ?? "").trim());
  if (!md || !mt) return null;

  const hour = Number(mt[1]);
  const minute = Number(mt[2]);
  if (hour > 23 || minute > 59) return null;

  const base = vnYmdToUtcMidnight(ymd);
  if (!base) return null;
  // base là UTC-midnight của ngày lịch VN → chính là "giờ tường VN 00:00" ở dạng wall.
  return fromVnWall(new Date(base.getTime() + (hour * 60 + minute) * 60_000));
}

/** Date → "HH:mm" theo giờ VN. */
export function toVnHm(d: Date): string {
  const w = toVnWall(d);
  return `${String(w.getUTCHours()).padStart(2, "0")}:${String(w.getUTCMinutes()).padStart(2, "0")}`;
}

/** Date → "YYYY-MM-DD" theo ngày lịch VN. (Trước đây: toLocalYMD) */
export function toVnYmd(d: Date): string {
  // en-CA cho ra đúng định dạng "YYYY-MM-DD"; timeZone neo cứng VN.
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: VN_TZ,
  }).format(d);
}

/** Hôm nay theo ngày lịch VN, dạng "YYYY-MM-DD". */
export function todayVnYmd(): string {
  return toVnYmd(new Date());
}

/**
 * Date|ISO string|null → "HH:mm DD/MM/YYYY" theo giờ VN — dùng cho các mốc CÓ GIỜ cần hiển thị
 * đầy đủ (Deadline KPI, thời điểm hoàn tất...), khác `toVnYmd` (chỉ ngày, cho input dạng ngày).
 *
 * Gom một chỗ vì Deadline KPI từng hiện Ở HAI MÀN theo hai kiểu khác nhau (màn NV 3D tự khai
 * Intl.DateTimeFormat riêng, sidebar Đơn hàng dùng field ngày-only nên mất giờ) — hai nơi tự
 * viết dễ lệch định dạng mà không ai nhận ra ngay.
 */
export function formatVnDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const w = toVnWall(date);
  const hh = String(w.getUTCHours()).padStart(2, "0");
  const mm = String(w.getUTCMinutes()).padStart(2, "0");
  const dd = String(w.getUTCDate()).padStart(2, "0");
  const mo = String(w.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = w.getUTCFullYear();
  return `${hh}:${mm} ${dd}/${mo}/${yyyy}`;
}

// ─── GIỜ LUÔN 24H — KHÔNG BAO GIỜ AM/PM ──────────────────────────────────────
//
// ⚠️ ĐÂY LÀ MỘT QUYẾT ĐỊNH VỀ AN TOÀN DỮ LIỆU, KHÔNG PHẢI VỀ THẨM MỸ.
//
// Nhầm AM/PM lệch ĐÚNG 12 TIẾNG, và nó lệch một cách IM LẶNG: "09:35" vẫn là một giờ hợp lệ ở cả
// hai nửa ngày nên không có gì để báo lỗi. Trên màn Tạm dừng, con số đó đi thẳng vào "Giờ đã làm"
// rồi vào KPI của nhân viên; trên khai báo tăng ca, nó đi vào tiền lương.
//
// Ba lý do nữa để không có ngoại lệ:
//   · Mọi chữ app tự vẽ đều là 24h (formatVnDateTime dùng hour12: false).
//   · Lịch làm việc lưu ca bằng SỐ PHÚT TỪ NỬA ĐÊM (startMinute/endMinute) — vốn dĩ là 24h.
//   · Giờ hành chính Việt Nam nói theo 24h.
//
// Ô `<input type="time">` hiện AM/PM hay không là do LOCALE MÁY quyết định, app không can thiệp
// được. Nên muốn chắc chắn 24h thì phải tự vẽ ô — xem TimeInput, dựng theo đúng khuôn DateInput
// mà dự án đã làm cho ngày (giữ picker gốc sau một cái icon, phần hiện ra thì mình kiểm soát).

/** Gõ số tới đâu chèn dấu hai chấm tới đó: "0935" → "09:35". Chỉ để HIỆN, chưa chắc hợp lệ. */
export function maskHmInput(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

/**
 * Chuỗi người dùng gõ → "HH:mm" chuẩn, hoặc null nếu không đọc được.
 *
 * Nhận cả dạng gõ tắt vì đó là cách người ta gõ thật: "17" → "17:00", "935" → "09:35".
 * KHÔNG nhận AM/PM: ô này 24h, và đoán hộ ý người dùng ở đây là đoán 12 tiếng.
 */
export function normalizeHm(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 0 || digits.length > 4) return null;

  // 1–2 chữ số là GIỜ TRÒN ("17" → 17:00); 3–4 chữ số thì hai số cuối là phút ("935" → 09:35).
  const padded = digits.length <= 2 ? `${digits.padStart(2, "0")}00` : digits.padStart(4, "0");
  const hh = Number(padded.slice(0, 2));
  const mm = Number(padded.slice(2));
  if (hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}


/**
 * Quy một mốc thời gian bất kỳ về SỐ NGÀY lịch VN dạng YYYYMMDD (VD 20260715).
 * Dùng để SO SÁNH theo NGÀY thay vì theo timestamp thô — cần thiết vì dữ liệu ngày cũ
 * trong DB từng tồn tại 2 kiểu ("…T00:00:00Z" và "…T17:00:00Z" của hôm trước).
 */
export function vnDayNum(d: string | Date | null | undefined): number | null {
  if (!d) return null;
  const ms = (typeof d === "string" ? new Date(d) : d).getTime();
  if (Number.isNaN(ms)) return null;
  const vn = new Date(ms + VN_OFFSET_MS); // dịch sang giờ VN rồi đọc theo UTC
  return vn.getUTCFullYear() * 10000 + (vn.getUTCMonth() + 1) * 100 + vn.getUTCDate();
}

/**
 * "YYYY-MM-DD" → Date ở UTC-midnight — ĐÚNG chuẩn lưu trữ của hệ thống.
 * Trả null nếu chuỗi không hợp lệ (không "đoán bừa" ngày sai).
 */
export function vnYmdToUtcMidnight(ymd: string | null | undefined): Date | null {
  if (!ymd) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  // Chặn ngày tràn (VD 31/02 bị JS tự dồn sang 03/03) — thà trả null còn hơn ghi sai ngày.
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

/**
 * Parse chuỗi ngày TỪ GOOGLE SHEET về "YYYY-MM-DD" (ngày lịch VN).
 * Chấp nhận các dạng người dùng/Sheet hay xuất ra:
 *     "15/07/2026"  "15-07-2026"  "15/7/26"        (dd/mm/yyyy — phổ biến nhất ở VN)
 *     "2026-07-15"                                  (ISO sẵn)
 *     "15-Jul-26"   "15-Jul-2026"                   (định dạng các script import cũ gặp)
 * Trả null nếu không nhận dạng được — KHÔNG suy đoán, để nơi gọi bỏ qua dòng đó.
 *
 * LƯU Ý: chỉ nhận dd/mm (kiểu VN), KHÔNG nhận mm/dd (kiểu Mỹ) — sheet nội bộ dùng dd/mm.
 */
const MONTHS_EN: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

export function parseVnDate(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  const pad = (n: number) => String(n).padStart(2, "0");
  const fullYear = (y: number) => (y < 100 ? 2000 + y : y);
  const build = (y: number, mo: number, d: number): string | null => {
    const ymd = `${fullYear(y)}-${pad(mo)}-${pad(d)}`;
    return vnYmdToUtcMidnight(ymd) ? ymd : null; // tái dùng chính validator ở trên
  };

  // ISO sẵn: 2026-07-15
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return build(Number(m[1]), Number(m[2]), Number(m[3]));

  // dd/mm/yyyy hoặc dd-mm-yyyy (yyyy có thể 2 chữ số)
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (m) return build(Number(m[3]), Number(m[2]), Number(m[1]));

  // 15-Jul-26 / 15-Jul-2026
  m = /^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{2,4})$/.exec(s);
  if (m) {
    const mo = MONTHS_EN[m[2].toUpperCase()];
    if (mo) return build(Number(m[3]), mo, Number(m[1]));
  }

  return null;
}

/** Hai mốc thời gian có CÙNG ngày lịch VN không? (null-safe) */
export function isSameVnDay(a: string | Date | null | undefined, b: string | Date | null | undefined): boolean {
  const da = vnDayNum(a), db = vnDayNum(b);
  return da !== null && db !== null && da === db;
}
