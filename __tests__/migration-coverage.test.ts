import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// TEST CHO ĐÚNG LỚP LỖI VỪA SUÝT LÊN PRODUCTION.
//
// Bảng `user_stores` có trong schema và được hơn 7 file ứng dụng dùng (kể cả màn Đơn hàng),
// nhưng KHÔNG migration nào tạo nó — nó chỉ nằm trong một file .sql ở THƯ MỤC GỐC của
// migrations, thứ mà `prisma migrate deploy` BỎ QUA hoàn toàn. Deploy lên một DB sạch là màn Đơn
// hàng chết ngay từ truy vấn đầu tiên.
//
// Rà tiếp thì ra thêm BỐN bảng nữa cùng cảnh: stores, accounts, sessions, verification_tokens,
// kpi_monthly_config. Tức lịch sử migration CHƯA BAO GIỜ dựng lại được DB từ số không — không ai
// biết, vì mọi lần deploy đều nhắm vào production nơi phần nền đã có sẵn.
//
// Lỗi này KHÔNG THỂ nhìn ra bằng cách đọc code, và tsc/lint/test nghiệp vụ đều không đụng tới nó.
// Nó chỉ lộ ra khi ĐỐI CHIẾU HAI NGUỒN. Nên phép đối chiếu đó phải là một test.

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");
const SCHEMA_PATH = join(process.cwd(), "prisma", "schema.prisma");

const schema = readFileSync(SCHEMA_PATH, "utf8");

/** Tên bảng thật của mọi model: `@@map("...")` nếu có, không thì chính tên model. */
function tablesInSchema(): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, model, body] = m;
    const mapped = body.match(/@@map\("([^"]+)"\)/);
    out.set(mapped ? mapped[1] : model, model);
  }
  return out;
}

/** Thư mục migration hợp lệ = có mốc thời gian. Chỉ những thư mục này được `migrate deploy` chạy. */
function migrationDirs(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{14}_/.test(name))
    .filter((name) => statSync(join(MIGRATIONS_DIR, name)).isDirectory())
    .sort();
}

function allMigrationSql(): string {
  return migrationDirs()
    .map((d) => {
      try {
        return readFileSync(join(MIGRATIONS_DIR, d, "migration.sql"), "utf8");
      } catch {
        return "";
      }
    })
    .join("\n");
}

function tablesCreatedByMigrations(sql: string): Set<string> {
  const out = new Set<string>();
  for (const m of sql.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+"?([\w.]+)"?/gi)) {
    out.add(m[1]);
  }
  return out;
}

describe("BỘ DÒ CÒN CHẠY — không bao giờ được xanh vì rỗng", () => {
  it("đọc được schema và tìm thấy nhiều model", () => {
    expect(tablesInSchema().size).toBeGreaterThanOrEqual(20);
  });

  it("tìm thấy nhiều thư mục migration có mốc thời gian", () => {
    expect(migrationDirs().length).toBeGreaterThanOrEqual(25);
  });

  it("gộp được SQL và tìm thấy nhiều lệnh CREATE TABLE", () => {
    expect(tablesCreatedByMigrations(allMigrationSql()).size).toBeGreaterThanOrEqual(20);
  });
});

describe("MỌI bảng trong schema phải được một migration tạo ra", () => {
  it("không còn bảng nào chỉ tồn tại trong schema mà không có nguồn gốc", () => {
    // Nếu test này đỏ: bạn vừa thêm một model mà quên migration, HOẶC bảng được tạo bằng
    // `prisma db push` / chạy tay trên Supabase. Cả hai đều nghĩa là deploy lên DB sạch sẽ thiếu
    // bảng, và lỗi chỉ lộ ra lúc chạy thật.
    //
    // CÁCH SỬA: tạo migration có mốc thời gian. Nếu bảng đã tồn tại trên production thì dùng
    // `CREATE TABLE IF NOT EXISTS` để lệnh là vô hại ở đó — xem
    // 20260819110000_baseline_repair_missing_tables làm mẫu.
    const created = tablesCreatedByMigrations(allMigrationSql());
    const missing = [...tablesInSchema()]
      .filter(([table]) => !created.has(table))
      .map(([table, model]) => `${table} (model ${model})`);

    expect(missing).toEqual([]);
  });
});

