-- Additive: 3D designer acknowledges receipt of an assignment.
-- A separate axis from work progress (status) and from internal review (reviewStatus):
-- awareness/handover, not progress. Deliberately no new enum value on
-- Design3DAssignmentStatus, which means "work progress" and is driven by progress logs.
--
-- Viết IDEMPOTENT như migration trước: DB dự án này từng đồng bộ bằng `prisma db push` nên
-- schema và bảng lịch sử migration đã lệch nhau nhiều lần. Idempotent thì chạy lại được, và
-- dán trực tiếp vào SQL Editor được khi không có connection string.

ALTER TABLE "design_3d_assignments"
  ADD COLUMN IF NOT EXISTS "acknowledgedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "acknowledgedById" TEXT;

DO $$ BEGIN
  ALTER TABLE "design_3d_assignments"
    ADD CONSTRAINT "design_3d_assignments_acknowledgedById_fkey"
    FOREIGN KEY ("acknowledgedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
