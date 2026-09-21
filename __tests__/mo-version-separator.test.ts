import { describe, it, expect } from "vitest";
import {
  formatVersionedDisplay,
  formatMoVersionedDisplay,
  getMoVersionDisplay,
  isMoFromWebapp,
  parseVersionSuffix,
  stripVersionSuffix,
  versionOf,
} from "@/app/lib/business/order-helpers";

// ─── Dấu phân cách phiên bản MO# ─────────────────────────────────────────────
//
// Vấn đề đã có thật: cùng một MO hiện "26.423423_1" ở bảng Danh sách đơn hàng nhưng
// "26.423423.1" ở màn Việc thiết kế 3D — user không biết đó là một hay hai đơn.
//
// Gốc rễ: formatMoVersionedDisplay cần cờ `isFromWebapp` (cho luật "_1 ngầm định"), mà
// phần lớn API không select Order.createdById. Không có cờ → màn hình in thô.
//
// Lời giải: formatVersionedDisplay KHÔNG cần cờ — nó chỉ ĐỔI DẤU của hậu tố đã có sẵn,
// không bịa thêm hậu tố. Dùng được ở mọi nơi, kể cả tin nhắn Chat.

describe("formatVersionedDisplay — không cần cờ, dùng được mọi nơi", () => {
  it("đổi hậu tố kiểu cũ '.' sang '_'", () => {
    expect(formatVersionedDisplay("26.423423.1")).toBe("26.423423_1");
    expect(formatVersionedDisplay("26.423423.12")).toBe("26.423423_12");
  });

  it("giữ nguyên hậu tố đã là '_'", () => {
    expect(formatVersionedDisplay("26.423423_2")).toBe("26.423423_2");
  });

  it("đổi '-N' (sản phẩm thứ N trong 1 SO) sang '_N'", () => {
    expect(formatVersionedDisplay("26.423423-3")).toBe("26.423423_3");
  });

  it("KHÔNG bịa hậu tố cho MO bare — đó là việc của luật '_1 ngầm định', cần cờ", () => {
    expect(formatVersionedDisplay("26.423423")).toBe("26.423423");
  });

  it("không hiểu nhầm số Odoo 2 phần thành phiên bản", () => {
    expect(formatVersionedDisplay("26.12345")).toBe("26.12345");
  });

  it("chuỗi rỗng / null / undefined → chuỗi rỗng (chỗ gọi tự quyết dấu '—')", () => {
    expect(formatVersionedDisplay(null)).toBe("");
    expect(formatVersionedDisplay(undefined)).toBe("");
    expect(formatVersionedDisplay("")).toBe("");
  });

  it("mã KHÔNG phải MO số (VD productionCode) giữ nguyên", () => {
    expect(formatVersionedDisplay("MO-2605-0001")).toBe("MO-2605-0001");
  });
});

describe("hai hàm định dạng KHÔNG BAO GIỜ lệch nhau về dấu", () => {
  // Đây là bất biến quan trọng nhất của cả thay đổi này. Trước đây hai hàm tự cài
  // luật tách hậu tố RIÊNG — hai nơi đọc cùng một sự thật. Giờ formatVersionedDisplay
  // uỷ quyền cho getMoVersionDisplay(s, false), nên chúng không thể trôi khỏi nhau.
  const SAMPLES = [
    "26.423423.1", "26.423423_2", "26.423423-3", "26.423423",
    "26.12345", "MO-2605-0001", "26.1.2.3",
  ];

  it("với isFromWebapp = false, hai hàm cho KẾT QUẢ Y HỆT", () => {
    for (const s of SAMPLES) {
      expect(formatVersionedDisplay(s)).toBe(formatMoVersionedDisplay(s, false));
    }
  });

  it("chênh lệch duy nhất khi isFromWebapp = true là luật '_1 ngầm định'", () => {
    // MO bare dạng số: bản có cờ thêm "_1", bản không cờ để nguyên.
    expect(formatMoVersionedDisplay("26.423423", true)).toBe("26.423423_1");
    expect(formatVersionedDisplay("26.423423")).toBe("26.423423");

    // Mọi trường hợp ĐÃ CÓ hậu tố thì cờ không đổi được gì — đây là điều khiến việc
    // dùng bản không cờ ở màn thiếu dữ liệu vẫn AN TOÀN.
    for (const s of ["26.423423.1", "26.423423_2", "26.423423-3"]) {
      expect(formatMoVersionedDisplay(s, true)).toBe(formatVersionedDisplay(s));
    }
  });
});

