# Billing provider abstraction

**Goal:** Billing is implemented behind a **provider-agnostic interface**. The rest of the app (API routes, extension, cloud billing UI) only talks to that interface. Swapping Lemon Squeezy for Stripe (or another provider) = new implementation + env + webhook URL; no changes to auth, limits, or UI logic.

**Current provider:** Lemon Squeezy (MoR, tax handled).  
**Future:** Stripe (or other) – implement same interface, swap in, migrate customers if needed.

---

## 1. Provider-agnostic surface

### 1.1 Database (same for any provider)

Store **canonical** subscription state in a **Subscription** (or Billing) entity, linked to User. User stays identity-only; all billing metadata lives in Subscription. Provider-specific IDs use generic column names so we can switch provider without schema changes.

**Subscription model:**

| Field | Type | Purpose |
|-------|------|---------|
| `id` | `String` (uuid) | Primary key. |
| `userId` | `String` | FK → User. One “current” subscription per user (or latest row; see below). |
| `billingProvider` | `String` | e.g. `lemon_squeezy` or `stripe`. Which provider this subscription lives in. |
| `billingCustomerId` | `String?` | Provider's customer ID (for portal lookups). |
| `billingSubscriptionId` | `String?` | Provider's subscription ID (for webhooks and portal/cancel). |
| `status` | `SubscriptionStatus` | Canonical status (see enum below). |
| `expiredAt` | `DateTime?` | **Single "access ends at"** – from provider (period end, trial end). **Has access** = expiredAt == null \|\| now < expiredAt. No currentPeriodEnd/trialEndsAt; one date for all cases. No scheduler needed. |
| `createdAt` | `DateTime` | For history and “current” resolution. |
| `updatedAt` | `DateTime` | |

(Omitted: `canceledAt` – not required to manage access; `expiredAt` defines when access ends. Add later if you need “when did they click cancel” for analytics.)

**SubscriptionStatus enum (canonical):**

| Value | Meaning | Pro access? |
|-------|---------|--------------|
| `active` | Paid, current. | Yes |
| `trial` | In trial period (use `trialEndsAt`). | Yes |
| `beta` | Beta access (no payment; can be set manually or via provider). | Yes |
| `canceled` | User canceled; **access until **expiredAt****, then treat as expired. No extra column: “canceled” means “will not renew, still has access until period end.” | Yes until `currentPeriodEnd`; then set **expiredAt** (webhook). |
| `past_due` | Payment failed; grace or restricted. | Product decision |
| `expired` | Kept for DB enum compat; prefer expiredAt for "over" so we don't rely on scheduler. | No (use expiredAt) |

**Derived for app logic:** `plan = 'pro'` when the user has a **current** subscription with **has access** = `expiredAt == null || now < expiredAt`. Otherwise `plan = 'free'`. One date only; no scheduler.

**“Current” subscription:** One row per user that represents the active relationship: either the single active/trial/beta row, or the latest by `createdAt` / `updatedAt`. When a user cancels, set `status = 'canceled'`; do not delete the row (keeps history). Access until **expiredAt** (set from provider). When they resubscribe, create a new Subscription row. **History:** On renewal (same sub, new period), optionally **add a new row** with the new expiredAt instead of updating—gives billing-period history without schema changes. `getStatus(userId)` loads the user’s current subscription and derives **has access** from expiredAt (expiredAt == null \|\| now < expiredAt).

**Trial and beta:** `trial` is typically set by the provider (e.g. Lemon Squeezy sends a “trial” or “trialing” state; webhook maps to `status = 'trial'` and sets expiredAt from trial end). `beta` is for non-paid Pro access: set manually (e.g. admin endpoint or internal script) or via a special offer; no provider webhook required. Both grant Pro access; UI can show “Trial” / “Beta” vs “Pro” for display only.

### 1.2 API routes (stable; do not change when provider changes)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/billing/create-checkout-session` | JWT or `billing_token` | Body: `{ successUrl?, cancelUrl?, priceKey? }` (e.g. `monthly` / `yearly`). Returns `{ url }` → redirect user. |
| `POST` | `/billing/create-portal-session` | JWT or `billing_token` | Body: `{ returnUrl? }`. Returns `{ url }` → redirect to provider's manage/cancel page. |
| `GET` | `/billing/status` | JWT or `billing_token` | Returns `{ plan: 'free' \| 'pro', status?, expiredAt? }` from Subscription. |

Auth: either **JWT** (normal API) or **billing_token** (cloud billing page opened from extension). See "Billing link (Option 2)" in stripe-subscription-plan.md – same flow; backend accepts either.

