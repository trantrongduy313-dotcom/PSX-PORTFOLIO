// ─── DANH MỤC THỢ SẢN XUẤT — nguồn khai báo duy nhất ─────────────────────────
//
// 🔴 VÌ SAO FILE NÀY TỒN TẠI:
//
// Danh sách bậc thợ trước đây nằm ở NĂM chỗ, và không chỗ nào biết về chỗ nào:
//
//   1. `LEVELS` trong craftsmen-client.tsx              → dựng dropdown
//   2. `VALID_LEVEL_ENUM` trong api/craftsmen/route.ts  → validate POST
//   3. `VALID_LEVEL_ENUM` trong api/craftsmen/[id]      → validate PUT  (bản chép của 2)
//   4. `LEVEL_RANK` trong api/craftsmen/route.ts        → xếp thứ tự
//   5. `LEVEL_RANK` trong api/craftsmen/[id]            → bản chép của 4
//
// Thêm một bậc thợ = sửa năm chỗ, và bốn trong số đó không có gì nhắc. Đã kiểm trước khi rút:
// năm bản THẬT SỰ còn bằng nhau — nên đây là refactor, không phải sửa lỗi. Nếu để thêm một
// thời gian nữa thì câu đó sẽ không còn đúng.
//
// api/craftsmen/route.ts còn `export { VALID_LEVELS, LEVEL_RANK }` — xuất luật ra TỪ MỘT FILE
// ROUTE, trong khi file route kia lại tự khai lại thay vì import. Nay luật ở đây, route mỏng.
//
// File THUẦN: không prisma, không React, không NextResponse. Vì thế cả hai route lẫn client
// đều import được, và test chạy thẳng vào luật.

import { z } from "zod";

/**
 * Bậc thợ, theo thứ tự hiển thị trong dropdown (cao → thấp).
 *
 * ⚠️ THÊM MỘT BẬC = THÊM VÀO ĐÂY **VÀ** VÀO `LEVEL_RANK`. Test canh hai danh sách này phải
 * trùng khoá — quên một bên là build đỏ, không phải người dùng phát hiện hộ bằng một thợ xếp
 * sai thứ tự trong danh sách chọn.
 */
export const CRAFTSMAN_LEVELS = [
  "KTSX", "Bậc 5", "Bậc 4", "Bậc 3", "Bậc 2", "Bậc 1",
  "ĐBXM", "AZ", "Resin", "Dây lắc", "Đúc",
] as const;

export type CraftsmanLevel = typeof CRAFTSMAN_LEVELS[number] | "";

/**
 * Hạng số để SẮP XẾP danh sách thợ (`orderBy: levelRank desc`).
 *
 * 0 KHÔNG có nghĩa "kém nhất" — nó nghĩa là "bậc này không nằm trong thang KTSX/Bậc 5…1".
 * ĐBXM · AZ · Resin · Dây lắc · Đúc là TÊN KHÂU dùng ở ô bậc, không phải cấp bậc, nên chúng
 * cùng 0 và rơi xuống nhóm cuối, xếp theo tên.
 */
export const LEVEL_RANK: Readonly<Record<string, number>> = {
  "KTSX":    9,
  "Bậc 5":   5,
  "Bậc 4":   4,
  "Bậc 3":   3,
  "Bậc 2":   2,
  "Bậc 1":   1,
  "ĐBXM":    0,
  "AZ":      0,
  "Resin":   0,
  "Dây lắc": 0,
  "Đúc":     0,
};

/** Hạng của một bậc. Bậc lạ (hoặc rỗng) → 0, tức xuống nhóm cuối chứ không làm hỏng sắp xếp. */
export function levelRankOf(level: string): number {
  return LEVEL_RANK[level] ?? 0;
}

/**
 * Khâu sản xuất của thợ.
 *
 * ⚠️ CỐ Ý CHƯA DÙNG ĐỂ VALIDATE. Client vẫn chỉ cho chọn trong danh sách này, nhưng API nhận
 * chuỗi tự do (xem `craftsmanInputSchema`). Siết lại là chặn hồ sơ cũ có giá trị ngoài danh
 * sách — và `stage-review-rows.ts` đã ghi rõ nó CỐ Ý không dựa vào cột `khau`, tức cột này có
 * thể đang lỏng. Muốn siết thì đếm giá trị thật trong DB trước, đừng siết mò.
 */
export const KHAU_OPTIONS = [
  "Nguội", "Hột", "TC Dây", "ĐBXM", "Đúc", "QC", "Resin", "AZ", "Dây lắc", "Khác",
] as const;

export type CraftsmanKhau = typeof KHAU_OPTIONS[number] | "";

/** Độ dài tối đa của Mã thợ. Trùng `@db` mặc định của Prisma cho String — chặn ở tầng luật. */
export const CRAFTSMAN_CODE_MAX = 20;

/**
 * Chuẩn hoá Mã thợ.
 *
 * 🎯 RỖNG LÀ MỘT GIÁ TRỊ HỢP LỆ, KHÔNG PHẢI LỖI. Mã thợ là nhãn cho người đọc, không bắt buộc.
 * Trả `""` (không phải `null`) để khớp `Craftsman.code String @default("")` — cùng hình dạng
 * với `Designer3D.code`, một khuôn cho "mã nhân sự" trong cả codebase.
 *
 * 🔴 VÀ NÓ KHÔNG PHẢI KHOÁ ĐỊNH DANH. Dữ liệu sản xuất nối vào danh mục thợ bằng TÊN dạng chữ
 * (xem api/reports/stages `select: { name, level, levelRank }` và types/kpi-report.ts), và
 * `Craftsman.name` đã `@unique`. Đừng thêm `@unique` cho `code`.
 *
 * ⚠️ Khác `Designer3D.code`, vốn BẮT BUỘC (`min(1)`) vì bên đó mã LÀ định danh — đã dùng chính
 * nó để khớp nhân viên khi thêm tài khoản. Hai trường cùng tên, hai vai trò, hai luật.
 */
export function normalizeCraftsmanCode(raw: string | null | undefined): string {
  return (raw ?? "").trim();
}

/**
 * Dữ liệu vào của cả TẠO lẫn SỬA thợ.
 *
 * Một schema cho hai route: trước đây `POST` và `PUT` mỗi bên khai một bản giống hệt, nên thêm
 * một trường là hai lần sửa và một cơ hội quên.
 */
export const craftsmanInputSchema = z.object({
  name:  z.string().min(1).max(100).trim(),
  level: z.enum([...CRAFTSMAN_LEVELS, ""]).default(""),
  khau:  z.string().max(50).trim().default(""),
  code:  z.string().max(CRAFTSMAN_CODE_MAX).trim().default(""),
});

export type CraftsmanInput = z.infer<typeof craftsmanInputSchema>;
