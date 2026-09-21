import { toVnYmd } from "@/app/lib/utils/vn-date";

// ═══════════════════════════════════════════════════════════════════════════
// TÀI LIỆU NÀY CÒN ĐÁNG TIN KHÔNG?
//
// 🔴 VÌ SAO FILE NÀY TỒN TẠI — và nó KHÔNG phải "thêm một cảnh báo":
//
// Trang Hướng dẫn ĐÃ CÓ một câu cảnh báo độ cũ, nhưng nó LUÔN LUÔN HIỆN:
//
//     "Chương này rà lần cuối 2026-08. Hệ thống cập nhật liên tục nên một số chi tiết CÓ THỂ
//      đã thay đổi — xem Có gì mới."
//
// Câu đó hiện y hệt trên chương vừa rà hôm qua và chương bỏ quên tám tháng. Một cảnh báo bật
// vĩnh viễn thì không phải cảnh báo — người đọc học cách bỏ qua nó sau ba lần.
//
// Bằng chứng nó đã vô dụng: `content.tsx` dạy sai định dạng số MO suốt 717 commit MÀ CÂU CẢNH
// BÁO NÀY VẪN ĐANG HIỆN trên chính chương đó.
//
// 🎯 Nên việc ở đây là ĐỔI MỘT CÂU VÔ ĐIỀU KIỆN THÀNH MỘT CON SỐ ĐO ĐƯỢC, và IM LẶNG khi không
// có gì để nói. Có im lặng thì lúc lên tiếng mới có nghĩa.
//
// ⚠️ NÓ KHÔNG LÀM TÀI LIỆU ĐÚNG LÊN. Nó chỉ làm chỗ sai LÊN TIẾNG, và cho một danh sách việc có
// thứ tự: chương nào cũ nhất, đứng sau nhiều thay đổi nhất → rà trước.
//
// Dùng cho CẢ HAI bộ nội dung — chương Hướng dẫn (ChapterDef.lastReviewed) và mục kiến thức của
// trợ lý (KnowledgeTopic.lastReviewed). Hai bộ đó cố ý dùng cùng một định dạng `YYYY-MM`.
//
// File THUẦN: không prisma, không React.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bao nhiêu thay đổi kể từ lần rà thì coi là ĐÁNG NGỜ.
 *
 * ⚠️ ĐÂY LÀ MỘT CON SỐ ĐOÁN, không phải số đo — cùng loại với KPI_USAGE_REVIEW_THRESHOLD. Nó
 * chưa dựa trên dữ liệu nào cả, và tôi ghi ra để người sau không tưởng nó có căn cứ.
 *
 * Đặt quá LỎNG thì mọi chương đều kêu và không ai nghe — tức quay về đúng câu cảnh báo vô điều
 * kiện mà file này sinh ra để thay thế. Quá CHẶT thì im lặng như hiện tại.
 *
 * Sau vài tháng có dữ liệu thật (bao nhiêu mục changelog mỗi tháng) thì chỉnh lại.
 */
export const STALE_CHANGE_COUNT = 8;

export type DocStalenessLevel = "FRESH" | "AGING" | "STALE";

export type DocStaleness = {
  /** Mốc rà của chính tài liệu đó, `YYYY-MM`. */
  lastReviewed: string;
  /** Số mục changelog đã đăng SAU tháng rà. */
  changesSince: number;
  level: DocStalenessLevel;
};

const MONTH_RE = /^20\d{2}-(0[1-9]|1[0-2])$/;

/**
 * Tháng (theo giờ Việt Nam) mà một mốc thời gian rơi vào — dạng `YYYY-MM`.
 *
 * ⚠️ PHẢI QUY VỀ GIỜ VIỆT NAM TRƯỚC KHI CẮT. Một mục đăng lúc 23:30 ngày 31/08 giờ VN là
 * 16:30 UTC cùng ngày — nhưng đăng lúc 00:30 ngày 01/09 giờ VN thì UTC vẫn còn là 31/08. Cắt
 * thẳng trên ISO string sẽ xếp nó nhầm sang tháng 8 và mục đó biến mất khỏi phép đếm.
 *
 * Dự án đã trả giá một lần cho đúng loại lỗi này: `getHours()` chạy đúng ở máy, lên Vercel lệch
 * 7 tiếng.
 */
function vnMonthOf(value: Date | string): string | null {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return toVnYmd(d).slice(0, 7);
}

/**
 * Đo độ cũ của một tài liệu.
 *
 * ⚠️ RANH GIỚI THÁNG: `lastReviewed = "2026-08"` nghĩa là đã rà HẾT tháng 8, nên chỉ đếm các mục
 * đăng từ tháng 9 trở đi. So sánh CHUỖI `YYYY-MM` là đủ và đúng — định dạng đó xếp thứ tự từ
 * điển trùng với thứ tự thời gian, nên không cần một phép tính ngày nào.
 *
 * `lastReviewed` sai định dạng → coi như KHÔNG BIẾT (`FRESH`, 0 thay đổi) thay vì ném lỗi: một
 * chương có mốc gõ sai không được phép làm trắng cả trang Hướng dẫn. Định dạng đã được kiểm ở
 * nơi khác — `topic.ts` từ chối mục sai ngay lúc build, còn `ChapterDef` thì do người viết giữ.
 */
