import { describe, expect, it } from "vitest";

import {
  ORDER_FILTER_SCOPE,
  ORDER_TAB_KEYS,
  filterParamsToDropOn,
  isFilterOnTab,
  scrubFiltersForTab,
} from "@/app/lib/ui/order-filter-scope";

// ─── Bảng phạm vi bộ lọc ─────────────────────────────────────────────────────
//
// Bảng này giờ trả lời BA câu hỏi cùng lúc: có vẽ ô đó không · có đếm vào huy hiệu LỌC không ·
// có rửa khi đổi tab không. Khai sai một dòng là sai cả ba nơi — nên nó đáng được canh kỹ hơn
// độ dài của nó gợi ý.

describe("ORDER_FILTER_SCOPE — tính toàn vẹn của bảng", () => {
  it("mọi tab được khai đều là tab CÓ THẬT", () => {
    for (const [param, tabs] of Object.entries(ORDER_FILTER_SCOPE)) {
      for (const t of tabs) expect(ORDER_TAB_KEYS, `${param} → ${t}`).toContain(t);
    }
  });

  // Danh sách rỗng = không tab nào hiện ô đó = một bộ lọc không ai bật được, nhưng vẫn bị rửa
  // ở khắp nơi. Code chết trông như đang chạy.
  it("không bộ lọc nào có danh sách tab rỗng", () => {
    for (const [param, tabs] of Object.entries(ORDER_FILTER_SCOPE)) {
      expect(tabs.length, param).toBeGreaterThan(0);
    }
  });

  // Khai đủ bốn tab thì bằng không khai — và "không khai" mới là cách đúng để nói "dùng chung".
  // Để lọt một dòng thừa là mời người sau hiểu nhầm bảng này liệt kê MỌI bộ lọc.
  it("không bộ lọc nào khai đủ cả bốn tab (đó là 'dùng chung', đừng liệt kê)", () => {
    for (const [param, tabs] of Object.entries(ORDER_FILTER_SCOPE)) {
      expect(tabs.length, param).toBeLessThan(ORDER_TAB_KEYS.length);
    }
  });

  // 🔴 RANH GIỚI. Đây là bảng của BỘ LỌC. Nhét trạng thái panel hay phân trang vào là panel
  // đang mở tự đóng mỗi lần đổi tab, và không ai hiểu vì sao.
  it("KHÔNG chứa trạng thái panel / phân trang / sắp xếp", () => {
    for (const k of ["orderId", "activeItemId", "page", "limit", "sortBy", "sortDir", "view", "tab"]) {
      expect(ORDER_FILTER_SCOPE[k], k).toBeUndefined();
    }
  });
});

describe("isFilterOnTab", () => {
  it("bộ lọc không khai trong bảng = có ở MỌI tab", () => {
    for (const t of ORDER_TAB_KEYS) {
      expect(isFilterOnTab("search", t), t).toBe(true);
      expect(isFilterOnTab("storeId", t), t).toBe(true);
      expect(isFilterOnTab("phanLoaiKh", t), t).toBe(true);
      expect(isFilterOnTab("dateFrom", t), t).toBe(true);
    }
  });

  it("stageFilter chỉ ở Phòng Sản Xuất", () => {
    expect(isFilterOnTab("stageFilter", "master-hub")).toBe(true);
    expect(isFilterOnTab("stageFilter", "pre-production")).toBe(false);
    expect(isFilterOnTab("stageFilter", "completed")).toBe(false);
    expect(isFilterOnTab("stageFilter", "cancelled")).toBe(false);
  });

  it("bomFilter chỉ ở Phòng Thiết Kế", () => {
    expect(isFilterOnTab("bomFilter", "pre-production")).toBe(true);
    expect(isFilterOnTab("bomFilter", "master-hub")).toBe(false);
  });

  // 🔴 CA ĐÃ LẬT MỘT GIẢ ĐỊNH CỦA CHÍNH TÔI khi lập kế hoạch. Nút nhanh Deadline gác bằng
  // `filters.tab !== "completed"` (hiện ở BA tab), trong khi khoảng ngày requiredDateFrom/To —
  // cũng nói về deadline — chỉ ở master-hub. Gom hai thứ thành một "cụm deadline" là rửa mất bộ
  // lọc của người đang ở tab Thiết kế: một lỗi mới thay cho lỗi cũ.
  it("deadlinePreset RỘNG HƠN requiredDate* — ba tab, chỉ trừ Hoàn tất", () => {
    expect(isFilterOnTab("deadlinePreset", "pre-production")).toBe(true);
    expect(isFilterOnTab("deadlinePreset", "master-hub")).toBe(true);
    expect(isFilterOnTab("deadlinePreset", "cancelled")).toBe(true);
    expect(isFilterOnTab("deadlinePreset", "completed")).toBe(false);

    expect(isFilterOnTab("requiredDateFrom", "pre-production")).toBe(false);
    expect(isFilterOnTab("requiredDateFrom", "master-hub")).toBe(true);
  });

  // `tab` vắng mặt trong URL nghĩa là master-hub (orders-client.tsx bỏ tham số cho tab mặc
  // định để URL sạch). Hiểu sai chỗ này là rửa mất bộ lọc PSX ngay khi vào trang.
  it("tab undefined được hiểu là master-hub", () => {
    expect(isFilterOnTab("stageFilter", undefined)).toBe(true);
    expect(isFilterOnTab("bomFilter", undefined)).toBe(false);
  });
});

