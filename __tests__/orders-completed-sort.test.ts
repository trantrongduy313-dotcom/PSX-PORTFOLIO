import { describe, expect, it } from "vitest";

import {
  compareByCompletedDate,
  sortByCompletedDate,
  type CompletedSortRow,
} from "@/app/lib/business/orders/completed-sort";

const row = (completedDate: string | null, moNumber = "26.00001"): CompletedSortRow => ({
  firstItem: { completedDate, moNumber },
});

describe("sortByCompletedDate — MO hoàn tất gần nhất lên trên", () => {
  it("mặc định (desc) xếp ngày mới nhất trước", () => {
    const sorted = sortByCompletedDate([
      row("2026-06-01", "A"),
      row("2026-08-10", "B"),
      row("2026-07-05", "C"),
    ]);
    expect(sorted.map((r) => r.firstItem?.moNumber)).toEqual(["B", "C", "A"]);
  });

  it("asc xếp ngày cũ nhất trước", () => {
    const sorted = sortByCompletedDate([
      row("2026-08-10", "B"),
      row("2026-06-01", "A"),
    ], "asc");
    expect(sorted.map((r) => r.firstItem?.moNumber)).toEqual(["A", "B"]);
  });

  it("KHÔNG sửa mảng gốc — nó là dữ liệu cache của React Query", () => {
    const input = [row("2026-06-01", "A"), row("2026-08-10", "B")];
    const before = input.map((r) => r.firstItem?.moNumber);
    sortByCompletedDate(input);
    expect(input.map((r) => r.firstItem?.moNumber)).toEqual(before);
  });
});

describe("MO chưa có Ngày HT", () => {
  // Coi rỗng là 0 thì ở chiều asc chúng chiếm trọn phần đầu bảng — người mở tab để tra đơn
  // xong sớm nhất lại thấy toàn dòng gạch ngang.
  it("xuống cuối ở chiều desc", () => {
    const sorted = sortByCompletedDate([
      row(null, "TRONG"),
      row("2026-06-01", "CO"),
    ]);
    expect(sorted.map((r) => r.firstItem?.moNumber)).toEqual(["CO", "TRONG"]);
  });

  it("VẪN xuống cuối ở chiều asc — rỗng nghĩa là không so được, không phải sớm nhất", () => {
    const sorted = sortByCompletedDate([
      row(null, "TRONG"),
      row("2026-06-01", "CO"),
    ], "asc");
    expect(sorted.map((r) => r.firstItem?.moNumber)).toEqual(["CO", "TRONG"]);
  });

  it("chuỗi ngày rác cũng bị coi là chưa có, không đẩy dòng lên đầu", () => {
    const sorted = sortByCompletedDate([
      row("khong-phai-ngay", "RAC"),
      row("2026-06-01", "CO"),
    ]);
    expect(sorted.map((r) => r.firstItem?.moNumber)).toEqual(["CO", "RAC"]);
  });

  it("hai dòng đều rỗng thì vẫn có thứ tự ổn định theo MO", () => {
    expect(compareByCompletedDate(row(null, "B"), row(null, "A"))).toBeGreaterThan(0);
  });
});

describe("Thứ tự ổn định khi trùng ngày", () => {
  // Trường này là NGÀY (không có giờ) nên rất nhiều MO trùng nhau. Thiếu tiêu chí phụ thì mỗi
  // lần render có thể ra một thứ tự khác và người dùng tưởng bảng đang tự nhảy.
  it("cùng ngày thì xếp theo mã MO tăng dần, ở CẢ HAI chiều", () => {
    const same = [row("2026-06-01", "26.003"), row("2026-06-01", "26.001"), row("2026-06-01", "26.002")];
    expect(sortByCompletedDate(same, "desc").map((r) => r.firstItem?.moNumber))
      .toEqual(["26.001", "26.002", "26.003"]);
    expect(sortByCompletedDate(same, "asc").map((r) => r.firstItem?.moNumber))
      .toEqual(["26.001", "26.002", "26.003"]);
  });

  it("thiếu firstItem thì rơi về orderNumber, không nổ", () => {
    const rows: CompletedSortRow[] = [{ orderNumber: "SO-2" }, { orderNumber: "SO-1" }];
    expect(sortByCompletedDate(rows).map((r) => r.orderNumber)).toEqual(["SO-1", "SO-2"]);
  });
});

