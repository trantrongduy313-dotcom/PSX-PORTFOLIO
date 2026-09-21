import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ═══════════════════════════════════════════════════════════════════════════
// TEST CHO ĐÚNG ĐƯỜNG MẤT DỮ LIỆU ĐÃ TÌM RA KHI RÀ SOÁT TRƯỚC KHI LÊN MAIN.
//
// `productionDetail.extraData` là MỘT cột JSON chứa toàn bộ tiến độ. Nhiều route đọc–sửa–ghi
// lại nguyên cả khối, và thứ duy nhất giữ chúng không giẫm lên nhau là khoá lạc quan
// `Order.version`. Khoá đó chỉ đúng khi MỌI người ghi cùng tăng số:
//
//   `admin/stage-reviews` ghi đè extraData mà KHÔNG tăng version → tab Tiến độ đang mở của
//   người khác vẫn giữ số cũ, số vẫn KHỚP khi họ bấm Lưu, khoá cho qua, và phê duyệt vừa
//   xong bị ghi đè mất. Không lỗi, không cảnh báo.
//
// ─── VÌ SAO ĐỌC MÃ NGUỒN CHỨ KHÔNG TEST HÀM ─────────────────────────────────
//
// Lỗi này KHÔNG nằm trong hàm nào cả — nó nằm ở chỗ một dòng KHÔNG ĐƯỢC VIẾT. Không có giá
// trị nào để so, không có hàm nào để gọi. Thứ duy nhất kiểm được là: file nào chạm vào
// extraData thì phải có mặt trong danh sách người tăng version.
//
// Và đây mới là phần đáng giá: nó chặn NGƯỜI VIẾT ROUTE THỨ BẢY. Vá hai chỗ hôm nay chỉ sửa
// hôm nay; test này giữ cho luật còn sống sau khi ai đó quên mất lý do nó tồn tại — đúng
// cùng một hình dạng với test danh sách trắng của `order_items`.
// ═══════════════════════════════════════════════════════════════════════════

const API_ROOT = join(process.cwd(), "app", "api");

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routeFiles(full));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

/** Route này có ghi đè `productionDetail.extraData` không. */
function writesExtraData(src: string): boolean {
  return /productionDetail\.update\(\s*\{[\s\S]{0,400}?extraData/.test(src);
}

/** Route này có làm hết hiệu lực bản sao đang mở ở client không. */
function bumpsVersion(src: string): boolean {
  return src.includes("bumpOrderVersion") || /version:\s*\{\s*increment/.test(src);
}

const rel = (p: string) => p.slice(process.cwd().length + 1).replace(/\\/g, "/");

describe("Ghi extraData thì PHẢI tăng Order.version", () => {
  const writers = routeFiles(API_ROOT).filter((f) => writesExtraData(readFileSync(f, "utf8")));

  it("tìm được đúng những route thật sự ghi extraData (bộ dò còn chạy)", () => {
    // Bộ dò dùng regex — nếu ai đó đổi cách gọi Prisma, nó có thể lặng lẽ không khớp gì nữa
    // và test bên dưới sẽ PASS vì rỗng. Chốt này biến "không dò được" thành đỏ, thay vì
    // thành một tấm lưới không còn bắt gì.
    expect(writers.length).toBeGreaterThanOrEqual(4);
    expect(writers.map(rel)).toContain("app/api/admin/stage-reviews/route.ts");
    expect(writers.map(rel)).toContain("app/api/import/sheet-sync/route.ts");
  });

  it("KHÔNG route nào ghi extraData mà bỏ quên version", () => {
    const offenders = writers.filter((f) => !bumpsVersion(readFileSync(f, "utf8"))).map(rel);
    expect(offenders).toEqual([]);
  });
});
