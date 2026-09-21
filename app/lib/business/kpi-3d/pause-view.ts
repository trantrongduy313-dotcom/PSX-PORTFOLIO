import { openPause, type PauseSpan } from "@/app/lib/business/kpi-3d/pause";
import { toVnYmd } from "@/app/lib/utils/vn-date";

// ─── Tạm dừng, phần ĐỌC ĐƯỢC ─────────────────────────────────────────────────
//
// pause.ts làm phép tính (trừ giờ, dời deadline). File này chỉ dịch mấy khoảng dừng thô thành
// thứ hiện lên màn hình được, và nó ra đời để bịt đúng một lỗ:
//
//   API đơn hàng KHÔNG nạp `pauses`, nên sidebar mù hoàn toàn về tạm dừng. Hai hậu quả khác
//   hẳn nhau về mức độ:
//     · nhẹ  — khối Thiết kế không nói được đơn đang bị gác;
//     · NẶNG — toDesign3DAssignmentView nhận `pauses = []` mặc định nên giờ thực tế KHÔNG trừ
//              phần bị gác, trong khi màn Việc thiết kế 3D thì trừ. Cùng một lượt, hai màn hình
//              hai con số, không màn nào tự biết mình sai.
//
// Đây đúng loại lỗi khó thấy nhất của dự án: một con số sai trông y hệt số đúng.
//
// ⚠️ KHÔNG ĐẶT completedAt CHO LƯỢT ĐANG DỪNG. Tạm dừng cần được thấy như "đã chốt giờ",
// KHÔNG phải như "đã hoàn tất": đóng dấu hoàn tất sẽ đẩy đơn vào cột "Đơn HT trong tháng" và
// sinh ra một phán quyết Đúng/Trễ hạn cho việc chưa xong. Giờ công của tháng đó đã được ghi
// nhận sẵn qua confirmedMinutes + hours-ledger — thứ thiếu chỉ là hiển thị, và nó ở đây.
//
// File THUẦN: không prisma, không React.

/** Khoảng dừng như API trả về — mốc là chuỗi ISO, không phải Date. */
export type RawPause = {
  id: string;
  pausedAt: string | Date;
  resumedAt: string | Date | null;
  confirmedMinutes: number | null;
  reason?: string | null;
};

const toDate = (v: string | Date | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
};

/**
 * Chuyển mốc chuỗi thành Date để đưa vào các hàm tính của pause.ts.
 *
 * BỎ HẲN khoảng có `pausedAt` không đọc được. Giữ lại với mốc rác thì pausedWorkingMinutes cắt
 * nó thành khoảng rỗng và trừ 0 — đúng về số nhưng im lặng: sẽ không ai biết dữ liệu hỏng.
 * Bỏ ở đây thì `pauses.length` lệch so với bảng, và đó là thứ nhìn ra được.
 */
export function toPauseSpans(rows: readonly RawPause[] | null | undefined): PauseSpan[] {
  const out: PauseSpan[] = [];
  for (const r of rows ?? []) {
    const pausedAt = toDate(r.pausedAt);
    if (!pausedAt) continue;
    // MANG THEO confirmedMinutes. Bỏ nó thì tab Thiết kế mất hẳn ô "Giờ thực tế" của một đơn
    // đang tạm dừng — số đã được tính vào KPI mà không chỗ nào đọc lại được.
    out.push({
      pausedAt,
      resumedAt: toDate(r.resumedAt),
      confirmedMinutes: typeof r.confirmedMinutes === "number" ? r.confirmedMinutes : null,
    });
  }
  return out;
}

export type PauseState = {
  /** Đang bị gác ngay lúc này. */
  isPaused: boolean;
  /** Mốc của khoảng dừng ĐANG MỞ. null khi không dừng. */
  pausedAt: Date | null;
  reason: string | null;
  /** Số phút người duyệt đã chốt tại mốc dừng đang mở — null nghĩa là chưa chốt. */
  confirmedMinutes: number | null;
  /** Tháng "YYYY-MM" mà số giờ trên được ghi vào. null khi không dừng. */
  kpiMonth: string | null;
  /** Số lần đã bị gác, kể cả các lần đã mở lại — dùng để hiện "đã tạm dừng 2 lần". */
  pauseCount: number;
};

const EMPTY: PauseState = {
  isPaused: false,
  pausedAt: null,
  reason: null,
  confirmedMinutes: null,
  kpiMonth: null,
  pauseCount: 0,
};

/**
 * Tình trạng tạm dừng của một lượt, gọn đủ để render.
 *
 * `kpiMonth` lấy theo MỐC DỪNG chứ không theo lúc mở sidebar: giờ công được hours-ledger ghi vào
 * tháng của mốc dừng, nên hiện tháng nào khác sẽ mâu thuẫn với báo cáo KPI ngay trên cùng dữ
 * liệu. Quản lý gác đơn ngày 31/8 mà bấm nút ngày 02/9 thì đây phải nói "08", không phải "09".
 */
export function pauseStateOf(rows: readonly RawPause[] | null | undefined): PauseState {
  const list = rows ?? [];
  if (list.length === 0) return EMPTY;

  const spans = toPauseSpans(list);
  const open = openPause(spans);
  const pauseCount = spans.length;

  if (!open) return { ...EMPTY, pauseCount };

  // Tra ngược về bản ghi gốc để lấy reason/confirmedMinutes — PauseSpan cố ý chỉ mang hai mốc.
  const openMs = open.pausedAt.getTime();
  const raw = list.find((r) => {
    const d = toDate(r.pausedAt);
    return d != null && d.getTime() === openMs && toDate(r.resumedAt) == null;
  });

  return {
    isPaused: true,
    pausedAt: open.pausedAt,
    reason: raw?.reason?.trim() || null,
    confirmedMinutes: typeof raw?.confirmedMinutes === "number" ? raw.confirmedMinutes : null,
    kpiMonth: toVnYmd(open.pausedAt).slice(0, 7),
    pauseCount,
  };
}

