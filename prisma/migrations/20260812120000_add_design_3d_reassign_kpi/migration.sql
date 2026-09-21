-- Không duyệt kết quả 3D → chuyển đơn sang nhân viên khác.
--
-- reassignedAt        — mốc phân biệt luồng mới với lượt bị đóng qua form sửa đơn hàng.
--                       Báo cáo KPI dựa vào nó để không kéo ngược dữ liệu lịch sử vào bảng.
-- kpiCounted          — người duyệt có tính công cho nhân viên cũ hay không. Mặc định true chỉ
--                       để mọi lượt bình thường không bị ảnh hưởng; nó chỉ có nghĩa khi đi kèm
--                       reassignedAt.
-- reassignDecidedById — AI đã bấm. Quyết định này đụng tới lương, phải truy được người quyết.
--
-- IF NOT EXISTS theo quy ước các migration khác trong thư mục này: database branch xem trước
-- có lịch sử _prisma_migrations KHÔNG đầy đủ (từng đồng bộ bằng `prisma db push`), nên
-- migration phải chạy lại được mà không vỡ và dán thẳng vào SQL Editor được.

ALTER TABLE "design_3d_assignments"
  ADD COLUMN IF NOT EXISTS "kpiCounted" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "reassignDecidedById" TEXT,
  ADD COLUMN IF NOT EXISTS "reassignedAt" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "design_3d_assignments"
    ADD CONSTRAINT "design_3d_assignments_reassignDecidedById_fkey"
    FOREIGN KEY ("reassignDecidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
