import { describe, expect, it } from "vitest";

import { buildItemCountWhere } from "@/app/lib/business/orders/item-count-where";
import { mergeWhere } from "@/app/lib/business/orders/where-merge";
import { orderStatusWhere } from "@/app/lib/business/orders/status-where";

// Huy hiệu tab đếm MO, bảng cũng hiện MO — hai con số đó LỆCH NHAU là lớp lỗi khó chịu nhất ở
// màn này: người dùng đếm tay xong không hiểu vì sao máy nói khác, và không có lỗi nào để tra.
//
// 🔴 Bộ dựng cũ ĐOÁN Ý NGHĨA TỪ CHỖ NGỒI: nó tháo `where.items` ra và đặt tên biến là
// `_itemsZoneFilter` — tức giả định khoá đó LUÔN là bộ lọc phòng. Sau khi bốn bộ lọc thôi
// giẫm chân nhau (xem __tests__/orders-where-merge.test.ts), giả định đó sai: không lọc phòng
// mà có lọc Ưu tiên thì Ưu tiên ngồi vào đúng khoá đó và bị VỨT ĐI — đếm nhiều hơn số dòng.
// Nay nhận diện theo HÌNH DẠNG, không theo chỗ ngồi.

const T = ["COMPLETED", "CANCELLED"];
const PRIORITY = { items: { some: { priorityCode: "UT1" } } };

/** Dựng `where` đúng thứ tự route dựng, để test đi qua cùng đường với code thật. */
const routeWhere = (opts: { zone?: string; history?: boolean; status?: string; priority?: boolean }) => {
  const where: Record<string, unknown> = { deletedAt: null };
  if (opts.zone) mergeWhere(where, { items: { some: { zone: opts.zone } } });
  mergeWhere(where, orderStatusWhere({ history: !!opts.history, status: opts.status }));
  if (opts.priority) mergeWhere(where, PRIORITY);
  return where;
};

describe("lọc phòng chuyển xuống cấp MO", () => {
  it("có lọc phòng → điều kiện phòng rời khỏi cấp SO, xuống cấp MO", () => {
    const iw = buildItemCountWhere({
      orderWhere: routeWhere({ zone: "PRE_PRODUCTION" }),
      zone: "PRE_PRODUCTION", history: false,
    });
    expect(iw.zone).toBe("PRE_PRODUCTION");
    expect((iw.order as Record<string, unknown>).items).toBeUndefined();
  });

  // 🔴 CHÍNH VẾT LỖI. Không lọc phòng thì Ưu tiên là người ngồi vào khoá `items` — bộ dựng cũ
  // vứt nó đi vì tưởng đó là bộ lọc phòng. Đếm khi đó nhiều hơn số dòng bảng hiện.
  it("KHÔNG lọc phòng nhưng có lọc Ưu tiên → Ưu tiên PHẢI CÒN", () => {
    const iw = buildItemCountWhere({
      orderWhere: routeWhere({ priority: true }), history: false,
    });
    expect((iw.order as Record<string, unknown>).items).toEqual(PRIORITY.items);
  });

  // Có cả hai: phòng ngồi `items`, Ưu tiên vào `AND`. Gỡ phòng nhưng KHÔNG được gỡ nhầm Ưu tiên.
  it("có cả phòng lẫn Ưu tiên → gỡ đúng phòng, giữ nguyên Ưu tiên", () => {
    const iw = buildItemCountWhere({
      orderWhere: routeWhere({ zone: "MASTER_HUB", priority: true }),
      zone: "MASTER_HUB", history: false,
    });
    const order = iw.order as Record<string, unknown>;
    expect(iw.zone).toBe("MASTER_HUB");
    expect(order.items).toBeUndefined();
    expect(order.AND).toEqual([PRIORITY]);
  });

  // Phép nhận diện theo hình dạng bảo đảm ĐIỀU NÀY: gỡ đúng bộ lọc phòng dù nó ngồi ở đâu.
  // Hôm nay route luôn gộp phòng TRƯỚC nên nó ngồi `items`; nhưng đó là một hợp đồng VÔ HÌNH
  // giữa hai file. Đổi thứ tự hai dòng ở route mà bộ đếm im lặng sai thì không ai lần ra.
  it("bộ lọc phòng nằm trong AND (Ưu tiên tới trước) → vẫn gỡ đúng nó", () => {
    const where: Record<string, unknown> = { deletedAt: null };
    mergeWhere(where, PRIORITY);
    mergeWhere(where, { items: { some: { zone: "MASTER_HUB" } } });

    const iw = buildItemCountWhere({ orderWhere: where, zone: "MASTER_HUB", history: false });
    const order = iw.order as Record<string, unknown>;
    expect(iw.zone).toBe("MASTER_HUB");
    expect(order.items).toEqual(PRIORITY.items);
    expect(order.AND).toBeUndefined();
  });

  // Gỡ hết phần tử của AND thì không được để lại `AND: []` — mảng rỗng trong Prisma là một
  // mệnh đề thật, và một khoá thừa là thêm một đường cho nó đi sai.
  it("AND rỗng sau khi gỡ → bỏ hẳn khoá AND", () => {
    const where: Record<string, unknown> = { deletedAt: null, items: { some: { a: 1 } } };
    mergeWhere(where, { items: { some: { zone: "MASTER_HUB" } } });
    const iw = buildItemCountWhere({ orderWhere: where, zone: "MASTER_HUB", history: false });
    expect((iw.order as Record<string, unknown>).AND).toBeUndefined();
  });
});

