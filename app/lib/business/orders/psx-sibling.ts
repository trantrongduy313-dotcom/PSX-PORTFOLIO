import { stripVersionSuffix, versionOf } from "@/app/lib/business/order-helpers";

// ─── "MO này đã có bản anh em bên PSX chưa" ───────────────────────────────────
//
// Luật này TỪNG chỉ sống trong route danh sách đơn hàng, nên bảng biết còn sidebar thì không:
// người ở PTK mở một MO đã chuyển sang sản xuất và không có gì nói cho họ biết — họ sửa, tưởng
// mình đang sửa cái đang chạy ngoài xưởng. Gom về đây để hai màn hỏi CÙNG một câu.
//
// Tách phần THUẦN ra khỏi truy vấn: hai route nạp dữ liệu theo hai cách khác nhau (danh sách gom
// hàng loạt, sidebar chỉ một đơn) nhưng LUẬT CHỌN phải y hệt. Chép luật sang chỗ thứ hai là hẹn
// ngày chúng lệch nhau — đúng lúc ai đó đổi quy tắc đánh số phiên bản.
//
// File THUẦN: không prisma, không React.

/**
 * Bản PSX này còn HIỆU LỰC không?
 *
 * ⚠️ TÁCH RA VÌ CÙNG MỘT CÂU HỎI ĐANG ĐƯỢC TRẢ LỜI KHÁC NHAU Ở HAI NƠI.
 *
 * Luật số 2 dưới đây nói: bản PSX đã HUỶ không còn là "đang ở PSX". Nhưng phép kiểm trùng MO ở
 * `promote/route.ts` KHÔNG loại bản huỷ — nó chỉ lọc `zone: MASTER_HUB, deletedAt: null`. Hệ quả
 * thật, đã gặp trên production:
 *
 *     MO 25.32658.5 bị huỷ với lý do "sai phiên bản", vẫn nằm bên PSX.
 *     → nó CHẶN việc chuyển xưởng của 25.32658_4.
 *     → tức MỘT BẢN ĐÃ BỊ TUYÊN LÀ SAI đang chặn bản đúng.
 *
 * Huy hiệu thì loại bản huỷ, chốt chặn thì không. Hai nơi hỏi cùng một câu, trả lời trái nhau —
 * và người dùng chỉ thấy cái chặn, không thấy vì sao.
 *
 * Bản HOÀN TẤT thì VẪN tính là còn hiệu lực: nó đã được sản xuất thật, và đó chính là lúc cần
 * cảnh báo nhất để không làm trùng.
 */
export function isLivePsxItem(it: { itemStatus: string | null; orderStatus: string }): boolean {
  return (it.itemStatus ?? it.orderStatus) !== "CANCELLED";
}

/** Một dòng OrderItem đang ở PSX, đủ để xét xem nó có phải bản anh em không. */
export type PsxCandidate = {
  moNumber: string | null;
  /** Trạng thái riêng của MO; null thì ăn theo trạng thái đơn. */
  itemStatus: string | null;
  orderStatus: string;
  orderNumber: string;
};

export type PsxSibling = { orderNumber: string; status: string; version: number };

/**
 * Với mỗi "họ MO" (phần gốc sau khi bỏ hậu tố phiên bản), bản PSX nào là bản đại diện.
 *
 * BA LUẬT, mỗi luật bịt một lỗi đã gặp:
 *
 *   1. Đối chiếu lại bằng `stripVersionSuffix`, KHÔNG tin `startsWith` của truy vấn. Truy vấn
 *      dùng `startsWith` để lọc thô cho nhanh, nhưng "26.1234" cũng khớp nhầm "26.12345".
 *
 *   2. Bản PSX đã HUỶ không còn là "đang ở PSX". Không loại nó thì sau khi huỷ bản cũ và tạo
 *      MO mới, huy hiệu vẫn hiện — báo một thứ không còn tồn tại.
 *      Bản HOÀN TẤT thì VẪN tính: nó đã được sản xuất thật, và đó chính là lúc cần cảnh báo
 *      nhất để không làm trùng.
 *
 *   3. Nhiều bản cùng họ thì lấy PHIÊN BẢN CAO NHẤT — bản mới nhất là bản đang có hiệu lực.
 */
export function psxSiblingByMoBase(
  candidates: readonly PsxCandidate[],
  moBases: ReadonlySet<string>,
): Map<string, PsxSibling> {
  const byBase = new Map<string, PsxSibling>();
  for (const it of candidates) {
    if (!it.moNumber) continue;
    const base = stripVersionSuffix(it.moNumber);
    if (!moBases.has(base)) continue;
    if (!isLivePsxItem(it)) continue;   // luật 2 — xem isLivePsxItem
    const version = versionOf(it.moNumber);
    const cur = byBase.get(base);
    if (!cur || version > cur.version) {
      byBase.set(base, { orderNumber: it.orderNumber, status: it.orderStatus, version });
    }
  }
  return byBase;
}

/**
 * Bản PSX anh em của MỘT dòng — null nếu không có.
 *
 * ⚠️ MO đang Ở PSX thì KHÔNG tự gắn cờ cho chính nó. Thiếu chốt này thì mọi MO bên PSX đều hiện
 * "đã chuyển sang PSX", tức một câu đúng nghĩa đen nhưng vô nghĩa với người đọc.
 */
export function psxSiblingOf(
  item: { moNumber: string | null | undefined; zone: string | null | undefined },
  byBase: ReadonlyMap<string, PsxSibling>,
): PsxSibling | null {
  if (!item.moNumber) return null;
  if (item.zone === "MASTER_HUB") return null;
  return byBase.get(stripVersionSuffix(item.moNumber)) ?? null;
}
