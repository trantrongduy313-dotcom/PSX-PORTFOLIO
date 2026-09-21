-- ─── Bảng phản hồi người dùng ────────────────────────────────────────────────
--
-- Kênh báo lỗi / đề xuất cải tiến ngay trong hệ thống. Luật ở app/lib/business/feedback/*.
--
-- SQL do `prisma migrate diff` sinh — KHÔNG sửa tay sau khi đã áp dụng (Prisma lưu checksum;
-- sửa một migration đã áp là làm `migrate deploy` hỏng ở mọi môi trường khác).
--
-- HAI ĐIỂM CỐ Ý, ghi lại để lần sau không ai "sửa cho đúng chuẩn":
--
--   1. KHÔNG có khoá ngoại từ "orderId" tới "orders". Một phản hồi không được chặn việc xoá
--      đơn, và không được biến mất theo đơn — nó là bằng chứng về PHẦN MỀM, không phải dữ
--      liệu của đơn. "orderNumber" lưu song song nên vẫn đọc được khi đơn đã đi.
--
--   2. "reporterId" NULLABLE + ON DELETE SET NULL. VIRTUAL_ADMIN không có hàng trong "users"
--      (auth-helpers.ts), nên FK bắt buộc sẽ chặn luôn admin ảo. Và xoá một nhân viên không
--      được xoá theo các báo cáo lỗi họ từng gửi — vì vậy có thêm ba cột ảnh chụp danh tính
--      ("reporterName/Email/Role") để báo cáo vẫn đọc được sau khi FK đã null.

-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('BUG', 'IDEA');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'TRIAGED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DECLINED');

-- CreateTable
CREATE TABLE "feedback_reports" (
    "id" TEXT NOT NULL,
    "kind" "FeedbackKind" NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "summary" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "imageUrls" TEXT[],
    "reporterId" TEXT,
    "reporterName" TEXT NOT NULL,
    "reporterEmail" TEXT NOT NULL,
    "reporterRole" TEXT NOT NULL,
    "pageUrl" TEXT,
    "orderId" TEXT,
    "orderNumber" TEXT,
    "moNumber" TEXT,
    "orderVersion" INTEGER,
    "commitSha" TEXT,
    "userAgent" TEXT,
    "viewport" TEXT,
    "adminReply" TEXT,
    "repliedAt" TIMESTAMP(3),
    "repliedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_reports_status_idx" ON "feedback_reports"("status");

-- CreateIndex
CREATE INDEX "feedback_reports_kind_idx" ON "feedback_reports"("kind");

-- CreateIndex
CREATE INDEX "feedback_reports_reporterId_idx" ON "feedback_reports"("reporterId");

-- CreateIndex
CREATE INDEX "feedback_reports_createdAt_idx" ON "feedback_reports"("createdAt");

-- AddForeignKey
ALTER TABLE "feedback_reports" ADD CONSTRAINT "feedback_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_reports" ADD CONSTRAINT "feedback_reports_repliedById_fkey" FOREIGN KEY ("repliedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
