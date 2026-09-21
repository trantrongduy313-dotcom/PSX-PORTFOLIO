import { describe, expect, it } from "vitest";

import {
  buildApiQuery,
  buildMetaQuery,
  type ExtendedFilters,
} from "@/app/dashboard/orders/_components/orders-client";

// ĐÂY mới là "hệ thống lọc" của màn Đơn hàng: bảng không lọc ở client nữa, nó dựng query rồi
// để server lọc. Sai một tham số ở đây là bảng trả về SAI TẬP ĐƠN, và giao diện vẫn trông
// hoàn toàn bình thường.
//
// 🔴 File này THAY cho app/__tests__/filter-system.test.ts (1.170 dòng) và
// mo-status-transitions.test.ts (410 dòng). Hai file đó tự khai lại logic của một hàm
// (`flatRows`) ĐÃ BỊ XOÁ rồi test bản khai lại của chính chúng — xanh vĩnh viễn, không canh
// gì của hệ thống thật. Test ở đây import ĐÚNG hàm đang chạy.

const filters = (over: Partial<ExtendedFilters> = {}): ExtendedFilters =>
  ({ tab: "all", ...over }) as ExtendedFilters;

const paramsOf = (over: Partial<ExtendedFilters> = {}, now?: Date) =>
  new URLSearchParams(buildApiQuery(filters(over), now ?? new Date("2026-08-20T00:00:00Z")));

describe("tham số theo tab", () => {
  it("tab Phòng Thiết Kế / Phòng Sản Xuất → lọc theo zone, KHÔNG phải history", () => {
    expect(paramsOf({ tab: "pre-production" }).get("zone")).toBe("PRE_PRODUCTION");
    expect(paramsOf({ tab: "master-hub" }).get("zone")).toBe("MASTER_HUB");
    expect(paramsOf({ tab: "pre-production" }).get("history")).toBeNull();
  });

  // Hai tab kết thúc đọc BẢNG LỊCH SỬ. Quên cờ `history` là hỏi bảng đang-hoạt-động lấy đơn
  // đã xong — trả về rỗng, và bảng trông như "không có đơn nào hoàn tất".
  it("tab Hoàn tất / Đã hủy → cờ history kèm đúng trạng thái", () => {
    for (const [tab, status] of [["completed", "COMPLETED"], ["cancelled", "CANCELLED"]] as const) {
      const params = paramsOf({ tab });
      expect(params.get("history")).toBe("true");
      expect(params.get("status")).toBe(status);
    }
  });

  // Tab "Tất cả" cố ý KHÔNG gửi zone — gửi là thu hẹp mất một nửa số đơn.
  it("tab Tất cả → không gửi zone, không gửi history", () => {
    const params = paramsOf({ tab: "all" });
    expect(params.get("zone")).toBeNull();
    expect(params.get("history")).toBeNull();
  });
});

describe("lọc theo cột", () => {
  it("chỉ gửi tham số người dùng thật sự đặt", () => {
    const params = paramsOf({ search: "26.10905", storeId: "s1", phanLoaiKh: "VIP" });
    expect(params.get("search")).toBe("26.10905");
    expect(params.get("storeId")).toBe("s1");
    expect(params.get("phanLoaiKh")).toBe("VIP");
  });

  // Ô rỗng KHÔNG được gửi: `search=` là server tìm chuỗi rỗng, không phải "không lọc".
  it("ô rỗng → không gửi tham số đó", () => {
    const params = paramsOf({ search: "", storeId: "", phanLoaiKh: "" });
    for (const key of ["search", "storeId", "phanLoaiKh"]) {
      expect(params.get(key)).toBeNull();
    }
  });

  it("cờ ưu tiên chỉ gửi khi bật", () => {
    expect(paramsOf({ isPriority: true }).get("isPriority")).toBe("true");
    expect(paramsOf({ isPriority: false }).get("isPriority")).toBeNull();
  });
});

