import { describe, expect, it } from "vitest";

import {
  ALL_STORES,
  isStoreChipClickable,
  storeChipState,
  storeIdForChip,
  type StoreChipState,
} from "@/app/lib/ui/store-filter";

// ─── Thanh chọn cửa hàng của vai SALES ───────────────────────────────────────
//
// 🔴 VÌ SAO MỘT HÀM BỐN DÒNG LẠI CẦN NGẦN NÀY TEST:
//
// Sai ở đây KHÔNG NỔ. Một chip sáng nhầm, hai chip cùng sáng, hoặc chip "Tất cả" không bao giờ
// sáng — cả ba đều render bình thường, không lỗi, không log. Người dùng chỉ thấy thanh cửa hàng
// "hơi lạ" rồi thôi không tin nó nữa.
//
// Và bài học vừa trả giá: Sales bị KẸT trong một cửa hàng vì cả ba lối ra đều đóng, suốt một
// thời gian dài, mà không ai báo lỗi — họ tưởng hệ thống vốn thế.

const STORES = ["s-ch1", "s-ch2", "s-ch3"];
const CHIPS = [ALL_STORES, ...STORES];

const stateOf = (chipId: string, selectedStoreId?: string, pendingStoreId: string | null = null) =>
  storeChipState({ chipId, selectedStoreId, pendingStoreId });

describe("storeChipState — khi KHÔNG có gì đang chờ", () => {
  it("chưa lọc cửa hàng nào → chip Tất cả sáng", () => {
    expect(stateOf(ALL_STORES, undefined)).toBe("active");
  });

  it("chưa lọc cửa hàng nào → các chip cửa hàng đều bình thường", () => {
    for (const s of STORES) expect(stateOf(s, undefined), s).toBe("idle");
  });

  it("đang lọc CH1 → CH1 sáng", () => {
    expect(stateOf("s-ch1", "s-ch1")).toBe("active");
  });

  // Ca này chốt đúng thứ người dùng thiếu: khi đã chọn một cửa hàng, chip "Tất cả" phải TẮT
  // nhưng vẫn BẤM ĐƯỢC — đó là đường quay lại.
  it("đang lọc CH1 → chip Tất cả tắt nhưng bấm được", () => {
    const s = stateOf(ALL_STORES, "s-ch1");
    expect(s).toBe("idle");
    expect(isStoreChipClickable(s)).toBe(true);
  });
});

describe("storeChipState — khi ĐANG chờ chuyển", () => {
  it("chip vừa bấm là pending, các chip khác mờ đi", () => {
    expect(stateOf("s-ch2", "s-ch1", "s-ch2")).toBe("pending");
    expect(stateOf("s-ch3", "s-ch1", "s-ch2")).toBe("dimmed");
  });

  // ⚠️ `pending` phải THẮNG `active`. Lúc vừa bấm sang chip khác, URL chưa đổi nên chip cũ vẫn
  // đang được chọn — xét `active` trước thì hai chip cùng nổi bật và người dùng không biết mình
  // vừa bấm cái nào.
  it("chip ĐANG ĐƯỢC CHỌN cũng mờ đi khi người dùng bấm sang chip khác", () => {
    expect(stateOf("s-ch1", "s-ch1", "s-ch2")).toBe("dimmed");
  });

  // 🔴 CA MÀ SENTINEL SINH RA ĐỂ PHỤC VỤ. `pendingStoreId` là `string | null` và `null` đã mang
  // nghĩa "không đang chờ" — nên "đang quay về Tất cả" KHÔNG biểu diễn được bằng null/undefined.
  // Thiếu ALL_STORES thì bấm Tất cả không có phản hồi nào: không lớp phủ, không đổi hình.
  it("đang quay về Tất cả → chip Tất cả là pending, các cửa hàng mờ", () => {
    expect(stateOf(ALL_STORES, "s-ch1", ALL_STORES)).toBe("pending");
    for (const s of STORES) expect(stateOf(s, "s-ch1", ALL_STORES), s).toBe("dimmed");
  });

  it("đang chờ thì KHÔNG chip nào bấm được — kể cả chip vừa bấm", () => {
    for (const c of CHIPS) {
      expect(isStoreChipClickable(stateOf(c, "s-ch1", "s-ch2")), c).toBe(false);
    }
  });
});

describe("bất biến — quét mọi tổ hợp", () => {
  const SELECTED: (string | undefined)[] = [undefined, ...STORES];
  const PENDING: (string | null)[] = [null, ALL_STORES, ...STORES];

  it("KHÔNG BAO GIỜ có hai chip cùng active", () => {
    for (const sel of SELECTED) {
      for (const pend of PENDING) {
        const actives = CHIPS.filter((c) => stateOf(c, sel, pend) === "active");
        expect(actives.length, `sel=${sel} pend=${pend}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("KHÔNG BAO GIỜ có hai chip cùng pending", () => {
    for (const sel of SELECTED) {
      for (const pend of PENDING) {
        const p = CHIPS.filter((c) => stateOf(c, sel, pend) === "pending");
        expect(p.length, `sel=${sel} pend=${pend}`).toBeLessThanOrEqual(1);
      }
    }
  });

  // Không có chip nào nổi bật thì thanh trông như chưa lọc gì — trong khi bảng ĐANG lọc. Đó
  // đúng là lỗi im lặng: màn hình nói một đằng, dữ liệu một nẻo.
  it("LUÔN có đúng một chip nổi bật (active hoặc pending)", () => {
    for (const sel of SELECTED) {
      for (const pend of PENDING) {
        const hi = CHIPS.filter((c) => {
          const s: StoreChipState = stateOf(c, sel, pend);
          return s === "active" || s === "pending";
        });
        expect(hi.length, `sel=${sel} pend=${pend}`).toBe(1);
      }
    }
  });

  it("một cửa hàng KHÔNG nằm trong danh sách chip không làm mất chip nổi bật", () => {
    // Ca thật: URL còn ?storeId của một cửa hàng vừa bị gỡ khỏi tài khoản. Server đã rơi về
    // "tất cả cửa hàng của bạn" (api/orders/route.ts), nên thanh KHÔNG được để trống trơn.
    const hi = CHIPS.filter((c) => stateOf(c, "s-da-bi-go") === "active");
    expect(hi.length).toBe(0);
  });
});

describe("storeIdForChip — giá trị ghi vào URL", () => {
  it("chip Tất cả → undefined, tức XOÁ tham số storeId", () => {
    expect(storeIdForChip(ALL_STORES)).toBeUndefined();
  });

  it("chip cửa hàng → chính id đó", () => {
    expect(storeIdForChip("s-ch1")).toBe("s-ch1");
  });

  it("sentinel không đụng id thật — bắt đầu bằng hai gạch dưới", () => {
    expect(ALL_STORES.startsWith("__")).toBe(true);
  });
});
