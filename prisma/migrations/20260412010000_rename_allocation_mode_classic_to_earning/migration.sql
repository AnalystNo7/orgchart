-- Rename PnlCache.allocationMode value "classic" → "earning".
-- Idempotent: UPDATE matches only rows still holding the old value,
-- ALTER ... SET DEFAULT is declarative.

-- Data migration
UPDATE "PnlCache" SET "allocationMode" = 'earning' WHERE "allocationMode" = 'classic';

-- Change column default to new value
ALTER TABLE "PnlCache" ALTER COLUMN "allocationMode" SET DEFAULT 'earning';
