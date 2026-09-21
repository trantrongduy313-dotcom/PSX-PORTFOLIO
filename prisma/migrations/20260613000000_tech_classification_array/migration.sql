-- Convert techClassification from TEXT (nullable) to TEXT[] (array)
-- Old values: 'Hột' / 'Trơn' / 'Móc Máy'
-- New values: raw CSV tokens e.g. TRƠN / NATURAL / M.MÁY / LAB / CZ / ĐÁ / ĐÁ MÀU / NGỌC TRAI

ALTER TABLE "order_items" ADD COLUMN "techClassification_new" TEXT[] NOT NULL DEFAULT '{}';

UPDATE "order_items" SET "techClassification_new" =
  CASE
    WHEN "techClassification" = 'Trơn'    THEN ARRAY['TRƠN']
    WHEN "techClassification" = 'Móc Máy' THEN ARRAY['M.MÁY']
    ELSE ARRAY[]::TEXT[]
  END;

ALTER TABLE "order_items" DROP COLUMN "techClassification";
ALTER TABLE "order_items" RENAME COLUMN "techClassification_new" TO "techClassification";
