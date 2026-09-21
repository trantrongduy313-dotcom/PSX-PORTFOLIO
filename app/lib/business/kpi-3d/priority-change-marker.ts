// ═══════════════════════════════════════════════════════════════════════════
// DÒNG NÀO VỪA BỊ ĐỔI ƯU TIÊN THIẾT KẾ
//
// VẤN ĐỀ: màn 3D tự kéo lại dữ liệu khi có gì đổi. Ưu tiên đổi thì chip đổi và dòng NHẢY VỊ TRÍ
// (ưu tiên là tầng 3 của thứ tự hàng đợi) — cả hai xảy ra lặng lẽ. Người đang nhìn màn hình thấy
// bảng tự xáo, không biết đơn nào vừa được nâng.
//
// ⚠️ VÌ SAO KHÔNG DÙNG NHÃN HẾT HẠN THEO THỜI GIAN ("đổi trong 2 giờ qua"):
//
// Chính queue-order.ts đã loại phương án đó khi làm huy hiệu MỚI — "mốc thời gian tự hết hạn dù
// nhân viên chưa hề thấy, nên ai nghỉ hai ngày quay lại là dấu đã biến mất". Một dấu 2 giờ sẽ
// tắt trong lúc người ta đi ăn trưa. Dấu phải do HÀNH ĐỘNG của người dùng xoá, không do đồng hồ.
//
// ⚠️ VÌ SAO KHÔNG THÊM CỘT `design3DPriorityChangedAt` VÀO DB:
//
// Nó đưa ta về đúng cái bẫy trên (một mốc thời gian phải tự già đi), và đổi lấy một cột phải giữ
// cho đúng mãi mãi. Cách này so BẢN TRƯỚC với BẢN SAU ngay ở trình duyệt — react-query đã giữ sẵn
// bản trước, nên không thêm cột, không thêm truy vấn, không thêm gì để hỏng.
//
// GIỚI HẠN, PHẢI BIẾT: chỉ thấy được khi người dùng ĐANG MỞ TAB lúc thay đổi xảy ra. Ai mở màn
// lúc 8h sẽ không thấy dấu cho thay đổi lúc 7h. Người đó đã có tin Google Chat — kênh dành riêng
// cho người không nhìn màn hình. Hai thứ bù cho nhau, cố ý không chồng nhau.
//
// File THUẦN: không React, không prisma.
// ═══════════════════════════════════════════════════════════════════════════

import { toDesignPriority } from "@/app/lib/business/kpi-3d/design-priority";

export type PriorityRow = {
  /** Id của LƯỢT GIAO VIỆC — khoá của dòng trên bảng. */
  id: string;
  orderItem?: { design3DPriorityCode?: string | null } | null;
};

/** Bản ghi nhớ "lần trước mỗi dòng mang bậc nào". */
export type PrioritySnapshot = ReadonlyMap<string, string>;

/** Chụp lại bậc ưu tiên hiện tại của từng dòng để lần sau còn so. */
export function snapshotPriorities(rows: readonly PriorityRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of rows) map.set(r.id, toDesignPriority(r.orderItem?.design3DPriorityCode));
  return map;
}

/**
 * Những dòng có bậc ưu tiên KHÁC so với lần chụp trước.
 *
 * DÒNG MỚI XUẤT HIỆN KHÔNG TÍNH LÀ "VỪA ĐỔI", kể cả khi nó là UT1. Nó chưa từng có mặt nên không
 * có gì để so — và nó đã có huy hiệu MỚI của riêng nó. Đánh dấu cả hai lên cùng một dòng là dựng
 * lại đúng cái lộn xộn mà việc tách cột này vừa dọn đi.
 *
 * Chuẩn hoá qua `toDesignPriority` ở cả hai phía: dữ liệu cũ để null còn bản mới ghi "Normal" là
 * cùng một bậc — so chuỗi thô sẽ báo "vừa đổi" cho một thứ không hề đổi.
 */
export function changedPriorityRowIds(
  prev: PrioritySnapshot | null,
  rows: readonly PriorityRow[],
): Set<string> {
  const changed = new Set<string>();
  // Chưa có bản trước = lần tải đầu tiên. Không có gì "vừa đổi" — đánh dấu cả bảng lúc mở màn
  // thì dấu này mất sạch ý nghĩa ngay lần dùng đầu.
  if (!prev) return changed;

  for (const r of rows) {
    const before = prev.get(r.id);
    if (before === undefined) continue; // dòng mới — xem chú thích trên
    if (before !== toDesignPriority(r.orderItem?.design3DPriorityCode)) changed.add(r.id);
  }
  return changed;
}

/**
 * Gộp dấu mới vào dấu đang có.
 *
 * CỘNG DỒN chứ không thay thế: hai lần đổi ưu tiên cách nhau 30 giây, mà người dùng chưa xem lần
 * nào — thay thế thì dấu của lần đầu biến mất và họ chỉ còn thấy một trong hai.
 */
export function mergePriorityMarks(current: ReadonlySet<string>, incoming: ReadonlySet<string>): Set<string> {
  return new Set([...current, ...incoming]);
}
