import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertNoKpiLeftBehind,
  requireCarryTarget,
  RollbackKpiCarryError,
  KPI_TABLES_LOST_ON_ITEM_DELETE,
} from "@/app/lib/business/orders/rollback-kpi-carry";

// TEST CHO ĐÚNG LỖ ĐÃ TÌM RA: `rollback` xoá cứng OrderItem, và quan hệ DUY NHẤT trỏ tới nó —
// Design3DAssignment (schema.prisma:741) — mang onDelete: Cascade, rồi cascade tiếp xuống
// ProgressLog / Pause / Overtime. Nên một lần lùi khâu thổi bay toàn bộ chuỗi chấm công của MO,
// vĩnh viễn và không một tiếng động.

describe("requireCarryTarget — không có chỗ nhận thì DỪNG, đừng xoá", () => {
  it("có item mới → trả về đúng id", () => {
    expect(requireCarryTarget("new-item-1", "26.42341_1")).toBe("new-item-1");
  });

  it.each([undefined, null, ""])("không có item mới (%s) → ném lỗi, KHÔNG đi tiếp", (bad) => {
    // Thà dừng cả lần lùi khâu (giao dịch rollback, không mất gì) còn hơn đi tiếp và mất dữ
    // liệu lương không lấy lại được.
    expect(() => requireCarryTarget(bad, "26.42341_1")).toThrow(RollbackKpiCarryError);
  });

  it("câu lỗi gọi TÊN MO — người đọc phải biết đơn nào đang kẹt", () => {
    expect(() => requireCarryTarget(null, "26.42341_1")).toThrow(/26\.42341_1/);
  });

  it("không rõ MO thì vẫn ra câu đọc được, không phải 'null'", () => {
    expect(() => requireCarryTarget(null, null)).toThrow(/không rõ/);
  });
});

describe("assertNoKpiLeftBehind — chốt chặn cuối trước lệnh xoá", () => {
  it("đã chuyển hết → đi tiếp bình thường", () => {
    expect(() => assertNoKpiLeftBehind(0, "26.42341_1")).not.toThrow();
  });

  it("còn sót lượt → ném lỗi thay vì để Postgres lặng lẽ cascade", () => {
    // ĐỔI MỘT LỖI ÂM THẦM LẤY MỘT LỖI ỒN ÀO.
    expect(() => assertNoKpiLeftBehind(2, "26.42341_1")).toThrow(RollbackKpiCarryError);
  });

  it("câu lỗi nói RÕ còn bao nhiêu dòng và mất những bảng nào", () => {
    let msg = "";
    try { assertNoKpiLeftBehind(3, "26.42341_1"); } catch (e) { msg = (e as Error).message; }
    expect(msg).toContain("3 lượt");
    for (const table of KPI_TABLES_LOST_ON_ITEM_DELETE) expect(msg).toContain(table);
  });
});

describe("Route rollback thật sự CHUYỂN lịch sử KPI trước khi xoá", () => {
  const src = readFileSync(
    join(process.cwd(), "app", "api", "orders", "[id]", "rollback", "route.ts"),
    "utf8",
  );

  const carryAt  = src.indexOf("design3DAssignment.updateMany");
  const guardAt  = src.indexOf("assertNoKpiLeftBehind(");
  const deleteAt = src.indexOf("orderItem.delete(");

  it("BỘ DÒ CÒN CHẠY — vẫn tìm thấy lệnh xoá item trong route", () => {
    // Không có khẳng định này thì ngày ai đó đổi tên lệnh xoá, mọi test dưới sẽ xanh vì KHÔNG
    // TÌM THẤY GÌ — xanh vì rỗng là kiểu xanh nguy hiểm nhất.
    expect(deleteAt).toBeGreaterThan(-1);
  });

  it("có chuyển lượt giao việc sang đơn/dòng hàng mới", () => {
    expect(carryAt).toBeGreaterThan(-1);
  });

  it("CHUYỂN phải nằm TRƯỚC XOÁ — sau lệnh xoá thì không còn gì để chuyển", () => {
    expect(carryAt).toBeLessThan(deleteAt);
  });

  it("chốt chặn cuối cũng nằm trước lệnh xoá", () => {
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(deleteAt);
  });
});

describe("Schema — quan hệ khiến việc này thành bắt buộc vẫn còn đó", () => {
  const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

  it("Design3DAssignment.orderItem vẫn là Cascade → module này còn lý do tồn tại", () => {
    // Nếu một ngày quan hệ đổi sang Restrict/SetNull thì bài toán đổi bản chất và phải đọc lại
    // cả module. Test này là cái chuông báo lúc đó.
    const model = schema.slice(schema.indexOf("model Design3DAssignment {"));
    const line = model.slice(0, model.indexOf("\n}")).split("\n").find((l) => l.includes("orderItem   OrderItem"));
    expect(line).toBeDefined();
    expect(line).toContain("onDelete: Cascade");
  });
});
