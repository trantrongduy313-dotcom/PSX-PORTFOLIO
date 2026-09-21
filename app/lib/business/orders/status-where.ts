// Mệnh đề lọc TRẠNG THÁI của GET /api/orders. Bẫy ở tên test: __tests__/orders-status-where.ts
//
// Tách ra vì cả bốn nhánh đều PER-MO, và đó là chỗ dễ viết lại sai nhất: một SO có thể vừa
// Hoàn tất ở cấp SO vừa có MO mới đang chạy, nên lọc theo mỗi `order.status` là bỏ lọt.

const TERMINAL = ["COMPLETED", "CANCELLED"] as const;

/** Mảnh `where` để trộn vào truy vấn. `OR`/`NOT`/`status` — chỉ những khoá nhánh đó dùng. */
export type StatusWhere = Record<string, unknown>;

export function orderStatusWhere(params: {
  history: boolean;
  status?: string | null;
}): StatusWhere {
  const { history, status } = params;

  if (history) {
    if (status === "COMPLETED" || status === "CANCELLED") {
      const where: StatusWhere = {
        OR: [{ status }, { items: { some: { itemStatus: status } } }],
      };
      // CHỈ tab Hoàn tất mới loại đơn đã huỷ. KHÔNG làm ngược lại: một SO đã Hoàn tất vẫn có
      // thể có MO bị huỷ riêng, và MO đó phải hiện ở tab Đã hủy.
      if (status === "COMPLETED") where.NOT = { status: "CANCELLED" };
      return where;
    }
    return { status: { in: [...TERMINAL] } };
  }

  if (status) return { status };

  // Tab "Tất cả": giấu đơn đã chốt, NHƯNG giữ SO có MO riêng lẻ còn chạy.
  return {
    OR: [
      { status: { notIn: [...TERMINAL] } },
      { items: { some: { itemStatus: { notIn: [...TERMINAL] } } } },
    ],
  };
}
