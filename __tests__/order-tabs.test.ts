import { describe, expect, it } from "vitest";

import {
  MH_PANEL_TABS,
  NON_RND_ROLES,
  clampTabKey,
  firstVisibleTabKey,
  ORDER_LIST_TABS,
  PTK_PANEL_TABS,
  isTabVisibleTo,
  visibleTabs,
  type TabVisibility,
} from "@/app/lib/ui/order-tabs";
import { ORDER_TAB_KEYS } from "@/app/lib/ui/order-filter-scope";
import { USER_ROLE_VALUES } from "@/app/lib/roles";

// ─── Tab của màn Đơn hàng ────────────────────────────────────────────────────
//
// Ba bộ tab này trước đây là JSX viết thẳng trong component — không kiểm được gì. Nay chúng là
// dữ liệu, và sắp mang thêm quyền xem theo vai (R&D chỉ thấy tab Sản xuất).
//
// ⚠️ NHẮC LẠI ĐIỀU MODULE ĐÃ NÓI: đây chỉ là lớp ẩn giao diện. Ẩn một tab KHÔNG ngăn ai gọi
// thẳng API với tham số của tab đó. Test ở đây chốt phần HIỂN THỊ; phần chặn thật thuộc về API
// và phải có test riêng.

const ALL_SETS: Array<[string, readonly TabVisibility[]]> = [
  ["ORDER_LIST_TABS", ORDER_LIST_TABS],
  ["PTK_PANEL_TABS", PTK_PANEL_TABS],
  ["MH_PANEL_TABS", MH_PANEL_TABS],
];

describe("Tính toàn vẹn của ba bộ tab", () => {
  it("không bộ nào rỗng", () => {
    for (const [name, set] of ALL_SETS) expect(set.length, name).toBeGreaterThan(0);
  });

  it("không bộ nào có key trùng", () => {
    for (const [name, set] of ALL_SETS) {
      const keys = (set as Array<{ key: string }>).map((t) => t.key);
      expect(new Set(keys).size, name).toBe(keys.length);
    }
  });

  // 🔴 `roles: []` là "không ai thấy" — một tab vô hình với mọi người, nhưng khối JSX của nó
  // vẫn nằm đó. Code chết trông như đang chạy. Muốn bỏ tab thì XOÁ dòng, đừng để mảng rỗng.
  it("không tab nào khai roles RỖNG", () => {
    for (const [name, set] of ALL_SETS) {
      for (const t of set) {
        if (t.roles) expect(t.roles.length, name).toBeGreaterThan(0);
      }
    }
  });

  // Khai đủ mọi vai = không khai. Để lọt một dòng thừa là mời người sau hiểu nhầm rằng bảng
  // này liệt kê MỌI tab kèm quyền, trong khi quy ước là "không khai = mọi vai".
  it("không tab nào khai đủ MỌI vai (đó là 'mọi vai', đừng liệt kê)", () => {
    for (const [name, set] of ALL_SETS) {
      for (const t of set) {
        if (t.roles) expect(t.roles.length, name).toBeLessThan(USER_ROLE_VALUES.length);
      }
    }
  });
});

describe("ORDER_LIST_TABS khớp với bảng phạm vi bộ lọc", () => {
  // 🔴 BẤT BIẾN LIÊN MODULE. `ORDER_FILTER_SCOPE` quyết định bộ lọc nào sống ở tab nào; bảng
  // tab này quyết định tab nào được thấy. Hai bảng nói về CÙNG BỐN TAB — lệch nhau là một tab
  // có bộ lọc nhưng không hiện, hoặc hiện nhưng không rửa bộ lọc khi rời đi.
  it("đúng bốn tab, đúng những khoá của ORDER_TAB_KEYS", () => {
    expect(ORDER_LIST_TABS.map((t) => t.key).sort()).toEqual([...ORDER_TAB_KEYS].sort());
  });

  it("labelKey trùng key — nhãn tra thẳng bằng khoá tab, không có bảng ánh xạ thứ hai", () => {
    for (const t of ORDER_LIST_TABS) expect(t.labelKey).toBe(t.key);
  });
});