**Important:** Controllers and guards never import Lemon Squeezy or Stripe. They call a single `BillingService` (or `IBillingProvider`) that has:

- `createCheckoutSession(userId, options) → { url }`
- `createPortalSession(userId, returnUrl) → { url }`
- (Status is read from DB by `BillingService.getStatus(userId)`: load user’s current Subscription, map to `{ plan, status, expiredAt }`; no provider call needed.)

### 1.3 Webhooks → canonical events

**Single webhook route:** `POST /billing/webhook` (or provider-specific path if you prefer, e.g. `/billing/webhook/lemon`).

- **No JWT.** Verify signature using provider-specific secret (e.g. Lemon Squeezy signing secret).
- Map provider events to **canonical events** and call one internal handler:

| Canonical event | Meaning | DB updates |
|-----------------|---------|------------|
| `subscription_activated` | User has an active paid subscription (or trial/beta started). | Create or update Subscription: set `status`, **expiredAt** (from provider period end or trial end), `billingCustomerId`, `billingSubscriptionId`, `billingProvider`. |
| `subscription_updated` | Period renewed or status changed. | Update Subscription: `status`, `currentPeriodEnd`, `trialEndsAt`. |
| `subscription_canceled` | Canceled or expired. | Update Subscription: set `status = 'canceled'` and **expiredAt** (when period ended); keep row for history. |

All business logic (limits, "is Pro?") reads only the current Subscription row and its `status`. Webhook handler parses provider payload → emits canonical event → **one** `SubscriptionEventHandler` that creates/updates the Subscription entity. When you switch to Stripe, you add a Stripe webhook parser that maps Stripe events to the same three canonical events and calls the same handler.

---

## 2. Lemon Squeezy implementation

### 2.1 Env

- `LEMONSQUEEZY_API_KEY` – API key (backend).
- `LEMONSQUEEZY_WEBHOOK_SECRET` – Signing secret for webhook verification.
- `LEMONSQUEEZY_STORE_ID` – Your store ID.
- `LEMONSQUEEZY_VARIANT_ID_MONTHLY` – Variant ID for monthly price.
- `LEMONSQUEEZY_VARIANT_ID_YEARLY` – Variant ID for yearly price.
- `FRONTEND_URL` – Base URL for success/cancel/return (e.g. `https://getnotic.io`).

(No Stripe keys until you migrate.)

### 2.2 Billing module layout

```
billing/
  billing.module.ts          # Imports BillingController, BillingService, LemonSqueezyProvider
  billing.controller.ts      # POST create-checkout-session, POST create-portal-session, GET status
  billing.service.ts         # Thin: getStatus(userId), delegates createCheckout/createPortal to provider
  interfaces/
    billing-provider.interface.ts   # IBillingProvider: createCheckoutSession, createPortalSession
  providers/
    lemon-squeezy.provider.ts      # Implements IBillingProvider + webhook parsing → canonical events
  handlers/
    subscription-event.handler.ts  # subscription_activated | _updated | _canceled → create/update Subscription
  billing.webhook.controller.ts   # POST /billing/webhook → verify signature → parse → emit → handler
```

- **BillingService** holds `IBillingProvider` (injected; in module, bind to `LemonSqueezyProvider`). It exposes `createCheckoutSession(userId, options)` and `createPortalSession(userId, returnUrl)` that just delegate to the provider. Plus `getStatus(userId)` that loads the user’s current Subscription and returns `{ plan, status, expiredAt }`.
- **LemonSqueezyProvider** implements `IBillingProvider`: calls Lemon Squeezy API to create checkout link and customer portal link (or equivalent). Uses `LEMONSQUEEZY_*` env only.
- **Webhook controller** receives POST, verifies Lemon Squeezy signature, parses event type (e.g. `order_created`, `subscription_created`, `subscription_updated`, `subscription_cancelled` – map Lemon Squeezy event names to canonical), extracts userId/customerId/subscriptionId/period end/trial end from payload, calls `SubscriptionEventHandler.handle(event)`.
- **SubscriptionEventHandler** is the only place that creates/updates the Subscription entity. It only knows about canonical events and DB; no Lemon Squeezy or Stripe types. It can set `status` and **expiredAt** (prefer expiredAt for "over" instead of status = 'expired') (e.g. provider sends “trial” → map to `trial` and set `trialEndsAt`; manual beta grants set `status = 'beta'`).

### 2.3 Lemon Squeezy specifics (for implementer)

