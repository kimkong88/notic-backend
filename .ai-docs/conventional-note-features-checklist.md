# Conventional Note Features Checklist (Excluding Subscription)

Confirmation that every conventional note feature is implemented and synced in both **frontend** (notic extension) and **backend** (notic-backend), **excluding subscription** (subscription is frontend-only debug / quota; no backend subscription API).

---

## Auth

| Feature | Frontend | Backend | Synced |
|--------|----------|---------|--------|
| Sign in (Google) | ✅ `auth.ts`, `api-client.ts` — POST /auth/authenticate, set tokens + partition | ✅ `auth.controller.ts`, `auth.service.ts` — authenticate, create/find user, return tokens | N/A (auth only) |
| Sign out | ✅ Clear tokens, partition, clear lastServerSnapshot | N/A | N/A |
| Token refresh | ✅ `api-client.ts` — 401 → POST /auth/refresh, retry | ✅ `auth.controller.ts` — POST /auth/refresh | N/A |

---

## Notes

| Feature | Frontend | Backend | Synced |
|--------|----------|---------|--------|
| Create note | ✅ dashboard-notes, note-actions `create` → triggerSync | ✅ Sync push: upsert note (content, lastModified, createdAt, displayName, folderId, workspaceId, deletedAt) | ✅ |
| Edit content | ✅ editor debounce → storage; PiP saveContent → triggerSync | ✅ Push includes content, lastModified | ✅ |
| Rename (displayName) | ✅ note-actions `rename` → triggerSync | ✅ SyncNoteItemDto.displayName, pull/push | ✅ |
| Move to folder | ✅ noteFolderKey + meta; note-actions (implicit) → triggerSync | ✅ folderId in note, pull/push | ✅ |
| Move to workspace | ✅ note-actions `moveToWorkspace` → triggerSync | ✅ workspaceId in note, pull/push | ✅ |
| Soft delete (trash) | ✅ note-actions `delete` (deletedAt) → triggerSync | ✅ SyncNoteItemDto.deletedAt, Note.deletedAt | ✅ |
| Restore from trash | ✅ note-actions `restore` → triggerSync | ✅ Push with deletedAt cleared | ✅ |
| Permanent delete | ✅ note-actions `deletePermanent` / `emptyTrash` → triggerSync (deletedNoteIds) | ✅ Push deletedNoteIds → delete + SyncDeletionLog | ✅ |
| Duplicate | ✅ note-actions `duplicate` → triggerSync | ✅ Push new note | ✅ |

---

## Folders

| Feature | Frontend | Backend | Synced |
|--------|----------|---------|--------|
| Create folder | ✅ dashboard-folders, folder-actions `create` → triggerSync | ✅ Sync push: upsert folder (name, parentId, createdAt, displayName, workspaceId) | ✅ |
| Rename folder | ✅ folder-actions `rename` → triggerSync | ✅ name/displayName in SyncFolderItemDto | ✅ |
| Delete folder | ✅ folder-actions `delete` → triggerSync (deletedFolderIds) | ✅ Push deletedFolderIds → delete + SyncDeletionLog | ✅ |
| Move folder | ✅ folder-actions `move` → triggerSync | ✅ parentId, workspaceId in push | ✅ |

---

## Workspaces

| Feature | Frontend | Backend | Synced |
|--------|----------|---------|--------|
| Create workspace | ✅ workspace-actions `create` → triggerSync | ✅ Sync push: upsert workspace (name, isDefault) | ✅ |
| Rename workspace | ✅ workspace-actions `rename` → triggerSync | ✅ name in SyncWorkspaceItemDto | ✅ |
| Delete workspace | ✅ workspace-actions `delete` → triggerSync (deletedWorkspaceIds) | ✅ Push deletedWorkspaceIds → delete + SyncDeletionLog | ✅ |
| Switch workspace | ✅ Client-only (currentWorkspaceId); not synced by design | N/A | N/A |

---

## Sync

| Feature | Frontend | Backend | Synced |
|--------|----------|---------|--------|
| Full sync (pull → merge → push) | ✅ triggerFullSync on sign-in / refresh; pull with optional `since` | ✅ GET /sync (limit, cursor, since); pull paginated, deleted*Ids when since > 0 | ✅ |
| Delta push | ✅ triggerSync after note/folder/workspace actions + PiP saveContent; buildDeltaPayload | ✅ POST /sync: delta delete (deleted*Ids) or full-replace | ✅ |
| Pull with `since` (deletion log) | ✅ pullFromServer(lastPullAt); mergeIntoLocal; removeLocalKeysForDeletedIds | ✅ findDeletedSince(since); return deletedNoteIds, deletedFolderIds, deletedWorkspaceIds on first page | ✅ |
| Sync status | ✅ GET /sync/status, checkServerNewer, periodic pull check | ✅ getSyncStatus(userId) → lastUpdatedAt | ✅ |
| Pause sync | ✅ setSyncPaused (debug); no pull/push when paused | N/A | N/A |

---

## Local-only / No backend

| Feature | Frontend | Backend | Note |
|--------|----------|---------|------|
| Export notes (file) | ✅ dashboard-export | — | Local file export only |
| Import notes (file) | ✅ dashboard-import | — | Local file import only |
| Context menu "Add page to Notic" | ✅ Creates note in storage; hashchange + loadAllNotes so open tab sees it; triggerSync when signed in | — | Note is synced via normal push after creation |

---

## Explicitly excluded: Subscription

| Feature | Frontend | Backend | Note |
|--------|----------|---------|------|
| Subscription status | ✅ subscription.ts — debug toggle, FREE_NOTE_LIMIT, isOverFreeNoteQuota | ❌ No subscription API | Subscription is **not** implemented on backend; frontend uses debug flag and note limit for quota warning only. |

---

## Summary

- **Auth:** Sign in (Google), sign out, token refresh — implemented and wired in both sides.
- **Notes:** Create, edit content, rename, move (folder/workspace), soft delete, restore, permanent delete, empty trash, duplicate — all drive triggerSync and are reflected in sync push/pull (including content, displayName, folderId, workspaceId, deletedAt, deletedNoteIds).
- **Folders:** Create, rename, delete, move — all drive triggerSync; push/pull and deletedFolderIds.
- **Workspaces:** Create, rename, delete — all drive triggerSync; push/pull and deletedWorkspaceIds. Switch is client-only.
- **Sync:** Full sync, delta push, pull with `since` and deletion log, sync status, pause — implemented on both sides.
- **Subscription:** Frontend-only (debug + quota); **not** in scope for “conventional note features done and synced.”

**Conclusion:** Every conventional note feature listed above is implemented and synced in both frontend and backend, except subscription, which is intentionally frontend-only and not part of the sync contract.
