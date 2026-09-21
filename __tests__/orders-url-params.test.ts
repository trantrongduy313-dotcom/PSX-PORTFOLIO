import { describe, expect, it } from "vitest";

import { buildNextParams } from "@/app/dashboard/orders/_components/order-url-params";
import { ORDER_TAB_KEYS, scrubFiltersForTab } from "@/app/lib/ui/order-filter-scope";

// ─── TEST ĐẶC TÍNH cho việc dựng URL của màn Đơn hàng ────────────────────────
//
// 🔴 VÌ SAO CẦN, VÀ VÌ SAO VIẾT TRƯỚC KHI SỬA:
//
// Hàm này chạy trên MỌI thao tác của màn đông người dùng nhất — đổi tab, gõ tìm kiếm, chọn cửa
// hàng, sang trang, mở panel. Việc đang làm là RỬA bộ lọc khi đổi tab, tức đổi hành vi ngay
// trên đường đi đó.
//
// Rửa thiếu thì lỗi cũ còn nguyên. Rửa quá tay thì người dùng mất ô tìm kiếm và cửa hàng mỗi
// lần bấm tab — một lỗi MỚI, khó chịu hơn lỗi đang sửa, và cũng không có gì báo.
//
// Nhóm "GIỮ NGUYÊN" bên dưới chính là cái lưới đó.

const params = (qs: string) => new URLSearchParams(qs);
const toObj = (p: URLSearchParams) => Object.fromEntries(p.entries());

describe("đổi tab — GIỮ NGUYÊN bộ lọc dùng chung", () => {
  // Đây là hành vi ĐANG CHẠY và nó ĐÚNG. Test này không mô tả mong muốn, nó chốt hiện trạng:
  // đỏ nghĩa là phép rửa vừa ăn lan sang thứ không được đụng.
  it("search · storeId · isPriority · phanLoaiKh sống sót qua mọi tab", () => {
    const base = "search=nhan&storeId=s1&isPriority=true&phanLoaiKh=VIP";
    for (const tab of ["pre-production", "master-hub", "completed", "cancelled"] as const) {
      const out = toObj(buildNextParams(params(base), { tab, page: 1 }));
      expect(out.search, tab).toBe("nhan");
      expect(out.storeId, tab).toBe("s1");
      expect(out.isPriority, tab).toBe("true");
      expect(out.phanLoaiKh, tab).toBe("VIP");
    }
  });

  it("Ngày tạo (dateFrom/dateTo/datePreset) có ở mọi tab nên không bị rửa", () => {
    const out = toObj(buildNextParams(params("dateFrom=2026-01-01&dateTo=2026-02-01"), {
      tab: "completed",
    }));
    expect(out.dateFrom).toBe("2026-01-01");
    expect(out.dateTo).toBe("2026-02-01");
  });

  it("panel đang mở KHÔNG bị đóng khi đổi tab", () => {
    // orderId/activeItemId là trạng thái panel, không phải bộ lọc — chúng cố ý nằm ngoài bảng
    // phạm vi. Nhét chúng vào là panel tự đóng mỗi lần bấm tab và không ai hiểu vì sao.
    const out = toObj(buildNextParams(params("orderId=o1&activeItemId=i1"), { tab: "completed" }));
    expect(out.orderId).toBe("o1");
    expect(out.activeItemId).toBe("i1");
  });
});

