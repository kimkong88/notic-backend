# Audit: Extension storage partitioning by user ID

Audit of the user-partitioning change to ensure sync-related data is correctly scoped by user and to fix bugs found.

---

## Bugs found and fixed

### 1. **sync.ts – `buildPayload` used unpartitioned keys (critical)**

- **Issue:** There was a single `buildPayload(items)` that used `STORAGE_PREFIX_SESSION`, `WORKSPACES_KEY`, `metaKey(sessionId)`, `noteFolderKey(sessionId)` (unpartitioned). It was called as `buildPayload(filtered, partition)` but the second argument was ignored. Filtered keys look like `notic___local___session_xyz`, so `key.startsWith('notic_session_')` was false and no notes were read; `items[WORKSPACES_KEY]` was also wrong.
- **Fix:** Replaced `buildPayload` with a partition-aware version that takes `(items, partition)` and uses `partitionPrefix(partition)`, `sessionPrefix`/`folderMetaPrefix`, `metaKeyPartitioned`, `noteFolderKeyPartitioned`, `workspacesKey(partition)`.
- **Result:** `getLocalPayload()` and `triggerSync()` now build payload from the current partition’s keys.

### 2. **dashboard-pip.ts – loadContent used unpartitioned key**

- **Issue:** On `loadContent`, the dashboard sent `event.data.key` (PiP’s unpartitioned key, e.g. `notic_session_xyz`) to the background. Data is stored under partition-scoped keys (e.g. `notic___local___session_xyz`), so the background returned null and PiP saw empty content.
- **Fix:** In the `loadContent` handler we now call `getStoragePartition()`, then `sessionKeyPartitioned(partition, event.data.sessionId)` and pass that key to `chrome.runtime.sendMessage({ action: 'getStorage', key })`.
- **Result:** PiP loads content from the correct partition.

### 3. **dashboard.ts – storage.onChanged did not match partition-scoped keys**

- **Issue:** The listener used `key.startsWith('notic_session_')`. Partition-scoped keys are `notic_${partition}_session_*`, so they never matched and `loadAllNotes()` was not triggered on note changes from sync/merge.
- **Fix:** Switched to `key.includes('_session_')` so any note key (partition-scoped or legacy) triggers a reload.
- **Result:** Note changes in the current partition trigger a reload as intended.

---

## Intentional / acceptable behavior

### pip.ts – `getStorageKey(sessionId)` still unpartitioned

- PiP sends `notic_session_${sessionId}` in messages. The dashboard:
  - **loadContent:** Builds the partition-scoped key from `sessionId` and requests that from the background (fixed above).
  - **saveContent:** Derives `sessionId` from the key (with a fallback for the old format) and writes via partition-scoped keys.
- So PiP does not need to know the partition; the dashboard translates. No change in pip.ts required for correctness.

### storage-keys.ts – legacy constants kept

- `WORKSPACES_KEY`, `STORAGE_PREFIX_SESSION`, `metaKey`, etc. remain for non–sync code (e.g. comments, or any remaining non-partitioned usage). Sync data uses the partition-scoped helpers only.

---

## Verification

- **sync.test.ts:** All four tests pass (pullFromServer, mergeIntoLocal with partition-scoped keys, triggerFullSync flow, failure path).
- **Partition flow:** `getStoragePartition()` is used in sync, sync-change-log, workspace, dashboard-notes, dashboard-folders, dashboard-pip, dashboard, dashboard-toolbar, dashboard-import, background. No remaining sync reads/writes use unpartitioned keys for user data.
- **Auth:** `userId` is stored on authenticate and cleared with tokens on sign-out; partition is `userId` when signed in and `__local__` when not.

---

## Edge cases to keep in mind

1. **Existing unpartitioned data:** Old keys (`notic_workspaces`, `notic_session_*`, etc.) are no longer read for sync. Users who had data before partitioning will see an empty state for that partition until they re-sync or re-create data. Optional follow-up: one-time migration that copies unpartitioned keys into `__local__` (or current user) partition.
2. **PiP key format:** PiP still sends the old key in messages; the dashboard ignores it for getStorage and uses `sessionId` + partition. If PiP is ever given a partition (e.g. from dashboard at open), it could send partition-scoped keys for consistency.
3. **storage.onChanged:** Using `key.includes('_session_')` could in theory match unrelated keys that contain that substring; in practice only note session keys use it.

---

## Files changed in this audit

- `notic/src/sync.ts` – partition-aware `buildPayload(items, partition)`.
- `notic/src/dashboard-pip.ts` – loadContent uses partition-scoped key for getStorage.
- `notic/src/dashboard.ts` – onChanged matches partition-scoped note keys via `_session_`.
