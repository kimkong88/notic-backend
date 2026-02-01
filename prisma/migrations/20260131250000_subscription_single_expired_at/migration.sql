-- Backfill expiredAt from trialEndsAt or currentPeriodEnd (for existing rows)
UPDATE "Subscription"
SET "expiredAt" = COALESCE("trialEndsAt", "currentPeriodEnd")
WHERE "expiredAt" IS NULL AND ("trialEndsAt" IS NOT NULL OR "currentPeriodEnd" IS NOT NULL);

-- Drop redundant date columns; expiredAt is the single "access ends at" field
ALTER TABLE "Subscription" DROP COLUMN IF EXISTS "currentPeriodEnd";
ALTER TABLE "Subscription" DROP COLUMN IF EXISTS "trialEndsAt";
