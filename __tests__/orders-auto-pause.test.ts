import { describe, expect, it } from "vitest";

import { detectAutoPause, type AutoPauseInput } from "@/app/lib/business/orders/auto-pause";

// Luật này từng nằm THẲNG trong app/api/orders/[id]/production/route.ts — 866 dòng, và luật
// này không có test nào. Chính comment trên nó gọi nó là "pure function", nhưng nó đọc đồng hồ
// nên không test tất định được. Nay `now` truyền vào.

// 08:05 ngày 20/08 giờ VN (VN = UTC+7).
const NOW = new Date("2026-08-20T01:05:00.000Z");

const input = (over: Partial<AutoPauseInput> = {}): AutoPauseInput => ({
  saleNoteIncluded: false,
  newSaleNote: "",
  prevSaleNote: "",
  customerName: undefined,
  prevCustomerName: "Khach A",
  salesName: undefined,
  prevSalesName: "Sale A",
  estimatedDate: undefined,
  prevEstimatedDate: new Date("2026-09-01T00:00:00.000Z"),
  effectiveStatus: "IN_PRODUCTION",
  isChangeApproved: false,
  ...over,
});

describe("ghi chú Sale — tạm ngưng thủ công", () => {
  it("gửi ghi chú mới → tạm ngưng, giữ nguyên nội dung ghi chú", () => {
    const result = detectAutoPause(
      input({ saleNoteIncluded: true, newSaleNote: "Khach doi da chu" }), NOW,
    );
    expect(result).toEqual({ type: "MANUAL_NOTE", note: "Khach doi da chu" });
  });

  // Xoá ghi chú KHÔNG phải là yêu cầu tạm ngưng.
  it("ghi chú rỗng → không tạm ngưng", () => {
    expect(detectAutoPause(input({ saleNoteIncluded: true, newSaleNote: "" }), NOW)).toBeNull();
  });

  // 🔴 Sidebar gửi MỌI trường ở mỗi lần lưu. Gate theo "có gửi" thay vì "có ĐỔI" là mỗi lần
  // bấm Lưu lại tạm ngưng đơn một lần — đúng lớp lỗi dự án đã trả giá ở chỗ khác.
  it("gửi lại ĐÚNG ghi chú cũ → KHÔNG tạm ngưng lần nữa", () => {
    const same = { saleNoteIncluded: true, newSaleNote: "Cho khach", prevSaleNote: "Cho khach" };
    expect(detectAutoPause(input(same), NOW)).toBeNull();
  });

  // Ghi chú thủ công thắng mọi luật khác — kể cả khi đơn chưa vào sản xuất.
  it("ghi chú mới khi đơn CHƯA vào sản xuất → vẫn tạm ngưng", () => {
    const result = detectAutoPause(
      input({ saleNoteIncluded: true, newSaleNote: "Cho", effectiveStatus: "PENDING_PRODUCTION" }),
      NOW,
    );
    expect(result?.type).toBe("MANUAL_NOTE");
  });
});

describe("đổi trường trọng yếu giữa lúc đang sản xuất", () => {
  it("đổi khách hàng → tạm ngưng, nêu đúng tên trường", () => {
    const result = detectAutoPause(input({ customerName: "Khach B" }), NOW);
    expect(result?.type).toBe("CRITICAL_CHANGE");
    expect(result?.note).toContain("Khách hàng");
  });

  it("đổi nhiều trường → nêu đủ, một dòng", () => {
    const result = detectAutoPause(
      input({ customerName: "Khach B", salesName: "Sale B" }), NOW,
    );
    expect(result?.note).toContain("Khách hàng");
    expect(result?.note).toContain("Sales");
  });

  // 🔴 `undefined` = client không gửi trường đó. Coi nó là "đã đổi" thì mỗi lần lưu bất kỳ
  // thứ gì cũng tạm ngưng đơn.
  it("không gửi trường nào → không tạm ngưng", () => {
    expect(detectAutoPause(input(), NOW)).toBeNull();
  });

  it("gửi lại ĐÚNG giá trị cũ → không tạm ngưng", () => {
    expect(detectAutoPause(input({ customerName: "Khach A", salesName: "Sale A" }), NOW)).toBeNull();
  });

  // Trước IN_PRODUCTION thì chưa ai làm gì theo dữ liệu cũ, nên sửa không cần chặn.
  it("đơn chưa vào sản xuất → đổi trường trọng yếu KHÔNG tạm ngưng", () => {
    const result = detectAutoPause(
      input({ customerName: "Khach B", effectiveStatus: "PENDING_PRODUCTION" }), NOW,
    );
    expect(result).toBeNull();
  });

  // Đã có người có thẩm quyền duyệt thay đổi → không chặn lại lần nữa.
  it("thay đổi đã được duyệt → không tạm ngưng", () => {
    expect(detectAutoPause(input({ customerName: "Khach B", isChangeApproved: true }), NOW)).toBeNull();
  });
});

describe("Ngày chốt SX — so theo NGÀY, không theo mốc thời gian", () => {
  it("đổi sang ngày khác → tạm ngưng", () => {
    const result = detectAutoPause(input({ estimatedDate: "2026-09-05" }), NOW);
    expect(result?.note).toContain("Ngày chốt SX");
  });

  // Cùng một ngày nhưng khác giờ (client gửi ISO đầy đủ, DB giữ Date) KHÔNG phải là đổi ngày.
  it("cùng ngày, khác giờ → KHÔNG tạm ngưng", () => {
    const result = detectAutoPause(
      { ...input(), estimatedDate: "2026-09-01T10:30:00.000Z" }, NOW,
    );
    expect(result).toBeNull();
  });

  it("xoá ngày chốt → tạm ngưng", () => {
    expect(detectAutoPause(input({ estimatedDate: null }), NOW)?.note).toContain("Ngày chốt SX");
  });
});

describe("dấu thời gian trong ghi chú", () => {
  // 🔴 Dự án đã trả giá: `getHours()` chạy local đúng, lên Vercel (UTC) lệch 7 tiếng.
  // 01:05 UTC = 08:05 giờ VN. Chấp nhận 01:05 là ghi sai giờ vào bản ghi sản xuất.
  it("in theo giờ Việt Nam, không theo giờ máy chủ", () => {
    const result = detectAutoPause(input({ customerName: "Khach B" }), NOW);
    expect(result?.note).toContain("08:05 20/08");
  });

  it("qua nửa đêm UTC vẫn ra đúng ngày VN", () => {
    // 23:30 UTC 19/08 = 06:30 VN ngày 20/08.
    const result = detectAutoPause(
      input({ customerName: "Khach B" }), new Date("2026-08-19T23:30:00.000Z"),
    );
    expect(result?.note).toContain("06:30 20/08");
  });
});
