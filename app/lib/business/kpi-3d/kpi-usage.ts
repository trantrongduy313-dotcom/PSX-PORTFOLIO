// ─── Tỉ lệ dùng giờ KPI ──────────────────────────────────────────────────────
//
// 🎯 VÌ SAO TỒN TẠI, VÀ NÓ SINH RA TỪ MỘT NGHỊCH LÝ:
//
// Yêu cầu của người dùng có hai phần, và phần thứ hai NGƯỢC CHIỀU với phần thứ nhất:
//
//   1. "Sớm / Trễ" đang hiện sai — 18 giờ cho một việc 4 giờ. → đã sửa ở evaluate3DKpiCompletion.
//   2. "DD kiểm soát được ĐH này tại sao lại nộp sớm quá nhiều thời gian, sợ 3D hiểu sai ý DD
//      nên làm quá nhanh."
//
// ⚠️ Nhưng người dùng PHÁT HIỆN được lượt đáng ngờ đó CHỈ VÌ con số 18 giờ trông vô lý. Sửa nó
// thành "3 giờ 7 phút" là con số trông hoàn toàn bình thường — và cái báo động TÌNH CỜ ấy mất đi.
//
// Nên sửa lỗi thôi thì chưa xong việc: phải có một báo động CÓ CHỦ Ý thay thế. Đó là file này.
//
// VÌ SAO LÀ TỈ LỆ, KHÔNG PHẢI SỐ GIỜ SỚM:
//
// "Sớm 3 giờ" không so được giữa hai nhóm KPI. Sớm 3 giờ trên một việc 4 giờ là dùng 25% thời
// gian; sớm 3 giờ trên một việc 40 giờ là dùng 92% — hai chuyện hoàn toàn khác nhau, cùng một
// con số. Tỉ lệ thì độc lập với độ dài KPI: 39/240 và 78/480 đều là 16%.
//
// 🔴 VÀ ĐÂY LÀ RÀNG BUỘC QUAN TRỌNG NHẤT CỦA CẢ FILE: NÓ LÀ LỜI NHẮC, KHÔNG PHẢI LỜI CÁO BUỘC.
//
// Nộp nhanh THƯỜNG LÀ CHUYỆN TỐT — mẫu quen, đơn giống đơn cũ, thợ giỏi. Nếu hệ thống mặc định
// coi nhanh là đáng ngờ thì nó PHẠT NGƯỜI LÀM TỐT, và điều người ta học được là GIỮ VIỆC LẠI CHO
// ĐỦ GIỜ MỚI NỘP. Đó là kết cục tệ nhất có thể: chậm hơn, và không ai nói ra vì sao.
//
// Nên: không chặn duyệt, không đổi kết quả KPI, không vào bảng xếp hạng. Chỉ là một dấu để người
// duyệt XEM KỸ HƠN trước khi bấm Đã duyệt. Điều cần kiểm là CHẤT LƯỢNG bản thiết kế — thời gian
// chỉ là dấu hiệu để đi xem, không phải kết luận.
//
// File thuần: không prisma, không React, không đọc env. Test trực tiếp.

/**
 * Dưới ngưỡng này thì đáng xem lại.
 *
 * 30% chọn theo bằng chứng đang có, KHÔNG phải theo lý thuyết: lượt 26.37669_1 dùng 16% (39 phút
 * trên 240 phút) và đó là lượt người dùng thấy đáng ngờ. Đặt ở 30% để bắt được ca đó cùng một
 * khoảng đệm, mà chưa gắn cờ vào những lượt chỉ nhanh hơn bình thường một chút.
 *
 * ⚠️ ĐÂY LÀ MỘT PHỎNG ĐOÁN CÓ CĂN CỨ, KHÔNG PHẢI MỘT CON SỐ ĐÃ ĐƯỢC ĐO. Sau vài tuần có dữ liệu
 * thật thì đọc lại phân bố rồi chỉnh — và lúc đó nên đưa nó vào phần cấu hình Nhóm KPI để admin
 * tự sửa, thay vì nằm ở đây. Chưa làm bây giờ vì chọn ngưỡng trước khi có dữ liệu là cấu hình
 * hoá một điều mình chưa biết.
 */
export const KPI_USAGE_REVIEW_THRESHOLD = 0.3;

/** Trên mức này là đã dùng quá giờ KPI — không phải mối lo của yêu cầu này, nhưng đo được thì nói. */
export const KPI_USAGE_OVER_THRESHOLD = 1;

export type KpiUsageLevel =
  /** Dùng rất ít thời gian được cấp — đáng xem lại chất lượng. */
  | "VERY_FAST"
  /** Bình thường. */
  | "NORMAL"
  /** Đã dùng quá số giờ KPI. */
  | "OVER";

