import { CARRIED_FROM_KEY } from "@/app/lib/business/kpi-3d/version-carryover";

// ─── Quyết định: MO nào cần tạo lượt giao việc 3D? ───────────────────────────
//
// VÌ SAO TÁCH RA: trước đây route quyết định bằng điều kiện
//     if (scopedItemId && isDesignOnlyUpdate)
// — tức là phụ thuộc vào việc CLIENT CÓ NHỚ GỬI trường `scopedItemId` hay không. Luồng lưu
// từ tab Thiết kế không gửi trường đó, nên toàn bộ việc tạo lượt giao việc bị bỏ qua âm thầm
// và tính năng chưa từng chạy đúng một lần nào qua giao diện thật.
//
// Nhưng mã MO VỐN ĐÃ NẰM TRONG DỮ LIỆU: extraData.perItem[<orderItemId>].design — khoá của
// object chính là mã MO. Server tự suy ra được, không cần client gửi thêm.
// Nguyên tắc: SUY RA TỪ DỮ LIỆU, KHÔNG BẮT CLIENT GỬI.
//
// File này CỐ Ý thuần (không import prisma, không "server-only") để test được trực tiếp —
// khác với các test cũ vốn CHÉP LẠI logic của route rồi kiểm tra bản chép đó.

/** Bốn trường bắt buộc để tạo được một lượt giao việc 3D. */
export type Design3DAssignmentFields = {
  designerName: string;
  groupName: string;
  assignedDate: string;
  assignedTime: string;
};

/**
 * Một khối giao việc 3D trong payload, kèm CHỖ NÓ NẰM để ghi bản vá về đúng vị trí.
 *
 * `slot` = 0  → khối gốc: perItem[id].tho3d + perItem[id].design (chỗ cũ, không đổi)
 * `slot` >= 1 → perItem[id].designers[slot - 1] (người thứ 2, 3… mới thêm)
 *
 * `assignmentId` là id lượt giao việc mà lần lưu TRƯỚC đã ghi ngược vào khối này. Có nó thì
 * khớp thẳng, không phải đoán theo tên — quan trọng khi một MO có nhiều người, vì đoán sai là
 * ghi KPI của người này sang người kia.
 */
