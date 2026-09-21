-- Vai R&D + cột "Mã số mẫu".
--
-- ⚠️ HAI CÂU NÀY PHẢI Ở HAI TRANSACTION KHÁC NHAU NẾU CÓ CÂU NÀO DÙNG GIÁ TRỊ 'RND'.
-- Postgres cho `ALTER TYPE … ADD VALUE` chạy trong transaction (PG12+), nhưng KHÔNG cho dùng
-- giá trị vừa thêm trong chính transaction đó. Migration này vì vậy CỐ Ý không gán vai cho ai
-- và không có câu nào tham chiếu 'RND' — nếu cần gán, làm ở một migration sau.
--
-- Đã chạy tay qua Supabase SQL Editor và xác nhận bằng hai lần Run riêng biệt:
--   SELECT unnest(enum_range(NULL::"UserRole"))  →  6 dòng, có RND
--   masoMau  →  text · nullable
-- `IF NOT EXISTS` khiến lần `prisma migrate deploy` sau thành no-op và Prisma tự ghi sổ.

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'RND';

-- KHÔNG unique: hai MO được phép cùng mã số mẫu.
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "masoMau" TEXT;
