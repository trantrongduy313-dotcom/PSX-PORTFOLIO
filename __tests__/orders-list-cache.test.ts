import { describe, expect, it } from "vitest";

import {
  carryStageMatchKeys,
  dropMoFromZoneSnapshot,
  insertOrderOnce,
  itemStatusNeedsSnapshotSync,
  mhSavePatch,
  orderLevelFromItemStatus,
  patchItemStatusInRow,
  patchItemInOrder,
  patchOrderInList,
  removeOrderFromList,
  showroomMoNumber,
} from "@/app/lib/business/orders/list-cache";

const row = (over: Record<string, unknown> = {}) => ({
  id: "so-1",
  status: "IN_DESIGN",
  isSuspended: false,
  allItems: [
    { itemId: "mo-a", itemStatus: "IN_DESIGN" },
    { itemId: "mo-b", itemStatus: "IN_DESIGN" },
  ],
  ...over,
});

const cache = (...rows: ReturnType<typeof row>[]) => ({ data: rows });

describe("patchOrderInList", () => {
  it("đổi đúng đơn được chỉ định", () => {
    const before = cache(row(), row({ id: "so-2" }));
    const after = patchOrderInList(before, "so-2", (r) => ({ ...r, status: "CANCELLED" })) as typeof before;
    expect(after.data[0].status).toBe("IN_DESIGN");
    expect(after.data[1].status).toBe("CANCELLED");
  });

  // Cache của snapshot tab khác không chứa đơn này. Dựng object mới là bắt cả bảng vẽ lại
  // mà không có gì đổi — React Query so sánh THAM CHIẾU.
  it("không có đơn trong cache → trả lại ĐÚNG object cũ", () => {
    const before = cache(row());
    expect(patchOrderInList(before, "khong-co", (r) => r)).toBe(before);
  });

  // `setQueriesData` gọi cả trên cache chưa nạp. Ném ở đây là hỏng một mutation đã thành công.
  it("cache rỗng / chưa nạp → trả nguyên, không ném", () => {
    expect(patchOrderInList(undefined, "so-1", (r) => r)).toBeUndefined();
    expect(patchOrderInList(null, "so-1", (r) => r)).toBeNull();
    expect(patchOrderInList({}, "so-1", (r) => r)).toEqual({});
  });
});

describe("patchItemStatusInRow", () => {
  // 🔴 Bài học đã trả giá ở chỗ khác trong dự án: mọi con số đếm theo MO. Một MO đổi trạng
  // thái KHÔNG được kéo các MO anh em trong cùng SO theo.
  it("chỉ đổi MO được chỉ định, MO anh em giữ nguyên", () => {
    const after = patchItemStatusInRow(row(), "mo-a", "SUSPENDED");
    expect(after.allItems[0].itemStatus).toBe("SUSPENDED");
    expect(after.allItems[1].itemStatus).toBe("IN_DESIGN");
  });

  it("đơn chưa có allItems → không ném, trả mảng rỗng", () => {
    expect(patchItemStatusInRow(row({ allItems: undefined }), "mo-a", "SUSPENDED").allItems).toEqual([]);
  });
});

describe("orderLevelFromItemStatus", () => {
  it("IN_PRODUCTION → chạy lại", () => {
    expect(orderLevelFromItemStatus("IN_PRODUCTION")).toEqual({ status: "IN_PRODUCTION", isSuspended: false });
  });

  it("SUSPENDED → tạm ngưng", () => {
    expect(orderLevelFromItemStatus("SUSPENDED")).toEqual({ status: "SUSPENDED", isSuspended: true });
  });

  // 🔴 Một MO hoàn tất KHÔNG có nghĩa cả SO hoàn tất — client không được tự suy ra điều đó.
  it("trạng thái khác → KHÔNG suy ra trạng thái cấp SO", () => {
    for (const status of ["COMPLETED", "CANCELLED", "IN_DESIGN", "DRAFT", ""]) {
      expect(orderLevelFromItemStatus(status)).toBeNull();
    }
  });
});

describe("itemStatusNeedsSnapshotSync", () => {
  // Tạm ngưng / chạy lại đổi TẬP đơn đang active, nên snapshot phải đồng bộ lại.
  it("chỉ tạm ngưng và chạy lại mới cần đồng bộ snapshot", () => {
    expect(itemStatusNeedsSnapshotSync("SUSPENDED")).toBe(true);
    expect(itemStatusNeedsSnapshotSync("IN_PRODUCTION")).toBe(true);
    expect(itemStatusNeedsSnapshotSync("COMPLETED")).toBe(false);
  });
});

