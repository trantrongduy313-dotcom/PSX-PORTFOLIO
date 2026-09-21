-- ƯU TIÊN CỦA VIỆC THIẾT KẾ 3D — trục RIÊNG, không phải bản sao của order_items."priorityCode".
--
-- Hai cột trả lời hai câu khác nhau, do hai người khác nhau đặt:
--   · priorityCode         — đơn này gấp cỡ nào với KHÁCH (Sale / Đặt đơn).
--   · design3DPriorityCode — trong hàng việc của NV 3D, cái nào dựng trước (Quản lý / Đặt đơn).
--
-- CỐ Ý KHÔNG đồng bộ hai cột: một đơn UT1 với khách có thể chỉ cần sửa nhẹ bản 3D cũ, còn một đơn
-- thường có thể phải dựng 3D trước vì đang chờ khách duyệt mẫu.
--
-- Thang chỉ ba bậc "UT1" | "UT2" | "Normal" (không có "SR"). Chuẩn hoá ở
-- app/lib/business/kpi-3d/design-priority.ts — mọi giá trị lạ đọc ra thành "Normal", nên cột để
-- kiểu TEXT như priorityCode sẵn có, không thêm enum mới.
--
-- MẶC ĐỊNH 'Normal' cho toàn bộ MO cũ: xếp hàng đợi y như trước ngày có cột này, không đơn nào tự
-- nhảy lên đầu.
--
-- IF NOT EXISTS theo quy ước các migration khác trong thư mục này: DB branch xem trước có lịch sử
-- _prisma_migrations không đầy đủ, nên migration phải chạy lại được và dán thẳng vào SQL Editor
-- của Supabase được.
ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "design3DPriorityCode" TEXT NOT NULL DEFAULT 'Normal';

-- Chỉ mục cho hàng đợi 3D: màn Việc thiết kế 3D sắp theo ưu tiên rồi tới deadline.
CREATE INDEX IF NOT EXISTS "order_items_design3DPriorityCode_idx"
  ON "order_items" ("design3DPriorityCode");
