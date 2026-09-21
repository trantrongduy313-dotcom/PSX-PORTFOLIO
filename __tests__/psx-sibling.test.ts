import { describe, it, expect } from "vitest";
import { psxSiblingByMoBase, psxSiblingOf, type PsxCandidate } from "@/app/lib/business/orders/psx-sibling";

const cand = (o: Partial<PsxCandidate> = {}): PsxCandidate => ({
  moNumber: "26.90203_1", itemStatus: null, orderStatus: "IN_PRODUCTION", orderNumber: "26.90203_1", ...o,
});
const bases = (...b: string[]) => new Set(b);

describe("chọn bản PSX đại diện cho mỗi họ MO", () => {
  it("một bản → chính nó", () => {
    const m = psxSiblingByMoBase([cand()], bases("26.90203"));
    expect(m.get("26.90203")).toEqual({ orderNumber: "26.90203_1", status: "IN_PRODUCTION", version: 1 });
  });

  it("nhiều bản cùng họ → lấy PHIÊN BẢN CAO NHẤT", () => {
    const m = psxSiblingByMoBase([
      cand({ moNumber: "26.90203_1", orderNumber: "A" }),
      cand({ moNumber: "26.90203_3", orderNumber: "C" }),
      cand({ moNumber: "26.90203_2", orderNumber: "B" }),
    ], bases("26.90203"));
    expect(m.get("26.90203")?.orderNumber).toBe("C");
  });

  it("nhận cả hậu tố kiểu cũ dấu chấm", () => {
    const m = psxSiblingByMoBase([cand({ moNumber: "26.90203.2" })], bases("26.90203"));
    expect(m.get("26.90203")?.version).toBe(2);
  });
});

describe("loại false-positive của startsWith thô", () => {
  // Truy vấn lọc bằng `startsWith` cho nhanh, nhưng "26.1234" cũng khớp nhầm "26.12345".
  it("họ khác không lọt vào dù chuỗi bắt đầu giống", () => {
    const m = psxSiblingByMoBase([cand({ moNumber: "26.12345_1" })], bases("26.1234"));
    expect(m.size).toBe(0);
  });
});

describe("bản đã HUỶ không còn là 'đang ở PSX'", () => {
  // Không loại thì sau khi huỷ bản cũ và tạo MO mới, huy hiệu vẫn hiện — báo một thứ không còn.
  it("huỷ ở cấp MO", () => {
    expect(psxSiblingByMoBase([cand({ itemStatus: "CANCELLED" })], bases("26.90203")).size).toBe(0);
  });

  it("huỷ ở cấp đơn", () => {
    expect(psxSiblingByMoBase([cand({ orderStatus: "CANCELLED" })], bases("26.90203")).size).toBe(0);
  });

  it("itemStatus THẮNG orderStatus — MO còn sống trong đơn đã huỷ vẫn tính", () => {
    const m = psxSiblingByMoBase([cand({ itemStatus: "IN_PRODUCTION", orderStatus: "CANCELLED" })], bases("26.90203"));
    expect(m.size).toBe(1);
  });

  it("bản HOÀN TẤT VẪN tính — đã sản xuất thật, đó là lúc cần cảnh báo nhất", () => {
    const m = psxSiblingByMoBase([cand({ itemStatus: "COMPLETED" })], bases("26.90203"));
    expect(m.size).toBe(1);
  });

  it("bản huỷ không che mất bản còn sống cùng họ", () => {
    const m = psxSiblingByMoBase([
      cand({ moNumber: "26.90203_2", itemStatus: "CANCELLED", orderNumber: "HUY" }),
      cand({ moNumber: "26.90203_1", orderNumber: "SONG" }),
    ], bases("26.90203"));
    expect(m.get("26.90203")?.orderNumber).toBe("SONG");
  });
});

describe("psxSiblingOf", () => {
  const byBase = psxSiblingByMoBase([cand()], bases("26.90203"));

  it("MO ở PTK có bản anh em → trả về", () => {
    expect(psxSiblingOf({ moNumber: "26.90203_1", zone: "PRE_PRODUCTION" }, byBase)).not.toBeNull();
  });

  it("MO ĐANG Ở PSX → null, không tự gắn cờ cho chính nó", () => {
    // Thiếu chốt này thì mọi MO bên PSX đều hiện "đã chuyển sang PSX" — đúng nghĩa đen, vô nghĩa
    // với người đọc.
    expect(psxSiblingOf({ moNumber: "26.90203_1", zone: "MASTER_HUB" }, byBase)).toBeNull();
  });

  it("không có mã MO → null", () => {
    expect(psxSiblingOf({ moNumber: null, zone: "PRE_PRODUCTION" }, byBase)).toBeNull();
    expect(psxSiblingOf({ moNumber: "", zone: "PRE_PRODUCTION" }, byBase)).toBeNull();
  });

  it("họ khác → null", () => {
    expect(psxSiblingOf({ moNumber: "26.11111", zone: "PRE_PRODUCTION" }, byBase)).toBeNull();
  });
});
