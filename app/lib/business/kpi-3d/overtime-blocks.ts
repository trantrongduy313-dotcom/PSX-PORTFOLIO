import { toVnYmd } from "@/app/lib/utils/vn-date";

// ─── TĂNG CA ĐÃ DUYỆT HIỆN RA NHƯ MỘT KHỐI RIÊNG ─────────────────────────────
//
// LỖ HỔNG ĐANG BỊT: trạng thái APPROVED của một khai báo tăng ca xưa nay là NGÕ CỤT — không một
// chỗ nào trong hệ thống đọc số giờ đã duyệt. Duyệt xong là hết, giờ công đó không đi tới đâu.
//
// ─── VÌ SAO KHÔNG BIẾN NÓ THÀNH MỘT LƯỢT GIAO VIỆC ──────────────────────────
//
// Cách "tiện" là tạo thêm một Design3DAssignment cho mỗi lần tăng ca: nó tự hiện ở màn Việc thiết
// kế, tự thành một khối trong tab Thiết kế, báo cáo tự cộng. Nhưng nó sai ở bốn chỗ, và ba trong
// số đó đâm thẳng vào các chốt chặn KPI vừa dựng:
//
//   1. Lượt giao việc BẮT BUỘC có deadline và phán quyết Đúng/Trễ hạn. Tăng ca không có hạn nào
//      để mà trễ — gán một cái deadline cho nó là bịa ra một phán quyết.
//   2. Các thẻ đếm (Tổng việc / Đang làm / Quá hạn / Chờ kiểm) sẽ bị bơm số cho một thứ không
//      phải là việc được giao.
//   3. Luật "ĐÃ DUYỆT LÀ CHỐT" (approved-lock.ts) cấm tạo lượt mới trên MO đã duyệt — mà nghiệp
//      vụ ở đây lại đòi khai tăng ca CHO CẢ ĐƠN ĐÃ HOÀN TẤT. Hai điều không thể cùng đúng.
//   4. Luật "một người không nhận hai lượt CÙNG LÚC" (usedDesignerIds) sẽ chặn ngay lần đầu.
//
// Nói cách khác: tăng ca là MỘT LOẠI KHÁC, nên mô hình hoá nó thành cùng một loại là sai từ gốc.
// Yêu cầu nghiệp vụ nói đúng điều đó: "không được cộng vào một block".
//
// File THUẦN: không prisma, không React.

/** Một khai báo tăng ca ĐÃ DUYỆT, đủ để dựng khối hiển thị. */
export type ApprovedOvertime = {
  id: string;
  /** MO mà nó thuộc về — suy từ lượt giao việc, KHÔNG phải người dùng chọn lại. */
  orderItemId: string;
  designer3DId: string;
  designerName: string | null;
  startAt: Date | string;
  endAt: Date | string;
  minutes: number;
  reason: string | null;
  approvedByName: string | null;
};

export type OvertimeBlock = {
  id: string;
  designerName: string;
  startAt: Date;
  endAt: Date;
  minutes: number;
  reason: string | null;
  approvedByName: string | null;
};

const asDate = (v: Date | string): Date => (v instanceof Date ? v : new Date(v));
const usable = (d: Date) => Number.isFinite(d.getTime());

/**
 * Khối tăng ca của MỘT MO, cũ trước mới sau.
 *
 * ⚠️ CHỈ NHẬN BẢN ĐÃ DUYỆT. Chỗ gọi phải lọc trước (hoặc truy vấn chỉ lấy APPROVED) — hàm này
 * không tự lọc vì nó không nhìn thấy `status`, và đó là CÓ Ý: nếu nhận cả bản chờ duyệt thì nhân
 * viên tự dựng được một khối trên màn hình của quản lý chỉ bằng cách bấm khai báo, tức tự cấp cho
 * mình một dòng "đã làm thêm 2 giờ" mà chưa ai đồng ý.
 */
export function overtimeBlocksForItem(
  rows: readonly ApprovedOvertime[],
  orderItemId: string,
): OvertimeBlock[] {
  const out: OvertimeBlock[] = [];
  for (const r of rows) {
    if (r.orderItemId !== orderItemId) continue;
    const startAt = asDate(r.startAt);
    const endAt = asDate(r.endAt);
    // Mốc hỏng thì BỎ QUA, không dựng một khối nói dối về thời gian.
    if (!usable(startAt) || !usable(endAt)) continue;
    out.push({
      id: r.id,
      designerName: r.designerName ?? "(chưa rõ nhân viên)",
      startAt,
      endAt,
      minutes: r.minutes,
      reason: r.reason,
      approvedByName: r.approvedByName,
    });
  }
  return out.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/** Tổng phút tăng ca của một MO — để hiện gọn khi có nhiều lần. */
export function totalOvertimeMinutes(blocks: readonly OvertimeBlock[]): number {
  return blocks.reduce((sum, b) => sum + (Number.isFinite(b.minutes) ? b.minutes : 0), 0);
}

/**
 * Giờ tăng ca chia theo THÁNG CỦA MỐC BẮT ĐẦU — không phải tháng đơn hoàn tất.
 *
 * VÌ SAO: đơn có thể hoàn tất tháng 1 rồi tháng 3 mới có người khai tăng ca cho nó (nghiệp vụ cho
 * phép khai lùi, vì đằng nào cũng phải qua tay người duyệt). Cộng vào tháng hoàn tất thì một tháng
 * đã chốt sổ tự nhiên to ra; cộng vào tháng DUYỆT thì con số nhảy theo lúc người quản lý rảnh tay.
 * Chỉ mốc BẮT ĐẦU LÀM là bất biến và đúng với thực tế công sức.
 *
 * Cùng nguyên tắc với sổ giờ của lượt giao việc (hours-ledger.ts).
 */
export function overtimeMinutesByMonth(
  rows: readonly ApprovedOvertime[],
): Map<string, number> {
  const byMonth = new Map<string, number>();
  for (const r of rows) {
    const startAt = asDate(r.startAt);
    if (!usable(startAt)) continue;
    if (!Number.isFinite(r.minutes) || r.minutes <= 0) continue;
    const month = toVnYmd(startAt).slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + r.minutes);
  }
  return byMonth;
}

/** Giờ tăng ca của từng nhân viên trong MỘT tháng ("YYYY-MM"). */
export function overtimeMinutesByDesigner(
  rows: readonly ApprovedOvertime[],
  month: string,
): Map<string, number> {
  const byDesigner = new Map<string, number>();
  for (const r of rows) {
    const startAt = asDate(r.startAt);
    if (!usable(startAt)) continue;
    if (!Number.isFinite(r.minutes) || r.minutes <= 0) continue;
    if (toVnYmd(startAt).slice(0, 7) !== month) continue;
    byDesigner.set(r.designer3DId, (byDesigner.get(r.designer3DId) ?? 0) + r.minutes);
  }
  return byDesigner;
}