- **Checkout:** Lemon Squeezy has "Checkouts" (one-off URL with variant, custom data). Pass `custom_data.user_id` (or similar) so webhook can find User. Build checkout URL with variant ID (monthly or yearly from `priceKey`).
- **Customer portal:** Lemon Squeezy offers a "Customer portal" or "Subscription management" link per customer/subscription; use their API to get that URL for `createPortalSession`.
- **Webhooks:** Subscribe to subscription lifecycle events in Lemon Squeezy dashboard; verify signature with `LEMONSQUEEZY_WEBHOOK_SECRET`; map to `subscription_activated`, `subscription_updated`, `subscription_canceled`; call `SubscriptionEventHandler` with user id, status, period end.

(Exact Lemon Squeezy event names and payload shape to be filled when implementing; keep mapping in one place – e.g. `lemon-squeezy.provider.ts` or a small `lemon-squeezy.mapper.ts`.)

### 2.4 Billing link (unchanged)

- Extension: "Manage plan & billing" → `POST /auth/billing-link` (JWT) → get `billing_token` → open `https://cloud/billing?billing_token=...`.
- Cloud billing page: reads `billing_token`, calls `GET /billing/status?billing_token=...` and `POST /billing/create-checkout-session` (and portal) with `billing_token` in body or header. Backend validates token, resolves userId, then uses **same** BillingService. No provider-specific code in auth or frontend.

---

## 3. Migration to Stripe (later)

1. **Implement** `providers/stripe.provider.ts` implementing `IBillingProvider`: create Checkout Session, create Customer Portal session, using Stripe SDK and Stripe env vars.
2. **Add** Stripe webhook parser: `POST /billing/webhook/stripe` (or same path with provider detection). Verify Stripe signature, map `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` to same canonical events, call same `SubscriptionEventHandler`.
3. **Switch** BillingModule to inject `StripeProvider` instead of `LemonSqueezyProvider` (e.g. env `BILLING_PROVIDER=stripe` and register the right provider).
4. **Subscription table:** Same schema. For new Stripe customers: create Subscription rows with `billingProvider = 'stripe'`, etc. For migrated Lemon Squeezy users: either run a script that creates Stripe customers/subscriptions and creates new Subscription rows (or update existing rows), or treat as "re-subscribe" (send them through Stripe checkout).
5. **No changes** to: BillingController routes, BillingService public API, SubscriptionEventHandler, Subscription model, auth/billing-link, extension, or cloud billing UI. Only provider impl + env + webhook route.

---

## 4. Todo list (Lemon Squeezy first)

- [ ] **DB:** Add **Subscription** model (userId, billingProvider, billingCustomerId, billingSubscriptionId, status enum: active | trial | beta | canceled | past_due | expired, currentPeriodEnd, trialEndsAt, createdAt, updatedAt). User unchanged. *(Done: see `prisma/schema/subscription.prisma`.)*
- [ ] **Interface:** Define `IBillingProvider` (createCheckoutSession, createPortalSession).
- [ ] **Handler:** `SubscriptionEventHandler` for canonical events → create/update Subscription.
- [ ] **Lemon Squeezy provider:** Implement `IBillingProvider` + webhook event mapping to canonical events.
- [ ] **Billing module:** BillingService (delegates to provider + getStatus), BillingController (create-checkout, create-portal, status), webhook controller → parser → handler.
- [ ] **Auth: Billing link:** `POST /auth/billing-link` (JWT → short-lived token); endpoints accept `billing_token` and resolve userId.
- [ ] **Lemon Squeezy Dashboard:** Store, products, variants (monthly/yearly), webhook endpoint, signing secret.
- [ ] **Cloud: Billing UI:** Page `/billing?billing_token=...` – status, Upgrade (monthly/yearly), Manage billing; success/cancel return URLs.
- [ ] **Extension:** Replace Subscription (debug) with `GET /billing/status`; "Manage plan & billing" opens cloud billing URL with token.
- [ ] **Enforce limit:** Backend and extension use `plan === 'pro'` from status (one window vs unlimited, etc.).

---

## 5. Summary

| Layer | Provider-agnostic? | When migrating |
|-------|--------------------|----------------|
| DB (Subscription entity) | Yes – generic names, status enum (active/trial/beta/canceled/past_due/expired) | No change |
| API (routes, request/response shape) | Yes | No change |
| BillingService (create checkout/portal, get status) | Yes | No change |
| SubscriptionEventHandler | Yes | No change |
| Provider impl (LemonSqueezyProvider / StripeProvider) | No – provider-specific | Swap impl, add Stripe webhook route, env |
| Webhook route body/signature | No – provider-specific | New route or branch by provider |

Migration = **change the billing provider implementation and config only**; the rest of the app stays the same.
