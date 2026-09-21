-- Ảnh mẫu upload trực tiếp (tối đa 2) + đổi "Video thực tế" thành "Folder mẫu".
--
-- ─── Vì sao MẢNG, không phải cột thứ hai ────────────────────────────────────
-- `sampleImageUrl2` thì ảnh thứ ba sẽ đẻ ra cột thứ ba, và hai cột gần giống tên là thứ sớm
-- muộn lệch. TEXT[] đã được dùng sẵn trong schema này (techClassification, sourceIds).
-- Trần 2 ép ở tầng luật (business/mo-image.ts, có test), KHÔNG ép bằng ràng buộc DB: thông báo
-- "đã đủ 2 ảnh" phải là một câu tiếng Việt cho người dùng, không phải một lỗi ràng buộc.
--
-- ─── Vì sao THÊM cột mới thay vì RENAME ─────────────────────────────────────
-- `ALTER TABLE ... RENAME COLUMN` làm tên cũ biến mất NGAY, trong khi code cũ còn đang chạy
-- tới lúc Vercel deploy xong — khoảng hai phút hỏng thật giữa giờ làm việc.
-- Lối thêm–chép–bỏ không có phút nào hỏng:
--   1. (migration này) thêm cột mới + chép dữ liệu
--   2. deploy code đọc/ghi cột mới
--   3. một migration RIÊNG, vài ngày sau, bỏ cột cũ
-- Cột `sampleVideoUrl` vì vậy VẪN CÒN sau migration này. Đó là chủ ý, không phải sót.
--
-- ⚠️ `IF NOT EXISTS` — đã chạy tay qua Supabase SQL Editor trước (39/39 dòng chép sang đúng),
-- nên lần `prisma migrate deploy` sau thành no-op và Prisma tự ghi sổ đúng chuẩn.

ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "sampleImageUploads" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "sampleFolderUrl" TEXT;

UPDATE "order_items"
   SET "sampleFolderUrl" = "sampleVideoUrl"
 WHERE "sampleVideoUrl" IS NOT NULL AND "sampleFolderUrl" IS NULL;
