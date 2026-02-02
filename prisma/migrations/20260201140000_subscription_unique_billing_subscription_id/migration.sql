-- Dedupe: keep one row per billingSubscriptionId (latest by createdAt), delete others.
DELETE FROM "Subscription"
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (PARTITION BY "billingSubscriptionId" ORDER BY "createdAt" DESC) AS rn
    FROM "Subscription"
    WHERE "billingSubscriptionId" IS NOT NULL
  ) sub
  WHERE rn > 1
);

-- Add unique constraint so duplicate subscription_created webhooks upsert instead of creating a second row.
CREATE UNIQUE INDEX "Subscription_billingSubscriptionId_key" ON "Subscription"("billingSubscriptionId");
