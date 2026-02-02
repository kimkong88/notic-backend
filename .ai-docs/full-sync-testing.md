# Full sync flow: implementation and testing

## What was added

**Extension (Notic):**

1. **pullFromServer()** – GET /sync (paginated); loops on `nextCursor`; returns combined notes + folders/workspaces from first page.
2. **mergeIntoLocal(server)** – Writes server notes, folders, workspaces into `chrome.storage.local`. Does not remove local-only items.
3. **triggerFullSync()** – Pull → merge → triggerSync() (push). Ensures tokens (or authenticates), then runs full sync.
4. **Dashboard** – When signed in on load, `enableSyncAndTrigger()` calls `triggerFullSync()` and then reloads workspaces, folders, notes and re-renders.

So on refresh when signed in: full sync runs (pull → merge → push), then UI reloads from storage.

---

## How to test it

### 1. Manual / in-browser

- **Backend:** Run dev server (e.g. `npm run start:dev`), ensure DB has user + some notes/folders/workspaces.
- **Extension:** Load unpacked, sign in, ensure backend is reachable (e.g. CORS, `VITE_API_URL`).
- **Steps:**
  1. Open dashboard (signed in) → network: expect GET /sync (first page), then GET /sync?cursor=... until no `nextCursor`, then POST /sync.
  2. In backend DB: `SyncLog` should have one row with `direction = pull` and one with `direction = push` for that session.
  3. Change data on server (or another client), refresh extension → after full sync, local UI should show server data (pull + merge), then push sends merged state.

**What to check:**

- Pull logs: at least one `SyncLog` with `direction = 'pull'` per full sync.
- Push logs: one `SyncLog` with `direction = 'push'` after merge.
- UI after refresh: notes/folders/workspaces match server + local-only (merge does not delete local-only).

### 2. Unit tests (extension)

- **pullFromServer:** Mock `fetchWithAuth` to return pages with `nextCursor`; assert accumulated notes and that folders/workspaces come from first page only.
- **mergeIntoLocal:** Mock `chrome.storage.local.set`; call merge with a fixed `PullResponse`; assert `set` is called with the right keys (workspaces, folder meta, note session + meta + folder link). Optionally assert we do not remove keys that are not in the server payload (local-only preserved by not touching them).
- **triggerFullSync:** Mock `pullFromServer`, `mergeIntoLocal`, `triggerSync`; assert order (pull → merge → push) and that on pull failure we do not call merge/push and state becomes `failed`.

Run with Vitest (or the project’s test runner) in the extension repo.

### 3. Backend

- **Pull:** Already covered by existing sync service tests (pull returns shape, pagination, SyncLog).
- **Push:** Already covered (upsert, delete, SyncLog).
- No new backend tests strictly required for “full sync”; full sync is an extension flow that uses existing GET + POST.

### 4. E2E (optional)

- Use a browser automation (e.g. Playwright) to load the extension, sign in, trigger a refresh, then either:
  - Inspect network (GET /sync, POST /sync), or
  - Query backend (e.g. test API or DB) to confirm SyncLog has both pull and push for that user/session.

---

## Summary

| Layer    | What to test |
|----------|----------------|
| Extension | Unit tests: pull pagination, merge writes, triggerFullSync order and failure path. Manual: full sync on refresh, pull + push in network, UI shows merged data. |
| Backend  | Existing tests; manual check of SyncLog for pull vs push. |
| E2E      | Optional: automate sign-in + refresh and assert network or SyncLog. |