describe("Tab Đã hủy — cùng hàm, đổi sang mốc NGÀY HỦY", () => {
  // Hai tab dùng CHUNG comparator để quy tắc "rỗng xuống cuối" / "trùng ngày xếp theo MO"
  // không lệch nhau. Nhóm test này khoá việc `field` thật sự đổi khoá sắp.
  const huy = (cancelledAt: string | null, moNumber: string): CompletedSortRow => ({
    firstItem: { cancelledAt, moNumber },
  });

  it("sắp theo cancelledAt, MO hủy gần nhất lên đầu", () => {
    const sorted = sortByCompletedDate([
      huy("2026-05-01", "CU"),
      huy("2026-08-09", "MOI"),
    ], "desc", "cancelledAt");
    expect(sorted.map((r) => r.firstItem?.moNumber)).toEqual(["MOI", "CU"]);
  });

  it("MO chưa có ngày hủy xuống cuối", () => {
    const sorted = sortByCompletedDate([
      huy(null, "TRONG"),
      huy("2026-05-01", "CO"),
    ], "desc", "cancelledAt");
    expect(sorted.map((r) => r.firstItem?.moNumber)).toEqual(["CO", "TRONG"]);
  });

  it("KHÔNG lẫn hai trường: có completedDate nhưng thiếu cancelledAt thì vẫn coi là rỗng", () => {
    // Đơn đã hủy không có completedDate (server set null khi hủy), nhưng nếu comparator đọc
    // nhầm trường thì một mốc SAI Ý NGHĨA sẽ đẩy dòng lên đầu bảng.
    const rows: CompletedSortRow[] = [
      { firstItem: { completedDate: "2026-08-09", cancelledAt: null, moNumber: "LAN" } },
      { firstItem: { completedDate: null, cancelledAt: "2026-05-01", moNumber: "DUNG" } },
    ];
    expect(sortByCompletedDate(rows, "desc", "cancelledAt").map((r) => r.firstItem?.moNumber))
      .toEqual(["DUNG", "LAN"]);
  });

  it("mặc định vẫn là completedDate — không đổi hành vi tab Hoàn tất", () => {
    const rows: CompletedSortRow[] = [
      { firstItem: { completedDate: "2026-05-01", cancelledAt: "2026-12-01", moNumber: "A" } },
      { firstItem: { completedDate: "2026-08-01", cancelledAt: "2026-01-01", moNumber: "B" } },
    ];
    expect(sortByCompletedDate(rows).map((r) => r.firstItem?.moNumber)).toEqual(["B", "A"]);
  });
});

describe("Dùng Ngày HT PER-MO, đúng trường cột NGÀY HT đang hiện", () => {
  // Server sắp theo Order.completedDate (cấp SO); bảng hiện firstItem.completedDate (per-MO).
  // Một SO nhiều MO hoàn tất lệch ngày thì hai con số khác nhau.
  it("hai MO cùng SO hoàn tất lệch ngày vẫn tách đúng thứ tự", () => {
    const sorted = sortByCompletedDate([
      { orderNumber: "SO-1", firstItem: { completedDate: "2026-06-01", moNumber: "26.001.1" } },
      { orderNumber: "SO-1", firstItem: { completedDate: "2026-08-01", moNumber: "26.001.2" } },
    ]);
    expect(sorted.map((r) => r.firstItem?.moNumber)).toEqual(["26.001.2", "26.001.1"]);
  });
});
