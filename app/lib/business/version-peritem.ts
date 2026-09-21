import { stripVersionSuffix } from "@/app/lib/business/order-helpers";
import { cleanCarriedItemData } from "@/app/lib/business/kpi-3d/version-carryover";

// ═══════════════════════════════════════════════════════════════════════════
// Remap dữ liệu sản xuất per-MO (ProductionDetail.extraData.perItem) khi TẠO PHIÊN BẢN.
//
// perItem được key theo OrderItem.id. Khi tạo version, các item MỚI có id MỚI → phải remap
// key cũ → key mới, dò theo base MO# (26.35576_2 và 26.35576_3 cùng base "26.35576").
//
// NGUYÊN TẮC (sửa bug mồ côi): CHỈ giữ perItem của những MO THỰC SỰ thuộc version này. MO
// anh em ở lại SO gốc KHÔNG được copy sang — nếu copy (giữ id cũ) sẽ tạo "perItem mồ côi":
// key trỏ tới item không tồn tại trong đơn version → KPI đếm trùng (bản gốc + bản copy) và
// màn Đánh giá Khâu hiện dòng "Chưa có tên". Dữ liệu của MO anh em vẫn nguyên ở SO gốc.
// ═══════════════════════════════════════════════════════════════════════════

/** OrderItem tối giản cần cho việc remap — chỉ id + moNumber. */
export type ItemIdentity = { id: string; moNumber: string | null };

/**
 * Dựng perItem cho ProductionDetail của bản version.
 *
 * @param oldPerItem  perItem của SO gốc (key = itemId cũ).
 * @param currentItems  items của SO gốc (để suy base MO# từ itemId cũ).
 * @param versionItems  items của bản version MỚI (đích remap; xác định MO nào thuộc version).
 * @returns perItem mới (key = itemId mới) — CHỈ gồm các MO thuộc version; MO anh em bị loại.
 *
 * Thuần (không side-effect) → test độc lập được.
 */
export function remapPerItemToVersion(
  oldPerItem: Record<string, unknown>,
  currentItems: ItemIdentity[],
  versionItems: ItemIdentity[],
): Record<string, unknown> {
  // base MO# → itemId mới (chỉ các MO thuộc version)
  const baseToNewItemId = new Map<string, string>();
  for (const it of versionItems) {
    if (it.moNumber) baseToNewItemId.set(stripVersionSuffix(it.moNumber), it.id);
  }
  // itemId cũ → base MO#, và itemId cũ → MO# ĐẦY ĐỦ (có hậu tố phiên bản).
  // Cần cả hai: base để remap, MO# đầy đủ để nói được "kế thừa từ 26.42341_1" — nhãn không có
  // hậu tố thì câu cảnh báo chỉ ra một cái tên không định danh được bản nào.
  const oldItemIdToBase = new Map<string, string>();
  const oldItemIdToMo = new Map<string, string>();
  for (const it of currentItems) {
    if (!it.moNumber) continue;
    oldItemIdToBase.set(it.id, stripVersionSuffix(it.moNumber));
    oldItemIdToMo.set(it.id, it.moNumber);
  }

  const newPerItem: Record<string, unknown> = {};
  for (const [oldItemId, value] of Object.entries(oldPerItem)) {
    const base = oldItemIdToBase.get(oldItemId);
    const newItemId = base ? baseToNewItemId.get(base) : undefined;
    // MO không thuộc version (không map được) → KHÔNG copy (tránh perItem mồ côi).
    if (!newItemId) continue;

    // ⚠️ KHÔNG COPY NGUYÊN KHỐI NỮA. Mốc giao / giờ thực tế / id lượt của bản CŨ không phải sự
    // thật của bản MỚI: copy nguyên khiến bản mới trông như đã giao việc trong khi không ai được
    // giao, và lần lưu sau sinh thêm một lượt thứ hai → KPI cộng đôi. Luật + lý do đầy đủ ở
    // kpi-3d/version-carryover.ts (có unit test riêng).
    const itemData = value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
    newPerItem[newItemId] = itemData
      ? cleanCarriedItemData(itemData, oldItemIdToMo.get(oldItemId) ?? base ?? "bản trước")
      : value;
  }
  return newPerItem;
}
