# Stripe subscription – plan

**Provider abstraction:** Billing is designed so we can swap providers without changing app logic. See **[billing-provider-abstraction.md](./billing-provider-abstraction.md)** for the provider-agnostic surface (DB, API, canonical events) and migration path.

**Current choice:** We use **Lemon Squeezy** first (MoR, tax handled). This doc’s flow (Checkout, Portal, webhooks, billing link) still applies; the abstraction doc describes the Lemon Squeezy implementation. When we migrate to Stripe, we implement the same interface and swap in; no changes to routes, handlers, or UI.

---

## Current state

- **Backend:** NestJS + Prisma. No Stripe yet. `User` has `Role` (admin/user), no subscription fields.
- **Frontend:** Dashboard has "Manage your Notic plan and billing" and a **Subscription (debug)** block (simulated toggle; will be replaced).
- **Product:** Free tier = 10-note sync limit; paid = remove limit (and any future premium features).

## Decisions to confirm

1. **Who pays via Stripe?** Web app only, or also Chrome extension users? (Extension can open your web billing page or use Chrome Web Store; this plan assumes Stripe for **web** and optionally linking the same account for extension.)
2. **Plans:** Single paid plan (e.g. "Pro" / "Notic Pro") vs multiple tiers (e.g. Pro / Team). Plan below assumes **one paid plan** to start.
3. **Billing UI:** Stripe **Checkout** (redirect to Stripe-hosted page) is simplest and PCI-safe. **Customer Portal** (Stripe-hosted) for manage/cancel. Optionally later: **Elements** (embedded card) for custom UI.

---

## Phase 1 – Backend (notic-backend)

### 1.1 Dependencies and env

- Add `stripe` to `package.json`.
- Env (e.g. `.env`): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` (or `STRIPE_PRICE_ID_PRO`), `FRONTEND_URL` (for success/cancel redirects).

### 1.2 Database

- **Option A – minimal:** Add to `User`: `stripeCustomerId?: string`, `stripeSubscriptionId?: string`, `subscriptionStatus?: string` (e.g. `active`, `canceled`, `past_due`), `subscriptionCurrentPeriodEnd?: DateTime`.
- **Option B – separate table:** New `Subscription` (or `Billing`) model linked to `User` with Stripe IDs and status. Keeps User cleaner and allows subscription history.
- Recommendation: **Option A** for v1 (one plan, one subscription per user); migrate to Option B if you add multiple products or history.

### 1.3 Stripe module

- **Module:** e.g. `StripeModule` (register in `AppModule`), inject `StripeService` (wrapper around `Stripe` SDK).
- **Service responsibilities:**
  - Create Stripe Customer (on first checkout or when linking billing).
  - Create **Checkout Session** (mode: `subscription`, line_items from `STRIPE_PRICE_ID`, success/cancel URLs using `FRONTEND_URL`).
  - Create **Customer Portal session** (return URL to your app).
  - (Optional) Get subscription status by `subscriptionId` or `customerId` for API responses.

### 1.4 API routes (NestJS controllers)

- `POST /billing/create-checkout-session` (or `/stripe/create-checkout-session`)  
  - Auth: JWT (current user).  
  - Body: e.g. `{ successUrl?, cancelUrl? }` (or use defaults from env).  
  - Creates/gets Stripe Customer, creates Checkout Session, returns `{ url }` (redirect to Stripe Checkout).

- `POST /billing/create-portal-session` (or `/stripe/create-portal-session`)  
  - Auth: JWT.  
  - Body: e.g. `{ returnUrl? }`.  
  - Creates Customer Portal session, returns `{ url }`.

- `GET /billing/status` (or `/me/subscription`)  
  - Auth: JWT.  
  - Returns subscription status from DB (or from Stripe if you prefer): e.g. `{ plan: 'free' | 'pro', status?, currentPeriodEnd? }`.  
  - Used by frontend to show "Pro" vs "Free" and to enforce 10-note limit.

### 1.5 Webhooks

- **Endpoint:** `POST /billing/webhook` (or `/stripe/webhook`).  
  - **No JWT.** Verify signature with `STRIPE_WEBHOOK_SECRET` (use `stripe.webhooks.constructEvent`).  
  - Handle at least:
    - `checkout.session.completed` → attach subscription to user (save `subscriptionId`, `customerId`, `status`, `current_period_end`).
    - `customer.subscription.updated` → update status and period end.
    - `customer.subscription.deleted` → set status to canceled / expired, clear or keep `subscriptionId` for history.
  - Respond 200 quickly; do heavy DB work in a background job if needed.

### 1.6 Auth and linking customer to user

- When creating Checkout Session, pass `client_reference_id` = your `userId` (or email). In `checkout.session.completed`, use it to find the User and store `stripeCustomerId` and `stripeSubscriptionId`.
- If the user already has `stripeCustomerId`, reuse it when creating the Checkout Session (so Stripe doesn’t create a second customer).

---

## Phase 2 – Frontend (notic)

### 2.1 Replace Subscription (debug)

- Remove the debug toggle and `SUBSCRIPTION_DEBUG_KEY` usage for "is subscribed."
- **Source of truth:** Call backend `GET /billing/status` (or `/me/subscription`) when loading dashboard/settings. Show "Free" vs "Pro" (and optional status/period end) from that response.

### 2.2 Billing entry points

- **Upgrade:** Button "Upgrade to Pro" (or "Manage plan") → call `POST /billing/create-checkout-session` → redirect to `url` (Stripe Checkout).
- **Manage / cancel:** Button "Manage billing" → call `POST /billing/create-portal-session` → redirect to `url` (Stripe Customer Portal).

### 2.3 Post-checkout return

- Success URL: e.g. `FRONTEND_URL/settings?checkout=success`. Show a short "You’re on Pro" message.
- Cancel URL: e.g. `FRONTEND_URL/settings?checkout=canceled`. No error needed.
- After redirect, refetch `/billing/status` so UI updates without full reload.

### 2.4 Enforcing the 10-note limit

- Backend: when creating a note or syncing, if user’s `subscriptionStatus` is not active (or plan is `free`), enforce the 10-note limit (you likely already have this logic; switch from debug flag to real subscription status).
- Frontend: use `/billing/status` to show upgrade prompts and disable "new note" or sync when at limit for free users.

---

## Phase 3 – Stripe Dashboard (manual)

- Create Product: e.g. "Notic Pro."
- Create Price: recurring (monthly or yearly), attach to Product. Copy Price ID → `STRIPE_PRICE_ID`.
- Webhooks: add endpoint `https://your-api.com/billing/webhook`, subscribe to `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy signing secret → `STRIPE_WEBHOOK_SECRET`.
- (Optional) Customer Portal: enable in Stripe Dashboard and configure branding/return URL.

