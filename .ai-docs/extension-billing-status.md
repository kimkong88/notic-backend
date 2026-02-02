# Extension: subscription status from real data

Plan for the extension to know subscription status from the backend and drive UI (upgrade vs manage, feature gating).

## Backend (already in place)

- **`GET /billing/status`** returns real subscription data:  
  `{ plan: 'free' | 'pro', status?: string, expiredAt?: string }`  
  - `plan`: derived from DB (has subscription + not expired).  
  - `status`: `paid` | `past_due` | `canceled` (for display).  
  - `expiredAt`: when access ends (ISO string or null).

- **Auth:** Same as other billing endpoints — **JwtOrBillingTokenGuard**:
  - **JWT:** `Authorization: Bearer <access_token>` (recommended for the extension so it can call status repeatedly).
  - Billing token: `x-billing-token: <token>` or query/body `token` (one-time use; not suitable for repeated status checks).

No backend changes needed for “extension needs real status.”

---

## Plan: hook extension to status

### 1. Extension has a valid access token

- After user signs in (e.g. Chrome Identity → your auth API → returns `access_token` + `refresh_token`), the extension must **store the access token** (e.g. in chrome.storage or similar) and **send it on API requests**.
- Use **JWT** for billing/status so the same token works for many calls; billing tokens are one-time and would be consumed on first use.

### 2. Extension calls `GET /billing/status` with JWT

- **Request:**  
  `GET <BACKEND_URL>/billing/status`  
  Header: `Authorization: Bearer <access_token>`
- **Response:**  
  `{ plan: 'free' | 'pro', status?: 'paid' | 'past_due' | 'canceled', expiredAt?: string | null }`
- Handle **401**: token expired or invalid → trigger refresh (if you have refresh_token) or re-auth.

### 3. Extension uses the response

- **Has Pro access:** `plan === 'pro'` and (`expiredAt == null` or `new Date(expiredAt) > now`). Use this to:
  - Gate Pro features (unlimited sync, extra tabs, etc.).
  - Show “Manage subscription” / “Billing” that opens the billing page (or portal).
- **No Pro / free:** `plan === 'free'`. Use this to:
  - Show “Upgrade to Pro” or “Start free trial” that opens billing page (e.g. `?intent=trial`).
- **Optional display:** Use `status === 'past_due'` to show a “Update payment method” message; use `expiredAt` to show “Access until …”.

### 4. When to fetch status

- On extension load / when popup or options open (if that’s where you show plan).
- After returning from billing page (user may have upgraded or cancelled).
- Optionally: periodic refresh (e.g. every N minutes) or after sync requests, so status stays in sync without opening the popup.

### 5. Summary

| Step | Owner | Action |
|------|--------|--------|
| 1 | Extension | Store access_token after sign-in; send `Authorization: Bearer <access_token>` on API calls. |
| 2 | Extension | Call `GET <BACKEND_URL>/billing/status` with that header. |
| 3 | Extension | Use `plan` + `expiredAt` for “has Pro”; drive CTAs (Upgrade / Start trial vs Manage subscription) and feature gating. |
| 4 | Extension | Decide when to call status (load, after billing return, optional refresh). |

Backend already exposes real data; the extension only needs to authenticate with JWT and call the existing billing status endpoint.