describe("đổi tab — RỬA bộ lọc không thuộc tab mới", () => {
  // 🔴 CA CHÍNH, đúng thứ người dùng báo: lọc TIẾN ĐỘ ở Phòng Sản Xuất rồi sang Phòng Thiết Kế
  // thì bộ lọc vẫn đang lọc mà không còn ô nào để tắt.
  it("stageFilter biến mất khi rời Phòng Sản Xuất", () => {
    const out = toObj(buildNextParams(params("stageFilter=DUC"), { tab: "pre-production" }));
    expect(out.stageFilter).toBeUndefined();
  });

  it("stageFilter ở lại khi vẫn đang ở Phòng Sản Xuất", () => {
    const out = toObj(buildNextParams(params("stageFilter=DUC&tab=pre-production"), {
      tab: "master-hub",
    }));
    expect(out.stageFilter).toBe("DUC");
  });

  it("bomFilter biến mất khi rời Phòng Thiết Kế", () => {
    const out = toObj(buildNextParams(params("tab=pre-production&bomFilter=DA_CO"), {
      tab: "master-hub",
    }));
    expect(out.bomFilter).toBeUndefined();
  });

  it("Ngày hoàn tất chỉ sống ở tab Hoàn tất", () => {
    const qs = "tab=completed&completedDateFrom=2026-01-01&completedDateTo=2026-02-01";
    const stay = toObj(buildNextParams(params(qs), { tab: "completed" }));
    expect(stay.completedDateFrom).toBe("2026-01-01");

    const leave = toObj(buildNextParams(params(qs), { tab: "master-hub" }));
    expect(leave.completedDateFrom).toBeUndefined();
    expect(leave.completedDateTo).toBeUndefined();
  });

  it("Ngày DK HT và Ngày chốt SX chỉ sống ở Phòng Sản Xuất", () => {
    const qs = "requiredDateFrom=2026-01-01&estimatedDateTo=2026-03-01";
    const out = toObj(buildNextParams(params(qs), { tab: "completed" }));
    expect(out.requiredDateFrom).toBeUndefined();
    expect(out.estimatedDateTo).toBeUndefined();
  });

  // 🔴 CA ĐÃ LẬT MỘT GIẢ ĐỊNH CỦA CHÍNH TÔI. Nút nhanh Deadline gác bằng
  // `filters.tab !== "completed"` — tức hiện ở BA tab, KHÁC với requiredDateFrom/To vốn chỉ ở
  // master-hub. Gom hai thứ này thành "cụm deadline" là rửa mất bộ lọc của người đang ở tab
  // Thiết kế: một lỗi mới thay cho lỗi cũ.
  it("deadlinePreset SỐNG ở Thiết kế và Đã hủy, chỉ chết ở Hoàn tất", () => {
    for (const tab of ["pre-production", "master-hub", "cancelled"] as const) {
      const out = toObj(buildNextParams(params("deadlinePreset=overdue"), { tab }));
      expect(out.deadlinePreset, tab).toBe("overdue");
    }
    const gone = toObj(buildNextParams(params("deadlinePreset=overdue"), { tab: "completed" }));
    expect(gone.deadlinePreset).toBeUndefined();
  });

  it("rửa NHIỀU bộ lọc cùng lúc trong một lần đổi tab", () => {
    const qs = "stageFilter=DUC&requiredDateFrom=2026-01-01&search=abc&storeId=s1";
    const out = toObj(buildNextParams(params(qs), { tab: "completed" }));
    expect(out.stageFilter).toBeUndefined();
    expect(out.requiredDateFrom).toBeUndefined();
    expect(out.search).toBe("abc");   // dùng chung → còn
    expect(out.storeId).toBe("s1");
  });

  // Không đổi tab thì KHÔNG rửa gì — người dùng đang ở PSX gõ tìm kiếm không được mất
  // stageFilter họ vừa chọn.
  it("patch KHÔNG chứa tab thì không rửa gì cả", () => {
    const out = toObj(buildNextParams(params("stageFilter=DUC"), { search: "abc" }));
    expect(out.stageFilter).toBe("DUC");
  });
});

describe("isRush đã bị khai tử — chặn nó quay lại", () => {
  // 🔴 `isPriority` va `isRush` TUNG LA HAI THAM SO CHO CUNG MOT TRUY VAN.
  //
  // api/orders/route.ts co dung mot cau: `if (isPriority || isRush) { priorityCode: UT1 }`.
  // Hai nut khac ten, dat o hai cho khac nhau tren man hinh, ra dung mot ket qua — nen khong
  // ai co co hoi nhan ra chung giong nhau.
  //
  // Test nay ghi lai dieu do. Lan sau ai thay `isRush` trong log cu hoac trong mot bookmark se
  // khong "khoi phuc" no nhu mot tinh nang bi mat.
  it("patch { isRush } KHÔNG tạo ra tham số nào", () => {
    const out = buildNextParams(params(""), { isRush: true } as never);
    expect(out.toString()).toBe("");
  });

  it("URL cũ mang ?isRush=true thì tham số đó KHÔNG được đụng tới, chỉ là không ai đọc", () => {
    // Cố ý KHÔNG viết mã chuyển tiếp isRush → isPriority: nuôi một nhánh tương thích cho tham
    // số vừa khai tử là thêm thứ phải nhớ xoá, mà không ai sẽ nhớ. Hai nút vốn lọc giống nhau
    // nên thiệt hại gần bằng 0 — người mở link cũ thấy danh sách không lọc, không phải sai dữ liệu.
    const out = buildNextParams(params("isRush=true"), { search: "abc" });
    expect(out.get("search")).toBe("abc");
  });
});

