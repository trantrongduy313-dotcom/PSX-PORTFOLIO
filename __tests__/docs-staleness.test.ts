import { describe, expect, it } from "vitest";

import {
  compareByStaleness,
  docStaleness,
  stalenessNotice,
  STALE_CHANGE_COUNT,
} from "@/app/lib/business/docs/staleness";

// Bộ dò độ cũ của tài liệu. Nó KHÔNG làm tài liệu đúng lên — nó làm chỗ sai lên tiếng, và nói
// được nên rà cái nào trước.

const NOW = new Date("2026-12-15T10:00:00+07:00");
const vn = (iso: string) => new Date(`${iso}+07:00`);

describe("docStaleness — ranh giới tháng", () => {
  // "2026-08" nghĩa là đã rà HẾT tháng 8. Mục đăng trong tháng 8 nằm TRONG phạm vi đã rà.
  it("mục đăng CÙNG tháng rà → KHÔNG tính", () => {
    expect(docStaleness("2026-08", [vn("2026-08-01T00:00"), vn("2026-08-31T23:59")], NOW).changesSince).toBe(0);
  });

  it("mục đăng tháng SAU → tính", () => {
    expect(docStaleness("2026-08", [vn("2026-09-01T00:00")], NOW).changesSince).toBe(1);
  });

  it("mục đăng TRƯỚC lần rà → không tính", () => {
    expect(docStaleness("2026-08", [vn("2026-07-31T23:59")], NOW).changesSince).toBe(0);
  });

  // 🔴 CA MÚI GIỜ — lý do phải quy về giờ VN trước khi cắt tháng.
  //
  // 00:30 ngày 01/09 giờ VN = 17:30 ngày 31/08 UTC. Cắt thẳng trên ISO/UTC sẽ xếp mục này vào
  // tháng 8 và nó BIẾN MẤT khỏi phép đếm — một thay đổi có thật mà bộ dò không thấy.
  it("00:30 ngày 01/09 giờ VN được tính là THÁNG 9, không phải tháng 8", () => {
    expect(docStaleness("2026-08", [vn("2026-09-01T00:30")], NOW).changesSince).toBe(1);
  });

  it("23:30 ngày 31/08 giờ VN vẫn là THÁNG 8", () => {
    expect(docStaleness("2026-08", [vn("2026-08-31T23:30")], NOW).changesSince).toBe(0);
  });

  it("nhận cả chuỗi ISO, không chỉ Date", () => {
    expect(docStaleness("2026-08", ["2026-09-05T03:00:00.000Z"], NOW).changesSince).toBe(1);
  });
});

describe("docStaleness — mức độ", () => {
  const many = (n: number) => Array.from({ length: n }, () => vn("2026-10-01T09:00"));

  it("không có thay đổi nào → FRESH", () => {
    expect(docStaleness("2026-11", [], NOW).level).toBe("FRESH");
  });

  it("có ít thay đổi → AGING", () => {
    expect(docStaleness("2026-08", many(3), NOW).level).toBe("AGING");
  });

  it("đạt ngưỡng → STALE", () => {
    expect(docStaleness("2026-08", many(STALE_CHANGE_COUNT), NOW).level).toBe("STALE");
  });

  it("dưới ngưỡng 1 đơn vị vẫn là AGING", () => {
    expect(docStaleness("2026-08", many(STALE_CHANGE_COUNT - 1), NOW).level).toBe("AGING");
  });
});

