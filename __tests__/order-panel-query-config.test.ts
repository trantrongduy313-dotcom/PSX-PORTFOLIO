import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const HOOK = join(process.cwd(), "app/dashboard/orders/_components/use-order-panel-data.ts");
const source = readFileSync(HOOK, "utf-8");

const orderQuery = source.slice(source.indexOf('queryKey: ["order-panel"'));

const numberAfter = (key: string): number | null => {
  const found = orderQuery.match(new RegExp(`${key}:\\s*([0-9_]+)`));
  return found ? Number(found[1].replace(/_/g, "")) : null;
};

describe("cấu hình query của sidebar đơn hàng", () => {
  // 🔴 Lệch hai con số này là lỗi IM LẶNG: staleTime dài hơn nhịp refetch thì refetch-on-focus
  // bị vô hiệu, và sidebar đóng băng đúng lúc người dùng quay lại tab. Bản trước là 5 PHÚT đi
  // cùng nhịp 30 GIÂY — hai lời khai mâu thuẫn trong cùng một cấu hình.
  it("staleTime của order khớp đúng nhịp refetch", () => {
    expect(numberAfter("staleTime")).toBe(numberAfter("refetchInterval"));
  });

  // Nhịp nền tắt là CỐ Ý (đỡ tải server), nhưng chính nó làm luật trên thành bắt buộc.
  it("không refetch khi tab ở nền", () => {
    expect(source).toContain("refetchIntervalInBackground: false");
  });

  // Số việc đang làm KHÔNG được dùng cache dài của danh mục: cũ một tiếng thì tệ hơn không
  // hiện gì, vì nó trông như số thật.
  it("workload không nằm chung cấu hình cache dài với danh mục", () => {
    const workload = source.slice(source.indexOf('queryKey: ["designers-3d-workload"]'));
    expect(workload.slice(0, 300)).not.toContain("CATALOG_QUERY");
  });

  // Vai không có quyền mà vẫn gọi thì nhận 403 mỗi lần mở panel — hỏi trước ở client.
  it("các query cần quyền đều có cờ enabled", () => {
    for (const key of [
      '["designers-3d-workload"]',
      '["kpi-3d-groups", "active"]',
      '["kpi-3d-working-calendars", "active"]',
    ]) {
      const block = source.slice(source.indexOf(`queryKey: ${key}`));
      expect(block.slice(0, 300)).toContain("enabled:");
    }
  });
});
