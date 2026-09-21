-- Add per-item zone to order_items for true per-MO independence
-- Default PRE_PRODUCTION; backfill existing rows from their parent order's zone
ALTER TABLE "order_items" ADD COLUMN "zone" "OrderZone" NOT NULL DEFAULT 'PRE_PRODUCTION';

-- Backfill: items whose parent order is in MASTER_HUB should also be MASTER_HUB
UPDATE "order_items"
SET "zone" = 'MASTER_HUB'
WHERE "orderId" IN (SELECT "id" FROM "orders" WHERE "zone" = 'MASTER_HUB');

-- Index for zone-based filtering
CREATE INDEX "order_items_zone_idx" ON "order_items"("zone");
