import { minutesPerWorkingDay, type WorkingCalendar } from "@/app/lib/business/kpi-3d-deadline";

// ─── Giờ thực tế: số hệ thống ghi vs số Order sửa tay ────────────────────────
//
// YÊU CẦU CỦA USER CÓ HAI PHẦN CHỐNG NHAU NẾU LÀM CẨU THẢ:
//   "khi hoàn thành thì dữ liệu tự động xuất hiện" — hệ thống phải tự ghi.
//   "nhưng vẫn cho phép Order sửa khi cần thiết"   — người vẫn phải sửa được.
//
// Một con số VỪA do hệ thống ghi VỪA cho người sửa, mà không phân biệt được, sẽ hỏng theo hai
// đường:
//   1. Order sửa thành 5 giờ; lần lưu sau hệ thống ghi lại 3 giờ → công sửa mất im lặng.
//   2. Người đọc báo cáo không biết 5 giờ kia là hệ thống đo hay ai đó gõ vào.
//
// Nên GIỮ HAI Ô RIÊNG, và nói rõ đang đọc ô nào:
//   - `Design3DAssignment.actualMinutes` — HỆ THỐNG đo, đóng dấu một lần lúc hoàn tất
//     (resolveAssignmentStateAfterProgress). Không ai sửa cột này.
//   - `extraData.perItem[].design.gioThucTe` (JSON) — SỐ SỬA TAY của Order. Vắng mặt =
//     chưa ai sửa = dùng số hệ thống.
//
// Dữ liệu CŨ tự động đúng nghĩa: mọi số `gioThucTe` đang có trong JSON đều do người gõ vào,
// nên xếp nó thành "đã sửa tay" là mô tả đúng lịch sử, không cần script backfill.
//
// File thuần (không prisma, không React) để test trực tiếp.

export type ActualMinutesSource = "SYSTEM" | "MANUAL" | "NONE";

export type ResolvedActualMinutes = {
  /** Số phút để hiển thị và để tính KPI. null = chưa có gì. */
  minutes: number | null;
  /** Con số đang hiển thị đến từ đâu — quyết định câu chú thích dưới ô nhập. */
  source: ActualMinutesSource;
  /** Số hệ thống đo, giữ riêng để còn đường quay về sau khi Order sửa tay. */
  systemMinutes: number | null;
};

/**
 * Chọn con số nào để hiển thị.
 *
 * SỐ SỬA TAY THẮNG: Order chỉ gõ vào khi họ biết một điều hệ thống không biết (NV làm hộ máy
 * khác, quên bấm gửi kết quả, việc bị gián đoạn vì lý do ngoài lịch). Để hệ thống thắng thì
 * ô sửa thành vô nghĩa.
 *
 * Số 0 KHÔNG tính là đã sửa: ô nhập cũ để trống lưu thành 0, và toàn bộ dữ liệu staging hiện
 * đang là `gioThucTe: 0`. Coi 0 là "Order cố ý ghi 0 giờ" sẽ khiến mọi lượt cũ che mất số hệ
 * thống vừa đo được — đúng lỗi màn hình đang hiện "Giờ thực tế 0 / Số ngày HT —".
 */
export function resolveActualMinutes(params: {
  /** Cột actualMinutes của assignment — số hệ thống đo. */
  systemMinutes: number | null | undefined;
  /** `gioThucTe` trong JSON, đơn vị GIỜ (số Order gõ). */
  manualHours: number | null | undefined;
}): ResolvedActualMinutes {
  // SỐ HỆ THỐNG NHẬN CẢ 0, khác với số sửa tay.
  //
  // Tới được đây thì systemMinutes đã qua resolveSystemActualMinutes — nơi đã loại số 0 rác do
  // code cũ chiếu từ JSON và thay bằng phép đo thật. Nên 0 ở đây LÀ một phép đo: việc xong
  // trong vòng dưới một phút, hoặc làm trọn ngoài giờ hành chính.
  //
  // Còn `manualHours` vẫn từ chối 0, vì ở đó số 0 là rác đã biết: ô nhập cũ để trống lưu thành 0.
  const systemMinutes = toMeasuredInt(params.systemMinutes);

  const manualHours = typeof params.manualHours === "number" && Number.isFinite(params.manualHours)
    ? params.manualHours
    : null;
  const manualMinutes = manualHours != null && manualHours > 0 ? Math.round(manualHours * 60) : null;

  if (manualMinutes != null) {
    return { minutes: manualMinutes, source: "MANUAL", systemMinutes };
  }
  if (systemMinutes != null) {
    return { minutes: systemMinutes, source: "SYSTEM", systemMinutes };
  }
  return { minutes: null, source: "NONE", systemMinutes: null };
}

