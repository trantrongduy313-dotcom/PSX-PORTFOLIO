import { z } from "zod";

import { deniedReasonFor } from "@/app/lib/business/kpi-3d/permissions";

// ─── GIAI ĐOẠN TIẾP THEO CỦA MỘT MO LÀ MỘT LƯỢT RIÊNG ────────────────────────
//
// Trước bản này, mở lại chỉ đóng khoảng dừng rồi dời deadline trên CHÍNH lượt cũ. Đủ cho một đơn
// gác vài tiếng, nhưng sai hẳn cho tình huống thật hay gặp: gác cuối tháng 8, mở lại tháng 9, và
// người làm tiếp có thể là người khác. Khi đó một lượt duy nhất phải đồng thời là "việc của AN
// tháng 8" và "việc của BÌNH tháng 9" — không cột nào diễn đạt nổi.
//
// Nên: giao-lượt-tiếp-theo ĐÓNG lượt cũ và MỞ một lượt mới nối vào nó (reassignedFromId +
// continuationReason). Mỗi lượt có đúng một người, một tháng, một ngân sách.
//
// ─── KHÔNG ĐÒI ĐƠN PHẢI ĐANG TẠM DỪNG ──────────────────────────────────────
//
// Bản đầu chỉ cho đi đường này khi đơn đang bị gác, và điều đó bịt kín một tình huống rất thường:
// đơn đang làm bình thường mà Order muốn giao cho CHÍNH người đó (hoặc người khác) thêm một lượt
// nữa. Không có cửa nào, nên người dùng với lấy "+ Thêm NV 3D" — mà nút đó tạo lượt SONG SONG,
// không phải lượt TIẾP THEO, rồi đụng vào chốt chặn `usedDesignerIds` và tưởng hệ thống không hỗ
// trợ làm nhiều lần.
//
// "Làm lần nữa" luôn là TUẦN TỰ: lượt cũ phải được chốt giờ trước. Có khoảng dừng đang mở thì
// đóng nó luôn; không có thì vẫn đi tiếp.
//
// ─── VÌ SAO NGÂN SÁCH LƯỢT MỚI PHẢI KHÁC LƯỢT ĐẦU ───────────────────────────
//
// reassign.ts (không duyệt → đổi người) cố ý cho lượt mới NGUYÊN suất giờ chuẩn, vì bản trước bị
// bác nên người mới làm LẠI TỪ ĐẦU. Ở đây thì ngược hẳn: người mới KẾ THỪA phần đã làm.
//
// Giữ nguyên suất ở đây sẽ khiến một MO 6 giờ chuẩn tiêu 12 giờ ngân sách, và người thứ hai chỉ
// cần làm nốt nửa việc trong nguyên một suất giờ — gần như không thể trễ hạn. Hai luồng trông
// giống nhau nhưng luật ngược nhau; chép luật của bên kia sang là cách hỏng dễ xảy ra nhất.
//
// File THUẦN: không prisma, không React.

/**
 * Ngân sách GỢI Ý cho giai đoạn tiếp theo = phần chưa tiêu của suất giờ gốc.
 *
 * ⚠️ CHỈ LÀ GỢI Ý, và không được biến thành số hệ thống tự áp. "Làm được một nửa" là đánh giá
 * của con người, không suy ra được từ đồng hồ: người cũ tiêu 5/6 giờ mà bản vẽ mới xong 30% thì
 * phép trừ chỉ còn 1 giờ — giao 1 giờ cho người mới làm 70% việc là phạt oan NGƯỜI MỚI, đúng
 * kiểu bất công mà reassign.ts đã tránh ở chiều ngược lại.
 *
 * Trả `null` khi ngân sách gốc đã tiêu hết (hoặc không biết suất gốc là bao nhiêu). Null nghĩa
 * là "hệ thống không có ý kiến, người giao phải tự đặt số" — cố ý KHÔNG rơi về 0 và cũng không
 * bịa ra một mức sàn: 0 giờ nghĩa là deadline rơi ngay vào lúc giao, tức người mới trễ hạn từ
 * giây đầu tiên; còn một mức sàn kiểu "tối thiểu 30 phút" là con số không ai giải thích được.
 */
export function suggestedRemainingMinutes(params: {
  standardMinutes: number | null;
  creditedMinutes: number;
}): number | null {
  const { standardMinutes, creditedMinutes } = params;
  if (standardMinutes == null || !Number.isFinite(standardMinutes) || standardMinutes <= 0) {
    return null;
  }
  const credited = Number.isFinite(creditedMinutes) ? Math.max(0, creditedMinutes) : 0;
  const remaining = standardMinutes - credited;
  return remaining > 0 ? remaining : null;
}

