// ─── Cùng một MO, hai phiên bản cùng ở PSX ───────────────────────────────────
//
// ⚠️ MODULE NÀY TỒN TẠI VÌ MỘT CHỐT CHẶN ĐANG KHOÁ SAI, và vì việc mở nó ra đòi một thứ khác
// phải được làm TRƯỚC.
//
// LỖI ĐÃ GẶP TRÊN PRODUCTION: `25.32658.5` bị huỷ với lý do "sai phiên bản" nhưng vẫn nằm bên
// PSX, và nó CHẶN việc chuyển xưởng của `25.32658_4`. Một bản đã bị tuyên là SAI đang chặn bản
// đúng. Gốc: phép kiểm trùng ở promote/route.ts lọc `zone: MASTER_HUB, deletedAt: null` mà KHÔNG
// loại trạng thái HUỶ — trong khi huy hiệu "Đã ở PSX" (psx-sibling.ts luật 2) thì có loại.
// Hai nơi hỏi cùng một câu, trả lời trái nhau; người dùng chỉ thấy cái chặn.
//
// VÀ NGHIỆP VỤ MUỐN NÓ LÀ CẢNH BÁO, KHÔNG PHẢI KHOÁ: cùng một MO ở hai phiên bản vẫn có thể cùng
// nằm ở xưởng, và người điều hành cần được QUYẾT. Đúng học thuyết đã ghi ở psx-sibling.ts và ở
// commit "sidebar báo MO này đã chuyển sang PSX — chỉ báo, không khoá".
//
// ⚠️ NHƯNG MỞ CỬA THÌ PHẢI BẬT ĐÈN TRƯỚC. `psxSiblingOf` có dòng "MO đang Ở PSX thì KHÔNG tự gắn
// cờ cho chính nó" — nên khi CẢ HAI phiên bản đã vào PSX thì KHÔNG bản nào hiện huy hiệu. Người
// bấm chuyển xưởng thấy hộp thoại rồi bấm qua; XƯỞNG — nơi thật sự làm ra sản phẩm — không thấy
// gì cả. Đổi chặn thành cảnh báo mà không có dấu hiệu bền vững thì không giảm rủi ro, chỉ CHUYỂN
// nó từ người biết sang người không biết. Đó là lý do `duplicateInPsxOf` nằm trong file này.
//
// File THUẦN: không prisma, không React.

import { stripVersionSuffix, versionOf } from "@/app/lib/business/order-helpers";
import { isLivePsxItem } from "@/app/lib/business/orders/psx-sibling";

/**
 * Ai được tự quyết cho phép trùng MO ở PSX.
 *
 * CHỈ ADMIN/ORDER. Đây là quyết định điều hành ảnh hưởng tới XƯỞNG — hai phiên bản cùng một MO
 * nằm cạnh nhau trên sàn sản xuất — không phải thao tác thường ngày của người chuyển đơn.
 * Cùng nhóm role với REASSIGN_ASSIGNMENT ở kpi-3d/permissions.ts, và cùng lý do.
 */
// ⚠️ KHÔNG dùng ở promote/route.ts: route đó đã chặn cả cửa cho ADMIN/ORDER ngay đầu hàm, nên gọi
// lại ở trong là để lại một nhánh KHÔNG BAO GIỜ CHẠY. Hàm này dành cho CLIENT — quyết định có hiện
// nút "Vẫn chuyển" hay không — và cho bất kỳ đường gọi mới về sau không có sẵn rào chắn ấy.
export function canAllowDuplicateMo(role: string | undefined): boolean {
  return role === "ADMIN" || role === "ORDER";
}

export type DuplicateMoInfo = {
  existingMoNumber: string;
  existingOrderNumber: string;
};

/**
 * Câu hỏi xác nhận. Phải NÊU TÊN cả MO và đơn: "có bản trùng" mà không nói bản nào thì người
 * dùng không có cách nào đi kiểm, và một hộp thoại không kiểm được thì chỉ còn cách bấm qua.
 */
