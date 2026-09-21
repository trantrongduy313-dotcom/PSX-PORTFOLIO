import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

import { guardMigrationTarget, parseDbIdentity } from "./lib/db-target";
import { loadDbRegistry } from "./lib/db-registry";

// ─── Đưa PREVIEW về đúng trạng thái của PRODUCTION, rồi thử migration mới ────
//
//   npm run baseline:preview
//
// ⚠️ VÌ SAO SCRIPT NÀY TỒN TẠI: lịch sử migration KHÔNG dựng lại được cơ sở dữ liệu từ số không.
// Đã chứng minh bằng hai lần chạy thật trên preview:
//
//   1) `20260519062804_init` — `CREATE TYPE "UserRole"` (không có IF NOT EXISTS; Postgres KHÔNG
//      hỗ trợ cú pháp đó cho TYPE) → gãy trên DB đã có enum.
//   2) `20260530000000_per_mo_fields` — đọc `orders."priorityCode"`, một cột mà KHÔNG migration
//      nào từng tạo. Nó chỉ tồn tại vì `db push` thêm vào ngoài luồng.
//
// Cả hai đều là lỗi LỊCH SỬ, và KHÔNG được sửa: production đã áp dụng chúng. Prisma lưu checksum
// của từng migration đã chạy — sửa file của một migration đã áp dụng là cách nhanh nhất làm
// `migrate deploy` trên production gãy. Vá lại quá khứ đắt hơn nhiều so với cái nó mua được.
//
// NÊN LÀM ĐÚNG THỨ CẦN LÀM: preview không cần dựng-từ-số-không, nó cần GIỐNG PRODUCTION. Cách
// production có schema là `db push`; ta làm lại đúng thế, đánh dấu các migration lịch sử là đã áp
// dụng, rồi để `migrate deploy` chạy ĐÚNG những migration còn đang chờ.
//
// Như vậy bài diễn tập còn TRUNG THỰC HƠN dựng-từ-số-không: nó tái hiện đúng thao tác sẽ xảy ra
// trên production, trên đúng hình dạng schema mà production đang có.
//
// AN TOÀN: đi qua guardMigrationTarget với `--expect preview`. Ref của production mang nhãn
// "production" nên bị từ chối. `db push --accept-data-loss` là lệnh phá huỷ, nên rào chắn này
// KHÔNG được bỏ.

for (const file of [".env.local", ".env"]) {
  dotenv.config({ path: path.resolve(process.cwd(), file), quiet: true });
}

const MIGRATIONS_DIR = path.resolve(process.cwd(), "prisma", "migrations");

/**
 * Migration được CỐ Ý để ở trạng thái chờ, để `migrate deploy` thật sự chạy chúng.
 *
 * Đây là hai migration mới của đợt này — trên production chúng cũng đang chờ. Để chúng chờ ở
 * preview nghĩa là ta thử ĐÚNG thứ chưa từng được thực thi ở đâu cả.
 */
const KEEP_PENDING = [
  "20260819110000_baseline_repair_missing_tables",
  "20260819120000_add_user_stores_official",
];

function migrationsOnDisk(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((n) => /^\d{14}_/.test(n) && statSync(path.join(MIGRATIONS_DIR, n)).isDirectory())
    .sort();
}

/**
 * Trên Windows, `npx` là `npx.cmd` — spawn được mà KHÔNG cần `shell: true`.
 *
 * VÌ SAO TRÁNH `shell: true`: Node cảnh báo DEP0190 vì với cờ đó, tham số KHÔNG được escape, chỉ
 * nối chuỗi. Ở đây tham số là tên thư mục migration trong repo nên không có ai chèn gì vào được,
 * nhưng để nguyên thì mỗi lần chạy lại in ra một cảnh báo bảo mật — và một cảnh báo luôn xuất
 * hiện, luôn vô hại, là cách nhanh nhất dạy người ta bỏ qua mọi cảnh báo.
 */
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

function run(args: string[]): void {
  execFileSync(NPX, ["prisma", ...args], { stdio: "inherit" });
}

/**
 * Như `run` nhưng BỎ QUA đúng câu lỗi "migration này đã được ghi nhận rồi".
 *
 * VÌ SAO CẦN: giai đoạn ② chạy 29 lệnh. Gãy ở lệnh thứ 20 rồi chạy lại từ đầu sẽ đụng 19
 * migration đã resolve xong, và `migrate resolve` coi đó là lỗi. Không khoan dung ở đây thì script
 * chỉ dùng được đúng MỘT lần — mà lần đầu nó chạy đã gãy vì một cờ sai, nên "chỉ một lần" là điều
 * kiện không dùng được.
 *
 * CHỈ bỏ qua ĐÚNG câu lỗi đó, mọi lỗi khác vẫn ném. Nuốt hết là biến một script vận hành thành
 * một script báo thành công bất kể chuyện gì xảy ra.
 */
