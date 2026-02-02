# Notion integration – evaluation and approach

**Goal:** Periodically sync Notic data (workspaces, folders, notes) to a Notion workspace the user chooses, with close fidelity and no duplication.

---

## Env vars and how to obtain them

**Backend env vars for Notion (OAuth):**

| Env var | Required | Description |
|---------|----------|-------------|
| `NOTION_OAUTH_CLIENT_ID` | Yes | OAuth client ID from your Notion **public** integration. |
| `NOTION_OAUTH_CLIENT_SECRET` | Yes | OAuth client secret from the same integration. |
| `NOTION_OAUTH_REDIRECT_URI` | Yes | **Backend** URL where Notion redirects after the user authorizes (the backend exchanges the code here). Must match one of the redirect URIs in the Notion integration. Example: `https://api.getnotic.io/notion/oauth/callback` (prod) or `http://localhost:3002/notion/oauth/callback` (local if backend runs on 3002). |

**How to obtain (Notion public integration):**

1. Go to **Notion integrations**: [https://www.notion.so/profile/integrations](https://www.notion.so/profile/integrations) (or **Settings & members** → **Connections** → **Develop or manage integrations** → **My integrations**).
2. Click **New integration**.
3. Choose **Public** (not Internal).
4. Fill in:
   - **Name** (e.g. “Notic”).
   - **Logo**, **Company name**, **Website** (optional but useful).
   - **Redirect URIs**: add your **backend** callback URL(s), e.g.  
     - Production: `https://api.getnotic.io/notion/oauth/callback`  
     - Local: `http://localhost:3002/notion/oauth/callback` (use the port your backend runs on)  
     The redirect URI is where **Notion** sends the user after auth; it must be the backend so it can exchange the code. `NOTION_OAUTH_REDIRECT_URI` must match one of these **exactly**.
5. Create the integration.
6. Open the integration → **Configuration** tab. You’ll see:
   - **OAuth client ID** → use as `NOTION_OAUTH_CLIENT_ID`.
   - **OAuth client secret** → use as `NOTION_OAUTH_CLIENT_SECRET`.
7. Copy both into your `.env` (or Railway/hosting secrets). Never commit the secret.

**Example `.env` snippet:**

```env
NOTION_OAUTH_CLIENT_ID=your-client-id-from-notion
NOTION_OAUTH_CLIENT_SECRET=your-client-secret-from-notion
NOTION_OAUTH_REDIRECT_URI=https://api.getnotic.io/notion/oauth/callback
```

For local dev, use your backend’s local URL (e.g. `http://localhost:3002/notion/oauth/callback` if backend runs on 3002), and add that exact URL to the integration’s **Redirect URIs** in Notion. Set `FRONTEND_URL=http://localhost:3000` so after exchanging the code the backend redirects the user to the frontend (e.g. `/settings?notion=connected`).

**If you see "Missing or invalid redirect_uri" from Notion:** The redirect URI sent to Notion must **exactly** match one of the Redirect URIs in your Notion integration (Configuration → Redirect URIs). Use the same string in both places: no trailing slash (e.g. `http://localhost:3002/notion/oauth/callback`), no extra spaces. The backend normalizes `NOTION_OAUTH_REDIRECT_URI` (trim + strip trailing slash), so in the Notion dashboard add the URL **without** a trailing slash.

---

## 1. Feasibility

**Yes, this is possible** with the public Notion API.

- **OAuth:** Notion supports public integrations with OAuth 2.0. User authorizes your app; you get `access_token`, `workspace_id`, and can create/update content in that workspace.
- **Content:** You can create pages under a page or under a database (data source). Page content is built from blocks (paragraphs, headings, etc.); you can set a page title and append block children for note body.
- **Deduplication:** Notion does not provide a built-in “external ID”. You prevent duplicates by **storing a mapping in your DB** (Notic entity → Notion page ID) and only creating when no mapping exists; otherwise you update the existing page.
- **Rate limits:** ~3 requests per second per integration (with some burst). You must throttle (queue + delay or respect `Retry-After` on 429).

---

## 2. Data mapping (Notic → Notion)

| Notic | Notion | Notes |
|-------|--------|--------|
| **Workspace** | One **parent page** (user picks or we create) | User selects “Sync to this page” or we create a root page per workspace. All folders/notes live under it. |
| **Folder** | **Child page** of workspace root (or of parent folder) | Title = folder name. Hierarchy: `parentId` → parent folder’s Notion page. |
| **Note** | **Child page** of folder page (or workspace root if no folder) | Title = note `displayName` or derived title; body = note content as blocks (e.g. paragraph blocks from markdown/plain text). |

- **Stable keys:** Use Notic’s `clientId` (and optionally backend `id`) as the unique key. Mapping table stores `(userId, entityType, clientId) → notionPageId`.
- **Optional:** Instead of “page per note”, you could use one Notion **database** per folder (or one DB for all notes) with columns: Notic ID, Title, Content, etc. Then each note is a **row** (page in that database). Same dedup idea: mapping table or a “Notic ID” property and query before create.

---

## 3. Preventing duplication

**Recommended: mapping table in your DB.**

- **Table (e.g. `notion_sync_mapping`):**  
  `userId`, `entityType` (‘workspace’ | ‘folder’ | ‘note’), `clientId` (Notic client id), `notionPageId` (Notion page UUID), optional `notionWorkspaceId`, `updatedAt`.
- **Unique constraint:** `(userId, entityType, clientId)` so there is at most one Notion page per Notic entity.
- **Sync logic:**
  1. For each entity (workspace root, folder, note): look up `notionPageId` by `(userId, entityType, clientId)`.
  2. If **found:** PATCH that Notion page (title, etc.) and update block children for notes (replace or append depending on strategy).
  3. If **not found:** POST create the page in Notion, then INSERT the mapping.
- **Why not “store Notic ID in Notion and query”?** You’d have to query Notion (e.g. filter by property) for every entity on every sync, which multiplies API calls and hits rate limits. A local mapping is one DB read per entity and only one Notion create when new.

**Idempotency:** Same Notic state → same Notion state. Re-running sync with no changes should only PATCH/update where needed; no duplicate pages.

---

## 4. Sync strategy

- **Direction:** One-way **Notic → Notion** (Notic is source of truth). No “sync from Notion back into Notic” in v1.
- **When:**
  - **Periodic:** Backend job (e.g. cron every N minutes) for users who have connected Notion (see below).
  - **On-demand:** “Sync to Notion” in extension or app triggers an API call that runs the same sync logic once.
- **What to sync:** Only data that changed since last successful sync (e.g. `lastModified` for notes, or a `notion_sync_cursor` per user). Full sync on first run or when mapping is empty.
- **Order:** Create/update workspace root → folders (top-down by `parentId`) → notes (under correct folder page). Respect parent–child so Notion parent page exists before creating children.
- **Deletions:** Decide policy: (a) delete/archive the Notion page when a note/folder is deleted in Notic, or (b) leave it in Notion (simpler; user can clean up). If (a), you need to track “was synced” and call Notion “archive page” (or delete) when Notic entity is deleted.

---

## 5. User flow and storage

1. **Connect Notion:** In settings, user clicks “Connect Notion” → OAuth redirect to Notion → user picks workspace and authorizes → redirect back with `code` → backend exchanges for `access_token` (and `refresh_token` if available). Store **per user:** `notionAccessToken`, `notionRefreshToken` (if any), `notionWorkspaceId`, optional `notionSyncRootPageId` (the page under which we create workspace/folders/notes).
2. **Choose sync root (optional):** Either user pastes a Notion page URL (we parse page_id) or we create a root page in their workspace (e.g. “Notic Sync”) and use that. Store `notionSyncRootPageId` so all Notic content lives under one place.
3. **Periodic sync:** For each user with valid Notion token and `notionSyncRootPageId`, job runs: load workspaces/folders/notes from your DB, resolve mapping, create/update Notion pages (throttled to ~3 req/s), update mapping and last-sync timestamp.

---

## 6. Technical notes

- **Token refresh:** If Notion returns 401, try refresh_token (if supported); otherwise user must re-authorize. Store token encrypted or in a secrets store.
- **Content format:** Notion blocks are structured (e.g. paragraph, heading_1, bulleted_list_item). You’ll need a small “Notic content → Notion blocks” converter (e.g. markdown or plain text to paragraphs/code blocks). Rich text inside blocks has its own schema.
- **Rate limiting:** Queue requests; aim for ≤3 req/s average; on 429, back off per `Retry-After` and retry. For large accounts, sync in batches and spread over time.
- **Partial failure:** If one page create/update fails (e.g. 403, 429), log it and continue; retry on next run. Don’t remove mapping until you’re sure the Notion page is gone (e.g. after successful archive/delete).

---

## 7. Recommended approach (summary)

1. **Backend:** Add Notion OAuth (authorize URL, callback, token exchange). Store tokens and `notionSyncRootPageId` per user (new table or columns). Add `notion_sync_mapping` table.
2. **Sync service:** One-way sync job: load user’s workspaces/folders/notes (from existing sync/DB), for each entity check mapping → create or update Notion page, write mapping, throttle to ~3 req/s.
3. **Deduplication:** Rely only on the mapping table; do not depend on storing Notic ID inside Notion for lookups (optional: add “Notic ID” as a Notion property for user visibility/debugging).
4. **Extension/UI:** “Connect Notion” + optional “Choose page” (paste link) + “Sync to Notion” button that triggers backend sync. Optionally show “Last synced at” from backend.
5. **Periodic job:** Cron (e.g. every 15–30 min) that runs sync for users with Notion connected and optionally only if “last modified” > “last notion sync” to save work.

This gives you periodic sync to a user-chosen Notion workspace with close structural fidelity (workspace → folder → note) and no duplication, using a single source of truth (your DB) and a local mapping table for idempotent create/update behavior.

---

## 8. Implementation outline

| Phase | Task | Notes |
|-------|------|--------|
| **Schema** | Add `NotionConnection` (userId, accessToken, refreshToken?, notionWorkspaceId, syncRootPageId?, lastSyncAt?) and `NotionSyncMapping` (userId, entityType, clientId, notionPageId, notionWorkspaceId?, updatedAt). | Encrypt tokens at rest; unique on (userId, entityType, clientId) for mapping. |
| **OAuth** | Notion OAuth: authorize URL, callback, token exchange. Store in NotionConnection. | Public integration; redirect URI in Notion dashboard. |
| **Sync root** | Endpoint or flow for user to set `syncRootPageId` (paste page URL → parse page_id). | Optional: create default "Notic Sync" page if not set. |
| **Sync service** | One-way sync: load workspaces/folders/notes, resolve mapping, create/update Notion pages (throttle ~3 req/s), update mapping and lastSyncAt. | Order: workspace root → folders (top-down) → notes. Content: markdown/plain → Notion blocks. |
| **API** | `POST /notion/sync` (trigger sync), `GET /notion/status` (connected?, lastSyncAt). | Auth required. |
| **Extension** | "Connect Notion", "Choose page", "Sync to Notion" button, "Last synced at". | Settings or share area. See [notion-api-contract.md](notion-api-contract.md) for endpoints and wiring. |
| **Cron** | Job every 15–30 min: for each user with Notion connected, run sync (optionally only if changes since lastSyncAt). | Queue or batch to respect rate limits across users. |

---

## 9. Scaling to 10,000+ paid users (Notion sync)

**Constraint:** Notion’s limit is **~3 requests per second per integration**. All users share that one bucket. You cannot raise it with more servers or more workers.

**Rough capacity (throttled at 3 req/s):**

- 3 req/s × 3,600 s ≈ **10,800 requests/hour**.
- **Incremental sync:** Only push entities changed since `lastSyncAt`. Assume ~5–20 Notion API calls per user per run (often just a few notes/folders changed).
- **Per 15‑min cron run:** 15 × 60 × 3 = **2,700 requests max** → at 20 req/user that’s **~135 users per run**; at 5 req/user, **~540 users per run**.
- To give each of 10,000 users at least one sync per 24h: 10,000 × 20 = 200,000 requests → 200,000 ÷ 3 ÷ 3,600 ≈ **18.5 hours** of throttled work. So you **spread** 10k users across the day (round‑robin), don’t sync everyone in one go.

**How to make it scale:**

| Lever | What to do |
|-------|------------|
| **1. Batch + round‑robin** | Each cron run (e.g. every 15 min) does **not** sync “all users”. It picks the **next N users** to sync (e.g. by oldest `lastSyncAt` or a `nextSyncAt`), with N such that N × avg_requests_per_user ≤ 2,700 (e.g. N ≈ 100–150). Over 24h, 96 runs × 135 users ≈ **12,960 user syncs** → enough to cover 10k users with slack. |
| **2. Incremental sync** | For each user, only create/update **workspaces/folders/notes that changed** since `lastSyncAt` (e.g. `lastModified > lastSyncAt`). Cuts requests per user sharply (often single digits). Low churn ⇒ few requests; big catch‑up on first sync or after long pause. |
| **3. Single global throttle** | All Notion API calls from your backend must go through **one** rate limiter (e.g. in‑process queue: max 3 req/s, or a small worker that is the only thing calling Notion). Multiple app instances don’t get more Notion quota—only one “pipe” to Notion. |
| **4. Cron as trigger only** | Cron (Option B) only **triggers** the sync job (e.g. HTTP to `/notion/cron/sync`). The handler selects “next batch of users”, then runs sync for that batch **sequentially or with strict throttle** so the process never exceeds 3 req/s to Notion. |
| **5. Optional: priority queue** | If you want paid users synced more often, give them a higher priority or a shorter “sync interval” (e.g. paid: every 15 min; free: every 24h). The same batch logic applies: pick next N by priority/oldest `lastSyncAt`. |
| **6. 429 handling** | On 429, respect `Retry-After` and back off. Keep throttle slightly under 3 req/s in normal operation to avoid 429; use retries only for bursts or drift. |

**Data model (optional but helpful):**

- **Option A:** No extra table. Each run: `SELECT * FROM notion_connection ORDER BY last_sync_at ASC NULLS FIRST LIMIT 150`. Sync those 150; update `last_sync_at`. Next run gets the next 150. Round‑robin emerges from “oldest last sync first”.
- **Option B:** Add `next_sync_at` (or priority) on `NotionConnection` so you can do “sync users where next_sync_at ≤ now()” and cap at 150. Lets you do “paid every 15 min, free every 24h” by setting `next_sync_at` differently.

**Summary:** To scale to 10k paid users with Notion sync, use **batched round‑robin** (e.g. ~100–150 users per 15‑min run), **incremental sync** (only changed entities), and a **single global throttle** at ≤3 req/s. One cron endpoint that runs the batch is enough; no need for multiple workers to Notion.

---

## 10. UX: when does sync happen? (user expectation vs rate limit)

**Tension:** Users typically expect “I edited a note → it shows up in Notion soon” (minutes, not hours). Pure round‑robin can mean “your turn” is many hours away for some users, which feels broken.

**Options:**

| Approach | How it works | UX | Trade-off |
|----------|--------------|----|-----------|
| **A. Cron-only (round‑robin)** | Cron runs every 15 min, syncs next N users by oldest `lastSyncAt`. | “Sync happens sometime in the next X hours.” | Predictable for system; bad UX if user expects “soon.” |
| **B. On-demand as primary** | User clicks “Sync to Notion” → we sync **that user** right away (or put them at front of queue). Cron only catches users who never click. | “My notes sync when I hit Sync.” | Fast when they ask; Notion stays stale if they never click. |
| **C. Hybrid (recommended)** | **“Sync to Notion”** = sync this user **immediately** (same request or a short queue). One user ≈ 5–50 Notion calls → ~2–20 sec at 3 req/s. **Cron** = round‑robin for everyone else (so users who don’t click still get synced within 24h). | “When I click Sync, my Notion is updated in under a minute. Otherwise we sync you in the background.” | Best of both: fast when they ask, background for the rest. |
| **D. Priority queue** | “Sync now” (or “recently edited”) users go into a **high-priority** batch; cron run processes “requested sync” first (e.g. 20 slots), then round‑robin (130 slots). | “If you clicked Sync, you’re in the next run (≤15 min). Else you’re in the general pool.” | Better than pure round‑robin; still up to 15 min for on-demand. |
| **E. Set expectations** | Product copy: “Notion sync runs every few hours.” No “Sync now” or a soft “Request sync” that just sets priority. | User knows it’s not instant. | Simple; may feel slow for paid users. |

**Recommendation: C (hybrid)**

- **“Sync to Notion” button (extension/app):** Calls `POST /notion/sync` for the **current user**. Backend runs sync for **that user only**, throttled at 3 req/s. With incremental sync, that’s often 5–20 requests → **a few seconds**. User sees “Syncing…” then “Synced to Notion” (and `lastSyncAt` updates). So **when they click, they get updates in Notion in under a minute** (often 10–30 sec).
- **Cron (e.g. every 15 min):** Runs batch for users who **didn’t** just click: e.g. pick 100–150 users by oldest `lastSyncAt`, sync them (throttled). So users who never click still get synced within ~24h; heavy clickers are already up to date.
- **Optional:** If “Sync now” is hit a lot and you’re worried about bursts, you can still put the requested user into a “priority” queue and process them in the **next** cron run (e.g. within 1–2 min with a more frequent cron, or a dedicated “on-demand” worker that only processes “sync requested” users). That caps burst traffic while keeping “sync within 1–2 min” as the promise.

**Copy / UX wording**

- **Button:** “Sync to Notion” or “Sync now” (not “Request sync” unless you go with D/E).
- **After click:** “Syncing to Notion…” → “Synced. Your notes are up to date in Notion.” Show `lastSyncAt` as “Last synced: 2 min ago.”
- **Settings:** “Notion syncs when you click Sync. We also sync in the background about once a day so your Notion stays up to date.”

This way sync feels **fast when the user cares** (on-demand), and the system still scales (cron + round‑robin + single throttle).

---

## 11. Manual sync vs “real-time” / automatic

**Recommendation: opt in to manual sync (at least for v1).**

| | Manual sync (“Sync to Notion”) | Automatic / “real-time” |
|--|-------------------------------|--------------------------|
| **What** | User clicks “Sync to Notion”; we push then. | Sync on every save, or cron in background, or “soon after edit.” |
| **Pros** | Simple. Predictable. User knows exactly when data goes to Notion. No surprise rate limits. Easy to explain and scale (one user per click). Honest: “you control when we send to Notion.” | Feels magical; no extra click. |
| **Cons** | User has to remember to click (or we remind). Notion can be stale between syncs. | Complex. Rate limits and scaling (cron/queue). Hard to set expectations (“when will it show up?”). Risk of 429 if many users “auto-sync” at once. |

**Why manual is a good default**

1. **Clarity:** “Your notes sync to Notion when you click Sync.” No vague “we sync periodically” or “within a few hours.”
2. **Control:** User decides when their data is sent to Notion. Fits privacy-minded and power users.
3. **Simplicity:** No cron, no round-robin, no “when did I last sync?” edge cases. One endpoint: “sync this user now.”
4. **Scale:** Only sync when asked → no thundering herd; you stay under 3 req/s unless many users click at once (and even then you can queue per user).
5. **v1 scope:** Ship “Connect Notion” + “Sync to Notion” + “Last synced: X.” Add optional background cron later if users ask for “sync without clicking.”

**When to add background / automatic**

- If users say “I forget to sync” or “I want my Notion always up to date” → add optional “Sync to Notion in the background (about once a day)” and the cron + round-robin from §9–10.
- Keep manual as the primary: “Sync now” stays the main action; background is a convenience, not the default promise.

**Copy**

- **Manual-only (v1):** “Sync to Notion when you’re ready. Click **Sync to Notion** to push your notes; we’ll show when it’s done.”
- **With optional background later:** “Click **Sync to Notion** for instant sync. We can also sync in the background about once a day—turn this on in settings.”

So: **yes, opt in to manual sync.** It’s simpler, clearer, and scales. “Real-time” can wait until you have the need and the capacity (cron + queue + throttle).
