import { describe, expect, it } from "vitest";

import {
  changedPriorityRowIds,
  mergePriorityMarks,
  snapshotPriorities,
  type PriorityRow,
} from "@/app/lib/business/kpi-3d/priority-change-marker";

const row = (id: string, code: string | null): PriorityRow => ({
  id,
  orderItem: { design3DPriorityCode: code },
});

describe("changedPriorityRowIds", () => {
  // Lần tải đầu KHÔNG có gì "vừa đổi". Đánh dấu cả bảng lúc mở màn thì dấu này mất sạch ý nghĩa
  // ngay lần dùng đầu tiên — và người dùng học được là bỏ qua nó.
  it("chưa có bản trước (lần tải đầu) → không đánh dấu gì", () => {
    expect(changedPriorityRowIds(null, [row("a", "UT1"), row("b", "Normal")]).size).toBe(0);
  });

  it("bậc đổi → đánh dấu đúng dòng đó", () => {
    const prev = snapshotPriorities([row("a", "UT1"), row("b", "Normal")]);
    const changed = changedPriorityRowIds(prev, [row("a", "UT2"), row("b", "Normal")]);
    expect([...changed]).toEqual(["a"]);
  });

  // HẠ ưu tiên cũng là thay đổi cần thấy — không chỉ nâng. Bỏ sót nhánh này thì người đang chờ
  // một đơn UT1 không biết nó vừa bị hạ.
  it("hạ về Normal cũng được đánh dấu", () => {
    const prev = snapshotPriorities([row("a", "UT1")]);
    expect(changedPriorityRowIds(prev, [row("a", "Normal")]).has("a")).toBe(true);
  });

  it("không đổi → không đánh dấu", () => {
    const prev = snapshotPriorities([row("a", "UT1"), row("b", "UT2")]);
    expect(changedPriorityRowIds(prev, [row("a", "UT1"), row("b", "UT2")]).size).toBe(0);
  });

  // Dòng chưa từng có mặt thì không có gì để so — và nó đã có huy hiệu MỚI của riêng nó. Đánh dấu
  // cả hai lên cùng một dòng là dựng lại đúng cái lộn xộn mà việc tách cột vừa dọn đi.
  it("dòng MỚI xuất hiện KHÔNG tính là vừa đổi, kể cả khi là UT1", () => {
    const prev = snapshotPriorities([row("a", "Normal")]);
    const changed = changedPriorityRowIds(prev, [row("a", "Normal"), row("moi", "UT1")]);
    expect(changed.size).toBe(0);
  });

  // Dữ liệu cũ để null, bản mới ghi "Normal" — CÙNG MỘT BẬC. So chuỗi thô sẽ báo "vừa đổi" cho
  // một thứ không hề đổi, và báo cho gần như mọi dòng ngay sau khi chạy migration.
  it("null / rỗng / chuỗi lạ đều là Normal — không báo đổi giả", () => {
    for (const before of [null, "", "SR", "linh tinh"]) {
      const prev = snapshotPriorities([row("a", before)]);
      expect(changedPriorityRowIds(prev, [row("a", "Normal")]).size, String(before)).toBe(0);
    }
  });

  it("dòng biến mất khỏi bảng không gây lỗi", () => {
    const prev = snapshotPriorities([row("a", "UT1"), row("b", "UT1")]);
    expect(changedPriorityRowIds(prev, [row("a", "UT1")]).size).toBe(0);
  });
});

describe("mergePriorityMarks", () => {
  // Hai lần đổi cách nhau 30 giây mà người dùng chưa xem lần nào: thay thế thì dấu của lần đầu
  // biến mất và họ chỉ còn thấy một trong hai.
  it("cộng dồn, không thay thế", () => {
    const merged = mergePriorityMarks(new Set(["a"]), new Set(["b"]));
    expect([...merged].sort()).toEqual(["a", "b"]);
  });

  it("trùng id không nhân đôi", () => {
    expect(mergePriorityMarks(new Set(["a"]), new Set(["a"])).size).toBe(1);
  });
});

describe("snapshotPriorities", () => {
  it("chuẩn hoá bậc khi chụp, để lần so sau không báo đổi giả", () => {
    const snap = snapshotPriorities([row("a", null), row("b", "UT1")]);
    expect(snap.get("a")).toBe("Normal");
    expect(snap.get("b")).toBe("UT1");
  });

  it("thiếu orderItem cũng chụp được", () => {
    const snap = snapshotPriorities([{ id: "a" }, { id: "b", orderItem: null }]);
    expect(snap.get("a")).toBe("Normal");
    expect(snap.get("b")).toBe("Normal");
  });
});
