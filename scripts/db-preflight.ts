import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import dotenv from "dotenv";
import { Client } from "pg";

import { parseDbIdentity } from "./lib/db-target";
import { compareShape, judgeLedger, parseSchemaShape } from "./lib/schema-shape";

// ─── DIỄN TẬP KHÔ trước khi chạy migration — CHỈ ĐỌC, không ghi một chữ nào ───
//
//   npm run db:preflight
//
// ⚠️ VÌ SAO CẦN: rà soát trước khi lên main phát hiện schema production ĐÃ TỪNG BỊ SỬA BẰNG TAY
// (file `add_user_stores.sql` kèm dòng "Run this on Supabase SQL editor before deploying"), và
// năm bảng trong schema không có migration nào tạo ra. Nghĩa là lịch sử migration KHÔNG mô tả
// đúng cơ sở dữ liệu thật, và không ai biết production đang ở hình dạng nào.
//
// Chạy 31 migration lên một DB không rõ hình dạng là nhảy vào chỗ tối. Script này bật đèn.
//
// AN TOÀN ĐỂ CHĨA THẲNG VÀO PRODUCTION: mọi câu lệnh đều là SELECT trên `information_schema` và
// `_prisma_migrations`. Không CREATE, không ALTER, không INSERT, không UPDATE, không DELETE.
// Có test quét nguồn chốt điều đó (xem __tests__/db-preflight-readonly.test.ts) — vì một lời hứa
// "chỉ đọc" nằm trong chú thích thì không ngăn được ai thêm một lệnh ghi vào tháng sau.
//
// KHÔNG BAO GIỜ chép DATABASE_URL của production vào .env.local. Truyền một lần cho đúng lệnh này:
//
//   DATABASE_URL="postgresql://..." npx tsx scripts/db-preflight.ts
//
// Quên xoá .env.local là lệnh GHI kế tiếp bắn thẳng vào production.

for (const file of [".env.local", ".env"]) {
  dotenv.config({ path: path.resolve(process.cwd(), file), quiet: true });
}

const MIGRATIONS_DIR = path.resolve(process.cwd(), "prisma", "migrations");
const SCHEMA_PATH = path.resolve(process.cwd(), "prisma", "schema.prisma");
const REGISTRY_PATH = path.resolve(process.cwd(), "db-targets.json");

function migrationsOnDisk(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((n) => /^\d{14}_/.test(n) && statSync(path.join(MIGRATIONS_DIR, n)).isDirectory())
    .sort();
}

function environmentLabel(projectRef: string | null): string {
  try {
    const parsed = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
    return parsed?.projects?.[projectRef ?? ""] ?? "KHÔNG NHẬN DIỆN ĐƯỢC";
  } catch {
    return "KHÔNG NHẬN DIỆN ĐƯỢC";
  }
}