describe("phân trang", () => {
  // Trang 1 là mặc định — gửi `page=1` chỉ làm URL dài ra và tạo thêm một khoá cache khác
  // cho cùng một kết quả.
  it("trang 1 → không gửi page", () => {
    expect(paramsOf({ page: 1 }).get("page")).toBeNull();
    expect(paramsOf({ page: 3 }).get("page")).toBe("3");
  });

  // 🔴 Khi lọc theo công đoạn, API tự phân trang. Gửi kèm page/limit là cắt mất kết quả một
  // cách im lặng — người dùng thấy thiếu MO mà không hiểu vì sao.
  it("đang lọc theo công đoạn → KHÔNG gửi page/limit", () => {
    const params = paramsOf({ stageFilter: "dinh-hot", page: 3, limit: 50 });
    expect(params.get("stageFilter")).toBe("dinh-hot");
    expect(params.get("page")).toBeNull();
    expect(params.get("limit")).toBeNull();
  });
});

describe("khoảng ngày", () => {
  // Người dùng chọn tay thì phải thắng preset — nếu không, chọn xong vẫn ra kết quả của preset.
  it("khoảng ngày chọn tay ĐÈ preset", () => {
    const params = paramsOf({ dateFrom: "2026-01-01", datePreset: 7 });
    expect(params.get("dateFrom")).toBe("2026-01-01");
  });

  it("preset → tính lùi đúng số ngày từ mốc hiện tại", () => {
    const params = paramsOf({ datePreset: 7 }, new Date("2026-08-20T10:00:00Z"));
    expect(params.get("dateFrom")?.slice(0, 10)).toBe("2026-08-13");
  });

  // preset = 0 nghĩa là "hôm nay", KHÔNG phải "không lọc" — bỏ qua nó là trả về cả năm dữ liệu.
  it("preset = 0 → vẫn gửi mốc hôm nay", () => {
    expect(paramsOf({ datePreset: 0 }, new Date("2026-08-20T10:00:00Z")).get("dateFrom")).not.toBeNull();
  });

  it("preset âm → không lọc theo ngày", () => {
    expect(paramsOf({ datePreset: -1 }).get("dateFrom")).toBeNull();
  });

  it("ba bộ lọc ngày đi ba tham số riêng, không lẫn nhau", () => {
    const params = paramsOf({
      requiredDateFrom: "2026-02-01", estimatedDateFrom: "2026-03-01", completedDateFrom: "2026-04-01",
    });
    expect(params.get("requiredDateFrom")).toBe("2026-02-01");
    expect(params.get("estimatedDateFrom")).toBe("2026-03-01");
    expect(params.get("completedDateFrom")).toBe("2026-04-01");
  });
});

describe("buildMetaQuery — query nhẹ để đếm tổng", () => {
  it("chỉ mang tham số cấp tab, bỏ hết search/sort/phân trang", () => {
    const params = new URLSearchParams(buildMetaQuery(filters({
      tab: "master-hub", search: "abc", sortBy: "createdAt", page: 3, limit: 50,
    })));
    expect(params.get("zone")).toBe("MASTER_HUB");
    for (const key of ["search", "sortBy", "page", "limit"]) {
      expect(params.get(key)).toBeNull();
    }
  });

  // 🔴 Tab lịch sử có snapshot RIÊNG theo cửa hàng, tab thường thì không. Gửi storeId cho tab
  // thường làm total đếm một cửa hàng nhưng snapshot đếm tất cả → luôn lệch → bản vá im lặng
  // bị chặn mãi mãi.
  it("chỉ tab lịch sử mới gửi storeId", () => {
    const history = new URLSearchParams(buildMetaQuery(filters({ tab: "completed", storeId: "s1" })));
    expect(history.get("storeId")).toBe("s1");

    for (const tab of ["all", "pre-production", "master-hub"] as const) {
      const params = new URLSearchParams(buildMetaQuery(filters({ tab, storeId: "s1" })));
      expect(params.get("storeId")).toBeNull();
    }
  });
});