describe("tab thường — giữ MO chưa chốt, KHÔNG rơi mất MO chưa có trạng thái riêng", () => {
  // 🔴 Phải dùng OR chứ không `notIn` trần: Prisma dịch notIn thành SQL NOT IN, và NOT IN loại
  // luôn hàng NULL trong PostgreSQL. Đa số MO có itemStatus null (ăn theo SO) — dùng notIn là
  // đếm THIẾU gần hết bảng.
  it("đếm cả MO có itemStatus null lẫn MO chưa chốt", () => {
    const iw = buildItemCountWhere({ orderWhere: routeWhere({}), history: false });
    expect(iw.OR).toEqual([{ itemStatus: null }, { itemStatus: { notIn: T } }]);
  });
});

describe("hai tab lịch sử — đếm theo TỪNG MO, không theo cấp SO", () => {
  // Một SO Hoàn tất có thể chứa MO bị huỷ riêng. Đếm ở cấp SO là MO đó không được tính ở đâu.
  it("tab Hoàn tất → MO tự nó hoàn tất, HOẶC MO ăn theo SO đã hoàn tất", () => {
    const iw = buildItemCountWhere({
      orderWhere: routeWhere({ history: true, status: "COMPLETED" }),
      history: true, status: "COMPLETED",
    });
    const [byItem, byOrder] = iw.OR as Record<string, unknown>[];
    expect(byItem).toEqual({ itemStatus: "COMPLETED" });
    expect(byOrder.itemStatus).toBeNull();
    expect((byOrder.order as Record<string, unknown>).status).toBe("COMPLETED");
  });

  // Mệnh đề "không phải đơn đã huỷ" của tab Hoàn tất phải theo xuống nhánh ăn-theo-SO, nếu
  // không nhánh đó kéo ngược đơn đã huỷ vào lại đúng chỗ vừa loại ra.
  it("mệnh đề loại đơn đã huỷ đi theo xuống nhánh ăn-theo-SO", () => {
    const iw = buildItemCountWhere({
      orderWhere: routeWhere({ history: true, status: "COMPLETED" }),
      history: true, status: "COMPLETED",
    });
    const byOrder = (iw.OR as Record<string, unknown>[])[1];
    expect((byOrder.order as Record<string, unknown>).NOT).toEqual({ status: "CANCELLED" });
  });

  it("tab lịch sử KHÔNG dán thêm lưới lọc của tab thường", () => {
    const iw = buildItemCountWhere({
      orderWhere: routeWhere({ history: true }), history: true,
    });
    expect(iw.OR).toBeUndefined();
    expect((iw.order as Record<string, unknown>).status).toEqual({ in: T });
  });
});
