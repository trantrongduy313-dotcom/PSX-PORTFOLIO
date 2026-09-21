-- VÌ SAO CÓ LƯỢT NÀY — chỉ có ở lượt thứ 2 trở đi của một MO. null = đây là lần 1.
--
-- Suy ra được từ reassignedAt + reviewStatus, nhưng suy đoán sẽ sai ngay khi có luồng thứ tư
-- (giai đoạn 3: mở lại sau tạm dừng). Một cột nói thẳng thì ba tháng sau vẫn đọc được.
--
-- IF NOT EXISTS theo quy ước các migration khác trong thư mục này: DB branch xem trước có lịch
-- sử _prisma_migrations không đầy đủ, nên migration phải chạy lại được và dán thẳng vào SQL
-- Editor của Supabase được.

DO $$ BEGIN
  CREATE TYPE "Design3DContinuationReason" AS ENUM (
    'REJECT_REASSIGN',
    'MANUAL_REASSIGN',
    'PAUSE_RESUME'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "design_3d_assignments"
  ADD COLUMN IF NOT EXISTS "continuationReason" "Design3DContinuationReason";