// ─── Đối chiếu trước khi chốt sổ ─────────────────────────────────────────────

export type PauseWarning = {
  key: "hours" | "render";
  text: string;
};

const fmtHours = (minutes: number): string => {
  const h = Math.round((minutes / 60) * 100) / 100;
  return `${h} giờ`;
};

/**
 * CHỈ NHỮNG GÌ BẤT THƯỜNG. Không có dòng "mọi thứ đều ổn".
 *
 * BẢN TRƯỚC TRẢ CẢ DÒNG `ok`, và đó là lỗi: một dòng chữ xanh nói "Đã có link ảnh render" không
 * làm người duyệt quyết khác đi điều gì, còn dòng "Đã làm 0.02 giờ / KPI 3 giờ" thì nhắc lại hai
 * con số đang hiển thị ngay phía trên nó. Bốn dòng chữ cho ba cái ô nhập — và chúng đọc như nhau
 * nên mắt bỏ qua cả bốn, kể cả cái cảnh báo thật.
 *
 * Số bình thường thuộc về Ô NHẬP của nó (xem hoursBudgetLabel / monthKeyOf), không thuộc một
 * đoạn văn ở cuối form. Chỗ này chỉ còn thứ cần người ta DỪNG LẠI NHÌN.
 *
 * ⚠️ KHÔNG CÓ MỨC CHẶN, và đó là quyết định có chủ ý. Tạm dừng gần như luôn là quyết định điều
 * hành (hết vật liệu, khách đổi ý, có đơn gấp hơn) — chặn thao tác gác đơn vì nhân viên chưa
 * kịp gửi ảnh là bắt họ gánh hậu quả của một tình huống họ không gây ra, và người quản lý sẽ
 * lách bằng cách bịa một link. Cảnh báo rồi cho đi tiếp giữ được cả hai: việc vẫn gác được, mà
 * dữ liệu vẫn nói thật.
 */
export function pauseWarnings(params: {
  confirmedMinutes: number | null;
  standardMinutes: number | null;
  hasRenderLink: boolean;
}): PauseWarning[] {
  const out: PauseWarning[] = [];
  const { confirmedMinutes, standardMinutes } = params;

  const usable =
    confirmedMinutes != null && Number.isFinite(confirmedMinutes) && confirmedMinutes >= 0;

  if (usable && standardMinutes != null && standardMinutes > 0 && confirmedMinutes > standardMinutes) {
    out.push({
      key: "hours",
      text: `Vượt ngân sách KPI ${fmtHours(standardMinutes)} — quá ${fmtHours(confirmedMinutes - standardMinutes)}`,
    });
  }

  // Câu cũ kèm cả lời giải thích "số giờ chốt ở đây không có kết quả kèm theo". Người duyệt đọc
  // nó một lần là hiểu, từ lần thứ hai nó chỉ chiếm hai dòng — và vì hệ thống CỐ Ý không chặn,
  // lời giải thích cũng không đổi được quyết định nào.
  if (!params.hasRenderLink) out.push({ key: "render", text: "Chưa có ảnh render" });

  return out;
}

/**
 * Ngân sách còn lại, viết NGẮN để nằm ngay dưới ô "Giờ đã làm" — `/ 3 giờ · còn 2.98 giờ`.
 *
 * Con số đi cùng ô sinh ra nó, không đi cùng một đoạn văn ở cuối form: người đọc không phải nối
 * hai chỗ cách nhau bốn dòng để hiểu một phép trừ.
 *
 * null khi chưa có gì để so — ô để trống (server sẽ tự đo), hoặc lượt không có ngân sách.
 */
export function hoursBudgetLabel(params: {
  confirmedMinutes: number | null;
  standardMinutes: number | null;
}): string | null {
  const { confirmedMinutes, standardMinutes } = params;
  if (confirmedMinutes == null || !Number.isFinite(confirmedMinutes) || confirmedMinutes < 0) return null;
  if (standardMinutes == null || !Number.isFinite(standardMinutes) || standardMinutes <= 0) return null;

  const left = standardMinutes - confirmedMinutes;
  // Vượt ngân sách đã có một CẢNH BÁO riêng ở pauseWarnings; nói thêm "còn -2 giờ" ở đây là nói
  // hai lần và bằng một con số âm không ai đọc được.
  // ĐỌC ĐƯỢC KHI ĐỨNG MỘT MÌNH. Bản trước trả về "/ 6 giờ · còn 2 giờ" — dấu "/" mở đầu chỉ có
  // nghĩa khi nhãn nằm SÁT DƯỚI ô số, đọc nối thành "3.08 / 6 giờ". Nay nó nằm trong một dòng tóm
  // tắt chung cho cả hàng, nên cái "/" mồ côi đó đọc gãy ("· / 6 giờ").
  return left >= 0 ? `còn ${fmtHours(left)} / ${fmtHours(standardMinutes)}` : `${fmtHours(standardMinutes)} KPI`;
}

/** "08/2026" từ "2026-08" — nhãn tháng cho người đọc, không phải khoá dữ liệu. */
export function formatKpiMonth(month: string | null): string {
  if (!month) return "";
  const [y, m] = month.split("-");
  return y && m ? `${m}/${y}` : month;
}
