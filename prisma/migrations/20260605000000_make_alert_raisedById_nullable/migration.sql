-- Make Alert.raisedById nullable
-- Needed so virtual admin (id="VIRTUAL_ADMIN") can create alerts
-- without violating the FK constraint to the users table.

ALTER TABLE "alerts" ALTER COLUMN "raisedById" DROP NOT NULL;
