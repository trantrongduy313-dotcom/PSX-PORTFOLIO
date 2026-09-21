-- Add per-MO fields to order_items
ALTER TABLE "order_items"
  ADD COLUMN "estimatedDate" TIMESTAMP(3),
  ADD COLUMN "requiredDate"  TIMESTAMP(3),
  ADD COLUMN "saleNote"      TEXT,
  ADD COLUMN "priorityCode"  VARCHAR(20) NOT NULL DEFAULT 'Normal',
  ADD COLUMN "isPriority"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isRush"        BOOLEAN NOT NULL DEFAULT false;

-- Migrate existing data: copy from orders into each item
UPDATE "order_items" oi
SET
  "estimatedDate" = o."estimatedDate",
  "requiredDate"  = o."requiredDate",
  "saleNote"      = o."saleNote",
  "priorityCode"  = o."priorityCode",
  "isPriority"    = o."isPriority",
  "isRush"        = o."isRush"
FROM "orders" o
WHERE oi."orderId" = o."id";