---

## Order of implementation

1. **Backend:** Env, Prisma (add subscription fields to User), Stripe module + create Checkout Session + create Portal Session + webhook handler, then `GET /billing/status`.
2. **Stripe Dashboard:** Product, Price, webhook endpoint.
3. **Frontend:** Replace debug subscription with `/billing/status`, add "Upgrade" and "Manage billing" buttons, success/cancel URLs, enforce limit from real status.
4. **Testing:** Use Stripe test keys and test cards; trigger webhooks with `stripe listen --forward-to localhost:3000/billing/webhook`.

---

## Security and ops

- Never expose Stripe secret key to the frontend. Only backend uses it.
- Webhook handler must verify signature; ignore unknown events or invalid signature.
- Store minimal required fields (customer id, subscription id, status, period end); avoid storing full Stripe objects if not needed.
- Prefer idempotent webhook handling (e.g. by `event.id` or subscription id) to avoid duplicate updates.

---

## Optional later

- Multiple plans (e.g. Pro / Team): add more Price IDs and/or products; `GET /billing/status` returns which product/price the user is on.
- Trial: set `subscription_data.trial_period_days` in Checkout Session.
- Usage-based: Stripe Metering + usage-based Price; backend reports usage to Stripe and syncs limits from subscription.
- Extension: same User can have Stripe subscription; extension calls same `GET /billing/status` (with auth) to know if user is Pro and skip 10-note limit.

---

## Decided: Option 2 – Billing link token (extension → cloud)

**Why:** Avoids wrong-account risk (Option 1: user could be User A in extension but User B on cloud; they’d pay the wrong profile). With Option 2, the user is fixed by the extension: backend issues a short-lived token for the extension’s current user; cloud only ever sees that token.

**Flow:**
1. User clicks “Manage plan & billing” in **extension**.
2. Extension calls backend with its JWT: `POST /auth/billing-link` (or similar).
3. Backend validates JWT, creates **short-lived (e.g. 5–10 min) one-time token** for that user, returns it.
4. Extension opens: `https://cloud-domain.com/billing?token=<token>` (from `redirectUrl`).
5. Cloud billing page loads, reads `billing_token`, sends it to backend (exchange for session or use for that request). Backend validates, serves billing UI / create-checkout / create-portal, **invalidates token** after first use (or short TTL).
6. Cloud never sees the extension’s real JWT; billing is always for the user who clicked in the extension.

**Backend addition:** `POST /auth/billing-link` (JWT required), returns `{ redirectUrl }` (e.g. `/billing?token=...`). Endpoints accept `token` (query/body) or `x-billing-token` header and invalidate after use.

---

## Decided: Landing page first, then billing UI

**If we have to touch the cloud anyway** (for the billing return URL with `token`), build the **landing page (cloud)** first. That gives:
- A live cloud site to which extension can link (“Manage plan & billing” → open landing/billing URL).
- A place to add `/billing?billing_token=...` and the billing UI (upgrade, manage, status) later.
- Stripe success/cancel URLs pointing at the same domain (e.g. `https://your-domain.com/billing/return?checkout=success`).

**Order:** Build landing page now (no code changes in this step). Then implement Stripe + Option 2 (billing link + billing UI on cloud).

---

## Todo list (Stripe + billing)

- [ ] **Landing page (cloud)** – Build landing page first (can be minimal). Will host billing UI and `/billing?billing_token=...` later.
- [ ] **Backend: Stripe** – Env, Prisma (User subscription fields), Stripe module, Checkout + Portal sessions, webhooks, `GET /billing/status`.
- [ ] **Backend: Billing link** – `POST /auth/billing-link` (JWT → short-lived one-time token), endpoint that accepts `billing_token` and invalidates after use.
- [ ] **Stripe Dashboard** – Product, monthly + yearly Price IDs, webhook endpoint.
- [ ] **Cloud: Billing UI** – Page `/billing` that reads `billing_token` from URL, calls backend with it, shows plan status + Upgrade (monthly/yearly) + Manage billing; success/cancel return URLs.
- [ ] **Extension** – Replace Subscription (debug) with real `GET /billing/status`; “Manage plan & billing” opens cloud billing URL with token (extension gets token from `POST /auth/billing-link`, then opens `https://cloud/billing?billing_token=...`).
- [ ] **Enforce 10-note limit** – Backend and extension use real subscription status instead of debug flag.
