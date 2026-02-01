# Sync deletion log: pagination and "since" (with examples)

## Pagination: extending pull without breaking it

Current behaviour:

- **First page:** `GET /sync` or `GET /sync?limit=1000` → returns notes (first batch), **full** folders, **full** workspaces, and `nextCursor` if there are more notes.
- **Next pages:** `GET /sync?cursor=...` → returns only **notes** (next batch), **empty** folders and workspaces, and `nextCursor` again until done.

Deletion arrays (`deletedNoteIds`, `deletedFolderIds`, `deletedWorkspaceIds`) should be returned **only on the first page** (when there is no `cursor`). Reason:

- "Deleted since" is a single list for the whole sync: "everything deleted after time T." The client only needs it once at the start of a full sync.
- On the **first** request the client sends `since=lastPullAt` (and no cursor). The server returns the usual first page **plus** the three deletion arrays (when `since` is present and valid).
- On **follow-up** requests the client sends only `cursor=...` (and optionally `limit`). The server returns the next page of notes and **does not** include deletion arrays (or sends empty arrays). No extra query for the log on later pages.

So:

- Add optional query param **`since`** (epoch ms). It is only meaningful when **no cursor** is sent (first page).
- When building the **first page** response: if `since` is present and &gt; 0, query the deletion log and add the three arrays to the response. When building **cursor** (next-page) responses: do not query the log; omit the three fields or set them to `[]`. Existing pagination (notes cursor, empty folders/workspaces on next pages) stays the same. Response shape stays backward compatible (new fields are optional).

---

## What is "since"? (with real examples)

**`since`** is an optional query param: **epoch milliseconds** meaning "I last successfully finished a full sync at this time." The client already stores that value as `lastPullAt` after each successful full sync. So:

- **Client:** "Give me the current state, and **also** tell me everything you deleted **after** this timestamp."
- **Server:** Queries the deletion log for this userId where `deletedAt > new Date(since)`, groups by entityType, and returns those clientIds in `deletedNoteIds` / `deletedFolderIds` / `deletedWorkspaceIds`.

So "since" is literally "since when did I last pull?" – the same value as `lastPullAt`.

---

### Example 1: Two devices; one deletes a note

| When | What |
|------|------|
| **Monday 10:00** | Device A and Device B both do a full sync. Both have note `note_abc`. Each client stores `lastPullAt = 1729231200000` (Monday 10:00). |
| **Tuesday 14:00** | On Device A the user deletes `note_abc` and syncs. Push sends `deletedNoteIds: ['note_abc']`. Server deletes the row and **inserts into SyncDeletionLog**: (userId, 'note', 'note_abc', Tuesday 14:00). |
| **Wednesday 09:00** | Device B does a full sync. It calls `GET /sync?since=1729231200000` (its lastPullAt = Monday 10:00). Server returns the current notes/folders/workspaces (first page) **and** queries the log: "deletions for this user where deletedAt &gt; Monday 10:00" → finds `note_abc`. So response includes `deletedNoteIds: ['note_abc']`. |
| **Device B** | Removes from local storage **only** the keys for `note_abc`. So Device B no longer has that note and won't re-upload it. |

---

### Example 2: New local-only note (must not be removed)

| When | What |
|------|------|
| **Monday 10:00** | Device B did a full sync. `lastPullAt = 1729231200000`. |
| **Tuesday** | On Device B the user **creates** a new note `note_xyz` (only on Device B; never pushed). |
| **Wednesday 09:00** | Device B does a full sync. It calls `GET /sync?since=1729231200000`. Server returns current state (no `note_xyz` in the list – it's only on Device B) and `deletedNoteIds: []` (or omits it). Nothing was deleted on the server since Monday 10:00 that Device B had. |
| **Device B** | **Does not** remove `note_xyz` from local storage, because `note_xyz` is not in `deletedNoteIds`. So the new local note is kept and will be pushed. "In local but not in server" is not treated as deleted. |

---

### Example 3: First sync or no previous full sync (since missing or 0)

- New device or user never did a full sync: `lastPullAt = 0` or not set.
- Client can send `GET /sync` (no `since`) or `GET /sync?since=0`.
- **Rule:** If `since` is missing or `since === 0`, server **does not** return deletion arrays (or returns empty arrays). Reason: we don't want to remove local data based on "everything ever deleted"; we only want "deleted **after** your last sync." So "since = 0" means "no previous sync" → don't apply any server-side deletion list. Client keeps all local state.

---

### Example 4: Pagination – since only on first request

Device B has 3000 notes. Full sync:

| Request | URL | Response |
|---------|-----|----------|
| **1** | `GET /sync?since=1729231200000&limit=1000` (no cursor) | notes 1–1000, full folders, full workspaces, `deletedNoteIds: ['note_abc']`, `nextCursor: "..."` |
| **2** | `GET /sync?cursor=...&limit=1000` | notes 1001–2000, empty folders/workspaces, **no** `deletedNoteIds` (or `[]`), `nextCursor: "..."` |
| **3** | `GET /sync?cursor=...&limit=1000` | notes 2001–3000, empty folders/workspaces, no deletion arrays |

Client uses `deletedNoteIds` only from the **first** response to remove local keys. Later pages don't need it.

Reference: `.ai-docs` from project root. See also `sync-deletion-log-design.md`.
