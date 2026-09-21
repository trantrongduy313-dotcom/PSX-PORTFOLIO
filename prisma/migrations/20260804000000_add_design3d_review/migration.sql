-- Additive: internal review of 3D design results (Order/Admin), separate from the
-- Order-level DESIGN_REVIEW status (which means "waiting for customer approval").
-- Adds one enum, one nullable FK, four nullable/defaulted columns. No data migration,
-- no column drops.
--
-- VIẾT IDEMPOTENT CÓ CHỦ ĐÍCH: database của dự án này từng được đồng bộ bằng `prisma db
-- push`, nên schema và bảng lịch sử migration đã lệch nhau nhiều lần (ngày 2026-08-04 phải
-- chạy `migrate resolve --applied` cho 9 migration cũ). Migration viết idempotent thì:
--   - chạy lại được sau khi đã áp dụng một phần, không cần resolve --rolled-back;
--   - dán được trực tiếp vào SQL Editor của Supabase khi không có connection string;
--   - lần chạy `prisma migrate deploy` sau đó vẫn ghi được lịch sử, không lỗi "already exists".

DO $$ BEGIN
  CREATE TYPE "Design3DReviewStatus" AS ENUM (
    'PENDING_REVIEW',
    'ACCEPTED',
    'REWORK'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "design_3d_assignments"
  ADD COLUMN IF NOT EXISTS "reviewStatus" "Design3DReviewStatus",
  ADD COLUMN IF NOT EXISTS "reviewedById" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewNote" TEXT,
  ADD COLUMN IF NOT EXISTS "reworkCount" INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE "design_3d_assignments"
    ADD CONSTRAINT "design_3d_assignments_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