describe("Tab panel", () => {
  it("PTK và PSX cùng mở đầu bằng Đơn hàng · Sản phẩm", () => {
    expect(PTK_PANEL_TABS.slice(0, 2).map((t) => t.key)).toEqual(["info", "items"]);
    expect(MH_PANEL_TABS.slice(0, 2).map((t) => t.key)).toEqual(["info", "items"]);
  });

  // `raw` phân biệt "nhãn là khoá trong L.ui.panel" với "nhãn là chữ hiển thị thẳng". Chỗ
  // render đọc cờ này thay vì đoán — đoán sai thì tab hiện ra chữ "tabOrder".
  it("nhãn không phải raw thì phải là khoá hợp lệ (không có dấu cách)", () => {
    for (const t of [...PTK_PANEL_TABS, ...MH_PANEL_TABS]) {
      if (!t.raw) expect(t.label, t.key).not.toContain(" ");
    }
  });
});

describe("isTabVisibleTo / visibleTabs", () => {
  it("tab KHÔNG khai roles → mọi vai thấy, kể cả vai lạ và undefined", () => {
    const tab: TabVisibility = {};
    for (const r of ["ADMIN", "ORDER", "PRODUCTION", "SALES", "DESIGN_3D", "VAI_LA", undefined]) {
      expect(isTabVisibleTo(tab, r as string | undefined), String(r)).toBe(true);
    }
  });

  it("tab CÓ khai roles → chỉ vai trong danh sách thấy", () => {
    const tab: TabVisibility = { roles: ["ADMIN"] };
    expect(isTabVisibleTo(tab, "ADMIN")).toBe(true);
    expect(isTabVisibleTo(tab, "SALES")).toBe(false);
    expect(isTabVisibleTo(tab, undefined)).toBe(false);
  });

  it("visibleTabs giữ NGUYÊN THỨ TỰ khai báo", () => {
    const tabs = [{ key: "a" }, { key: "b", roles: ["ADMIN"] as const }, { key: "c" }];
    expect(visibleTabs(tabs, "ADMIN").map((t) => t.key)).toEqual(["a", "b", "c"]);
    expect(visibleTabs(tabs, "SALES").map((t) => t.key)).toEqual(["a", "c"]);
  });

  it("mọi vai NGOÀI R&D vẫn thấy đủ cả ba bộ", () => {
    for (const role of NON_RND_ROLES) {
      for (const [name, set] of ALL_SETS) {
        expect(visibleTabs(set, role).length, `${role} / ${name}`).toBe(set.length);
      }
    }
  });
});

// ─── R&D ─────────────────────────────────────────────────────────────────────

describe("R&D chỉ thấy phần Phòng Sản Xuất", () => {
  // 🔴 BỘ DÒ CHO MỘT BẢN SAO. `NON_RND_ROLES` chép tay danh sách vai vì module tab giữ THUẦN,
  // không phụ thuộc bảng vai của tầng auth. Bản sao thì phải có bộ dò — nếu không, vai thứ bảy
  // ra đời sẽ âm thầm mất ba tab danh sách và bốn tab panel mà không ai biết.
  it("NON_RND_ROLES đúng bằng USER_ROLE_VALUES trừ RND", () => {
    expect([...NON_RND_ROLES].sort()).toEqual(USER_ROLE_VALUES.filter((r) => r !== "RND").sort());
  });

  it("danh sách: chỉ còn tab Phòng Sản Xuất", () => {
    expect(visibleTabs(ORDER_LIST_TABS, "RND").map((t) => t.key)).toEqual(["master-hub"]);
  });

  // Kể cả tab Đơn hàng cũng ẩn: nó bắt họ bấm thêm một bước trước khi tới ô Mã số mẫu, còn
  // phần định danh (MO# · SO# · tên khách) đã nằm ở dòng tiêu đề panel, thấy được ở mọi tab.
  it("panel PSX: chỉ còn ĐÚNG MỘT tab — Sản phẩm", () => {
    expect(visibleTabs(MH_PANEL_TABS, "RND").map((t) => t.key)).toEqual(["items"]);
  });
});

