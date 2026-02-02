# Trial sign-up flow (Lemon Squeezy + extension)

How to send users to a trial sign-up from the extension for better conversion.

## How to get the variant ID for trial

In Lemon Squeezy, the **free trial is a setting on a subscription variant**, not a separate product.

1. **Enable trial on a variant**
   - In Lemon Squeezy: **Products** → your Pro subscription product → edit the product.
   - For a **Subscription** product you’ll see **“Subscription has free trial?”** — turn it **on**.
   - Set the trial length (e.g. 7 days, 14 days, 1 month).
   - That applies to the variant(s) for that product (e.g. your “Pro Monthly” variant).

2. **Two ways to get a “trial” checkout**
   - **Use your existing monthly variant:** If you enable the free trial on your **monthly** variant, the “trial” is the same variant. Set **`LEMONSQUEEZY_VARIANT_ID_TRIAL`** to the **same value as `LEMONSQUEEZY_VARIANT_ID_MONTHLY`**. Or leave `LEMONSQUEEZY_VARIANT_ID_TRIAL` unset — the backend falls back to monthly (then yearly) when `priceKey === 'trial'`.
   - **Use a separate variant:** Create a second variant (e.g. “Pro Monthly – 7-day trial”) with the trial enabled, and set **`LEMONSQUEEZY_VARIANT_ID_TRIAL`** to that variant’s ID.

3. **Where to find the variant ID**
   - **Dashboard:** Products → your product → the variant may show an ID in the URL when you edit it, or in the product/variant settings.
   - **API:** `GET https://api.lemonsqueezy.com/v1/variants?filter[product_id]=<YOUR_PRODUCT_ID>` with header `Authorization: Bearer <LEMONSQUEEZY_API_KEY>`. The response lists variants with `id` and `attributes` (e.g. `has_free_trial`). Use the `id` of the variant that has the trial.

**TL;DR:** Enable “Subscription has free trial?” on your Pro subscription (e.g. monthly) in Lemon Squeezy. Then either set `LEMONSQUEEZY_VARIANT_ID_TRIAL` to that variant’s ID, or leave it unset and the backend will use your monthly variant for trial checkout.

## Backend (done)

- **`priceKey: 'trial'`** is supported in `POST /billing/create-checkout-session` (body: `{ successUrl?, cancelUrl?, priceKey?: 'monthly' | 'yearly' | 'trial' }`).
- Checkout uses **`LEMONSQUEEZY_VARIANT_ID_TRIAL`** when `priceKey === 'trial'`. If unset, falls back to **monthly** then **yearly** (so you can use your existing monthly variant with trial enabled and omit `LEMONSQUEEZY_VARIANT_ID_TRIAL`).

## Frontend (billing page)

1. **“Start free trial” button**  
   Call create-checkout-session with **`priceKey: 'trial'`** (same as Upgrade to Pro but with `priceKey: 'trial'` in the JSON body). Redirect to the returned `url` (Lemon checkout).

2. **Optional: `?intent=trial`**  
   When the billing page loads with `?intent=trial` (and user is already logged in via cookie or `?token=`), either:
   - Highlight the “Start free trial” CTA, or
   - Auto-call create-checkout-session with `priceKey: 'trial'` and redirect immediately (one click in extension → Lemon trial checkout).

3. **Example request**  
   `POST /billing/create-checkout-session` (or frontend proxy) with:
   ```json
   { "successUrl": "https://yourapp.com/billing?checkout=success", "cancelUrl": "https://yourapp.com/billing", "priceKey": "trial" }
   ```

## Extension

Add a button/link that opens the billing page with trial intent:

- **With auth (user already has billing token):**  
  `https://<APP_URL>/billing?token=<billing_token>&intent=trial`  
  If the page supports auto-redirect when `intent=trial` and session is valid, the user lands on Lemon trial checkout after one click.

- **Without token (user must sign in on billing page):**  
  `https://<APP_URL>/billing?intent=trial`  
  User signs in on the billing page, then sees “Start free trial” (or gets auto-redirect if you implement it).

Use your app’s base URL (e.g. `https://getnotic.io` or `https://app.getnotic.io`) for `<APP_URL>`. The billing page is the same route you use for “Upgrade to Pro”; only the `intent=trial` (and optional `token`) change behaviour for conversion.
