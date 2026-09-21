/**
 * Tạo bcrypt hash cho mật khẩu admin.
 * Chạy: node scripts/hash-password.mjs <mật-khẩu>
 * Sau đó copy output vào Vercel env var ADMIN_PASSWORD_HASH
 */
import bcrypt from "bcryptjs";

const password = process.argv[2];

if (!password) {
  console.error("Cách dùng: node scripts/hash-password.mjs <mật-khẩu>");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);

console.log("\n✓ Copy 2 dòng sau vào Vercel → Settings → Environment Variables:\n");
console.log(`ADMIN_EMAIL=<email-admin-của-sếp>`);
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
console.log("\nSau khi thêm env var → Redeploy trên Vercel.\n");