describe("clampTabKey", () => {
  it("R&D gõ thẳng ?tab=pre-production bị ép về master-hub", () => {
    for (const t of ["pre-production", "completed", "cancelled"]) {
      expect(clampTabKey(ORDER_LIST_TABS, t, "RND"), t).toBe("master-hub");
    }
  });

  it("tab hợp lệ của vai thì giữ nguyên", () => {
    expect(clampTabKey(ORDER_LIST_TABS, "master-hub", "RND")).toBe("master-hub");
    for (const role of NON_RND_ROLES) {
      expect(clampTabKey(ORDER_LIST_TABS, "pre-production", role), role).toBe("pre-production");
    }
  });

  // ⚠️ Tab đang mở còn nhận những khoá KHÔNG phải tab danh sách (VD "all" của bộ lọc nhanh).
  // Ép cả chúng là bẻ gãy chúng cho MỌI vai — kể cả vai không bị hạn chế gì.
  it("khoá không có trong bảng thì KHÔNG bị đụng tới", () => {
    for (const role of [...USER_ROLE_VALUES, undefined]) {
      expect(clampTabKey(ORDER_LIST_TABS, "all", role as string | undefined), String(role)).toBe("all");
    }
  });

  // 🔴 CA ĐÃ LÀM PANEL TRẮNG. `mhTab` khởi tạo cứng là "info"; ẩn tab đó khỏi R&D mà không ép
  // thì thanh tab vẽ một nút còn nội dung hỏi `mhTab === "items"` → không render gì.
  it("panel PSX: R&D mở mặc định 'info' bị ép về 'items'", () => {
    expect(clampTabKey(MH_PANEL_TABS, "info", "RND")).toBe("items");
  });

  it("vai không thấy tab nào → trả NGUYÊN VẸN, không undefined", () => {
    const nobody = [{ key: "x", roles: ["ADMIN"] as const }];
    expect(clampTabKey(nobody, "x", "SALES")).toBe("x");
    expect(firstVisibleTabKey(nobody, "SALES")).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BỘ DÒ CHO "PANEL TRẮNG" — suy từ USER_ROLE_VALUES, vai thứ bảy được canh sẵn
// ═══════════════════════════════════════════════════════════════════════════

describe("Không vai nào bị bỏ lại với màn hình trống", () => {
  const SETS: Array<[string, readonly (TabVisibility & { key: string })[]]> = [
    ["ORDER_LIST_TABS", ORDER_LIST_TABS],
    ["PTK_PANEL_TABS", PTK_PANEL_TABS],
    ["MH_PANEL_TABS", MH_PANEL_TABS],
  ];

  it.each(USER_ROLE_VALUES)("%s thấy ít nhất MỘT tab ở cả ba bộ", (role) => {
    for (const [name, set] of SETS) {
      expect(visibleTabs(set, role).length, `${role} không thấy tab nào trong ${name}`).toBeGreaterThan(0);
    }
  });

  // 🔴 BẤT BIẾN TRUNG TÂM CỦA CƠ CHẾ NÀY, viết thành một câu: sau khi ép, tab đang mở LUÔN là
  // một tab vai đó nhìn thấy. Đó chính xác là điều đã bị vi phạm hai lần (?tab= và mhTab="info").
  it("ép từ BẤT KỲ khoá nào trong bảng cũng ra một tab vai đó THẤY", () => {
    for (const role of USER_ROLE_VALUES) {
      for (const [name, set] of SETS) {
        const seen = new Set(visibleTabs(set, role).map((t) => t.key));
        for (const t of set) {
          expect(seen, `${role} / ${name} / ${t.key}`).toContain(clampTabKey(set, t.key, role));
        }
      }
    }
  });
});