describe("filterParamsToDropOn", () => {
  it("sang Phòng Thiết Kế thì bỏ các bộ lọc của PSX và của Hoàn tất", () => {
    expect(filterParamsToDropOn("pre-production")).toEqual([
      "completedDateFrom", "completedDateTo",
      "estimatedDateFrom", "estimatedDateTo",
      "requiredDateFrom", "requiredDateTo",
      "stageFilter",
    ]);
  });

  it("sang Phòng Sản Xuất thì chỉ bỏ BOM và Ngày hoàn tất", () => {
    expect(filterParamsToDropOn("master-hub")).toEqual([
      "bomFilter", "completedDateFrom", "completedDateTo",
    ]);
  });

  it("sang Hoàn tất thì bỏ cả Deadline", () => {
    expect(filterParamsToDropOn("completed")).toContain("deadlinePreset");
  });

  it("không bao giờ bỏ bộ lọc dùng chung", () => {
    for (const t of ORDER_TAB_KEYS) {
      const dropped = filterParamsToDropOn(t);
      for (const shared of ["search", "storeId", "isPriority", "isRush", "phanLoaiKh", "status", "dateFrom", "dateTo", "datePreset"]) {
        expect(dropped, `${t} / ${shared}`).not.toContain(shared);
      }
    }
  });

  it("mỗi tham số trong bảng: giữ ở tab thuộc, bỏ ở tab không thuộc — không sót ca nào", () => {
    for (const [param, tabs] of Object.entries(ORDER_FILTER_SCOPE)) {
      for (const t of ORDER_TAB_KEYS) {
        const dropped = filterParamsToDropOn(t).includes(param);
        expect(dropped, `${param} @ ${t}`).toBe(!tabs.includes(t));
      }
    }
  });

  it("kết quả TIỀN ĐỊNH — đã sắp xếp, không phụ thuộc thứ tự khai báo", () => {
    for (const t of ORDER_TAB_KEYS) {
      const got = [...filterParamsToDropOn(t)];
      expect(got, t).toEqual([...got].sort());
    }
  });
});

describe("scrubFiltersForTab — rửa trong bộ nhớ, không qua URL", () => {
  const full = {
    tab: "master-hub",
    search: "nhan",
    storeId: "s1",
    isPriority: true,
    phanLoaiKh: "VIP",
    stageFilter: "DUC",
    bomFilter: "DA_CO",
    requiredDateFrom: "2026-01-01",
    completedDateTo: "2026-02-01",
    deadlinePreset: "overdue",
    orderId: "o1",
    page: 3,
    sortBy: "orderDate",
  };

  it("bỏ bộ lọc không thuộc tab", () => {
    const out = scrubFiltersForTab(full, "pre-production");
    expect(out.stageFilter).toBeUndefined();
    expect(out.requiredDateFrom).toBeUndefined();
    expect(out.completedDateTo).toBeUndefined();
  });

  it("GIỮ NGUYÊN bộ lọc dùng chung và trạng thái panel / phân trang", () => {
    const out = scrubFiltersForTab(full, "completed");
    expect(out.search).toBe("nhan");
    expect(out.storeId).toBe("s1");
    expect(out.isPriority).toBe(true);
    expect(out.phanLoaiKh).toBe("VIP");
    expect(out.orderId).toBe("o1");
    expect(out.page).toBe(3);
    expect(out.sortBy).toBe("orderDate");
  });

  it("bomFilter sống ở Thiết kế, chết ở nơi khác", () => {
    expect(scrubFiltersForTab(full, "pre-production").bomFilter).toBe("DA_CO");
    expect(scrubFiltersForTab(full, "master-hub").bomFilter).toBeUndefined();
  });

  // 🔴 BẤT BIẾN THEN CHỐT CỦA CẢ FILE.
  //
  // Hai đường rửa — một qua URL (buildNextParams → filterParamsToDropOn), một trong bộ nhớ
  // (scrubFiltersForTab) — PHẢI bỏ đúng cùng một tập. Lệch nhau là khoá truy vấn lúc chờ khác
  // khoá lúc xong, tức đúng lại cái lỗi "fetch hai lần" mà hàm này sinh ra để khử.
  it("bỏ ĐÚNG CÙNG TẬP với filterParamsToDropOn, ở mọi tab", () => {
    for (const tab of ORDER_TAB_KEYS) {
      const out = scrubFiltersForTab(full, tab) as Record<string, unknown>;
      const cleared = Object.keys(full).filter((k) => out[k] === undefined);
      const expected = filterParamsToDropOn(tab).filter((p) => p in full);
      expect([...cleared].sort(), tab).toEqual([...expected].sort());
    }
  });

  it("KHÔNG sửa object gốc", () => {
    const src = { ...full };
    scrubFiltersForTab(src, "completed");
    expect(src.stageFilter).toBe("DUC");
  });

  it("rửa hai lần cho cùng kết quả", () => {
    for (const tab of ORDER_TAB_KEYS) {
      const once = scrubFiltersForTab(full, tab);
      expect(scrubFiltersForTab(once, tab), tab).toEqual(once);
    }
  });

  // ⚠️ Đặt `undefined` chứ không `delete`: khoá truy vấn được dựng bằng cách so nội dung, và
  // một object thiếu hẳn khoá KHÁC một object có khoá mang giá trị undefined.
  it("giữ nguyên tập KHOÁ, chỉ đổi giá trị", () => {
    const out = scrubFiltersForTab(full, "completed");
    expect(Object.keys(out).sort()).toEqual(Object.keys(full).sort());
  });
});