export function duplicateMoConfirmText(info: DuplicateMoInfo): string {
  return (
    `MO# ${info.existingMoNumber} đang ở PSX (đơn hàng ${info.existingOrderNumber}). ` +
    `Chuyển tiếp sẽ có HAI phiên bản của cùng một MO cùng nằm ở xưởng — hãy chắc rằng xưởng biết ` +
    `phải làm bản nào.`
  );
}

/** Câu từ chối khi người bấm không có quyền tự quyết. Phải CHỈ ĐƯỜNG, không chỉ nói "không được". */
export function duplicateMoForbiddenText(info: DuplicateMoInfo): string {
  return (
    `MO# ${info.existingMoNumber} đang ở PSX (đơn hàng ${info.existingOrderNumber}). ` +
    `Chỉ Admin/Đặt đơn được cho phép hai phiên bản cùng một MO ở xưởng. ` +
    `Hoặc nhờ họ xác nhận, hoặc lùi đơn ${info.existingOrderNumber} về PTK trước.`
  );
}

/** Một dòng OrderItem ở PSX, đủ để xét trùng trong nội bộ PSX. */
export type PsxRow = {
  moNumber: string | null;
  itemStatus: string | null;
  orderStatus: string;
  orderNumber: string;
  zone: string | null;
};

export type DuplicateInPsx = {
  /** Số phiên bản CÒN HIỆU LỰC của cùng họ MO đang ở PSX (gồm cả chính nó). */
  count: number;
  /** Các phiên bản khác (không gồm chính nó), để hiện ra cho người đọc kiểm được. */
  others: { orderNumber: string; moNumber: string; version: number }[];
};

/**
 * Với MỘT dòng đang ở PSX: họ MO của nó còn phiên bản nào khác cũng đang ở PSX?
 *
 * ⚠️ KHÁC HẲN `psxSiblingOf`, và đó là điểm chính. Hàm kia trả về null cho dòng đã ở MASTER_HUB
 * (đúng cho câu hỏi "PTK ơi, bản này đã xuống xưởng chưa"). Hàm này trả lời câu NGƯỢC LẠI —
 * "xưởng ơi, MO này có bản song song không" — nên nó CHỈ xét dòng đang ở PSX.
 *
 * Đối chiếu lại bằng `stripVersionSuffix`, KHÔNG tin `startsWith` của truy vấn: "26.1234" cũng
 * khớp nhầm "26.12345". Cùng luật 1 của psxSiblingByMoBase.
 */
export function duplicateInPsxOf(
  item: PsxRow,
  allPsxRows: readonly PsxRow[],
): DuplicateInPsx | null {
  if (!item.moNumber) return null;
  if (item.zone !== "MASTER_HUB") return null;
  if (!isLivePsxItem(item)) return null;

  const base = stripVersionSuffix(item.moNumber);

  const family = allPsxRows.filter(
    (r) =>
      r.moNumber != null &&
      r.zone === "MASTER_HUB" &&
      isLivePsxItem(r) &&
      stripVersionSuffix(r.moNumber) === base,
  );

  if (family.length < 2) return null;

  const others = family
    .filter((r) => r.moNumber !== item.moNumber)
    .map((r) => ({
      orderNumber: r.orderNumber,
      moNumber: r.moNumber!,
      version: versionOf(r.moNumber!),
    }))
    .sort((a, b) => a.version - b.version);

  // Cùng moNumber xuất hiện nhiều lần (dữ liệu hỏng) thì `others` rỗng dù family >= 2. Không có
  // gì để chỉ ra thì đừng hiện huy hiệu — một cảnh báo không nói được vấn đề ở đâu chỉ gây nhiễu.
  if (others.length === 0) return null;

  return { count: family.length, others };
}

/** Nhãn ngắn cho huy hiệu trên bảng PSX và sidebar. */
export function duplicateInPsxBadgeText(dup: DuplicateInPsx): string {
  const list = dup.others.map((o) => o.moNumber).join(", ");
  return `Trùng MO — còn ${list} ở PSX`;
}