describe("showroomMoNumber", () => {
  it("thêm hậu tố -SR", () => {
    expect(showroomMoNumber("26.36938")).toBe("26.36938-SR");
  });

  // Bấm "Chuyển Showroom" hai lần không được ra `-SR-SR`.
  it("đã có -SR rồi → giữ nguyên, không cộng thêm", () => {
    expect(showroomMoNumber("26.36938-SR")).toBe("26.36938-SR");
  });

  // `_4` là phiên bản MO, nằm SAU số gốc — hậu tố -SR vẫn nối vào cuối chuỗi.
  it("MO có phiên bản → hậu tố nối vào cuối", () => {
    expect(showroomMoNumber("25.33240_4")).toBe("25.33240_4-SR");
  });
});

describe("mhSavePatch", () => {
  const base = {
    activeItemId: "mo-a",
    savedItemStatus: "IN_PRODUCTION",
    skipItemStatus: false,
    orderStatus: "COMPLETED",
    isSuspended: true,
  };

  // 🔴 Đang sửa MỘT MO thì KHÔNG đụng status cấp SO — nếu không, tạm ngưng một MO sẽ kéo
  // trạng thái của các MO anh em theo.
  it("đang sửa một MO → chỉ đổi itemStatus của MO đó, không đổi status cấp SO", () => {
    const after = mhSavePatch(row(), base);
    expect(after.allItems[0].itemStatus).toBe("IN_PRODUCTION");
    expect(after.allItems[1].itemStatus).toBe("IN_DESIGN");
    expect(after.status).toBe("IN_DESIGN");
    expect(after.isSuspended).toBe(false);
  });

  it("không có MO đang sửa → đổi status cấp SO", () => {
    const after = mhSavePatch(row(), { ...base, activeItemId: null });
    expect(after.status).toBe("COMPLETED");
    expect(after.isSuspended).toBe(true);
  });

  // handleComplete đã đặt COMPLETED lạc quan TRƯỚC đó rồi; vá lại là ghi đè chính nó bằng
  // một giá trị cũ hơn.
  it("skipItemStatus → rơi về nhánh cấp SO, không vá lại itemStatus", () => {
    const after = mhSavePatch(row(), { ...base, skipItemStatus: true });
    expect(after.allItems[0].itemStatus).toBe("IN_DESIGN");
    expect(after.status).toBe("COMPLETED");
  });

  it("server không trả itemStatus → không bịa, rơi về nhánh cấp SO", () => {
    const after = mhSavePatch(row(), { ...base, savedItemStatus: null });
    expect(after.allItems[0].itemStatus).toBe("IN_DESIGN");
    expect(after.status).toBe("COMPLETED");
  });
});

describe("removeOrderFromList", () => {
  it("gỡ đúng đơn, giữ các đơn khác", () => {
    const after = removeOrderFromList(cache(row(), row({ id: "so-2" })), "so-1") as { data: unknown[] };
    expect(after.data).toHaveLength(1);
  });

  it("không có đơn → trả lại ĐÚNG object cũ", () => {
    const before = cache(row());
    expect(removeOrderFromList(before, "khong-co")).toBe(before);
  });
});

describe("insertOrderOnce", () => {
  it("chèn lên ĐẦU tab đích", () => {
    const after = insertOrderOnce(cache(row({ id: "so-2" })), row()) as { data: { id: string }[] };
    expect(after.data.map((r) => r.id)).toEqual(["so-1", "so-2"]);
  });

  // Cùng một dòng được tiêm hai lần: một lần lạc quan lúc bấm, một lần ở afterSuccess.
  // Không chặn thì bảng hiện HAI dòng cho cùng một đơn.
  it("đơn đã có trong tab → KHÔNG chèn lần hai", () => {
    const before = cache(row());
    expect(insertOrderOnce(before, row())).toBe(before);
  });
});

