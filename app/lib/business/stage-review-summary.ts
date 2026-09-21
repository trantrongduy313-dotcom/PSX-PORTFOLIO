// ─── Khối tổng ở cuối bản in Đánh giá Khâu ───────────────────────────────────
//
// PHẠM VI TÍNH (user chốt): tổng được tính TỪ ĐÚNG DANH SÁCH ĐANG IN, không phải từ API báo
// cáo cả tháng. Nghĩa là lọc theo thợ / gõ tìm kiếm thì tổng đổi theo — con số dưới bảng luôn
// đúng bằng các dòng ở trên nó.
//
// HỆ QUẢ PHẢI NÓI RÕ TRÊN BẢN IN: ĐM/Tháng là chỉ tiêu CẢ THÁNG. Khi danh sách in chỉ là một
// phần của tháng, "Kết quả %" sẽ thấp hơn thực tế — không phải sai, mà là đang so một phần
// công việc với chỉ tiêu cả tháng. Bản in tự ghi chú điều này (xem print-stage-review.tsx).
//
// Vì sao tính lại từ dòng thay vì gọi /api/reports/stages: API gộp sẵn theo cả tháng, không có
// cách nào lọc cho khớp bộ lọc đang xem trên màn.

import {
  buildNguoiKpiSummary,
  type NguoiKpiSummary,
  type NguoiQuotaConfig,
} from "@/app/lib/business/kpi-nguoi";
import { nguoiKpiPrintRow } from "@/app/lib/business/kpi-nguoi-display";

/**
 * Tập trường tối thiểu cần để cộng tổng — cố ý KHÔNG nhận nguyên ReviewRow, để hàm này test
 * được mà không phải dựng 15 trường không liên quan.
 */
export type StageReviewSummaryInput = {
  crafter: string | null;
  /** "Giờ thực tế" nhập tay, dạng "5g 30p". */
  durationNote: string | null;
  coldworkQuality: string | null;
  coldworkTimeOk: string | null;
};

/**
 * "Ng Hg Mp" → số giờ thập phân.
 *
 * Phần "g" phải nhận cả số thập phân ("2.5g" — dữ liệu import cũ); nếu chỉ bắt \d+ thì regex
 * khớp nhầm vào phần lẻ sau dấu chấm (2.5g → bắt "5g" → sai gấp đôi). Giữ đúng quy ước với
 * durationToMinutes() ở màn Đánh giá Khâu, kể cả đơn vị "n" (ngày = 24h).
 */
export function durationNoteToHours(s: string | null | undefined): number {
  if (!s) return 0;
  let minutes = 0;
  const dn = s.match(/(\d+)n/);            if (dn) minutes += parseInt(dn[1], 10) * 1440;
  const dh = s.match(/(\d+(?:\.\d+)?)g/);  if (dh) minutes += parseFloat(dh[1]) * 60;
  const dm = s.match(/(\d+)p/);            if (dm) minutes += parseInt(dm[1], 10);
  return minutes / 60;
}

/**
 * Gộp danh sách công việc đang in thành dòng tổng — MỘT DÒNG MỖI THỢ, sắp theo tên.
 *
 * Một dòng mỗi thợ (thay vì một dòng tổng duy nhất) để bản in "Tất cả thợ" vẫn dùng được:
 * cộng chung nhiều thợ vào một dòng thì ĐM và Kết quả % vô nghĩa hoàn toàn.
 *
 * `moCount` đếm THEO TỪNG CÔNG VIỆC — 1 MO làm 2 lần = 2 dòng, khớp cách đếm của
 * /api/reports/stages và của Google Sheet gốc.
 */
