import { readFileSync } from "fs";
import { Client } from "pg";

const envFile = readFileSync(".env", "utf8");
for (const line of envFile.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const val = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, "");
  if (!process.env[key]) process.env[key] = val;
}

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
if (!url) { console.error("No DATABASE_URL/DIRECT_URL found"); process.exit(1); }

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

const UPDATES: { from: string; to: string; level: string }[] = [
  { from: "Luong Tri Hien",   to: "Lương Trí Hiền",   level: "KTSX"  },
  { from: "Nguyen Van Le",    to: "Nguyễn Văn Lê",    level: "Bậc 5" },
  { from: "Ngo Hung Ngoc",    to: "Ngô Hùng Ngọc",    level: "Bậc 4" },
  { from: "Pham Quang Huy",   to: "Phạm Quang Huy",   level: "Bậc 4" },
  { from: "Phan Hong Dat",    to: "Phan Hồng Đạt",    level: "Bậc 4" },
  { from: "Huynh Nguyen Bao", to: "Huỳnh Nguyên Bảo", level: "Bậc 3" },
  { from: "Pham Hieu May",    to: "Phạm Hiếu May",    level: "Bậc 3" },
  { from: "Tran Trung Nghia", to: "Trần Trung Nghĩa", level: "Bậc 3" },
  { from: "Le Dinh Thuan",    to: "Lê Đình Thuận",    level: "Bậc 2" },
];

async function main() {
  await client.connect();
  console.log("Connected.");

  for (const u of UPDATES) {
    const res = await client.query(
      `UPDATE "craftsmen" SET name=$1, level=$2, "updatedAt"=NOW() WHERE name=$3`,
      [u.to, u.level, u.from]
    );
    const rows = res.rowCount ?? 0;
    if (rows > 0) {
      console.log(`  ✓ "${u.from}" → "${u.to}" (${u.level})`);
    } else {
      console.log(`  ⚠ Not found: "${u.from}" (already updated?)`);
    }
  }

  console.log("\nDone.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => client.end());