export type KpiUsageInput = {
  /** Giờ thực tế hệ thống đo (phút). null/0 = chưa có số đo. */
  actualMinutes: number | null | undefined;
  /** Số giờ KPI đã đóng dấu cho lượt này (phút). */
  standardMinutes: number | null | undefined;
};

/**
 * Tỉ lệ giờ thực tế / giờ KPI. `null` khi chưa đo được.
 *
 * TRẢ null CHỨ KHÔNG TRẢ 0 khi thiếu dữ liệu. Hai chuyện khác nhau hẳn: "chưa có số đo" và "làm
 * xong trong 0 phút". Gộp lại là mọi lượt cũ chưa có `actualMinutes` bị gắn cờ VERY_FAST — đúng
 * loại báo động giả làm người ta bỏ qua cả những cảnh báo thật.
 *
 * `actualMinutes = 0` cũng coi là CHƯA CÓ SỐ ĐO, cùng quy ước với resolveActualMinutes ở
 * actual-minutes.ts: ô nhập cũ để trống lưu thành 0, nên rất nhiều hàng đang là 0 mà không phải
 * vì ai đó cố ý ghi 0 giờ.
 */
export function kpiUsageRatio(input: KpiUsageInput): number | null {
  const actual = input.actualMinutes;
  const standard = input.standardMinutes;

  if (typeof actual !== "number" || !Number.isFinite(actual) || actual <= 0) return null;
  // standard <= 0 thì phép chia vô nghĩa (và chia 0 ra Infinity, một con số sẽ lặng lẽ chảy vào
  // giao diện dưới dạng "Infinity%").
  if (typeof standard !== "number" || !Number.isFinite(standard) || standard <= 0) return null;

  return actual / standard;
}

export function kpiUsageLevel(ratio: number | null): KpiUsageLevel | null {
  if (ratio === null) return null;
  if (ratio > KPI_USAGE_OVER_THRESHOLD) return "OVER";
  if (ratio < KPI_USAGE_REVIEW_THRESHOLD) return "VERY_FAST";
  return "NORMAL";
}

/** "16%" — làm tròn tới phần trăm nguyên. Chi tiết hơn thế là độ chính xác giả. */
export function formatKpiUsagePercent(ratio: number | null): string {
  if (ratio === null) return "—";
  return `${Math.round(ratio * 100)}%`;
}

/**
 * Câu hiện cho người đọc, kèm cả con số VÀ cách nó được tính ra.
 *
 * Kèm cả hai số ("39 phút / 4 giờ") chứ không chỉ tỉ lệ: một mình "16%" buộc người đọc phải đi
 * tìm hai con số kia ở hai dòng khác của panel để tự kiểm. Đây là dữ liệu ảnh hưởng tới đánh giá
 * công việc của một người, nên nó phải tự chứng minh được.
 */
export function formatKpiUsage(input: KpiUsageInput): string {
  const ratio = kpiUsageRatio(input);
  if (ratio === null) return "—";
  return `${formatKpiUsagePercent(ratio)} (${formatMinutes(input.actualMinutes as number)} / ${formatMinutes(input.standardMinutes as number)})`;
}

/**
 * Nhắc cho người duyệt, hoặc null nếu không có gì đáng nhắc.
 *
 * ⚠️ Câu chữ ở đây được chọn rất kỹ, và đó không phải chuyện thẩm mỹ. Nó KHÔNG nói "đáng ngờ",
 * KHÔNG nói "quá nhanh", KHÔNG nhắc tới người làm. Nó nói ra MỘT SỰ THẬT ĐO ĐƯỢC rồi đề nghị
 * một hành động — vì lượt nộp nhanh phần lớn là lượt tốt, và một dòng chữ mang giọng buộc tội sẽ
 * dạy cả phòng cách giữ việc lại cho đủ giờ.
 */
export function kpiUsageNotice(input: KpiUsageInput): string | null {
  const ratio = kpiUsageRatio(input);
  if (kpiUsageLevel(ratio) !== "VERY_FAST") return null;
  return `Dùng ${formatKpiUsagePercent(ratio)} giờ KPI — nên xem kỹ bản thiết kế trước khi duyệt.`;
}

/** "39 phút" · "4 giờ" · "4 giờ 30 phút". */
function formatMinutes(total: number): string {
  const abs = Math.max(0, Math.round(total));
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  if (hours === 0) return `${minutes} phút`;
  if (minutes === 0) return `${hours} giờ`;
  return `${hours} giờ ${minutes} phút`;
}
