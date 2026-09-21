-- MỘT LƯỢT GIAO VIỆC CHỈ ĐƯỢC CÓ MỘT KHOẢNG TẠM DỪNG ĐANG MỞ
--
-- Luật này vốn đã có ở tầng ứng dụng (deniedReasonForPause → isPaused), nhưng nó kiểm trên bản
-- vừa đọc rồi mới ghi. Hai request gần nhau — bấm đôi lên một cái nút xưa nay đợi vài giây, hay
-- Admin và Đặt đơn cùng gác một MO — đều thấy "chưa dừng", đều qua cửa, và tạo HAI khoảng mở.
--
-- HẬU QUẢ KHÔNG PHẢI Ở GIỜ CÔNG: pausedWorkingMinutes đã gộp khoảng chồng nhau nên phép trừ vẫn
-- đúng. Hỏng ở chỗ khác và không có đường chữa từ giao diện: mở lại chỉ đóng MỘT khoảng, khoảng
-- còn lại mở vĩnh viễn → chip "Tạm dừng" không bao giờ mất, và mọi lần bấm Tạm dừng sau đó đều bị
-- từ chối vì "đang tạm dừng rồi".
--
-- VÌ SAO LÀ INDEX Ở DB, KHÔNG PHẢI MỘT LẦN KIỂM NỮA: lần đọc thứ hai cũng cũ ngay sau khi đọc.
-- Chỉ ràng buộc ở DB mới khiến trạng thái đó KHÔNG THỂ tồn tại, bất kể thứ tự request.
--
-- VÌ SAO LÀ SQL THÔ: đây là partial unique index (chỉ áp dụng khi resumed_at IS NULL) — Prisma
-- schema không diễn tả được. Khai bằng @@unique([assignmentId]) thì cấm luôn cả các khoảng dừng
-- ĐÃ ĐÓNG, tức cấm một MO bị gác lần thứ hai. Đó là nghiệp vụ có thật và phải giữ.
--
-- Trước khi tạo index: đóng các khoảng mở trùng lặp đang tồn tại (nếu có). GIỮ khoảng MỚI NHẤT
-- và đóng những khoảng cũ hơn tại đúng mốc dừng của chúng — độ dài 0. Không đoán một mốc mở lại
-- không ai từng bấm: một khoảng dài bịa ra sẽ bị trừ vào giờ công của nhân viên.
UPDATE "design_3d_pauses" p
SET "resumedAt" = p."pausedAt",
    "resumeNote" = COALESCE(p."resumeNote", 'Tự đóng khi thêm ràng buộc một-khoảng-mở (bản ghi trùng do bấm đôi)')
WHERE p."resumedAt" IS NULL
  AND EXISTS (
    SELECT 1 FROM "design_3d_pauses" q
    WHERE q."assignmentId" = p."assignmentId"
      AND q."resumedAt" IS NULL
      AND (q."pausedAt" > p."pausedAt" OR (q."pausedAt" = p."pausedAt" AND q."id" > p."id"))
  );

-- IF NOT EXISTS theo quy ước các migration khác trong thư mục này: DB branch xem trước có lịch sử
-- _prisma_migrations không đầy đủ, nên migration phải chạy lại được và dán thẳng vào SQL Editor của
-- Supabase được. Lệnh UPDATE ở trên vốn đã chạy lại được (lần hai không còn dòng nào khớp).
CREATE UNIQUE INDEX IF NOT EXISTS "design_3d_pauses_one_open_per_assignment"
  ON "design_3d_pauses" ("assignmentId")
  WHERE "resumedAt" IS NULL;
