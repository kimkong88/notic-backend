# Subscription webhook and access behaviour

Documented behaviour for Lemon Squeezy subscription webhooks and Pro access. Tests in `billing.webhook.controller.spec.ts`, `subscription-event.handler.spec.ts`, and `billing.service.spec.ts` assert these behaviours.

## Webhook event handling

| Lemon event | Our canonical event | DB behaviour |
|-------------|----------------------|--------------|
| `subscription_created` | `subscription_activated` | **Upsert** by `billingSubscriptionId`: if row exists, update; else create. Unique on `billingSubscriptionId` prevents duplicates. |
| `subscription_updated`, `subscription_resumed` | `subscription_updated` | **Mutate** existing row (update `status`, `expiredAt`). |
| `subscription_cancelled`, `subscription_expired` | `subscription_canceled` | **Mutate** existing row (set `status: canceled`, `expiredAt` from payload). We do **not** create a new row; we update the same subscription. |

## expiredAt source

- **We do not set `expiredAt` to "now"** when handling `subscription_expired` or `subscription_cancelled`.
- We set `expiredAt` from the **Lemon Squeezy payload**: `attrs.ends_at ?? attrs.trial_ends_at ?? attrs.renews_at` (see `computeExpiredAt` in `billing.webhook.controller.ts`).
- For `subscription_expired`, Lemon typically sends `ends_at` = the date the subscription ended.
- If the payload has no `ends_at` / `trial_ends_at` / `renews_at`, we pass `expiredAt: undefined` and only update `status` to `canceled`; the handler does not set `expiredAt` in that case.

## Pro access (hasAccess)

- **Single source of truth:** `expiredAt` (and having a subscription). See `BillingService.getStatus`.
- **Formula:** `hasAccess = sub != null && (sub.expiredAt == null || now < sub.expiredAt)`.
- **`status` is not used for access.** We do **not** revoke Pro when `status === 'past_due'`.
- **past_due:** We keep Pro access during past_due (grace period). When Lemon exhausts retries, they send `subscription_expired`; we then set `expiredAt` from payload and access ceases when `now >= expiredAt`.

## Status values

- **paid:** Payment current (includes active, trial, paused from Lemon).
- **past_due:** Payment failed/overdue; we still grant Pro until `expiredAt`.
- **canceled:** Subscription cancelled or expired; access until `expiredAt` then revoke.

## Edge cases

- **Duplicate subscription_created:** Unique on `billingSubscriptionId`; handler upserts (find by ID → update or create). Duplicate webhooks update the same row.
- **Cancelled/expired with no date:** Grace period (7 days) applied so `expiredAt = now + 7 days`.

## Tests

- **Webhook:** `subscription_expired` / `subscription_cancelled` pass `expiredAt` from payload (`ends_at`); missing `ends_at` passes grace date (now + 7 days).
- **Handler:** `subscription_activated` upserts by `billingSubscriptionId` (update if exists, else create); `subscription_canceled` mutates existing record.
- **BillingService.getStatus:** Plan is `'pro'` when `hasAccess` is true (expiredAt only); `status === 'past_due'` with future `expiredAt` still returns `plan: 'pro'`.
