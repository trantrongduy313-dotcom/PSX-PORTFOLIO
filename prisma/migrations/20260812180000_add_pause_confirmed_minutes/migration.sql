-- Giờ đã làm, CHỐT tại thời điểm tạm dừng.
--
-- Giờ công trước nay chỉ được ghi nhận MỘT LẦN, ở tháng đơn hoàn tất. Nhân viên làm 20 giờ
-- trong tháng 8, đơn bị gác vô hạn, xong tháng 11 → tháng 8 của họ trống trơn. Con số này là
-- mốc chốt sổ cho tháng đó; nó CỘNG DỒN từ lúc nhận việc nên phần ghi nhận mỗi tháng là hiệu
-- giữa hai lần chốt liên tiếp, không cách nào cộng trùng (xem kpi-3d/hours-ledger.ts).
--
-- IF NOT EXISTS theo quy ước các migration khác trong thư mục này: DB branch xem trước có lịch
-- sử _prisma_migrations không đầy đủ, nên migration phải chạy lại được và dán thẳng vào SQL
-- Editor của Supabase được.

ALTER TABLE "design_3d_pauses"
  ADD COLUMN IF NOT EXISTS "confirmedMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "confirmedById" TEXT;

DO $$ BEGIN
  ALTER TABLE "design_3d_pauses"
    ADD CONSTRAINT "design_3d_pauses_confirmedById_fkey"
    FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
