-- Khoảng Admin/Order bắt tạm dừng một lượt giao việc 3D — DỪNG ĐỒNG HỒ KPI.
--
-- Bảng RIÊNG chứ không phải hai cột trên assignment: một đơn có thể bị gác NHIỀU LẦN, hai cột
-- chỉ giữ được lần cuối và xoá mất lịch sử của các lần trước.
--
-- IF NOT EXISTS theo quy ước các migration khác trong thư mục này: database branch xem trước
-- có lịch sử _prisma_migrations KHÔNG đầy đủ (từng đồng bộ bằng `prisma db push`, và bản clone
-- chỉ mang đúng một dòng lịch sử). Migration phải chạy lại được mà không vỡ, và phải dán
-- thẳng vào SQL Editor của Supabase được khi không có connection string.

CREATE TABLE IF NOT EXISTS "design_3d_pauses" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "pausedAt" TIMESTAMP(3) NOT NULL,
    "resumedAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "pausedById" TEXT,
    "resumedById" TEXT,
    "resumeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_3d_pauses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "design_3d_pauses_assignmentId_idx" ON "design_3d_pauses"("assignmentId");
CREATE INDEX IF NOT EXISTS "design_3d_pauses_resumedAt_idx" ON "design_3d_pauses"("resumedAt");

DO $$ BEGIN
  ALTER TABLE "design_3d_pauses"
    ADD CONSTRAINT "design_3d_pauses_assignmentId_fkey"
    FOREIGN KEY ("assignmentId") REFERENCES "design_3d_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "design_3d_pauses"
    ADD CONSTRAINT "design_3d_pauses_pausedById_fkey"
    FOREIGN KEY ("pausedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "design_3d_pauses"
    ADD CONSTRAINT "design_3d_pauses_resumedById_fkey"
    FOREIGN KEY ("resumedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