export const continuationInputSchema = z.object({
  /** Ai làm tiếp. CÓ THỂ TRÙNG người cũ — "vẫn người đó, nhưng là một giai đoạn khác". */
  designer3DId: z.string().trim().min(1, "Phải chọn nhân viên 3D làm tiếp."),
  /**
   * Ngân sách giờ cho giai đoạn tiếp theo, tính bằng PHÚT.
   *
   * BẮT BUỘC, cố ý không có `.default()`. Đây là con số quyết định người làm tiếp đúng hay trễ
   * hạn; để hệ thống tự điền một mặc định là để nó ra phán quyết thay người quản lý mà không ai
   * biết. Form điền sẵn gợi ý, nhưng người bấm vẫn phải nhìn qua nó.
   */
  standardMinutes: z.number().int().min(1, "Số giờ cho giai đoạn tiếp theo phải lớn hơn 0.").max(100_000),
  /** Mốc bắt đầu lượt mới. Nó quyết định giờ của giai đoạn này thuộc THÁNG nào. */
  startedAt: z.coerce.date().optional(),
  kpiGroupId: z.string().trim().min(1).optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export type ContinuationInput = z.infer<typeof continuationInputSchema>;

/** Phần trạng thái cần để xét có giao được lượt tiếp theo không. */
export type ContinuableAssignment = {
  status: string;
  reviewStatus: string | null;
};

/** Vì sao KHÔNG giao được lượt tiếp theo — null nghĩa là hợp lệ. */
export function deniedReasonForContinuation(
  role: string | undefined,
  a: ContinuableAssignment,
): string | null {
  const denied = deniedReasonFor("PAUSE_ASSIGNMENT", { role, designer3DId: null });
  if (denied) return denied;

  if (a.status === "CANCELLED" || a.status === "REASSIGNED") {
    return "Lượt giao việc đã đóng — không giao tiếp được từ lượt này.";
  }
  // Đã duyệt thì giờ đã đóng băng và MO coi như xong; mở tiếp một giai đoạn nữa là dựng ra công
  // việc cho một thứ đã kết thúc.
  if (a.reviewStatus === "ACCEPTED") {
    return "Lượt giao việc đã được duyệt — không giao tiếp được từ lượt này.";
  }
  return null;
}

/**
 * Vì sao MỐC BẮT ĐẦU của lượt mới không hợp lệ — null nghĩa là hợp lệ.
 *
 * Tách khỏi deniedReasonForResumeAt (bên pause.ts) vì hai bài toán khác nhau: bên kia mốc phải
 * SAU mốc dừng, còn ở đây có thể KHÔNG có khoảng dừng nào. Chặn còn lại giống nhau và phải giống
 * nhau — mốc này quyết định giờ vào KPI tháng nào.
 *
 * `pausedAt` truyền vào khi đơn đang bị gác; null khi không.
 */
export function deniedReasonForContinueAt(params: {
  startedAt: Date;
  previousStartedAt: Date;
  pausedAt: Date | null;
  now: Date;
}): string | null {
  const ms = (d: Date) => d.getTime();
  const valid = (d: Date | null | undefined): d is Date =>
    d instanceof Date && Number.isFinite(d.getTime());

  if (!valid(params.startedAt)) return "Mốc giao lượt mới không đọc được.";

  // Nới 2 phút cho lệch đồng hồ máy — chặn chặt tới từng giây thì người bấm đúng lúc cũng có thể
  // bị từ chối. Cùng độ nới với deniedReasonForPauseAt, cố ý.
  if (ms(params.startedAt) > ms(params.now) + 2 * 60_000) {
    return "Mốc giao lượt mới ở tương lai — deadline sẽ tính từ một thời điểm chưa xảy ra.";
  }

  // Không được lùi TRƯỚC lượt cũ: hai lượt của một chuỗi phải nối tiếp nhau, nếu không lịch sử
  // đọc ra "lần 2 bắt đầu trước lần 1".
  if (valid(params.previousStartedAt) && ms(params.startedAt) < ms(params.previousStartedAt)) {
    return "Mốc giao lượt mới sớm hơn lúc giao lượt trước — hai lượt phải nối tiếp nhau.";
  }

  // Đang bị gác thì lượt mới bắt đầu TỪ lúc mở lại trở đi. Sớm hơn mốc dừng nghĩa là hai lượt
  // chồng thời gian nhau, và giờ của khoảng chồng đó thuộc về cả hai người.
  if (valid(params.pausedAt) && ms(params.startedAt) < ms(params.pausedAt)) {
    return "Mốc giao lượt mới sớm hơn mốc tạm dừng — hai lượt sẽ chồng thời gian nhau.";
  }

  return null;
}

/** Ghi chú bàn giao cho người làm tiếp — họ không thấy lượt cũ sau khi nó bị đóng. */
export function continuationNote(params: {
  fromDesignerName: string;
  creditedMinutes: number;
  pauseReason: string | null;
}): string {
  const hours = Math.round((Math.max(0, params.creditedMinutes) / 60) * 100) / 100;
  const why = params.pauseReason?.trim();
  return [
    `Làm tiếp phần dở của ${params.fromDesignerName} (đã ghi nhận ${hours} giờ).`,
    why ? `Đơn từng tạm dừng vì: ${why}` : "",
  ].filter(Boolean).join(" ");
}