/** Số phút ĐO ĐƯỢC — nhận 0, chỉ loại null/NaN/âm. */
function toMeasuredInt(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

/** Số giờ để đổ vào ô nhập (bước 0.5 như ô đang dùng). null = để trống. */
export function actualMinutesToHours(minutes: number | null): number | null {
  if (minutes == null) return null;
  return Math.round((minutes / 60) * 100) / 100;
}

/**
 * Số ngày hoàn tất = số phút làm việc / số phút MỘT NGÀY LÀM VIỆC CỦA LỊCH.
 *
 * THAY CHO `calcSoNgayHT` chia cứng cho 8 giờ. Lịch đang cấu hình có ngày làm 470 phút
 * (≈7,83 giờ), nên hằng số 8 làm lệch ~2% — và lệch nhiều hơn mỗi lần admin sửa ca. Hai định
 * nghĩa "một ngày làm việc" trong cùng một hệ thống là loại lỗi im lặng: không ai thấy sai,
 * chỉ thấy hai màn ra hai con số.
 */
export function workingDaysFromMinutes(
  minutes: number | null,
  calendar?: WorkingCalendar,
): number | null {
  // 0 phút → 0 ngày, KHÔNG phải null. Nếu trả null thì ô "Giờ thực tế" hiện 0 mà ô "Số ngày HT"
  // hiện "—" — hai ô cạnh nhau nói hai điều khác nhau về cùng một phép đo.
  if (minutes == null || minutes < 0) return null;

  const perDay = minutesPerWorkingDay(calendar);
  if (perDay <= 0) return null;

  return Math.round((minutes / perDay) * 10) / 10;
}

/**
 * Khối "Kết quả thực hiện" có gì để hiện hay không.
 *
 * VÌ SAO Ở ĐÂY CHỨ KHÔNG PHẢI MỘT `&&` TRONG JSX: lúc Order GIAO việc, bốn ô kết quả (Ngày HT,
 * Giờ thực tế, Số ngày HT, Kết quả) không thể có nội dung — nhưng chúng vẫn hiện ra thành
 * `dd/mm/yyyy`, `0`, `—`, `—` chen vào giữa bốn ô Order đang phải điền. Order cần điền 4 ô mà
 * form hiện 10.
 *
 * Tệ hơn là hai trong số đó CÒN MỜI THAO TÁC: "Ngày HT 3D" là ô nhập ngày cho sửa, nên đang
 * giao việc mà gõ được ngày hoàn tất cho việc chưa ai bắt đầu.
 *
 * Điều kiện gom về một hàm để bố cục và nhãn cùng đọc một nguồn — nếu mỗi chỗ tự viết `view &&
 * ...` thì sẽ có ngày tiêu đề khối hiện mà ruột trống, hoặc ngược lại.
 */
export function hasDesign3DResult(params: {
  /** Đã có lượt giao việc thật trên bảng chưa (view của sidebar). */
  hasAssignment: boolean;
  /** Ngày hoàn tất — chuỗi "YYYY-MM-DD" hoặc rỗng. */
  completedYmd?: string | null;
  /** Nhãn kết quả KPI do server chốt. */
  ketQuaLabel?: string | null;
  minutes: number | null;
}): boolean {
  if (!params.hasAssignment) return false;
  return !!params.completedYmd?.trim() || !!params.ketQuaLabel?.trim() || params.minutes != null;
}

/** Chú thích dưới ô "Giờ thực tế" — nói rõ người đọc đang xem số của ai. */
export function actualMinutesHint(source: ActualMinutesSource): string {
  switch (source) {
    case "SYSTEM":
      return "Hệ thống tự đo từ lúc NV nhận việc đến lúc gửi kết quả (chỉ tính giờ làm việc)";
    case "MANUAL":
      return "Đã sửa tay — đang dùng số này thay cho số hệ thống đo";
    default:
      return "Hệ thống tự ghi khi NV 3D gửi kết quả";
  }
}
