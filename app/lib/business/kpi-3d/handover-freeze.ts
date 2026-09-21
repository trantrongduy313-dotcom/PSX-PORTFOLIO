import "server-only";

// ─── CHỐT giờ của lượt cũ khi đổi người — MỘT luật, MỘT chỗ ──────────────────
//
// ⚠️ MODULE NÀY TỒN TẠI VÌ CÙNG MỘT LUẬT ĐANG ĐƯỢC CẦN Ở HAI ĐƯỜNG, và một trong hai đường
// KHÔNG HỀ CÓ NÓ.
//
// Có hai cửa đổi người thiết kế:
//
//   · route reassign  — làm ĐÚNG: chốt giờ, đóng khoảng dừng, ghi reassignedAt, hỏi kpiCounted.
//   · đường lưu form  — chỉ ghi `status: "REASSIGNED"` và KHÔNG GÌ KHÁC.
//
// Hệ quả thật của đường thứ hai:
//
//   1. KHÔNG chốt giờ → con số của người cũ vẫn được SUY RA mỗi lần hiển thị, đo từ lúc nhận
//      việc tới "bây giờ". Tức giờ của người đã rời đơn còn PHÌNH RA theo thời gian NGƯỜI MỚI
//      làm. Càng để lâu con số càng sai, và không ai bấm gì cả.
//
//   2. KHÔNG có `reassignedAt` → báo cáo đọc `isReassignedAway = reassignedAt != null` thành
//      false, nên lượt đã bị người khác tiếp quản lại rơi vào nhánh "đơn chờ buông" (cảnh báo
//      dành cho việc giao rồi mà không ai đụng tới), và `donChuaHT` KHÔNG được trừ — người cũ
//      gánh vĩnh viễn một đơn chưa hoàn thành mà họ không còn cách nào hoàn thành.
//
//   3. Khoảng tạm dừng còn mở KHÔNG được đóng → lượt đã đóng vẫn hiện "đang tạm dừng" mãi mãi
//      ở mọi màn hình đọc theo `resumedAt = null`.
//
// VÌ SAO KHÔNG CHÉP ĐOẠN CODE SANG: phép đo này có ba nhánh và một cái bẫy (xem dưới). Hai bản
// chép tay của một luật tính LƯƠNG thì không có cách nào biết chúng còn khớp nhau, và lần lệch
// đầu tiên là hai màn hình nói hai con số khác nhau về tiền của một người.

import { alreadyCreditedMinutes } from "@/app/lib/business/kpi-3d/hours-ledger";
import { workedMinutesUntil } from "@/app/lib/business/kpi-3d/pause";
import { freezeActualMinutes } from "@/app/lib/business/kpi-3d/review";

type WorkedParams = Parameters<typeof workedMinutesUntil>[0];
type LedgerCheckpoint = Parameters<typeof alreadyCreditedMinutes>[0][number];

/**
 * Khoảng tạm dừng, ở mức thông tin mà phép đo cần.
 *
 * GIAO của hai kiểu, không phải một trong hai: cùng một mảng `pauses` được đưa qua CẢ
 * `workedMinutesUntil` (cần mốc dừng/mở) và `alreadyCreditedMinutes` (cần số phút đã ghi công).
 * Lấy kiểu suy ra TỪ CHÍNH hai hàm đó, không khai lại bằng tay — khai lại là thêm một bản chép
 * nữa của cùng một sự thật.
 */
export type HandoverPause = WorkedParams["pauses"][number] & LedgerCheckpoint;

export type HandoverFreezeInput = {
  actualMinutes: number | null;
  completedAt: Date | null;
  acknowledgedAt: Date | null;
  assignedAt: Date;
  calendar?: WorkedParams["calendar"];
  pauses: readonly HandoverPause[];
  /** Mốc "bây giờ" của thao tác — truyền tay để test được, và để hai đường dùng chung một mốc. */
  now: Date;
};

/**
 * Số phút PHẢI ghi vào `actualMinutes` của lượt cũ khi nó bị đổi người.
 * Trả về null nghĩa là không có gì để chốt (đừng ghi đè).
 *
 * ⚠️ CÁI BẪY: `freezeActualMinutes` có dòng `if (!completedAt) return null`. Hợp lý cho luồng
 * duyệt (chưa nộp thì chưa có gì để chốt), nhưng SAI ở đây — bị lấy đơn GIỮA LÚC ĐANG LÀM là
 * trường hợp phổ biến nhất của việc đổi người, và khi đó lượt không bao giờ có `completedAt`.
 * Chỉ dựa vào hàm đó thì người cũ nhận 0 giờ, và nút "Có tính KPI" thành vô nghĩa về mặt giờ.
 *
 * Nên ca chưa nộp đi đường riêng: lấy mốc đã chốt ở lần tạm dừng gần nhất, không có thì đo tại
 * đây. Cả hai đường đều đi qua ĐÚNG phép đo mà hộp Tạm dừng dùng, nên hai con số không lệch.
 */
export function freezeMinutesOnHandover(input: HandoverFreezeInput): number | null {
  const frozen = freezeActualMinutes({
    actualMinutes: input.actualMinutes,
    completedAt: input.completedAt,
    acknowledgedAt: input.acknowledgedAt,
    assignedAt: input.assignedAt,
    calendar: input.calendar,
    pauses: input.pauses,
  });
  if (frozen != null) return frozen;
  if (input.completedAt) return null;

  return (
    alreadyCreditedMinutes(input.pauses) ||
    workedMinutesUntil({
      assignedAt: input.assignedAt,
      acknowledgedAt: input.acknowledgedAt,
      until: input.now,
      pauses: input.pauses,
      calendar: input.calendar,
    })
  );
}

/**
 * Phần dữ liệu PHẢI ghi lên lượt cũ để nó thật sự "đã đóng vì đổi người".
 *
 * Dùng cho ĐƯỜNG LƯU FORM (không có hộp thoại). CỐ Ý KHÔNG ghi `reviewStatus` / `reviewedAt`:
 * ở đường này KHÔNG có ai kiểm kết quả cả, nên đóng dấu một phán quyết kiểm là ghi lại một
 * việc chưa từng xảy ra. Route reassign vẫn ghi các trường đó, vì ở đó có người thật bấm.
 *
 * `kpiCounted` để MẶC ĐỊNH true, không phải false: đường này không có hộp thoại nên không ai
 * quyết định gì. Không tính công cho người ta khi CHƯA AI quyết định là lặng lẽ lấy đi phần
 * lương đã làm — sai theo hướng đó tệ hơn hẳn sai theo hướng tính thừa, vì tính thừa còn nhìn
 * thấy được ở báo cáo, còn tính thiếu thì không ai biết mà khiếu nại.
 */
export function handoverClosureData(params: {
  frozenMinutes: number | null;
  now: Date;
}): Record<string, unknown> {
  return {
    status: "REASSIGNED",
    // Mốc này là thứ báo cáo dùng để biết lượt đã bị tiếp quản (isReassignedAway). Thiếu nó là
    // toàn bộ lỗi số 2 ở đầu file.
    //
    // CHỈ ghi cho các lần đổi người TỪ NAY: những dòng lịch sử đã đóng bằng đường cũ vẫn để
    // null, nên số của các tháng đã chốt sổ KHÔNG đổi. Sửa hướng đi tới, không viết lại quá khứ.
    reassignedAt: params.now,
    kpiCounted: true,
    ...(params.frozenMinutes != null && params.frozenMinutes > 0
      ? { actualMinutes: params.frozenMinutes }
      : {}),
  };
}