/** Ngủ ĐỒNG BỘ — cả script này chạy tuần tự, không có vòng lặp sự kiện để await vào. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * ⚠️ VÌ SAO CÓ RETRY VÀ GIÃN NHỊP: bản đầu gọi 29 lệnh `npx prisma migrate resolve` liên tiếp,
 * mỗi lệnh là MỘT TIẾN TRÌNH MỚI mở MỘT KẾT NỐI MỚI tới session pooler của Supabase. Pooler cạn
 * kết nối ở lệnh thứ 14 và trả về:
 *
 *     Error: P1001: Can't reach database server
 *
 * Câu lỗi đó đọc như "database chết", nên nó dẫn người ta đi sai hướng — thật ra là chính script
 * tự làm ngập pooler. Nhìn 29 tiến trình nối tiếp thì rõ, nhưng câu lỗi không hề nói vậy.
 *
 * P1001 là lỗi TẠM THỜI: đợi một nhịp là pooler nhả kết nối. Nên thử lại có lùi dần, và giãn một
 * nhịp ngắn giữa các lệnh thành công để không dựng lại đúng cái đợt dồn đó.
 */
function resolveApplied(migration: string): "moi" | "da-co" {
  const MAX_LAN = 4;
  for (let lan = 1; lan <= MAX_LAN; lan++) {
    try {
      execFileSync(NPX, ["prisma", "migrate", "resolve", "--applied", migration], {
        stdio: "pipe",
        encoding: "utf8",
      });
      return "moi";
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      const out = String(e.stdout ?? "") + String(e.stderr ?? "");

      if (/already recorded as applied|already applied/i.test(out)) return "da-co";

      // CHỈ thử lại đúng lỗi kết nối. Lỗi nghiệp vụ mà thử lại 4 lần thì chỉ làm output khó đọc
      // và che mất nguyên nhân thật.
      const tamThoi = /P1001|Can't reach database server|connection|timeout/i.test(out);
      if (!tamThoi || lan === MAX_LAN) {
        console.error(out);
        throw err;
      }
      const cho = 2000 * lan;
      console.log(`      ⟳ pooler đang nghẽn, thử lại sau ${cho / 1000}s (lần ${lan}/${MAX_LAN - 1})`);
      sleepSync(cho);
    }
  }
  throw new Error("không tới được đây");
}

function main() {
  const identity = parseDbIdentity(process.env.DATABASE_URL);
  const verdict = guardMigrationTarget({
    identity,
    registry: loadDbRegistry(),
    expected: "preview",
    confirmedProduction: false,
  });

  if (!verdict.ok) {
    console.error(`\n✖ Đã CHẶN.\n\n${verdict.reason}\n`);
    process.exit(1);
  }
  console.log(`✓ Đích hợp lệ: ${verdict.label} — ${identity.display}\n`);

  const all = migrationsOnDisk();
  const toResolve = all.filter((m) => !KEEP_PENDING.includes(m));
  const pending = all.filter((m) => KEEP_PENDING.includes(m));

  if (pending.length !== KEEP_PENDING.length) {
    // Đổi tên/xoá một migration trong KEEP_PENDING mà quên sửa file này thì script sẽ âm thầm
    // đánh dấu nó là đã áp dụng, và bài diễn tập không thử gì cả — xanh vì rỗng, ở dạng vận hành.
    console.error(`✖ Không tìm thấy đủ migration cần để chờ. Mong ${KEEP_PENDING.length}, thấy ${pending.length}.`);
    console.error(`  KEEP_PENDING trong scripts/baseline-preview.ts đã lệch với thư mục migrations.`);
    process.exit(1);
  }

  console.log("① Dựng schema trực tiếp từ schema.prisma (đúng cách production đã được dựng)…\n");
  // KHÔNG có `--skip-generate`: Prisma 7 đã bỏ cờ đó khỏi `db push` — chỉ còn --accept-data-loss,
  // --force-reset, --schema, --url, --config. Truyền vào là lệnh thất bại ngay từ đầu.
  run(["db", "push", "--accept-data-loss"]);

  console.log(`\n② Đánh dấu ${toResolve.length} migration lịch sử là ĐÃ ÁP DỤNG…\n`);
  let moi = 0;
  let daCo = 0;
  for (const m of toResolve) {
    const kq = resolveApplied(m);
    if (kq === "moi") moi++;
    else daCo++;
    console.log(`    ${kq === "moi" ? "✓" : "·"} ${m}`);
    // Giãn nhịp CHỈ khi vừa thật sự mở kết nối. Cái đã có sẵn không chạm DB nên không cần chờ —
    // và chờ vô cớ 29 lần biến một script 30 giây thành một script hai phút.
    if (kq === "moi") sleepSync(400);
  }
  console.log(`\n    ${moi} mới ghi nhận, ${daCo} đã có sẵn từ lần chạy trước.`);

  console.log(`\n③ Còn ${pending.length} migration ĐANG CHỜ — chạy chúng bằng migrate deploy:\n`);
  for (const m of pending) console.log(`    · ${m}`);
  console.log("");
  run(["migrate", "deploy"]);

  console.log("\n✓ Xong. Preview giờ đứng ở đúng chỗ production sẽ đứng sau khi deploy.");
  console.log("  Bước kế: npm run db:preflight — phải sạch.");
}

main();