describe("hành vi sẵn có — chốt lại để phép rửa không làm hỏng", () => {
  it("tab master-hub là mặc định nên KHÔNG ghi vào URL", () => {
    const out = toObj(buildNextParams(params("tab=completed"), { tab: "master-hub" }));
    expect(out.tab).toBeUndefined();
  });

  it("đổi tab xoá limit và _w", () => {
    const out = toObj(buildNextParams(params("limit=50&_w=1"), { tab: "completed" }));
    expect(out.limit).toBeUndefined();
    expect(out._w).toBeUndefined();
  });

  it("`undefined` nghĩa là XOÁ, còn vắng mặt nghĩa là ĐỪNG ĐỤNG", () => {
    // Khác biệt này chạy xuyên suốt hàm (`"x" in patch` chứ không phải `patch.x`), và nó là
    // cách nút "Tất cả" của thanh cửa hàng bỏ lọc.
    const cleared = toObj(buildNextParams(params("storeId=s1"), { storeId: undefined }));
    expect(cleared.storeId).toBeUndefined();

    const untouched = toObj(buildNextParams(params("storeId=s1"), { search: "x" }));
    expect(untouched.storeId).toBe("s1");
  });

  it("stageFilter và phanLoaiKh xoá page — không giữ trang cũ trên một tập khác", () => {
    expect(toObj(buildNextParams(params("page=3"), { stageFilter: "DUC" })).page).toBeUndefined();
    expect(toObj(buildNextParams(params("page=3"), { phanLoaiKh: "VIP" })).page).toBeUndefined();
  });

  it("đóng panel thì bỏ luôn activeItemId", () => {
    const out = toObj(buildNextParams(params("orderId=o1&activeItemId=i1"), { orderId: null }));
    expect(out.orderId).toBeUndefined();
    expect(out.activeItemId).toBeUndefined();
  });

  it("không sửa vào bộ tham số gốc", () => {
    const src = params("search=abc");
    buildNextParams(src, { search: "xyz", tab: "completed" });
    expect(src.get("search")).toBe("abc");
  });
});

describe("🔴 khoá truy vấn lúc CHỜ phải trùng khoá lúc URL đã bắt kịp", () => {
  // Đây là phát biểu chính xác của lỗi "bấm tab xong vài giây sau mới đúng".
  //
  // Màn Đơn hàng dựng khoá React Query từ bộ lọc. Trong cửa sổ chờ nó dùng bản trong bộ nhớ
  // (đã áp pendingTab), sau đó dùng bản từ URL. Nếu HAI BẢN KHÁC NHAU thì khoá đổi giữa chừng
  // → React Query coi là một truy vấn khác → FETCH LẦN HAI, và lần đầu trả về sai.
  //
  // Test này so hai đường rửa trên cùng một đầu vào. Bằng nhau = một lần fetch.
  it("rửa trong bộ nhớ ≡ rửa qua URL, ở mọi tab", () => {
    const before = {
      search: "nhan", storeId: "s1", isPriority: true, phanLoaiKh: "VIP",
      stageFilter: "DUC", bomFilter: "DA_CO",
      requiredDateFrom: "2026-01-01", completedDateTo: "2026-02-01",
      deadlinePreset: "overdue",
    } as Record<string, string | boolean>;

    for (const tab of ORDER_TAB_KEYS) {
      // đường 1 — trong bộ nhớ, lúc đang chờ
      const inMemory = scrubFiltersForTab(before, tab);
      const memKeys = Object.keys(before).filter((k) => inMemory[k] !== undefined).sort();

      // đường 2 — qua URL, sau khi router bắt kịp
      const qs = new URLSearchParams(
        Object.entries(before).map(([k, v]) => [k, String(v)]),
      );
      const urlOut = buildNextParams(qs, { tab });
      const urlKeys = Object.keys(before).filter((k) => urlOut.has(k)).sort();

      expect(memKeys, tab).toEqual(urlKeys);
    }
  });
});
