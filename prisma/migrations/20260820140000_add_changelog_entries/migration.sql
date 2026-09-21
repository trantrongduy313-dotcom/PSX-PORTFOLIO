-- ─── Bảng changelog "Có gì mới" ──────────────────────────────────────────────
--
-- Admin ghi những gì vừa cải tiến, người dùng thấy. Luật ở app/lib/business/changelog/*.
--
-- SQL do `prisma migrate diff` sinh — KHÔNG sửa tay sau khi đã áp dụng (Prisma lưu checksum;
-- sửa một migration đã áp là làm `migrate deploy` hỏng ở mọi môi trường khác).
--
-- CHỈ THÊM: 1 enum + 1 bảng. Không sửa, không xoá, không đụng bảng nào sẵn có.
--
-- ⚠️ CỘT QUAN TRỌNG NHẤT LÀ "notifiedAt", và nó CỐ Ý tách khỏi "isPublished":
--    thông báo Chat chỉ bắn khi nó còn NULL, nên sửa một lỗi chính tả ở mục đã đăng không bao
--    giờ bắn lần hai. Suy ra từ chuyển trạng thái thay vì lưu sự thật đã xảy ra là chỗ hỏng
--    ngay khi có ai bỏ đăng rồi đăng lại. Xem business/changelog/publish.ts.

-- CreateEnum
CREATE TYPE "ChangelogArea" AS ENUM ('ORDERS', 'DESIGN_3D', 'PSX', 'STATISTICS', 'GENERAL');

-- CreateTable
CREATE TABLE "changelog_entries" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "area" "ChangelogArea" NOT NULL DEFAULT 'GENERAL',
    "isImportant" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "commitSha" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "changelog_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "changelog_entries_isPublished_publishedAt_idx" ON "changelog_entries"("isPublished", "publishedAt");

-- CreateIndex
CREATE INDEX "changelog_entries_area_idx" ON "changelog_entries"("area");

-- AddForeignKey
ALTER TABLE "changelog_entries" ADD CONSTRAINT "changelog_entries_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
