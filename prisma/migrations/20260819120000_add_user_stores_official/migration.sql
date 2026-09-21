-- Bảng user_stores (User ↔ Store nhiều-nhiều) — CHÍNH THỨC HOÁ một bước vốn làm TAY.
--
-- ⚠️ VÌ SAO MIGRATION NÀY TỒN TẠI:
-- Bảng này trước đây chỉ được tạo bởi `prisma/migrations/add_user_stores.sql` — một file nằm ở
-- THƯ MỤC GỐC của migrations, KHÔNG có folder timestamp. `prisma migrate deploy` BỎ QUA hoàn
-- toàn những file như vậy. Chính comment trong file đó đã ghi "Run this on Supabase SQL editor
-- before deploying", tức nó là một bước làm tay.
--
-- Hệ quả nếu không có migration này: `model UserStore` có trong schema và đang được hơn 7 file
-- ứng dụng dùng (kể cả dashboard/orders/page.tsx), nhưng deploy lên một DB sạch sẽ KHÔNG tạo
-- bảng — màn Đơn hàng chết ngay từ truy vấn đầu tiên.
--
-- IDEMPOTENT LÀ BẮT BUỘC, không phải cho đẹp: production đã được vá tay nên có thể ĐÃ CÓ bảng
-- này rồi. Migration phải chạy đúng ở CẢ HAI trạng thái — đã có và chưa có — vì ta không biết
-- chắc production đang ở trạng thái nào.

CREATE TABLE IF NOT EXISTS "user_stores" (
  "userId"     TEXT NOT NULL,
  "storeId"    TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_stores_pkey" PRIMARY KEY ("userId", "storeId"),
  CONSTRAINT "user_stores_userId_fkey"  FOREIGN KEY ("userId")  REFERENCES "users"("id")  ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_stores_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "user_stores_storeId_idx" ON "user_stores"("storeId");

-- Chuyển User.storeId (cột cũ, vẫn còn trong schema) sang bảng mới để không mất phân quyền
-- đang có. ON CONFLICT DO NOTHING: chạy lại lần hai không nhân đôi, và không đè lên những dòng
-- đã được gán tay từ trước.
INSERT INTO "user_stores" ("userId", "storeId")
SELECT "id", "storeId"
FROM   "users"
WHERE  "storeId" IS NOT NULL
ON CONFLICT DO NOTHING;
