-- Composite indexes for orders table
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

CREATE INDEX IF NOT EXISTS "orders_orderDate_idx"
  ON "orders" ("orderDate");

CREATE INDEX IF NOT EXISTS "orders_completedDate_idx"
  ON "orders" ("completedDate");

CREATE INDEX IF NOT EXISTS "orders_deletedAt_zone_status_idx"
  ON "orders" ("deletedAt", "zone", "status");

CREATE INDEX IF NOT EXISTS "orders_deletedAt_status_idx"
  ON "orders" ("deletedAt", "status");
