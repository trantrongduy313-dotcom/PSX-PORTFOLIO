import { describe, expect, it } from "vitest";

import { deadlineRangeFor } from "@/app/lib/business/orders/deadline-preset";
import { STATUS_BY_TAB } from "@/app/dashboard/orders/_components/orders-toolbar";

// Thay cho app/__tests__/filter-improvements.test.ts (488 dòng). File đó tự khai lại
// `STATUS_BY_TAB` và logic preset deadline rồi test bản khai lại của chính nó.
//
// 🔴 Bản chép của STATUS_BY_TAB đã LỆCH: thiếu `DESIGN_COMPLETED` ở cả tab "Tất cả" lẫn tab
// Phòng Thiết Kế. Trạng thái đó thêm vào bản thật sau, và test không hề biết.
//
// Logic preset deadline thì trước đây nằm THẲNG trong JSX của orders-toolbar (40 dòng trong
// một `onClick`), nên không có cách nào test. Nay nó là `deadlineRangeFor`, JSX còn 5 dòng.

const at = (iso: string) => new Date(iso);

describe("deadlineRangeFor", () => {
  it("bỏ lọc → hai đầu đều trống", () => {
    expect(deadlineRangeFor(null, at("2026-08-20T10:00:00Z")))
      .toEqual({ requiredDateFrom: undefined, requiredDateTo: undefined });
  });

  // Mốc phải là NỬA ĐÊM UTC — khớp đúng cách `requiredDate` được lưu trong DB. Lấy giờ hiện
  // tại là đơn có deadline hôm nay nhưng sớm hơn bây giờ sẽ rơi khỏi kết quả.
  it("neo về nửa đêm UTC, không lấy giờ hiện tại", () => {
    const range = deadlineRangeFor("week", at("2026-08-20T15:47:00Z"));
    expect(range.requiredDateFrom).toBe("2026-08-20T00:00:00.000Z");
  });

  it("'7 ngày tới' → từ hôm nay đến đúng 7 ngày sau", () => {
    const range = deadlineRangeFor("week", at("2026-08-20T10:00:00Z"));
    expect(range.requiredDateFrom).toBe("2026-08-20T00:00:00.000Z");
    expect(range.requiredDateTo).toBe("2026-08-27T00:00:00.000Z");
  });

  // 🔴 "week" và "thisWeek" KHÁC nhau. Lẫn hai cái là bảng trả sai tập đơn vào mọi ngày
  // không phải Thứ 2.
  it("'tuần này' → Thứ 2 đến Chủ nhật của tuần lịch, không phải 7 ngày tới", () => {
    // 2026-08-20 là Thứ Năm.
    const range = deadlineRangeFor("thisWeek", at("2026-08-20T10:00:00Z"));
    expect(range.requiredDateFrom).toBe("2026-08-17T00:00:00.000Z"); // Thứ 2
    expect(range.requiredDateTo).toBe("2026-08-23T00:00:00.000Z");   // Chủ nhật
  });

  // Chủ nhật là NGÀY CUỐI của tuần ISO, không phải ngày đầu. Tính nhầm là cả Chủ nhật bị đẩy
  // sang tuần sau.
  it("hôm nay là Chủ nhật → vẫn thuộc tuần đang chạy", () => {
    // 2026-08-23 là Chủ nhật.
    const range = deadlineRangeFor("thisWeek", at("2026-08-23T10:00:00Z"));
    expect(range.requiredDateFrom).toBe("2026-08-17T00:00:00.000Z");
    expect(range.requiredDateTo).toBe("2026-08-23T00:00:00.000Z");
  });

  it("hôm nay là Thứ 2 → tuần bắt đầu từ chính hôm nay", () => {
    const range = deadlineRangeFor("thisWeek", at("2026-08-17T10:00:00Z"));
    expect(range.requiredDateFrom).toBe("2026-08-17T00:00:00.000Z");
  });

  // 🔴 Quá hạn KHÔNG có mốc đầu: mọi deadline trước hôm nay đều tính, dù cũ bao lâu. Đặt một
  // mốc đầu là giấu mất những đơn trễ lâu nhất — đúng những đơn cần thấy nhất.
  it("'quá hạn' → không có mốc đầu, mốc cuối là hôm qua", () => {
    const range = deadlineRangeFor("overdue", at("2026-08-20T10:00:00Z"));
    expect(range.requiredDateFrom).toBeUndefined();
    expect(range.requiredDateTo).toBe("2026-08-19T00:00:00.000Z");
  });

  it("qua ranh giới tháng vẫn đúng", () => {
    expect(deadlineRangeFor("overdue", at("2026-09-01T10:00:00Z")).requiredDateTo)
      .toBe("2026-08-31T00:00:00.000Z");
    expect(deadlineRangeFor("week", at("2026-08-28T10:00:00Z")).requiredDateTo)
      .toBe("2026-09-04T00:00:00.000Z");
  });
});

describe("STATUS_BY_TAB — trạng thái chọn được ở mỗi tab", () => {
  // 🔴 Chính vết lệch của bản chép cũ: nó thiếu DESIGN_COMPLETED ở hai tab này.
  it("tab Tất cả và Phòng Thiết Kế đều có Hoàn tất 3D", () => {
    expect(STATUS_BY_TAB.all).toContain("DESIGN_COMPLETED");
    expect(STATUS_BY_TAB["pre-production"]).toContain("DESIGN_COMPLETED");
  });

  // Tab "Tất cả" đã lọc bỏ đơn kết thúc, nên đưa hai trạng thái đó vào dropdown là mời người
  // dùng chọn một bộ lọc chắc chắn ra rỗng.
  it("tab Tất cả KHÔNG cho chọn trạng thái đã kết thúc", () => {
    expect(STATUS_BY_TAB.all).not.toContain("COMPLETED");
    expect(STATUS_BY_TAB.all).not.toContain("CANCELLED");
  });

  it("tab Phòng Thiết Kế chỉ có trạng thái của PTK", () => {
    expect(STATUS_BY_TAB["pre-production"]).not.toContain("IN_PRODUCTION");
  });

  it("tab Phòng Sản Xuất chỉ có trạng thái của PSX", () => {
    expect(STATUS_BY_TAB["master-hub"]).toEqual(["IN_PRODUCTION", "SUSPENDED"]);
  });

  it("hai tab kết thúc chỉ có đúng trạng thái của mình", () => {
    expect(STATUS_BY_TAB.completed).toEqual(["COMPLETED"]);
    expect(STATUS_BY_TAB.cancelled).toEqual(["CANCELLED"]);
  });

  it("không tab nào có trạng thái trùng lặp", () => {
    for (const [tab, statuses] of Object.entries(STATUS_BY_TAB)) {
      expect(new Set(statuses).size, `tab ${tab}`).toBe(statuses.length);
    }
  });
});
