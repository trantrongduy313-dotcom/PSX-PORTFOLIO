// ─── "Đơn nào vừa đổi" — gộp HAI nguồn thay đổi về một danh sách ─────────────
//
// ⚠️ MODULE NÀY TỒN TẠI VÌ CHỮ KÝ THAY ĐỔI CỦA MÀN ĐƠN HÀNG ĐANG MÙ VỚI VIỆC NV 3D LÀM.
//
// Nhịp tim `/api/orders/meta` trước đây chỉ theo dõi `Order.updatedAt` (+ OrderItem). Nhưng hai
// hành động thường gặp nhất của NV 3D KHÔNG CHẠM TỚI hai bảng đó:
//
//   · acknowledge (nhận việc)                  — chỉ ghi Design3DAssignment;
//   · progress   (cập nhật tiến độ / gửi kết quả) — cũng vậy.
//
// Chỉ `review` (Đặt đơn duyệt) mới bump Order. Nên với NV 3D nhận việc hay gửi kết quả:
// KHÔNG nháy dòng, KHÔNG dải cảnh báo trong sidebar, và Đặt đơn nhìn một trạng thái đóng băng
// trong khi màn hình vẫn trông như đang cập nhật đầy đủ.
//
// Điều đáng nói: dải cảnh báo "Đơn này vừa được cập nhật bởi người khác" ĐÃ TỒN TẠI và đã được
// nối dây đầy đủ (`panelOrderStale` → `externallyUpdated`). Nó không hỏng — nó BỊ BỎ ĐÓI, vì
// nguồn tin của nó không bao giờ nghe thấy tiếng từ bảng Design3DAssignment.
//
// Đây đúng bài học đã ghi ở kpi-3d/freshness.ts, chiếu ngược lại: "trường đó nằm ở bảng nào thì
// bảng đó PHẢI có mặt trong chữ ký". Lần đó màn 3D thiếu OrderItem; lần này màn đơn hàng thiếu
// Design3DAssignment.
//
// File THUẦN: không prisma, không React.

/** Một đơn vừa đổi, nhìn từ phía bảng `orders`. */
export type OrderChangeRow = {
  id: string;
  orderNumber: string;
  store: { name: string } | null;
  /** Các MO của đơn này vừa đổi. */
  items: { id: string; moNumber: string | null }[];
};

/** Một lượt giao việc 3D vừa đổi — mang theo đơn và MO của nó. */
export type AssignmentChangeRow = {
  orderItemId: string;
  order: { id: string; orderNumber: string; store: { name: string } | null } | null;
  orderItem: { moNumber: string | null } | null;
};

export type ChangedOrder = {
  id: string;
  orderNumber: string;
  storeName: string | null;
  /**
   * MO nào đã đổi.
   *
   * ⚠️ KHÔNG ĐƯỢC BỎ TRỐNG khi nguồn là lượt 3D. Sidebar chỉ coi là "cũ" khi ĐÚNG MO đang xem
   * nằm trong danh sách này (xem `panelOrderStale`) — mảng rỗng nghĩa là "đổi ở cấp đơn", và
   * ca đó CỐ Ý không kích hoạt cảnh báo. Nên quên `orderItemId` ở đây thì mọi thứ khác đúng hết
   * mà dải cảnh báo vẫn không bao giờ hiện.
   */
  changedItemIds: string[];
  changedMoNumbers: string[];
};

/**
 * Gộp thay đổi từ bảng `orders` và bảng `design_3d_assignments`.
 *
 * GỘP THEO orderId, KHÔNG NỐI HAI MẢNG: một đơn có thể đổi ở CẢ HAI đường trong cùng một nhịp
 * (Đặt đơn sửa NVL trong lúc NV 3D gửi kết quả). Nối thẳng thì đơn đó xuất hiện hai lần và số
 * "N đơn vừa đổi" hiện ra cho người dùng sẽ NÓI QUÁ — một chỉ báo nói quá bị bỏ qua nhanh y như
 * một chỉ báo không hiện.
 */
export function mergeChangedOrders(
  fromOrders: readonly OrderChangeRow[],
  fromAssignments: readonly AssignmentChangeRow[],
): ChangedOrder[] {
  type Acc = { id: string; orderNumber: string; storeName: string | null; itemIds: Set<string>; moNumbers: Set<string> };
  const merged = new Map<string, Acc>();

  const touch = (id: string, orderNumber: string, storeName: string | null): Acc => {
    const cur = merged.get(id);
    if (cur) return cur;
    const next: Acc = { id, orderNumber, storeName, itemIds: new Set(), moNumbers: new Set() };
    merged.set(id, next);
    return next;
  };

  for (const o of fromOrders) {
    const entry = touch(o.id, o.orderNumber, o.store?.name ?? null);
    for (const it of o.items) {
      entry.itemIds.add(it.id);
      if (it.moNumber) entry.moNumbers.add(it.moNumber);
    }
  }

  for (const a of fromAssignments) {
    if (!a.order) continue;
    const entry = touch(a.order.id, a.order.orderNumber, a.order.store?.name ?? null);
    entry.itemIds.add(a.orderItemId);
    if (a.orderItem?.moNumber) entry.moNumbers.add(a.orderItem.moNumber);
  }

  return [...merged.values()].map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    storeName: o.storeName,
    changedItemIds: [...o.itemIds],
    changedMoNumbers: [...o.moNumbers],
  }));
}

/**
 * Mốc mới nhất trong TẤT CẢ các bảng thuộc chữ ký.
 *
 * ⚠️ PHẢI LÀ MAX CỦA CẢ HAI. Client gửi mốc này lại làm `changedSince` ở nhịp sau; chỉ lấy mốc
 * của `Order` thì mốc gửi đi sẽ CŨ HƠN thực tế, và cùng một thay đổi 3D được báo lại ở MỌI nhịp.
 * Nghe như phiền nhẹ, nhưng một cảnh báo lặp mãi thì người dùng học cách bỏ qua nó — và lần sau
 * cảnh báo thật cũng bị bỏ qua theo.
 */
export function latestStamp(...stamps: readonly (Date | string | null | undefined)[]): string | null {
  const times = stamps
    .map((d) => (d == null ? NaN : new Date(d).getTime()))
    .filter((t) => Number.isFinite(t));
  return times.length > 0 ? new Date(Math.max(...times)).toISOString() : null;
}