export type Design3DBlock = Design3DAssignmentFields & {
  slot: number;
  assignmentId: string | null;
  /** Giờ thực tế Order nhập cho RIÊNG người này. null = chưa nhập. */
  actualHours: number | null;
  /**
   * Khối này được KẾ THỪA từ phiên bản nào (VD "26.42341_1"), null = không phải bản kế thừa.
   *
   * Tới được đây nghĩa là khối ĐÃ ĐỦ 4 TRƯỜNG, tức người dùng đã gõ mốc giao mới — cờ đã hết
   * nhiệm vụ và phải được xoá trong cùng lần lưu. Không xoá thì cảnh báo "chưa giao việc" còn
   * lại mãi trên một khối đã giao, và một cảnh báo sai là cách nhanh nhất để người dùng học
   * cách bỏ qua mọi cảnh báo.
   */
  carriedFromVersion: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Đọc khối giao việc 3D của MỘT MO. Trả null nếu chưa đủ 4 trường.
 *
 * Tên nhân viên ưu tiên lấy ở cấp MO (perItem[id].tho3d), rơi về gốc (extraData.tho3d) cho
 * dữ liệu cũ chưa tách theo MO.
 */
export function readDesign3DFields(
  extraData: Record<string, unknown> | null | undefined,
  orderItemId: string,
): Design3DAssignmentFields | null {
  const extra = asRecord(extraData);
  if (!extra) return null;

  const perItem = asRecord(extra.perItem);
  const itemData = perItem ? asRecord(perItem[orderItemId]) : null;
  if (!itemData) return null;

  const design = asRecord(itemData.design);
  if (!design) return null;

  const fields: Design3DAssignmentFields = {
    designerName: asText(itemData.tho3d) || asText(extra.tho3d),
    groupName: asText(design.phanNhom3D),
    assignedDate: asText(design.ngayGiao3D),
    assignedTime: asText(design.gioGiao3D),
  };

  const complete =
    fields.designerName && fields.groupName && fields.assignedDate && fields.assignedTime;
  return complete ? fields : null;
}

function asNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function blockFrom(
  raw: Record<string, unknown>,
  designerName: string,
  slot: number,
): Design3DBlock | null {
  const fields: Design3DAssignmentFields = {
    designerName,
    groupName: asText(raw.phanNhom3D),
    assignedDate: asText(raw.ngayGiao3D),
    assignedTime: asText(raw.gioGiao3D),
  };
  const complete =
    fields.designerName && fields.groupName && fields.assignedDate && fields.assignedTime;
  if (!complete) return null;

  return {
    ...fields,
    slot,
    assignmentId: asText(raw.kpi3DAssignmentId) || null,
    actualHours: asNumberOrNull(raw.gioThucTe),
    carriedFromVersion: asText(raw[CARRIED_FROM_KEY]) || null,
  };
}

/**
 * Đọc TẤT CẢ khối giao việc 3D của một MO — một MO có thể có nhiều NV 3D cùng làm.
 *
 * VÌ SAO KHÔNG NHÂN BẢN KHỐI GỐC: cách dễ nhất là chép người thứ nhất vào `designers[0]` rồi
 * coi mảng đó là nguồn duy nhất. Nhưng khi đó cùng một sự thật nằm ở hai chỗ, và mọi thứ đang
 * đọc `perItem[id].design` (báo cáo cũ, xuất Excel, dữ liệu lịch sử) sẽ phải theo dõi xem chỗ
 * nào mới đúng — đúng loại lỗi vừa mất cả buổi để gỡ ở khâu Nguội.
 *
 * Nên: khối gốc GIỮ NGUYÊN nghĩa là người thứ nhất (slot 0), mảng `designers` chỉ chứa người
 * thứ 2 trở đi. Không có bản sao nào cả. Dữ liệu cũ đọc ra đúng một khối, y như trước.
 *
 * Bỏ qua khối chưa điền đủ 4 trường — user đang nhập dở, không phải lỗi.
 */
export function readDesign3DBlocks(
  extraData: Record<string, unknown> | null | undefined,
  orderItemId: string,
): Design3DBlock[] {
  const extra = asRecord(extraData);
  if (!extra) return [];

  const perItem = asRecord(extra.perItem);
  const itemData = perItem ? asRecord(perItem[orderItemId]) : null;
  if (!itemData) return [];

  const out: Design3DBlock[] = [];

  const design = asRecord(itemData.design);
  if (design) {
    const name = asText(itemData.tho3d) || asText(extra.tho3d);
    const first = blockFrom(design, name, 0);
    if (first) out.push(first);
  }

  const extras = Array.isArray(itemData.designers) ? itemData.designers : [];
  extras.forEach((entry, index) => {
    const raw = asRecord(entry);
    if (!raw) return;
    const block = blockFrom(raw, asText(raw.tho3d), index + 1);
    if (block) out.push(block);
  });

  return out;
}

/**
 * Ghi bản vá của server (id lượt giao việc, số giờ KPI, deadline…) về ĐÚNG khối đã sinh ra nó.
 *
 * Đối xứng với readDesign3DBlocks: slot 0 ghi vào `design` gốc, slot >=1 ghi vào
 * `designers[slot-1]`. Đây là chỗ dễ sai nhất của cả tính năng — ghi lệch một slot là gán số
 * giờ KPI và deadline của người này sang người kia mà không có gì báo lỗi. Nên nó nằm ở module
 * thuần, test trực tiếp được, thay vì viết thẳng trong route (route không export được hàm).
 *
 * Trả về object MỚI, không sửa tại chỗ — `mergedExtra` trong route còn được dùng tiếp.
 */
export function applyDesign3DPatches(
  extraData: Record<string, unknown>,
  patchesByItem: Map<string, Array<{ slot: number } & Record<string, unknown>>>,
): Record<string, unknown> {
  if (patchesByItem.size === 0) return extraData;

  const perItem = { ...(asRecord(extraData.perItem) ?? {}) };

  for (const [itemId, patches] of patchesByItem) {
    const itemData = { ...(asRecord(perItem[itemId]) ?? {}) };
    const designers = Array.isArray(itemData.designers) ? [...itemData.designers] : [];

    for (const { slot, ...patch } of patches) {
      if (slot === 0) {
        itemData.design = { ...(asRecord(itemData.design) ?? {}), ...patch };
        continue;
      }
      const index = slot - 1;
      // Slot trỏ ra ngoài mảng nghĩa là payload và bản vá lệch nhau — bỏ qua còn hơn ghi bừa
      // vào một ô khác. Không xảy ra khi cả hai cùng đọc từ readDesign3DBlocks.
      if (index < 0 || index >= designers.length) continue;
      designers[index] = { ...(asRecord(designers[index]) ?? {}), ...patch };
    }

    if (designers.length > 0) itemData.designers = designers;
    perItem[itemId] = itemData;
  }

  return { ...extraData, perItem };
}

/** Một khối bị TỪ CHỐI vĩnh viễn — phải rút khỏi payload trước khi ghi. */
export type Design3DRejectedBlock = {
  slot: number;
  /**
   * Tên nhân viên cần TRẢ LẠI cho khối gốc (slot 0).
   *
   * Slot 0 là khối chính của MO — không xoá được, vì nó còn mang nhóm KPI, mốc giao, ghi chú…
   * Thứ bị từ chối chỉ là CÁI TÊN vừa đổi, nên trả tên cũ về là đủ. Không có tên cũ (khối gốc
   * vốn chưa gắn lượt nào) thì xoá trắng ô tên.
   */
  revertDesignerName?: string | null;
};

/**
 * RÚT các khối bị từ chối khỏi extraData, để JSON không lưu một thứ bảng không có.
 *
 * LỖI ĐANG SỬA: khi đồng bộ trả về BLOCKED, route vẫn ghi `extraData` như thường — nên sidebar
 * vẫn hiện khối "Nhân viên 3D #2" với người vừa chọn, kể cả sau khi tải lại trang, dù KHÔNG có
 * lượt giao việc nào được tạo. Người dùng thấy một cảnh báo rồi thấy dữ liệu vẫn nằm đó, và kết
 * luận hợp lý là "chắc nó vẫn lưu được". Đây đúng là hai nguồn sự thật lệch nhau: JSON nói có
 * người thứ hai, bảng nói không.
 *
 * ⚠️ CHỈ RÚT KHỐI BỊ TỪ CHỐI VĨNH VIỄN, không rút khối bị chặn vì THIẾU CẤU HÌNH. Hai loại chặn
 * khác nhau về bản chất:
 *
 *   THIẾU CẤU HÌNH (chưa bật nhóm KPI, chưa có lịch làm việc) — sẽ hợp lệ ngay khi admin bật
 *   cấu hình. Xoá ô người dùng vừa điền ở đây là bắt họ nhập lại từ đầu sau khi sửa cấu hình.
 *
 *   VI PHẠM LUẬT (MO đã duyệt, cùng người hai khối) — KHÔNG BAO GIỜ hợp lệ. Giữ lại là giữ một
 *   lời nói dối vĩnh viễn trên màn hình.
 */
export function removeDesign3DBlocks(
  extraData: Record<string, unknown>,
  rejectedByItem: Map<string, Design3DRejectedBlock[]>,
): Record<string, unknown> {
  if (rejectedByItem.size === 0) return extraData;

  const perItem = { ...(asRecord(extraData.perItem) ?? {}) };

  for (const [itemId, rejected] of rejectedByItem) {
    const itemData = { ...(asRecord(perItem[itemId]) ?? {}) };
    const designers = Array.isArray(itemData.designers) ? [...itemData.designers] : [];

    // XOÁ TỪ SLOT LỚN XUỐNG NHỎ. Xoá xuôi thì mỗi lần splice làm mọi slot phía sau tụt một bậc,
    // và slot tiếp theo trong danh sách sẽ trỏ vào người KHÁC — xoá oan đúng người vô can.
    for (const { slot, revertDesignerName } of [...rejected].sort((a, b) => b.slot - a.slot)) {
      if (slot === 0) {
        itemData.tho3d = revertDesignerName ?? "";
        continue;
      }
      const index = slot - 1;
      if (index < 0 || index >= designers.length) continue;
      designers.splice(index, 1);
    }

    // Mảng rỗng thì BỎ HẲN khoá, không để `designers: []`: khoá rỗng vẫn là một khác biệt so với
    // dữ liệu chưa từng có người thứ hai, và nó sẽ đi vào lịch sử thay đổi như một lần sửa thật.
    if (designers.length > 0) itemData.designers = designers;
    else delete itemData.designers;

    perItem[itemId] = itemData;
  }

  return { ...extraData, perItem };
}

/**
 * Danh sách MO cần đồng bộ lượt giao việc, suy ra từ chính payload.
 *
 * `validItemIds` là các MO CÓ THẬT của đơn — chặn trường hợp payload chứa khoá lạ (dữ liệu
 * rác, MO đã xoá, hoặc client gửi bậy) khiến ta đi tạo lượt giao việc cho MO không tồn tại.
 *
 * Hàm này cũng đóng vai trò CHỐT CHẶN RẺ: route gọi nó trước, mảng rỗng thì thoát ngay,
 * không chạm cơ sở dữ liệu.
 */
export function resolveDesign3DSyncTargets(
  extraData: Record<string, unknown> | null | undefined,
  validItemIds: readonly string[],
): string[] {
  const extra = asRecord(extraData);
  const perItem = extra ? asRecord(extra.perItem) : null;
  if (!perItem) return [];

  const valid = new Set(validItemIds);
  return Object.keys(perItem).filter(
    (itemId) => valid.has(itemId) && readDesign3DBlocks(extra, itemId).length > 0,
  );
}
