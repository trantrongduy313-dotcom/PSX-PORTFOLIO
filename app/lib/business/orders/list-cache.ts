// Các phép vá cache danh sách đơn — bản THUẦN, tách khỏi `onSuccess` của mutation.
// Bẫy đã biết nằm ở tên test: __tests__/orders-list-cache.test.ts

/** Hình dạng tối thiểu mà mọi cache danh sách đều có — không ràng thêm để dùng được cho cả snapshot. */
type ListRow = {
  id: string;
  status?: unknown;
  isSuspended?: unknown;
  allItems?: Array<{ itemId: string; itemStatus?: unknown }>;
};

type ListCache<Row extends ListRow> = { data: Row[] };

/** Đổi MỘT đơn. Không có gì đổi thì trả lại chính `cache` — React Query so sánh tham chiếu. */
export function patchOrderInList<Row extends ListRow>(
  cache: unknown,
  orderId: string,
  patch: (row: Row) => Row,
): unknown {
  const list = cache as ListCache<Row> | null | undefined;
  if (!list?.data) return cache;

  let changed = false;
  const data = list.data.map((row) => {
    if (row.id !== orderId) return row;
    changed = true;
    return patch(row);
  });
  return changed ? { ...list, data } : cache;
}

/** Đổi itemStatus của MỘT MO. Các MO anh em trong cùng SO giữ nguyên. */
export function patchItemStatusInRow<Row extends ListRow>(
  row: Row,
  itemId: string,
  itemStatus: unknown,
): Row {
  return {
    ...row,
    allItems: (row.allItems ?? []).map((item) =>
      item.itemId === itemId ? { ...item, itemStatus } : item,
    ),
  };
}

/** Trạng thái cấp SO suy từ tạm ngưng / chạy lại của một MO. Trạng thái khác trả null. */
export function orderLevelFromItemStatus(
  itemStatus: string,
): { status: string; isSuspended: boolean } | null {
  if (itemStatus === "IN_PRODUCTION") return { status: "IN_PRODUCTION", isSuspended: false };
  if (itemStatus === "SUSPENDED") return { status: "SUSPENDED", isSuspended: true };
  return null;
}

/** Tạm ngưng / chạy lại đổi TẬP đơn active của snapshot nên phải đồng bộ nền. */
export function itemStatusNeedsSnapshotSync(itemStatus: string): boolean {
  return orderLevelFromItemStatus(itemStatus) !== null;
}

/** MO# của hàng Showroom. Bấm hai lần KHÔNG được ra `-SR-SR`. */
export function showroomMoNumber(moNumber: string): string {
  return moNumber.endsWith("-SR") ? moNumber : `${moNumber}-SR`;
}

/** Vá sau khi lưu tab MASTER_HUB. Sửa một MO thì KHÔNG đụng status cấp SO. */
export function mhSavePatch<Row extends ListRow>(
  row: Row,
  args: {
    activeItemId: string | null;
    savedItemStatus: unknown;
    skipItemStatus: boolean;
    orderStatus: unknown;
    isSuspended: unknown;
  },
): Row {
  const editsOneMo =
    args.activeItemId != null && args.savedItemStatus !== null && !args.skipItemStatus;

  return editsOneMo
    ? patchItemStatusInRow(row, args.activeItemId!, args.savedItemStatus)
    : { ...row, status: args.orderStatus, isSuspended: args.isSuspended };
}

/** Gỡ hẳn một đơn khỏi cache — dùng khi CẢ đơn rời khỏi tab. */
export function removeOrderFromList(cache: unknown, orderId: string): unknown {
  const list = cache as ListCache<ListRow> | null | undefined;
  if (!list?.data) return cache;
  const data = list.data.filter((row) => row.id !== orderId);
  return data.length === list.data.length ? cache : { ...list, data };
}

/** Chèn đơn lên đầu tab đích. Đã có rồi thì KHÔNG chèn lần hai (nhân đôi dòng). */
export function insertOrderOnce<Row extends ListRow>(cache: unknown, row: Row): unknown {
  const list = cache as ListCache<Row> | null | undefined;
  if (!list?.data) return cache;
  if (list.data.some((existing) => existing.id === row.id)) return cache;
  return { ...list, data: [row, ...list.data] };
}

/**
 * Sửa MỘT item trong MỘT đơn. Giữ nguyên `allItems` chưa nạp (undefined) thay vì biến nó
 * thành mảng rỗng — đơn không có allItems khác hẳn đơn có allItems rỗng.
 */
export function patchItemInOrder<Item extends { itemId: string }>(
  cache: unknown,
  orderId: string,
  itemId: string,
  patch: (item: Item) => Item,
): unknown {
  const list = cache as { data: Array<{ id: string; allItems?: Item[] }> } | null | undefined;
  if (!list?.data) return cache;
  return {
    ...list,
    data: list.data.map((row) =>
      row.id !== orderId
        ? row
        : { ...row, allItems: row.allItems?.map((item) => (item.itemId === itemId ? patch(item) : item)) },
    ),
  };
}

type ZonedItem = { itemId: string; moNumber?: string | null; zone?: unknown };

/**
 * Gỡ một MO khỏi snapshot của tab nguồn khi nó chuyển sang zone khác.
 * Không còn MO nào thuộc zone đó → cả đơn rời tab.
 */
export function dropMoFromZoneSnapshot(
  cache: unknown,
  orderId: string,
  itemId: string,
  zone: unknown,
): unknown {
  type Row = { id: string; allItems?: ZonedItem[]; firstItem?: unknown };
  const list = cache as { data: Row[] } | null | undefined;
  if (!list?.data) return cache;

  return {
    ...list,
    data: list.data.flatMap((row) => {
      if (row.id !== orderId) return [row];
      const allItems = (row.allItems ?? []).filter((item) => item.itemId !== itemId);
      if (!allItems.some((item) => item.zone === zone)) return [];
      return [{
        ...row,
        allItems,
        allMoNumbers: allItems.map((item) => item.moNumber).filter(Boolean),
        firstItem: allItems[0] ?? row.firstItem,
      }];
    }),
  };
}

/**
 * Hình dạng một dòng trong bảng đơn, ở mức panel cần: có id, có allItems, còn lại để mở.
 * Thay cho `(old: any)` — không dựng lại toàn bộ OrderSummary vì panel chỉ vá vài trường.
 */
export type PanelListRow = ListRow & {
  allItems?: Array<{ itemId: string; itemStatus?: unknown } & Record<string, unknown>>;
} & Record<string, unknown>;

/** Giữ `stageMatchKeys` của dòng cũ khi thay allItems bằng bản mới — bản detail không có nó. */
export function carryStageMatchKeys<Item extends { itemId: string; stageMatchKeys?: unknown }>(
  incoming: readonly Item[],
  previous: readonly Item[],
): Item[] {
  return incoming.map((item) => {
    const old = previous.find((prev) => prev.itemId === item.itemId);
    return old?.stageMatchKeys ? { ...item, stageMatchKeys: old.stageMatchKeys } : item;
  });
}