function bullet(items: readonly string[], indent = "    "): string {
  return items.map((i) => `${indent}· ${i}`).join("\n");
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("✖ Chưa đặt DATABASE_URL. Truyền một lần cho đúng lệnh này, ĐỪNG ghi vào .env.local.");
    process.exit(1);
  }

  const identity = parseDbIdentity(url);
  const label = environmentLabel(identity.projectRef);

  console.log("─".repeat(78));
  console.log("DIỄN TẬP KHÔ — CHỈ ĐỌC, không ghi bất cứ thứ gì");
  console.log("─".repeat(78));
  console.log(`Đang soi     : ${identity.display}`);
  console.log(`Nhãn môi trường: ${label}`);
  console.log("");

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  let problems = 0;

  try {
    // ── 1. Sổ migration ─────────────────────────────────────────────────────
    const onDisk = migrationsOnDisk();

    const ledgerExists = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
       ) AS exists`,
    );

    if (!ledgerExists.rows[0]?.exists) {
      // Đây KHÔNG phải chuyện nhỏ: DB có dữ liệu nhưng Prisma chưa từng ghi sổ ở đây, nghĩa là
      // toàn bộ schema hiện có được dựng ngoài migration. `migrate deploy` sẽ coi CẢ 31
      // migration là chưa chạy và thử tạo lại những bảng đã tồn tại.
      console.log("⚠️  KHÔNG CÓ bảng _prisma_migrations.");
      console.log("    Prisma chưa từng ghi sổ trên DB này → migrate deploy sẽ coi MỌI migration");
      console.log("    là chưa chạy và cố tạo lại những thứ đã có. PHẢI xử lý bằng baseline trước.");
      console.log("");
      problems++;
    } else {
      const rows = await client.query<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>(
        `SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`,
      );
      // BA TRẠNG THÁI, KHÔNG PHẢI HAI — bản đầu gộp "dở dang" với "đã đánh dấu lùi" vào cùng một
      // rổ `failed`, và hai thứ đó có hệ quả khác hẳn nhau:
      //
      //   finished_at có, rolled_back_at trống  → ĐÃ ÁP DỤNG
      //   cả hai trống                          → DỞ DANG: Prisma từ chối deploy khi thấy nó
      //   rolled_back_at có                     → Prisma coi là CHƯA áp dụng → sẽ CHẠY LẠI
      //
      // Ca thứ ba KHÔNG phải lỗi, nhưng nó là rủi ro thật: chạy lại một migration không idempotent
      // vào cột đã tồn tại là nổ. Nó tự hiện ra ở danh sách "sẽ chạy" bên dưới, đúng chỗ của nó.
      const verdict = judgeLedger({
        onDisk,
        applied: rows.rows.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name),
        failed: rows.rows.filter((r) => !r.finished_at && !r.rolled_back_at).map((r) => r.migration_name),
      });

      // ĐẾM MIGRATION, KHÔNG ĐẾM DÒNG. Một migration có thể có NHIỀU dòng trong sổ (một lần gãy,
      // một lần thành công), nên đếm dòng cho ra con số LỚN HƠN số migration trên đĩa — và "32 / 31"
      // khiến người đọc đi tìm một migration thứ 32 không tồn tại.
      const soDaXong = new Set(
        rows.rows.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name),
      ).size;
      console.log(`SỔ MIGRATION — trên đĩa ${onDisk.length}, DB ghi đã xong ${soDaXong}`);
      console.log("");

      if (verdict.failed.length > 0) {
        console.log(`  ✖ ${verdict.failed.length} migration DỞ DANG — Prisma sẽ từ chối deploy khi thấy nó:`);
        console.log(bullet(verdict.failed));
        console.log("    → chữa bằng: prisma migrate resolve --applied <tên>  (nếu nó thật sự đã chạy xong)");
        console.log("                 prisma migrate resolve --rolled-back <tên>  (nếu cần chạy lại)");
        console.log("");
        problems++;
      }
      if (verdict.danglingButApplied.length > 0) {
        // KHÔNG tính là vấn đề. Đây là vết xước lịch sử: một lần chạy gãy để lại dòng dở dang, rồi
        // `migrate resolve --applied` THÊM dòng mới thay vì sửa dòng cũ. Migration đã áp dụng xong.
        // Báo như một chốt chặn thì công cụ này thành báo động giả — và một công cụ hay báo động
        // giả sẽ bị bỏ qua đúng vào lần nó báo đúng.
        console.log(`  ℹ ${verdict.danglingButApplied.length} migration còn dòng dở dang CŨ nhưng đã có dòng thành công:`);
        console.log(bullet(verdict.danglingButApplied));
        console.log("    → dấu vết của một lần chạy gãy trước đó. KHÔNG chặn deploy.");
        console.log("");
      }
      if (verdict.unknownToRepo.length > 0) {
        console.log(`  ✖ ${verdict.unknownToRepo.length} migration DB đã chạy nhưng KHÔNG còn trên đĩa:`);
        console.log(bullet(verdict.unknownToRepo));
        console.log("    → migrate deploy sẽ báo lịch sử không khớp và DỪNG.");
        console.log("");
        problems++;
      }
      if (verdict.pending.length > 0) {
        console.log(`  ▸ ${verdict.pending.length} migration SẼ CHẠY ở lần deploy tới:`);
        console.log(bullet(verdict.pending));
        console.log("");
      } else {
        console.log("  ✓ Không có migration nào đang chờ.");
        console.log("");
      }
    }

    // ── 2. Hình dạng thật so với schema ─────────────────────────────────────
    const expected = parseSchemaShape(readFileSync(SCHEMA_PATH, "utf8"));

    const cols = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'`,
    );
    const actual = new Map<string, Set<string>>();
    for (const r of cols.rows) {
      if (!actual.has(r.table_name)) actual.set(r.table_name, new Set());
      actual.get(r.table_name)!.add(r.column_name);
    }

    const drift = compareShape(expected, actual);

    // KHÔNG tính bảng ghi sổ của chính Prisma: schema.prisma không khai nó, nên để nó vào phép đếm
    // là hai con số lệch nhau vĩnh viễn ("23 mong đợi / 24 đang có") mà không hề có gì sai.
    const soBangNghiepVu = [...actual.keys()].filter((t) => t !== "_prisma_migrations").length;
    console.log(`HÌNH DẠNG — schema mong đợi ${expected.tables.size} bảng, DB đang có ${soBangNghiepVu} bảng`);
    console.log("");

    if (drift.missingTables.length > 0) {
      console.log(`  ✖ ${drift.missingTables.length} BẢNG THIẾU — truy vấn đầu tiên chạm tới là nổ:`);
      console.log(bullet(drift.missingTables.map((t) => `${t} (model ${expected.modelOf.get(t)})`)));
      console.log("");
      problems++;
    }
    if (drift.missingColumns.size > 0) {
      console.log(`  ✖ ${drift.missingColumns.size} bảng THIẾU CỘT:`);
      for (const [table, gone] of drift.missingColumns) {
        console.log(`    · ${table}: ${gone.join(", ")}`);
      }
      console.log("");
      problems++;
    }
    if (drift.extraTables.length > 0) {
      // KHÔNG tính là lỗi: bảng thừa không làm ứng dụng chết. Nhưng nó là DẤU VẾT của những lần
      // vá tay, và đó đúng là thứ ta đang đi tìm.
      console.log(`  ℹ ${drift.extraTables.length} bảng có trong DB mà schema không nhắc (chỉ để biết):`);
      console.log(bullet(drift.extraTables));
      console.log("");
    }
    if (drift.missingTables.length === 0 && drift.missingColumns.size === 0) {
      console.log("  ✓ Không thiếu bảng hay cột nào.");
      console.log("");
    }
  } finally {
    await client.end();
  }

  console.log("─".repeat(78));
  if (problems > 0) {
    console.log(`✖ ${problems} nhóm vấn đề. ĐỪNG deploy cho tới khi xử lý xong.`);
    process.exit(1);
  }
  console.log("✓ Sạch. Không phát hiện vấn đề nào chặn deploy.");
}

main().catch((err) => {
  console.error("✖ Diễn tập khô thất bại:", err instanceof Error ? err.message : err);
  process.exit(1);
});
