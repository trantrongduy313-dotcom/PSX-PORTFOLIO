-- AlterTable: add completedAt to order_items
ALTER TABLE "order_items" ADD COLUMN "completedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "order_items_completedAt_idx" ON "order_items"("completedAt");
