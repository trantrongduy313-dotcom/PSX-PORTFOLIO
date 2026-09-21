// Trạng thái các chip chọn cửa hàng (thanh riêng của vai SALES).
// Bất biến có test: __tests__/ui-store-filter.test.ts
//
// Chip "Tất cả" tồn tại vì Sales từng chọn một cửa hàng rồi không có đường nào quay lại: bấm
// lại chip đang chọn không làm gì, "Xóa lọc" cố ý bỏ qua storeId, đổi tab thì storeId đi theo.

/**
 * Id giả cho chip "Tất cả".
 *
 * Không dùng `null`: `pendingStoreId` đã dùng `null` cho nghĩa "không đang chuyển", nên bấm
 * "Tất cả" sẽ mất lớp phủ "Đang chuyển sang…". Tiền tố `__` để không đụng cuid thật.
 */
export const ALL_STORES = "__all__";

export type StoreChipState = "active" | "pending" | "dimmed" | "idle";

export type StoreChipInput = {
  /** Id cửa hàng của chip này, hoặc `ALL_STORES` cho chip "Tất cả". */
  chipId: string;
  /** `filters.storeId`. `undefined` = đang xem TẤT CẢ cửa hàng được gán. */
  selectedStoreId?: string;
  /** Chip vừa được bấm và đang chờ, hoặc `null` khi không có gì đang chờ. */
  pendingStoreId: string | null;
};

export function storeChipState(input: StoreChipInput): StoreChipState {
  const { chipId, selectedStoreId, pendingStoreId } = input;

  if (pendingStoreId !== null) {
    return pendingStoreId === chipId ? "pending" : "dimmed";
  }
  const selected = selectedStoreId ?? ALL_STORES;
  return selected === chipId ? "active" : "idle";
}

export function isStoreChipClickable(state: StoreChipState): boolean {
  return state === "idle";
}

/** `undefined` cho chip "Tất cả" — `updateUrl` xoá tham số khi nhận giá trị falsy. */
export function storeIdForChip(chipId: string): string | undefined {
  return chipId === ALL_STORES ? undefined : chipId;
}