describe("docStaleness — dữ liệu hỏng KHÔNG được làm sập trang", () => {
  // Một chương có mốc gõ sai không được phép làm trắng cả trang Hướng dẫn. Coi như KHÔNG BIẾT.
  it("lastReviewed sai định dạng → FRESH, 0 thay đổi, không ném lỗi", () => {
    for (const bad of ["2026-13", "26-08", "2026/08", "", "hôm qua", "2026-8"]) {
      const s = docStaleness(bad, [vn("2026-10-01T09:00")], NOW);
      expect(s.level, bad).toBe("FRESH");
      expect(s.changesSince, bad).toBe(0);
    }
  });

  it("mốc đăng hỏng bị bỏ qua, không đếm vào", () => {
    // Đếm một mục không tồn tại là hù người đọc bằng một con số không có thật.
    expect(docStaleness("2026-08", ["không-phải-ngày", vn("2026-10-01T09:00")], NOW).changesSince).toBe(1);
  });

  // Mốc rà ở TƯƠNG LAI (gõ nhầm năm) sẽ làm mọi mục rơi vào "trước lần rà" và tài liệu trông như
  // vừa rà xong — im lặng vì một lỗi gõ là đúng thứ bộ dò này sinh ra để chặn.
  it("lastReviewed ở tương lai bị kẹp về tháng hiện tại", () => {
    expect(docStaleness("2027-06", [vn("2026-10-01T09:00")], NOW).changesSince).toBe(1);
  });

  it("danh sách rỗng → FRESH", () => {
    expect(docStaleness("2026-01", [], NOW).changesSince).toBe(0);
  });
});

describe("stalenessNotice", () => {
  // 🎯 `null` là phần quan trọng nhất: im lặng khi không có gì để nói. Đó là điều phân biệt nó
  // với câu cảnh báo cũ — câu đó LUÔN hiện, nên người đọc học cách bỏ qua, và một lỗi định dạng
  // MO sống sót 717 commit ngay dưới nó.
  it("FRESH → null, KHÔNG hiện gì", () => {
    expect(stalenessNotice(docStaleness("2026-11", [], NOW), "vi")).toBeNull();
  });

  it("có thay đổi → nói SỐ, không nói 'có thể'", () => {
    const notice = stalenessNotice(docStaleness("2026-08", [vn("2026-09-01T09:00")], NOW), "vi");
    expect(notice).toContain("1 thay đổi");
    expect(notice).toContain("08/2026"); // định dạng người đọc, không phải YYYY-MM thô
    // "có thể đã thay đổi" đúng với mọi tài liệu trên đời, nên nó không nói gì cả.
    expect(notice?.toLowerCase()).not.toContain("có thể");
  });

  it("có bản tiếng Anh", () => {
    const one = stalenessNotice(docStaleness("2026-08", [vn("2026-09-01T09:00")], NOW), "en");
    expect(one).toContain("1 system change");
    expect(one).toContain("08/2026");
    const two = stalenessNotice(docStaleness("2026-08", [vn("2026-09-01T09:00"), vn("2026-10-01T09:00")], NOW), "en");
    expect(two).toContain("2 system changes");
  });
});

describe("compareByStaleness — nói được RÀ CÁI NÀO TRƯỚC", () => {
  const doc = (lastReviewed: string, n: number) => ({
    staleness: docStaleness(lastReviewed, Array.from({ length: n }, () => vn("2026-11-01T09:00")), NOW),
  });

  it("nhiều thay đổi hơn thì đứng trước", () => {
    expect([doc("2026-01", 2), doc("2026-01", 9)].sort(compareByStaleness)[0].staleness.changesSince).toBe(9);
  });

  it("bằng số thay đổi thì mốc CŨ hơn đứng trước", () => {
    const sorted = [doc("2026-09", 1), doc("2026-02", 1)].sort(compareByStaleness);
    expect(sorted[0].staleness.lastReviewed).toBe("2026-02");
  });

  // Một danh sách 23 chương đều gắn cờ thì vô dụng như không gắn cờ nào — thứ tự mới là thứ biến
  // cảnh báo thành việc làm được.
  it("sắp được cả danh sách mà không ném lỗi", () => {
    const list = [doc("2026-05", 3), doc("2026-11", 0), doc("2026-01", 12)];
    expect(list.sort(compareByStaleness).map((d) => d.staleness.changesSince)).toEqual([12, 3, 0]);
  });
});
