-- Simplify SubscriptionStatus enum to paid, canceled, past_due.
-- Map old values: active/trial/beta -> paid; expired -> canceled; keep canceled, past_due.

CREATE TYPE "SubscriptionStatus_new" AS ENUM ('paid', 'canceled', 'past_due');

ALTER TABLE "Subscription"
  ALTER COLUMN "status" TYPE "SubscriptionStatus_new"
  USING (
    CASE "status"::text
      WHEN 'active' THEN 'paid'::"SubscriptionStatus_new"
      WHEN 'trial' THEN 'paid'::"SubscriptionStatus_new"
      WHEN 'beta' THEN 'paid'::"SubscriptionStatus_new"
      WHEN 'paid' THEN 'paid'::"SubscriptionStatus_new"
      WHEN 'canceled' THEN 'canceled'::"SubscriptionStatus_new"
      WHEN 'expired' THEN 'canceled'::"SubscriptionStatus_new"
      WHEN 'past_due' THEN 'past_due'::"SubscriptionStatus_new"
      ELSE 'paid'::"SubscriptionStatus_new"
    END
  );

DROP TYPE "SubscriptionStatus";

ALTER TYPE "SubscriptionStatus_new" RENAME TO "SubscriptionStatus";
