// Dựng mệnh đề ĐẾM cho huy hiệu tab: đếm MO (OrderItem), không đếm SO.
// Ba bẫy đã trả giá nằm ở tên test: __tests__/orders-item-count-where.test.ts

type Where = Record<string, unknown>;

const sameShape = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Gỡ mệnh đề lọc phòng theo HÌNH DẠNG, không theo chỗ ngồi — chỗ ngồi tuỳ ai tới trước. */
function withoutZoneFilter(where: Where, zone: string | null | undefined): Where {
  if (!zone) return { ...where };
  const zoneCond = { some: { zone } };
  const rest: Where = {};

  for (const [key, value] of Object.entries(where)) {
    if (key === "items" && sameShape(value, zoneCond)) continue;
    if (key === "AND" && Array.isArray(value)) {
      const kept = value.filter((c) => !sameShape(c, { items: zoneCond }));
      if (kept.length > 0) rest.AND = kept;
      continue;
    }
    rest[key] = value;
  }
  return rest;
}

export function buildItemCountWhere(params: {
  orderWhere: Where;
  zone?: string | null;
  history: boolean;
  status?: string | null;
}): Where {
  const { orderWhere, zone, history, status } = params;

  const { NOT: orderNot, OR: orderOr, ...base } = withoutZoneFilter(orderWhere, zone);

  const iw: Where = { order: { ...base } };
  const order = iw.order as Where;
  if (orderNot) order.NOT = orderNot;

  // Phòng đo ở CẤP MO, không phải cấp SO — một SO có thể trộn MO của cả hai phòng.
  if (zone) iw.zone = zone;

  if (orderOr) {
    if (history && (status === "COMPLETED" || status === "CANCELLED")) {
      iw.OR = [{ itemStatus: status }, { itemStatus: null, order: { ...order, status } }];
    } else {
      order.OR = orderOr;
    }
  }

  // 🔴 Phải dùng OR, KHÔNG dùng `notIn` trần: Prisma dịch notIn thành SQL NOT IN, và NOT IN
  // loại luôn hàng NULL trong PostgreSQL. Đa số MO có itemStatus null (ăn theo SO).
  if (!history) {
    iw.OR = [{ itemStatus: null }, { itemStatus: { notIn: ["COMPLETED", "CANCELLED"] } }];
  }

  return iw;
}
