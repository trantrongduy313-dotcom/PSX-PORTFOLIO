-- Tài liệu tham khảo Order gửi kèm khi giao việc cho NV 3D: ảnh mẫu + video sản phẩm thật.
--
-- Ở OrderItem chứ không ở lượt giao việc: đây là thuộc tính của SẢN PHẨM, không phải của người
-- làm. Một MO có thể có nhiều NV 3D và cả hai phải nhìn cùng một bộ tài liệu.
--
-- IF NOT EXISTS theo quy ước các migration khác: database branch xem trước có lịch sử
-- _prisma_migrations không đầy đủ (được clone chứ không chạy tuần tự).
ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "sampleImageUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "sampleVideoUrl" TEXT;
