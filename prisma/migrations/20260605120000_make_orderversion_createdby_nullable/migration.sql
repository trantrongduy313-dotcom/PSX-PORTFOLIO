-- Make OrderVersion.createdById nullable
-- Needed so virtual admin (id="VIRTUAL_ADMIN") can trigger rollback/snapshot
-- without violating the FK constraint to the users table.

ALTER TABLE "order_versions" ALTER COLUMN "createdById" DROP NOT NULL;
