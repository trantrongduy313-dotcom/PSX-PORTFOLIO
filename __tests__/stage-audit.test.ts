import { describe, it, expect } from "vitest";

import { diffStages } from "@/app/lib/business/stage-audit";

// Bộ test này ra đời để đóng một bug ĐÃ TỪNG XẢY RA THẬT trên production:
// bản khai "khâu nào lưu nhiều thợ" phía server thiếu TC_NGUOI, nên nhánh so sánh records[]
// không bao giờ chạy cho khâu TC Nguội → sửa thợ, đổi giờ, xóa bản ghi đều KHÔNG để lại dòng
// nào trong Lịch sử thay đổi. Không lỗi biên dịch, không lỗi chạy, chỉ là im lặng.
//
// Logic này trước nằm trong route file nên không export/test được — đó là lý do nó sống sót.

const rec = (over: Record<string, unknown> = {}) => ({
  crafter: "Thợ A", lan: 1, gioThucTe: "2g 30p", ketQua: "Đạt", ...over,
});

describe("diffStages — khâu nhiều thợ so theo records[]", () => {
  it("TC_NGUOI: đổi thợ trong records[] PHẢI sinh dòng Lịch sử (bug cũ: im lặng)", () => {
    const out = diffStages(
      { TC_NGUOI: { records: [rec({ crafter: "Thợ CŨ" })] } },
      { TC_NGUOI: { records: [rec({ crafter: "Thợ MỚI" })] } },
      ["TC_NGUOI"],
    );
    expect(out).toEqual([
      { field: "TC NGUỘI · Thợ #1 · Thợ", old: "Thợ CŨ", new: "Thợ MỚI" },
    ]);
  });

  it("TC_NGUOI: xóa bản ghi được ghi nhận", () => {
    const out = diffStages(
      { TC_NGUOI: { records: [rec(), rec({ crafter: "Thợ B" })] } },
      { TC_NGUOI: { records: [rec()] } },
      ["TC_NGUOI"],
    );
    expect(out).toEqual([
      { field: "TC NGUỘI · Thợ #2", old: "có bản ghi", new: "(đã xóa)" },
    ]);
  });

  it("NGUOI: vẫn hoạt động như trước (không hồi quy)", () => {
    const out = diffStages(
      { NGUOI: { records: [rec({ gioThucTe: "2g" })] } },
      { NGUOI: { records: [rec({ gioThucTe: "3g" })] } },
      ["NGUOI"],
    );
    expect(out).toEqual([
      { field: "NGUỘI · Thợ #1 · Giờ thực tế", old: "2g", new: "3g" },
    ]);
  });

  it("khâu nhiều thợ KHÔNG diff scalar `crafter` cấp khâu (chỉ là tóm tắt suy diễn)", () => {
    // Nếu diff cả scalar lẫn records sẽ ra hai dòng cho cùng một thay đổi.
    const out = diffStages(
      { NGUOI: { crafter: "A", records: [rec({ crafter: "A" })] } },
      { NGUOI: { crafter: "B", records: [rec({ crafter: "B" })] } },
      ["NGUOI"],
    );
    expect(out).toHaveLength(1);
    expect(out[0].field).toBe("NGUỘI · Thợ #1 · Thợ");
  });
});

describe("diffStages — khâu scalar", () => {
  it("KHOA: diff `crafter` ở cấp khâu vì khâu này chưa có records[]", () => {
    const out = diffStages(
      { KHOA: { crafter: "A" } },
      { KHOA: { crafter: "B" } },
      ["KHOA"],
    );
    expect(out).toEqual([{ field: "KHÓA · Thợ", old: "A", new: "B" }]);
  });

  it("KHOA: records[] bị bỏ qua — khâu scalar không đọc nhánh đó", () => {
    const out = diffStages(
      { KHOA: { records: [rec({ crafter: "X" })] } },
      { KHOA: { records: [rec({ crafter: "Y" })] } },
      ["KHOA"],
    );
    expect(out).toEqual([]);
  });
});

describe("diffStages — chuẩn hoá giá trị", () => {
  it("ngày hiển thị theo giờ VN dd/mm/yyyy, không lùi 1 ngày do UTC", () => {
    // 2026-08-09T17:30:00Z = 00:30 ngày 10/08 giờ VN → phải ra 10/08, không phải 09/08.
    const out = diffStages(
      { KHOA: { doneAt: "2026-08-09T10:00:00.000Z" } },
      { KHOA: { doneAt: "2026-08-09T17:30:00.000Z" } },
      ["KHOA"],
    );
    expect(out).toEqual([
      { field: "KHÓA · Hoàn thành", old: "09/08/2026", new: "10/08/2026" },
    ]);
  });

  it("trạng thái dịch sang tiếng Việt", () => {
    const out = diffStages(
      { KHOA: { stageStatus: "pending" } },
      { KHOA: { stageStatus: "done" } },
      ["KHOA"],
    );
    expect(out).toEqual([{ field: "KHÓA · Trạng thái", old: "Chờ", new: "Hoàn thành" }]);
  });

  it("null và chuỗi rỗng coi như nhau — không sinh dòng rác", () => {
    const out = diffStages(
      { KHOA: { crafter: null, durationNote: "" } },
      { KHOA: { crafter: "", durationNote: null } },
      ["KHOA"],
    );
    expect(out).toEqual([]);
  });

  it("không có thay đổi → không có dòng nào", () => {
    const s = { NGUOI: { stageStatus: "done", records: [rec()] } };
    expect(diffStages(s, s, ["NGUOI"])).toEqual([]);
  });
});
