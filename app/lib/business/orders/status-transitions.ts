// Luật chuyển trạng thái đơn — NGUỒN DUY NHẤT. Trước đây có BỐN bản sao (UI, route PATCH đơn,
// route PATCH sản xuất, và một bản thứ tư khai ngay trong file test) và chúng ĐÃ lệch.
// Chi tiết vết lệch nằm ở tên test: __tests__/order-status-transitions.test.ts

/** `undefined` = KHÔNG ràng buộc — khác hẳn `[]` = terminal. Hai nghĩa này từng bị lẫn. */
type TransitionMap = Partial<Record<string, readonly string[]>>;

/** Phòng Thiết Kế. Hủy KHÔNG nằm ở đây — nó đi đường riêng (patchItemStatus / resolve-action). */
const PRE_PRODUCTION: TransitionMap = {
  DRAFT:            ["PENDING_DESIGN", "IN_DESIGN", "DESIGN_REVIEW", "DESIGN_APPROVED", "DESIGN_COMPLETED", "CANCELLED"],
  PENDING_DESIGN:   ["DRAFT", "IN_DESIGN", "DESIGN_REVIEW", "DESIGN_APPROVED", "DESIGN_COMPLETED", "CANCELLED"],
  IN_DESIGN:        ["DRAFT", "PENDING_DESIGN", "DESIGN_REVIEW", "DESIGN_APPROVED", "DESIGN_COMPLETED", "CANCELLED"],
  DESIGN_REVIEW:    ["IN_DESIGN", "DESIGN_APPROVED", "DESIGN_COMPLETED", "CANCELLED"],
  DESIGN_APPROVED:  ["DESIGN_REVIEW", "IN_DESIGN", "DESIGN_COMPLETED"],
  DESIGN_COMPLETED: ["DESIGN_APPROVED", "DESIGN_REVIEW", "IN_DESIGN"],
};

/** Phòng Sản Xuất. COMPLETED/CANCELLED là terminal — không có lối ra. */
const MASTER_HUB: TransitionMap = {
  PENDING_PRODUCTION: ["IN_PRODUCTION", "SUSPENDED", "CANCELLED"],
  IN_PRODUCTION:      ["SUSPENDED", "COMPLETED", "CANCELLED", "QUALITY_CHECK"],
  QUALITY_CHECK:      ["IN_PRODUCTION", "SUSPENDED", "COMPLETED", "CANCELLED"],
  SUSPENDED:          ["IN_PRODUCTION", "COMPLETED", "CANCELLED"],
};

export type OrderZone = "PRE_PRODUCTION" | "MASTER_HUB";

/** Danh sách đích hợp lệ, hoặc `null` khi trạng thái này không bị ràng buộc. */
export function allowedNextStatuses(from: string, zone: OrderZone): readonly string[] | null {
  return (zone === "MASTER_HUB" ? MASTER_HUB : PRE_PRODUCTION)[from] ?? null;
}

/** Server hỏi câu này. Không ràng buộc thì cho qua — giữ đúng hành vi cũ của cả hai route. */
export function canTransition(from: string, to: string, zone: OrderZone): boolean {
  const allowed = allowedNextStatuses(from, zone);
  return allowed === null || allowed.includes(to);
}

/** Dropdown hiện gì. LUÔN gồm trạng thái hiện tại — thiếu nó là select tự nhảy mục đầu. */
export function selectableStatuses(from: string, zone: OrderZone): readonly string[] {
  return [from, ...(allowedNextStatuses(from, zone) ?? [])];
}

/** Cờ `isSuspended` đi theo trạng thái; `undefined` = không đụng. Bẫy ở tên test. */
export function suspendedFlagFor(fromStatus: string, toStatus: string): boolean | undefined {
  if (toStatus === fromStatus) return undefined;
  if (toStatus === "SUSPENDED") return true;
  if (fromStatus === "SUSPENDED") return false;
  return undefined;
}