export function docStaleness(
  lastReviewed: string,
  publishedAt: readonly (Date | string)[],
  /** Chỉ dùng để chặn mốc rà ở TƯƠNG LAI — xem chú thích dưới. */
  now: Date,
): DocStaleness {
  if (!MONTH_RE.test(lastReviewed)) {
    return { lastReviewed, changesSince: 0, level: "FRESH" };
  }

  // ─── MỐC RÀ Ở TƯƠNG LAI = ĐẾM TẤT CẢ ────────────────────────────────────────
  //
  // Gõ nhầm năm ("2027-06") làm MỌI mục changelog rơi vào "trước lần rà", và tài liệu trông như
  // vừa được rà xong — im lặng tuyệt đối vì một lỗi gõ. Đó đúng là thứ file này sinh ra để chặn.
  //
  // Kẹp về tháng hiện tại KHÔNG cứu được: mọi mục đã đăng đều nằm trước tháng này, nên kết quả
  // vẫn là 0. (Tôi đã viết bản đó trước, và test bắt được.)
  //
  // Một mốc rà ở tương lai là chuyện KHÔNG THỂ xảy ra, nên ta không tin nó được. Phản ứng ồn ào
  // nhất mà vẫn an toàn: coi như CHƯA TỪNG được rà — đếm tất cả. Tài liệu bị gắn cờ đậm, ai đó
  // mở ra và thấy ngay cái mốc vô lý.
  const nowMonth = vnMonthOf(now);
  const reviewed = nowMonth && lastReviewed > nowMonth ? "0000-00" : lastReviewed;

  let changesSince = 0;
  for (const p of publishedAt) {
    const m = vnMonthOf(p);
    // Mục chưa đăng / mốc hỏng thì bỏ qua, không đếm vào — đếm một mục không tồn tại là hù người
    // đọc bằng một con số không có thật.
    if (m && m > reviewed) changesSince += 1;
  }

  const level: DocStalenessLevel =
    changesSince === 0 ? "FRESH" : changesSince >= STALE_CHANGE_COUNT ? "STALE" : "AGING";

  return { lastReviewed, changesSince, level };
}

/**
 * Câu nhắc cho người đọc — `null` nghĩa là KHÔNG HIỆN GÌ.
 *
 * 🎯 `null` LÀ PHẦN QUAN TRỌNG NHẤT CỦA HÀM NÀY. Chương không có thay đổi nào sau lần rà thì im
 * lặng hoàn toàn. Đó là điều phân biệt nó với câu cảnh báo cũ (luôn hiện, nên bị bỏ qua).
 *
 * Câu chữ nói SỐ, không nói "có thể": "12 thay đổi kể từ lần rà" là một sự thật kiểm được, còn
 * "một số chi tiết có thể đã thay đổi" đúng với mọi tài liệu trên đời và vì thế không nói gì cả.
 */
export function stalenessNotice(s: DocStaleness, locale: "vi" | "en"): string | null {
  if (s.level === "FRESH") return null;

  const when = formatReviewMonth(s.lastReviewed);
  const n = s.changesSince;
  return locale === "vi"
    ? `Rà soát lần cuối ${when} — đã có ${n} thay đổi hệ thống kể từ đó.`
    : `Last reviewed ${when} — ${n} system change${n > 1 ? "s" : ""} since then.`;
}

/**
 * "2026-06" → "06/2026".
 *
 * ⚠️ KHÔNG dùng `new Date()`: chuỗi này là NĂM-THÁNG, không phải một thời điểm. Dựng Date từ nó
 * sẽ ăn theo múi giờ rồi lệch tháng ở đúng ngày đầu/cuối tháng.
 *
 * Ở đây chứ không ở component: cả trang Hướng dẫn lẫn (về sau) trang sức khoẻ tài liệu đều hiện
 * mốc này, và hai cách định dạng cho cùng một giá trị là thứ người đọc sẽ tưởng là hai thứ khác.
 */
export function formatReviewMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return m && y ? `${m}/${y}` : ym;
}

/**
 * Xếp thứ tự việc cần rà: cũ nhất và nhiều thay đổi nhất lên trước.
 *
 * Tồn tại để bộ dò không dừng ở "có vấn đề" mà nói được "làm cái nào trước" — một danh sách 23
 * chương đều gắn cờ thì cũng vô dụng như không gắn cờ nào.
 */
export function compareByStaleness(
  a: { staleness: DocStaleness },
  b: { staleness: DocStaleness },
): number {
  if (a.staleness.changesSince !== b.staleness.changesSince) {
    return b.staleness.changesSince - a.staleness.changesSince;
  }
  return a.staleness.lastReviewed.localeCompare(b.staleness.lastReviewed);
}