describe("patchItemInOrder", () => {
  it("sửa đúng item của đúng đơn", () => {
    const after = patchItemInOrder(cache(row()), "so-1", "mo-a", (item) => ({ ...item, zone: "PRE_PRODUCTION" })) as {
      data: { allItems: { zone?: string }[] }[];
    };
    expect(after.data[0].allItems[0].zone).toBe("PRE_PRODUCTION");
    expect(after.data[0].allItems[1].zone).toBeUndefined();
  });

  // Đơn CHƯA nạp allItems khác hẳn đơn CÓ allItems rỗng — biến undefined thành [] là nói
  // rằng đơn này không có MO nào.
  it("allItems chưa nạp → giữ nguyên undefined, không thành mảng rỗng", () => {
    const after = patchItemInOrder(cache(row({ allItems: undefined })), "so-1", "mo-a", (i) => i) as {
      data: { allItems?: unknown }[];
    };
    expect(after.data[0].allItems).toBeUndefined();
  });
});

describe("dropMoFromZoneSnapshot", () => {
  const zoned = (...items: { itemId: string; moNumber: string; zone: string }[]) => ({
    data: [{ id: "so-1", allItems: items, firstItem: items[0] }],
  });

  it("còn MO khác cùng zone → đơn ở lại, chỉ mất MO đã chuyển", () => {
    const after = dropMoFromZoneSnapshot(
      zoned(
        { itemId: "mo-a", moNumber: "26.1", zone: "PRE_PRODUCTION" },
        { itemId: "mo-b", moNumber: "26.2", zone: "PRE_PRODUCTION" },
      ),
      "so-1", "mo-a", "PRE_PRODUCTION",
    ) as { data: { allItems: unknown[]; allMoNumbers: string[]; firstItem: { itemId: string } }[] };

    expect(after.data).toHaveLength(1);
    expect(after.data[0].allItems).toHaveLength(1);
    // allMoNumbers và firstItem PHẢI tính lại — bỏ quên là dòng vẫn hiện MO vừa chuyển đi.
    expect(after.data[0].allMoNumbers).toEqual(["26.2"]);
    expect(after.data[0].firstItem.itemId).toBe("mo-b");
  });

  it("hết MO thuộc zone đó → cả đơn rời tab", () => {
    const after = dropMoFromZoneSnapshot(
      zoned({ itemId: "mo-a", moNumber: "26.1", zone: "PRE_PRODUCTION" }),
      "so-1", "mo-a", "PRE_PRODUCTION",
    ) as { data: unknown[] };
    expect(after.data).toHaveLength(0);
  });

  // 🔴 Còn MO ở zone KHÁC không giữ được đơn lại ở tab này — đó là tab của zone kia.
  it("chỉ còn MO ở zone khác → vẫn rời tab nguồn", () => {
    const after = dropMoFromZoneSnapshot(
      zoned(
        { itemId: "mo-a", moNumber: "26.1", zone: "PRE_PRODUCTION" },
        { itemId: "mo-b", moNumber: "26.2", zone: "MASTER_HUB" },
      ),
      "so-1", "mo-a", "PRE_PRODUCTION",
    ) as { data: unknown[] };
    expect(after.data).toHaveLength(0);
  });

  it("cache chưa nạp → trả nguyên, không ném", () => {
    expect(dropMoFromZoneSnapshot(undefined, "so-1", "mo-a", "PRE_PRODUCTION")).toBeUndefined();
  });
});

describe("carryStageMatchKeys", () => {
  // `stageMatchKeys` do BANG tu tinh cho cot tien do; ban detail cua don khong co truong nay.
  // Thay allItems bang ban detail ma khong mang no theo la cot tien do trong rong sau moi lan luu.
  it("giu stageMatchKeys cua dong cu cho item cung itemId", () => {
    const after = carryStageMatchKeys(
      [{ itemId: "mo-a", itemStatus: "IN_PRODUCTION" }],
      [{ itemId: "mo-a", stageMatchKeys: ["dinh-hot"] }],
    );
    expect(after[0]).toEqual({ itemId: "mo-a", itemStatus: "IN_PRODUCTION", stageMatchKeys: ["dinh-hot"] });
  });

  it("dong cu khong co stageMatchKeys → tra nguyen item moi", () => {
    const incoming = [{ itemId: "mo-a" }];
    expect(carryStageMatchKeys(incoming, [{ itemId: "mo-a" }])[0]).toBe(incoming[0]);
  });

  // MO moi (chua tung o bang) khong co dong cu de mang gi theo — khong duoc nem.
  it("khong tim thay dong cu → tra nguyen, khong nem", () => {
    expect(carryStageMatchKeys([{ itemId: "mo-moi" }], [])).toEqual([{ itemId: "mo-moi" }]);
  });
});
