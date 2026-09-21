import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { compareShape, judgeLedger, parseSchemaShape } from "../scripts/lib/schema-shape";

// TEST CHO CÔNG CỤ TRẢ LỜI CÂU HỎI CHƯA AI TRẢ LỜI ĐƯỢC: production đang có schema gì?
//
// Rà soát trước khi lên main cho thấy schema production đã từng bị sửa BẰNG TAY, và năm bảng
// trong schema không có migration nào tạo ra. Lịch sử migration không mô tả đúng DB thật, nên
// chạy 31 migration lên nó là nhảy vào chỗ tối.

const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

describe("parseSchemaShape — phân biệt CỘT với QUAN HỆ", () => {
  const shape = parseSchemaShape(schema);

  it("BỘ DÒ CÒN CHẠY — đọc được nhiều bảng từ schema thật", () => {
    expect(shape.tables.size).toBeGreaterThanOrEqual(20);
  });

  it("dùng @@map làm tên bảng, không phải tên model", () => {
    expect(shape.tables.has("user_stores")).toBe(true);
    expect(shape.modelOf.get("user_stores")).toBe("UserStore");
    expect(shape.tables.has("UserStore")).toBe(false);
  });

  it("cột vô hướng được nhận", () => {
    const orders = shape.tables.get("orders");
    expect(orders?.has("orderNumber")).toBe(true);
    expect(orders?.has("version")).toBe(true);
  });

  it("trường QUAN HỆ KHÔNG sinh cột, nhưng khoá ngoại đi kèm thì CÓ", () => {
    // `order Order @relation(fields: [orderId] ...)` không có cột nào trong bảng; cột thật là
    // `orderId`, do một trường riêng khai. Nhận nhầm quan hệ thành cột sẽ khiến preflight báo
    // "thiếu cột" ở mọi bảng, và một cảnh báo sai hàng loạt thì bị bỏ qua y như không có.
    const a = shape.tables.get("design_3d_assignments");
    expect(a?.has("orderItemId")).toBe(true);
    expect(a?.has("orderItem")).toBe(false);
    expect(a?.has("order")).toBe(false);
  });

  it("danh sách quan hệ (Model[]) KHÔNG sinh cột", () => {
    expect(shape.tables.get("orders")?.has("items")).toBe(false);
  });

  it("cột kiểu ENUM VẪN được tính — enum có cột thật", () => {
    expect(shape.tables.get("design_3d_assignments")?.has("status")).toBe(true);
  });

  it("model khai SAU vẫn được nhận là quan hệ (quét hai lượt)", () => {
    // Quét một lượt thì model khai sau bị tưởng là enum và sinh ra cột ma. `users` khai trước
    // `UserStore`, nên chiều ngược lại là phép thử thật.
    expect(shape.tables.get("user_stores")?.has("user")).toBe(false);
    expect(shape.tables.get("user_stores")?.has("userId")).toBe(true);
  });
});

describe("parseSchemaShape — @map đổi tên cột", () => {
  it("dùng tên trong @map, không dùng tên trường", () => {
    const shape = parseSchemaShape(`
model Thing {
  id      String @id
  camelIt String @map("snake_it")
  @@map("things")
}
`);
    const cols = shape.tables.get("things")!;
    expect(cols.has("snake_it")).toBe(true);
    expect(cols.has("camelIt")).toBe(false);
  });
});

describe("compareShape — chỉ THIẾU mới là lỗi", () => {
  const expected = parseSchemaShape(`
model A {
  id   String @id
  name String
  @@map("a")
}
model B {
  id String @id
  @@map("b")
}
`);

  it("bảng thiếu hẳn được nêu tên", () => {
    const drift = compareShape(expected, new Map([["a", new Set(["id", "name"])]]));
    expect(drift.missingTables).toEqual(["b"]);
  });

  it("cột thiếu được nêu theo từng bảng", () => {
    const drift = compareShape(expected, new Map([
      ["a", new Set(["id"])],
      ["b", new Set(["id"])],
    ]));
    expect(drift.missingColumns.get("a")).toEqual(["name"]);
  });

  it("_prisma_migrations KHÔNG bị nêu là bảng lạ — nó là bảng của chính Prisma", () => {
    // Nó không có trong schema.prisma nên phép so sẽ luôn nêu nó ra: một dòng cảnh báo xuất hiện
    // MỌI LẦN và LUÔN vô hại. Đó là cách nhanh nhất dạy người dùng bỏ qua cả danh sách — mà danh
    // sách đó tồn tại để phát hiện dấu vết vá tay.
    const drift = compareShape(expected, new Map([
      ["a", new Set(["id", "name"])],
      ["b", new Set(["id"])],
      ["_prisma_migrations", new Set(["id"])],
    ]));
    expect(drift.extraTables).toEqual([]);
  });

  it("bảng THỪA chỉ để biết, KHÔNG tính là thiếu", () => {
    // Bảng thừa không làm ứng dụng chết — nhưng nó là DẤU VẾT của những lần vá tay, đúng thứ ta
    // đang đi tìm. Nên phải hiện ra mà không được chặn deploy.
    const drift = compareShape(expected, new Map([
      ["a", new Set(["id", "name"])],
      ["b", new Set(["id"])],
      ["di_tich_cu", new Set(["id"])],
    ]));
    expect(drift.extraTables).toEqual(["di_tich_cu"]);
    expect(drift.missingTables).toEqual([]);
  });

  it("khớp hoàn toàn → không báo gì", () => {
    const drift = compareShape(expected, new Map([
      ["a", new Set(["id", "name"])],
      ["b", new Set(["id"])],
    ]));
    expect(drift.missingTables).toEqual([]);
    expect(drift.missingColumns.size).toBe(0);
  });
});

