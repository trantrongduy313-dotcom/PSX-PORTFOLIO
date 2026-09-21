-- Số giờ THỰC TẾ của TỪNG lượt giao việc 3D, lưu bằng phút.
--
-- Trước đây con số này chỉ có trong extraData.perItem[itemId].design.gioThucTe — một ô cho
-- một MO. Khi một MO có nhiều NV 3D cùng làm thì một ô không mang được hai con số, và báo cáo
-- buộc phải gán cùng giá trị đó cho mọi người, làm tổng giờ bị nhân bản theo số người.
--
-- Cột NULLABLE, không backfill: NULL nghĩa là "chưa có số riêng, đọc từ JSON như cũ". Nhờ vậy
-- toàn bộ dữ liệu lịch sử giữ nguyên cách tính hiện tại, không đổi số liệu của kỳ đã chốt.
-- IF NOT EXISTS theo đúng quy ước các migration 3D khác: database branch dùng để xem trước
-- có lịch sử _prisma_migrations không đầy đủ (được clone chứ không chạy tuần tự), nên migration
-- phải chạy lại được mà không vỡ.
ALTER TABLE "design_3d_assignments"
  ADD COLUMN IF NOT EXISTS "actualMinutes" INTEGER;
