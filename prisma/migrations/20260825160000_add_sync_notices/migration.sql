-- Nhắc việc từ mẻ đồng bộ Google Sheet — xem chú thích model SyncNotice trong schema.prisma.
--
-- Idempotent (IF NOT EXISTS): bảng này được tạo TAY trên Supabase SQL Editor trước khi deploy,
-- nên `prisma migrate deploy` chạy sau sẽ gặp bảng đã tồn tại. Không có IF NOT EXISTS thì lệnh
-- đó đổ và _prisma_migrations kẹt ở trạng thái failed.
CREATE TABLE IF NOT EXISTS "sync_notices" (
    "id"        TEXT NOT NULL,
    "month"     TEXT NOT NULL,
    "payload"   JSONB NOT NULL,
    "syncedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_notices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sync_notices_month_key" ON "sync_notices"("month");