describe("judgeLedger — sổ migration", () => {
  it("migration trên đĩa chưa áp dụng → đang chờ", () => {
    const v = judgeLedger({ onDisk: ["m1", "m2", "m3"], applied: ["m1"], failed: [] });
    expect(v.pending).toEqual(["m2", "m3"]);
  });

  it("DB ghi đã chạy nhưng KHÔNG còn trên đĩa → cảnh báo, deploy sẽ dừng", () => {
    // Ai đó xoá hoặc đổi tên một migration đã chạy. `migrate deploy` báo lịch sử không khớp và
    // DỪNG — biết trước còn hơn phát hiện giữa lúc deploy.
    const v = judgeLedger({ onDisk: ["m1"], applied: ["m1", "m_da_bi_xoa"], failed: [] });
    expect(v.unknownToRepo).toEqual(["m_da_bi_xoa"]);
  });

  it("migration dở dang / lỗi được nêu riêng", () => {
    const v = judgeLedger({ onDisk: ["m1"], applied: [], failed: ["m1"] });
    expect(v.failed).toEqual(["m1"]);
  });

  it("mọi thứ khớp → không có gì để báo", () => {
    const v = judgeLedger({ onDisk: ["m1"], applied: ["m1"], failed: [] });
    expect(v).toEqual({ pending: [], unknownToRepo: [], failed: [], danglingButApplied: [] });
  });

  it("dở dang VÀ không có dòng thành công → CHẶN deploy", () => {
    const v = judgeLedger({ onDisk: ["m1"], applied: [], failed: ["m1"] });
    expect(v.failed).toEqual(["m1"]);
    expect(v.danglingButApplied).toEqual([]);
  });

  it("dở dang NHƯNG đã có dòng thành công → chỉ là vết xước, KHÔNG chặn", () => {
    // Xảy ra thật trên preview: `migrate:reset-preview` gãy ở per_mo_fields để lại dòng dở dang,
    // rồi `migrate resolve --applied` THÊM một dòng mới thay vì sửa dòng cũ. Migration đã áp dụng
    // xong. Gộp hai ca này thì công cụ thành báo động giả — và một công cụ hay báo động giả sẽ bị
    // bỏ qua đúng vào lần nó báo đúng.
    const v = judgeLedger({ onDisk: ["m1"], applied: ["m1"], failed: ["m1"] });
    expect(v.failed).toEqual([]);
    expect(v.danglingButApplied).toEqual(["m1"]);
  });
});

describe("Script preflight phải CHỈ ĐỌC — an toàn để chĩa vào production", () => {
  const src = readFileSync(join(process.cwd(), "scripts", "db-preflight.ts"), "utf8");
  // Bỏ dòng chú thích: phần đầu file GIẢI THÍCH rằng không được có CREATE/ALTER/INSERT — soi cả
  // chú thích thì chính lời giải thích làm test đỏ.
  const code = src
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");

  it("BỘ DÒ CÒN CHẠY — vẫn thấy phần thân script có truy vấn", () => {
    expect(code).toContain("client.query");
  });

  it.each(["CREATE ", "ALTER ", "DROP ", "INSERT ", "UPDATE ", "DELETE ", "TRUNCATE "])(
    "KHÔNG có lệnh ghi: %s",
    (verb) => {
      // Một lời hứa "chỉ đọc" nằm trong chú thích thì không ngăn được ai thêm một lệnh ghi vào
      // tháng sau. Script này được thiết kế để chĩa thẳng vào PRODUCTION, nên lời hứa đó phải
      // được một test giữ.
      expect(code.toUpperCase()).not.toContain(verb);
    },
  );

  it("có nhắc người dùng ĐỪNG ghi DATABASE_URL production vào .env.local", () => {
    // Quên xoá .env.local là lệnh GHI kế tiếp bắn thẳng vào production.
    expect(src).toContain(".env.local");
  });

  it("in ra ĐANG SOI DB nào trước khi làm gì — không bao giờ để người dùng đoán", () => {
    expect(code).toContain("parseDbIdentity");
    expect(code).toContain("Nhãn môi trường");
  });
});
