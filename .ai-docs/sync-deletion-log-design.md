# Sync: server-side deletion – what to do first

So the client can remove "deleted on server" items from local storage **without** removing new local-only notes, the server must tell the client **which** clientIds were deleted since the client last synced. That requires a **deletion log** (or equivalent) and a small pull contract change.

---

## 1. Backend: new entity (deletion log)

**Add a table that records when notes/folders/workspaces are removed for a user.**

- **Name:** e.g. `SyncDeletionLog` or `DeletedEntityLog`.
- **Columns (minimal):**
  - `userId` (String, FK to User)
  - `entityType` (enum: `note` | `folder` | `workspace`)
  - `clientId` (String) – extension client id (same as in Note.clientId, etc.)
  - `deletedAt` (DateTime) – when the deletion was applied on the server

- **When to write:**
  - Whenever the server **removes** a note/folder/workspace for that user:
    - **Push with delta:** when you process `deletedNoteIds` / `deletedFolderIds` / `deletedWorkspaceIds` and call `deleteByUserIdAndClientIds`, insert one row per deleted clientId into this log (userId, entityType, clientId, deletedAt = now).
    - **Push with full-replace:** when you call `deleteByUserIdExceptClientIds` (or equivalent), the clientIds you actually delete should also be written to this log (one row per deleted clientId).

- **Index:** `(userId, deletedAt)` (or `userId, entityType, deletedAt`) so you can query "deletions for this user after time T."

- **Prune:** to avoid unbounded growth, periodically delete rows where `deletedAt` is older than e.g. 30 days (or 7 days). Clients that don’t sync for longer than that will not get those deletions; they can still do a full refresh if needed.

So: **first step on backend is to add this table and, in the existing push path (both delta and full-replace), insert into the log for every note/folder/workspace you delete.**

---

## 2. Backend: pull returns “deleted since”

- **Pull contract:** extend the pull response with optional arrays that mean “these clientIds were **deleted** on the server since the time you give me”:
  - `deletedNoteIds?: string[]`
  - `deletedFolderIds?: string[]`
  - `deletedWorkspaceIds?: string[]`

- **Pull input:** the client must send “since when” it last successfully pulled, so the server can filter the log. Options:
  - **Query:** e.g. `GET /sync?since=1699123456789` (epoch ms). If `since` is present, the server queries `SyncDeletionLog` for this userId where `deletedAt > new Date(since)`, groups by entityType, and returns the clientIds in the three arrays above.
  - **Header:** e.g. `X-Sync-Since: 1699123456789` – same idea.

- **When to return:** only when the client sends `since` (or equivalent). If `since` is omitted, keep current behaviour (no deletion arrays). So: **second step on backend is to accept `since` on pull and, when present, fill those three arrays from the new table.**

---

## 3. Client: send `since`, apply only returned deletions

- **On full sync (and optionally on first page of pull):** when calling GET /sync, send the client’s last successful full-sync time, e.g. `lastPullAt`: `GET /sync?since=${lastPullAt}` (and keep existing cursor behaviour for pagination).

- **When processing pull response:** if the response includes `deletedNoteIds` / `deletedFolderIds` / `deletedWorkspaceIds`, then in `mergeIntoLocal` (or equivalent) **remove from local storage only those keys** – do **not** remove “in local but not in server.” So you only remove ids that the server explicitly says were deleted.

- **New local-only notes:** they are never in `deletedNoteIds` (they were never on the server), so they are never removed. “Deleted on server” and “never existed” are distinguished because only the former appear in the deletion log and in the pull response.

So: **first step on client is to send `since` on pull and, when the response includes the new arrays, remove from local only those ids.**

---

## Order of work

1. **Backend**
   - Add the deletion-log table and migration.
   - In the push flow (both delta and full-replace), insert into the log for every deleted note/folder/workspace (by clientId).
   - Extend pull to accept `since` (query or header) and to return `deletedNoteIds`, `deletedFolderIds`, `deletedWorkspaceIds` from the log when `since` is provided.
   - (Optional) Add a prune job or inline prune for old log rows.

2. **Client**
   - When calling pull (e.g. first page of full sync), send `lastPullAt` as `since`.
   - Extend `mergeIntoLocal` (or the full-sync handler) to accept optional deletion arrays and to remove from local storage **only** the keys for those ids.
   - Re-enable “remove from local” logic, but only for ids that appear in the server-returned deletion arrays, not for “in local but not in server.”

No new entity is required besides the **deletion log** table; the rest is “when to write it,” “how to read it on pull,” and “client sends since and applies only those deletions.”

**Pagination and "since" in detail:** See **sync-deletion-since-and-pagination.md** for (1) why extending pull with deletion arrays does not break pagination (return them only on the first page; omit on cursor requests), and (2) what "since" means with real examples (two devices, new local note, first sync, pagination).

Reference: `.ai-docs` from project root.
