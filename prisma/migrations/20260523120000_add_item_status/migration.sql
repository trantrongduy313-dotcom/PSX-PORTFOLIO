-- Add per-item status override to order_items
-- NULL = inherit from parent Order.status (backward compatible)
ALTER TABLE "order_items" ADD COLUMN "itemStatus" "OrderStatus";
