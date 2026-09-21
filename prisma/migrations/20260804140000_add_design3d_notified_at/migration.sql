-- Additive: track whether the Google Chat notification for a new assignment was sent.
-- A silently failed notification is worse than none: Order would assume the designer knows.
-- Pairs with acknowledgedAt so Order sees both ends (sent -> acknowledged).
--
-- Idempotent như các migration trước: DB dự án này từng đồng bộ bằng `prisma db push` nên
-- schema và bảng lịch sử migration đã lệch nhau nhiều lần. Idempotent thì chạy lại được và
-- dán trực tiếp vào SQL Editor được khi không có connection string.

ALTER TABLE "design_3d_assignments"
  ADD COLUMN IF NOT EXISTS "notifiedAt" TIMESTAMP(3);
