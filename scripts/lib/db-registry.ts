import { readFileSync } from "node:fs";
import path from "node:path";

// Danh sách nhãn môi trường của các database (db-targets.json).
//
// TÁCH RA VÌ CÓ HAI CHỖ CẦN ĐỌC NÓ: guard-db-target.ts (rào chắn cho migrate:*) và
// baseline-preview.ts. Chép tay lần thứ hai thì hai bản có thể đọc khác nhau — và một trong hai
// bản đó đang canh cửa cho lệnh phá huỷ.
//
// Đọc lỗi thì trả về rỗng, KHÔNG ném: registry rỗng khiến mọi ref thành "không nhận diện được",
// và guardMigrationTarget CHẶN ca đó. Tức lỗi đọc file dẫn tới CHẶN, không dẫn tới cho qua.
export function loadDbRegistry(cwd = process.cwd()): Record<string, string> {
  try {
    const parsed = JSON.parse(readFileSync(path.resolve(cwd, "db-targets.json"), "utf8"));
    return parsed?.projects && typeof parsed.projects === "object" ? parsed.projects : {};
  } catch {
    return {};
  }
}
