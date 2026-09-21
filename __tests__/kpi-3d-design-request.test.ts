import { describe, expect, it } from "vitest";

import { effectiveDesignBlock, resolveDesignRequest } from "@/app/lib/business/kpi-3d/design-request";

// "Yêu cầu thiết kế" KHÔNG phải một cột — nó nằm trong ProductionDetail.extraData, ở một trong
// hai chỗ. Luật chọn phải giống HỆT sidebar, nếu không bảng và sidebar sẽ hiện hai giá trị khác
// nhau cho cùng một MO và không ai hiểu vì sao.

const perItem = (itemId: string, value: unknown) => ({
  perItem: { [itemId]: { design: { yeucauThietKe: value } } },
});

describe("resolveDesignRequest", () => {
  it("đọc từ cụm per-MO", () => {
    expect(resolveDesignRequest(perItem("i1", "Chỉnh size"), "i1")).toBe("Chỉnh size");
  });

  it("MO chưa có cụm riêng → rơi về cụm dùng chung (dữ liệu cũ)", () => {
    const extra = { design: { yeucauThietKe: "TK mới" }, ...perItem("i1", "Chỉnh size") };
    expect(resolveDesignRequest(extra, "i2")).toBe("TK mới");
  });

  // ⚠️ ĐÂY LÀ CHỖ DỄ LÀM SAI NHẤT, và là lý do hàm này tồn tại.
  //
  // Sidebar chọn CẢ CỤM `design` (`perItemDesign ?? sharedDesign`), KHÔNG rơi về từng trường. Hễ
  // MO đã có cụm riêng thì cụm chung bị bỏ qua HOÀN TOÀN — kể cả khi trường này trong cụm riêng
  // đang rỗng. Rơi về từng trường ở đây sẽ làm bảng hiện một giá trị mà sidebar không hiện.
  it("có cụm riêng nhưng trường rỗng → KHÔNG rơi về cụm chung", () => {
    const extra = { design: { yeucauThietKe: "TK mới" }, ...perItem("i1", "") };
    expect(resolveDesignRequest(extra, "i1")).toBeNull();
  });

  it("có cụm riêng nhưng thiếu hẳn trường → vẫn KHÔNG rơi về cụm chung", () => {
    const extra = { design: { yeucauThietKe: "TK mới" }, perItem: { i1: { design: { nhomSP3D: "Trang sức" } } } };
    expect(resolveDesignRequest(extra, "i1")).toBeNull();
  });

  // Trả null chứ không trả chuỗi rỗng: chỗ hiển thị cần phân biệt "chưa đặt" với giá trị thật.
  it("chưa đặt / chỉ khoảng trắng → null", () => {
    expect(resolveDesignRequest(perItem("i1", "   "), "i1")).toBeNull();
    expect(resolveDesignRequest({ design: {} }, "i1")).toBeNull();
    expect(resolveDesignRequest({}, "i1")).toBeNull();
  });

  it("cắt khoảng trắng thừa", () => {
    expect(resolveDesignRequest(perItem("i1", "  Làm INFO  "), "i1")).toBe("Làm INFO");
  });

  // extraData là cột JSON tự do — dữ liệu nhập từ script cũ có thể là bất cứ hình gì. Một dòng
  // rác KHÔNG được phép làm sập cả bảng 200 dòng.
  it("JSON rác đủ kiểu → null, không ném lỗi", () => {
    for (const junk of [null, undefined, "chuỗi", 42, [], [1, 2], { perItem: "khong-phai-object" }]) {
      expect(resolveDesignRequest(junk, "i1"), JSON.stringify(junk)).toBeNull();
    }
  });

  it("giá trị không phải chuỗi → null, không ép kiểu bừa", () => {
    for (const bad of [42, true, {}, ["TK mới"]]) {
      expect(resolveDesignRequest(perItem("i1", bad), "i1"), JSON.stringify(bad)).toBeNull();
    }
  });

  // Route truyền `r.orderItem?.id ?? null` — lượt giao việc mồ côi MO thì vẫn phải đọc được cụm
  // chung thay vì ném lỗi.
  it("không có orderItemId → đọc cụm dùng chung", () => {
    expect(resolveDesignRequest({ design: { yeucauThietKe: "TK cũ" } }, null)).toBe("TK cũ");
  });
});

describe("effectiveDesignBlock", () => {
  // Tách riêng để các trường khác trong cụm (yeucauKyThuat, nhomSP3D…) dùng lại đúng phép chọn
  // này khi cần lên bảng, thay vì viết lại lần nữa.
  it("trả cả cụm, không chỉ một trường", () => {
    const block = effectiveDesignBlock({ perItem: { i1: { design: { yeucauThietKe: "TK mới", nhomSP3D: "Trang sức" } } } }, "i1");
    expect(block?.nhomSP3D).toBe("Trang sức");
  });

  it("không có cụm nào → null", () => {
    expect(effectiveDesignBlock({ perItem: { i1: {} } }, "i1")).toBeNull();
  });
});