export function summarizeNguoiReviewRows(
  rows: StageReviewSummaryInput[],
  cfg: NguoiQuotaConfig,
): NguoiKpiSummary[] {
  const acc = new Map<string, { totalHours: number; moCount: number; qualityFail: number; timeFail: number }>();

  for (const r of rows) {
    const crafter = r.crafter?.trim();
    if (!crafter) continue; // công việc chưa gán thợ — không quy được vào KPI của ai
    const a = acc.get(crafter) ?? { totalHours: 0, moCount: 0, qualityFail: 0, timeFail: 0 };
    a.totalHours += durationNoteToHours(r.durationNote);
    a.moCount    += 1;
    if (r.coldworkQuality === "Không đạt") a.qualityFail += 1;
    if (r.coldworkTimeOk  === "Không đạt") a.timeFail    += 1;
    acc.set(crafter, a);
  }

  return [...acc.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "vi"))
    // code = "" và level = "" : mã + bậc thợ nằm ở bảng Craftsman phía server, ReviewRow không
    // mang theo. Hai cột đó vì vậy bị loại khỏi hộp Tổng hợp bên dưới (nguoiSummaryStats chỉ
    // liệt kê các chỉ số) thay vì in ra hai ô trống.
    .map(([crafter, a]) => buildNguoiKpiSummary({ crafter, code: "", level: "", ...a }, cfg));
}

/** Một cặp nhãn:giá-trị trong hộp Tổng hợp — nhãn ĐẦY ĐỦ, không viết tắt (VD "SL công việc",
 * không phải "moCount") vì đây là văn bản người đọc, khác với `key` kỹ thuật của cột. */
export type SummaryStat = { label: string; value: string };

/**
 * Dòng tổng → DANH SÁCH CẶP NHÃN:GIÁ TRỊ, để dựng thành hộp "Tổng hợp" chèn ngay dưới nhóm công
 * việc của một thợ (1 ô colSpan hết bảng chi tiết) — cùng ngôn ngữ hình ảnh với hộp "Tổng hợp"
 * của bản in Đơn hàng (report-pdf.ts), thay vì dựng một bảng riêng có header thứ hai.
 *
 * VÌ SAO KHÔNG DỰNG BẢNG RIÊNG: bảng chi tiết và bảng tổng dùng HAI BỘ CỘT KHÁC NHAU (VD "Giờ
 * KPI" ở bảng chi tiết không tồn tại ở dòng tổng) — 2 bảng với 2 header nối tiếp nhau trông như
 * hai bản in dán lại, không giống MỘT báo cáo liền mạch.
 *
 * Trả về danh sách thuần (không phải JSX) để hàm này test được không cần render — nơi hiển thị
 * (print-stage-review.tsx) tự quyết định layout hộp.
 */
export function nguoiSummaryStats(s: NguoiKpiSummary): SummaryStat[] {
  const c = nguoiKpiPrintRow(s).cells;
  return [
    { label: "Tổng giờ thực tế", value: c.totalHrs },
    { label: "SL công việc", value: c.moCount },
    { label: "SL quy về nhóm chuẩn", value: c.units },
    { label: "ĐM / Tháng", value: c.quota },
    { label: "Kết quả (%)", value: c.result },
    { label: "SL không đạt CLSP", value: c.clKd },
    { label: "SL trễ", value: c.late },
  ];
}

/**
 * Gom danh sách theo `crafter`, GIỮ NGUYÊN thứ tự xuất hiện lần đầu — không sort lại theo tên.
 *
 * Dùng để chèn dòng TỔNG ngay sau nhóm công việc của một thợ: cần các dòng của cùng một thợ
 * NẰM LIỀN NHAU trong bảng in, dù dữ liệu gốc xen kẽ nhiều thợ theo thời gian làm việc.
 *
 * Generic thay vì gắn cứng ReviewRow — logic gom nhóm không phụ thuộc khâu Nguội, tái dùng
 * được cho khâu khác sau này.
 */
export function groupByCrafter<T extends { crafter: string | null }>(
  rows: T[],
): Array<{ crafter: string | null; items: T[] }> {
  const order: (string | null)[] = [];
  const buckets = new Map<string | null, T[]>();
  for (const r of rows) {
    const key = r.crafter?.trim() || null;
    if (!buckets.has(key)) { buckets.set(key, []); order.push(key); }
    buckets.get(key)!.push(r);
  }
  return order.map(key => ({ crafter: key, items: buckets.get(key)! }));
}

/**
 * Khâu nào có khối tổng KPI. Vắng mặt = không in khối tổng.
 *
 * Dạng bảng tra thay vì `if (stage === "NGUOI")` rải trong JSX: thêm khâu sau này chỉ là thêm
 * một dòng ở đây, và chỗ khai báo cũng là chỗ duy nhất phải sửa.
 */
export const STAGE_SUMMARY_TITLE: Record<string, string> = {
  NGUOI: "Tổng hợp KPI thợ Nguội",
};