describe("Không được có file .sql lạc ở thư mục gốc migrations", () => {
  it("mọi file .sql phải nằm trong một thư mục có mốc thời gian", () => {
    // `add_user_stores.sql` từng nằm ở đây. `migrate deploy` BỎ QUA nó, còn người đọc thì tưởng
    // nó đã được áp dụng — một file vừa không chạy vừa gây hiểu nhầm thì tệ hơn là không có.
    const stray = readdirSync(MIGRATIONS_DIR).filter(
      (name) => name.endsWith(".sql") && statSync(join(MIGRATIONS_DIR, name)).isFile(),
    );

    expect(stray).toEqual([]);
  });

  it("mỗi thư mục migration đều có migration.sql", () => {
    const empty = migrationDirs().filter((d) => {
      try {
        return readFileSync(join(MIGRATIONS_DIR, d, "migration.sql"), "utf8").trim().length === 0;
      } catch {
        return true;
      }
    });
    expect(empty).toEqual([]);
  });
});

describe("Bản vá nền phải AN TOÀN trên production (nơi các bảng đã tồn tại)", () => {
  const repairRaw = readFileSync(
    join(MIGRATIONS_DIR, "20260819110000_baseline_repair_missing_tables", "migration.sql"),
    "utf8",
  );
  // BỎ DÒNG CHÚ THÍCH trước khi soi. Phần chú thích của file đó GIẢI THÍCH vì sao không được
  // dùng ALTER TABLE ADD CONSTRAINT — soi cả chú thích thì chính lời giải thích làm test đỏ.
  const repair = repairRaw
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  it("mọi CREATE TABLE đều IF NOT EXISTS", () => {
    const bare = [...repair.matchAll(/CREATE TABLE(\s+IF NOT EXISTS)?\s+"([\w]+)"/gi)]
      .filter((m) => !m[1])
      .map((m) => m[2]);
    expect(bare).toEqual([]);
  });

  it("mọi CREATE INDEX đều IF NOT EXISTS", () => {
    const bare = [...repair.matchAll(/CREATE (?:UNIQUE )?INDEX(\s+IF NOT EXISTS)?\s+"([\w]+)"/gi)]
      .filter((m) => !m[1])
      .map((m) => m[2]);
    expect(bare).toEqual([]);
  });

  it("KHÔNG dùng ALTER TABLE ADD CONSTRAINT — Postgres không có IF NOT EXISTS cho nó", () => {
    // Lệnh đó sẽ NỔ trên production nơi ràng buộc đã tồn tại. Khoá ngoại phải viết trong lòng
    // CREATE TABLE để chỉ chạy đúng lúc bảng được tạo mới.
    expect(repair).not.toMatch(/ALTER TABLE[\s\S]*?ADD CONSTRAINT/i);
  });

  it("chạy TRƯỚC migration user_stores — nó tham chiếu bảng stores", () => {
    const dirs = migrationDirs();
    const repairAt = dirs.indexOf("20260819110000_baseline_repair_missing_tables");
    const userStoresAt = dirs.indexOf("20260819120000_add_user_stores_official");
    expect(repairAt).toBeGreaterThan(-1);
    expect(userStoresAt).toBeGreaterThan(-1);
    expect(repairAt).toBeLessThan(userStoresAt);
  });
});

describe("Khoá ngoại chỉ được trỏ tới bảng mà migration TRƯỚC ĐÓ đã tạo", () => {
  it("không migration nào tham chiếu một bảng chưa từng được tạo trước nó", () => {
    // Đây chính là cách `add_user_stores_official` suýt gãy: nó REFERENCES "stores", mà không
    // migration nào trước đó tạo bảng ấy. Trên production thì chạy được (bảng có sẵn từ db push),
    // trên DB sạch thì gãy — một lỗi chỉ xuất hiện ở đúng nơi ta chưa từng thử.
    const dirs = migrationDirs();
    const createdSoFar = new Set<string>();
    const violations: string[] = [];

    for (const dir of dirs) {
      let sql = "";
      try {
        sql = readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8");
      } catch {
        continue;
      }
      for (const m of sql.matchAll(/REFERENCES\s+"([\w]+)"/gi)) {
        // Tự tham chiếu trong cùng file là hợp lệ (bảng được tạo ngay phía trên).
        const target = m[1];
        const createdHere = new RegExp(`CREATE TABLE(\\s+IF NOT EXISTS)?\\s+"${target}"`, "i").test(sql);
        if (!createdSoFar.has(target) && !createdHere) {
          violations.push(`${dir} → REFERENCES "${target}"`);
        }
      }
      for (const m of sql.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+"([\w]+)"/gi)) {
        createdSoFar.add(m[1]);
      }
    }

    expect(violations).toEqual([]);
  });
});