describe("định dạng hiển thị KHÔNG được đụng tới logic đếm phiên bản", () => {
  // Nếu việc đổi dấu vô tình rò sang thuật toán "phiên bản lớn nhất + 1" thì mã mới
  // sinh ra sẽ sai — nguy hiểm hơn hẳn một lỗi hiển thị.
  it("parseVersionSuffix vẫn đọc đúng cả hai dấu và giữ nguyên `sep` gốc", () => {
    expect(parseVersionSuffix("26.423423.1")).toEqual({ base: "26.423423", version: 1, sep: "." });
    expect(parseVersionSuffix("26.423423_1")).toEqual({ base: "26.423423", version: 1, sep: "_" });
  });

  it("stripVersionSuffix / versionOf không đổi", () => {
    expect(stripVersionSuffix("26.423423.7")).toBe("26.423423");
    expect(stripVersionSuffix("26.423423_7")).toBe("26.423423");
    expect(versionOf("26.423423.7")).toBe(7);
    expect(versionOf("26.423423")).toBe(0);
  });

  it("getMoVersionDisplay vẫn trả base và suffix RIÊNG (bảng cần để vẽ badge màu)", () => {
    expect(getMoVersionDisplay("26.423423.1", false)).toEqual({ base: "26.423423", verSuffix: "_1" });
    expect(getMoVersionDisplay("26.423423", false)).toEqual({ base: "26.423423", verSuffix: null });
    expect(getMoVersionDisplay("26.423423", true)).toEqual({ base: "26.423423", verSuffix: "_1" });
  });
});

// ─── Cờ nuôi luật "_1 ngầm định" ─────────────────────────────────────────────
//
// ⚠️ CỜ NÀY TỪNG SỐNG INLINE TRONG /api/orders. Popup nhắc việc cần nó nhưng không với tới
// được, nên đóng cứng `true` — mọi MO nhập từ Odoo mọc thêm "_1" mà bảng Đơn hàng không có.
// Nó ở đây để chỉ còn MỘT nơi trả lời câu hỏi này.

describe("isMoFromWebapp", () => {
  it("specs.createdViaWebapp = true → true", () => {
    expect(isMoFromWebapp({ specifications: { createdViaWebapp: true }, orderCreatedById: null })).toBe(true);
  });

  it("Order.createdById có giá trị → true (đơn tạo qua webapp)", () => {
    expect(isMoFromWebapp({ specifications: {}, orderCreatedById: "u1" })).toBe(true);
  });

  // MO nhập từ Odoo: script import không set createdById, và specs không có cờ.
  it("cả hai vắng → false", () => {
    expect(isMoFromWebapp({ specifications: {}, orderCreatedById: null })).toBe(false);
    expect(isMoFromWebapp({ specifications: null, orderCreatedById: undefined })).toBe(false);
  });

  // Cột Json trả unknown; giá trị rác không được biến thành `true`.
  it("specs sai hình / cờ không phải boolean true → false", () => {
    for (const v of ["x", 0, [], { createdViaWebapp: "true" }, { createdViaWebapp: 1 }]) {
      expect(isMoFromWebapp({ specifications: v, orderCreatedById: null }), JSON.stringify(v)).toBe(false);
    }
  });
});
