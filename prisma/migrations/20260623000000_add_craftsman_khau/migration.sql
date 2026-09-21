-- Add khau (stage assignment) column to craftsmen
-- and make level optional (default empty string)
ALTER TABLE "craftsmen" ADD COLUMN IF NOT EXISTS "khau" TEXT NOT NULL DEFAULT '';
ALTER TABLE "craftsmen" ALTER COLUMN "level" SET DEFAULT '';
