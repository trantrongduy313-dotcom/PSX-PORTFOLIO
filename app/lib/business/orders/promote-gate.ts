// Sáu phép kiểm trước khi một MO được chuyển từ PTK sang PSX. Trước đây nằm rải trong
// transaction của app/api/orders/[id]/promote/route.ts, không có test — chỉ có một bản CHÉP
// trong app/__tests__/system-integration.test.ts, và bản đó không biết cờ `force` tồn tại.
// Bẫy đã biết nằm ở tên test: __tests__/orders-promote-gate.test.ts

export type PromoteBlock =
  | { tag: "WRONG_STATUS"; status: string }
  | { tag: "SUSPENDED" }
  | { tag: "MISSING_CUSTOMER" }
  | { tag: "MISSING_SALES" }
  | { tag: "MISSING_NVL" };

/** MO có trạng thái riêng thì trạng thái riêng thắng; không có thì kế thừa của SO. */
export function effectivePromoteStatus<TStatus extends string>(
  itemStatus: TStatus | null | undefined,
  orderStatus: TStatus,
): TStatus {
  return itemStatus ?? orderStatus;
}

/** Ghi đè RIÊNG THEO MO trong `item.specifications` thắng cấp SO — SO cũ có thể để trống. */
export function effectiveContactName(
  fromItemSpecs: unknown,
  fromOrder: string | null | undefined,
): string {
  const perMo = typeof fromItemSpecs === "string" ? fromItemSpecs.trim() : "";
  return perMo || (fromOrder ?? "").trim();
}

/**
 * `null` = cho đi. 🔴 `force` KHÔNG phải "bỏ qua tất cả": nó bỏ qua trạng thái, Khách hàng và
 * Sales — nhưng TẠM NGƯNG và NVL thì không có đường vòng.
 */
export function checkPromoteGate(input: {
  effectiveStatus: string;
  isSuspended: boolean;
  customerName: string;
  salesName: string;
  hasNvl: boolean;
  force: boolean;
}): PromoteBlock | null {
  const { effectiveStatus, isSuspended, customerName, salesName, hasNvl, force } = input;

  if (effectiveStatus !== "DESIGN_APPROVED" && !force) {
    return { tag: "WRONG_STATUS", status: effectiveStatus };
  }
  if (isSuspended) return { tag: "SUSPENDED" };
  if (!customerName && !force) return { tag: "MISSING_CUSTOMER" };
  if (!salesName && !force) return { tag: "MISSING_SALES" };
  if (!hasNvl) return { tag: "MISSING_NVL" };

  return null;
}
