-- Additive: ảnh đại diện sản phẩm upload trực tiếp (Supabase Storage), song song với link
-- Drive hiện có (designFileUrl). Chỉ thêm 1 cột nullable, không đụng dữ liệu cũ.
--
-- Idempotent như các migration trước: dự án này đã từng đồng bộ bằng `prisma db push` nên
-- schema và bảng lịch sử migration lệch nhau nhiều lần. Idempotent thì chạy lại được, và dán
-- trực tiếp vào SQL Editor được khi không có connection string.

ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "designImageUrl" TEXT;
