import { activeAttempts, buildAttemptChains, type AttemptInput } from "@/app/lib/business/kpi-3d/attempt-chain";

// ─── Khối "Nhân viên 3D #N" trên sidebar: lượt nào được một khối riêng ────────
//
// LỖ HỔNG ĐANG BỊT: danh sách khối do JSON extraData quyết định (`design` = slot 0,
// `designers[]` = slot 1+), còn lượt giao việc thì nằm ở bảng. Khi hệ thống TỰ tạo một lượt mới
// (mở lại sau tạm dừng, hoặc không duyệt → đổi người), JSON không hề biết — nên:
//
//   · Số khối KHÔNG tăng. Mở lại đơn xong vẫn chỉ một khối.
//   · Khối #1 IM LẶNG chuyển sang hiển thị lượt mới, vì nó không ghim lượt nào cả — panel chỉ
//     `activeAttempts(...).find(orderItemId === activeItemId)`. Kết quả và số giờ đã chốt của
//     lần 1 không còn ô nào đọc được, dù vẫn nằm nguyên trong bảng.
//
// Người dùng cần đúng điều ngược lại: mở lại sau tạm dừng thì PHẢI có một khối mới, vì lần tiếp
// theo có thể thuộc THÁNG khác và ngân sách giờ khác — tức KPI khác hẳn.
//
// ─── VÌ SAO KHÔNG MIRROR LỊCH SỬ VÀO JSON ───────────────────────────────────
//
// Cách rẻ hơn là để route mở-lại ghi thêm một slot vào JSON. Nhưng dự án đã có sẵn một dòng cảnh
// báo đúng chuyện này — "Hai nơi lưu cùng một sự thật thì sớm muộn lệch" — và mỗi lượt sẽ tồn
// tại ở hai nơi, không nơi nào biết mình sai khi lệch.
//
// Nên: LƯỢT ĐÃ ĐÓNG dựng khối CHỈ ĐỌC đọc thẳng từ bảng; JSON giữ đúng vai còn lại là ô nhập của
// các lượt ĐANG chạy. Không có gì để lệch vì mỗi bên trả lời một câu hỏi khác nhau.
//
// File THUẦN: không prisma, không React.

/** Trạng thái của lượt đã đóng — quyết định nhãn của khối chỉ đọc. */
const CLOSED_STATUSES = new Set(["REASSIGNED", "CANCELLED"]);

export type ClosedAttemptBlock<T extends AttemptInput> = {
  attempt: T;
  /** Số hiệu khối — cùng dãy với các khối đang chạy, không đánh số riêng. */
  blockNo: number;
  /**
   * Vì sao lượt này đã đóng — LẤY TỪ LƯỢT KẾ TIẾP, không từ chính nó.
   *
   * `continuationReason` trả lời "vì sao CÓ lượt này", nên lý do lượt 1 bị đóng nằm ở lượt 2.
   * Đọc trên chính nó sẽ luôn ra null cho lượt đầu chuỗi — tức khối chỉ đọc không bao giờ nói
   * được vì sao nó đã đóng, đúng thứ người duyệt cần biết nhất.
   *
   * null = đã đóng nhưng không có lượt kế tiếp (VD đơn bị huỷ hẳn).
   */
  closedReason: AttemptInput["continuationReason"];
};

/**
 * Các lượt ĐÃ ĐÓNG xứng đáng có một khối riêng.
 *
 * KHÔNG phải mọi lượt đã đóng: một lượt bị bác ngay khi vừa giao (không duyệt → đổi người, chưa
 * ai làm gì) thì thêm một khối chỉ làm panel dài ra mà không nói thêm điều gì — chính là mớ lộn
 * xộn mà activeAttempts() đã dọn đi. Điều kiện là lượt đó có THỨ GÌ ĐỂ ĐỐI CHIẾU KPI:
 *
 *   · đã đóng dấu giờ thực tế (`actualMinutes > 0`), hoặc
 *   · đã hoàn tất (`completedAt`).
 *
 * Mở lại sau tạm dừng luôn thoả điều kiện đầu — route resume-continuation đóng băng số giờ đã
 * chốt vào `actualMinutes` của lượt cũ.
 *
 * ⚠️ CANCELLED cũng vào đây nếu đã có giờ: đơn bị huỷ giữa lúc đang làm thì công của nhân viên
 * vẫn là công thật, và cuối tháng vẫn phải đối chiếu được.
 */
export function closedAttemptBlocks<T extends AttemptInput>(
  rows: readonly T[],
): ClosedAttemptBlock<T>[] {
  // Đi theo CHUỖI, không theo thứ tự thô: một MO có thể có nhiều chuỗi song song (hai NV cùng
  // làm), và số hiệu khối phải khớp thứ tự các chuỗi đó — xem buildAttemptChains.
  const chains = buildAttemptChains(rows);

  const out: ClosedAttemptBlock<T>[] = [];
  let blockNo = 0;
  for (const chain of chains) {
    for (let i = 0; i < chain.length; i += 1) {
      const att = chain[i];
      if (!CLOSED_STATUSES.has(att.status)) continue;
      const hasHours = typeof att.actualMinutes === "number" && att.actualMinutes > 0;
      if (!hasHours && !att.completedAt) continue;
      blockNo += 1;
      // `att` là bản sao có thêm attemptNo/isActive; trả về DÒNG GỐC để không mất trường nào mà
      // AttemptInput không khai (deadlineAt, pauses…).
      const original = rows.find((r) => r.id === att.id) as T;
      out.push({ attempt: original, blockNo, closedReason: chain[i + 1]?.continuationReason ?? null });
    }
  }
  return out;
}

/**
 * Số hiệu khối đầu tiên dành cho các khối ĐANG CHẠY (ô nhập).
 *
 * Các khối chỉ đọc chiếm dãy số trước, nên khối JSON slot 0 không còn luôn là "#1". Đánh số lại
 * ở đây thay vì `index + 1` rải rác trong JSX: hai chỗ tự cộng sẽ có ngày lệch nhau và panel
 * hiện hai khối cùng mang số #2.
 */
export function firstEditableBlockNo(closedCount: number): number {
  return closedCount + 1;
}

/** Lượt đang chạy — dùng lại luật của attempt-chain, không khai lần hai. */
export { activeAttempts };
