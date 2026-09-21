import path from "node:path";

import dotenv from "dotenv";

import { guardMigrationTarget, parseDbIdentity } from "./lib/db-target";
import { loadDbRegistry } from "./lib/db-registry";

// Nạp env theo ĐÚNG thứ tự ưu tiên của Next.js: .env.local ghi đè .env.
// dotenv không ghi đè biến đã có, nên nạp .env.local TRƯỚC là ra đúng kết quả.
// Nếu chỉ nạp .env (như bản đầu của file này), rào chắn sẽ báo "chưa đặt DATABASE_URL"
// trong khi `npm run dev` vẫn nối vào DB thật ghi trong .env.local — tức là trấn an sai.
for (const file of [".env.local", ".env"]) {
  dotenv.config({ path: path.resolve(process.cwd(), file), quiet: true });
}

// ─── Rào chắn trước khi chạy migration ────────────────────────────────────────
// Dùng qua npm script, KHÔNG gọi trực tiếp:
//   npm run migrate:preview      → chỉ chạy nếu DATABASE_URL đang trỏ vào preview
//   npm run migrate:production   → còn cần thêm --confirm-production
//   npm run db:whereami          → chỉ in ra đang trỏ vào đâu, không chạy gì
//
// Script CỐ Ý MỎNG: đọc env + file cấu hình rồi hỏi module thuần (lib/db-target.ts).
// Toàn bộ quy tắc quyết định nằm ở đó và có unit test riêng.

const args = process.argv.slice(2);
const expectedIndex = args.indexOf("--expect");
const expected = expectedIndex >= 0 ? (args[expectedIndex + 1] ?? "") : "";
const confirmedProduction = args.includes("--confirm-production");

const identity = parseDbIdentity(process.env.DATABASE_URL);

// Chế độ chỉ xem: hỏi "tôi đang trỏ vào đâu" mà không định chạy migration.
if (!expected) {
  const registry = loadDbRegistry();
  const label = registry[identity.projectRef ?? ""] ?? "KHÔNG NHẬN DIỆN ĐƯỢC";
  console.log(`DATABASE_URL đang trỏ vào : ${identity.display}`);
  console.log(`Nhãn môi trường           : ${label}`);
  process.exit(0);
}

const verdict = guardMigrationTarget({
  identity,
  registry: loadDbRegistry(),
  expected,
  confirmedProduction,
});

if (!verdict.ok) {
  console.error(`\n✖ Đã CHẶN migration.\n\n${verdict.reason}\n`);
  process.exit(1);
}

console.log(`✓ Đích hợp lệ: ${verdict.label} — ${identity.display}`);
