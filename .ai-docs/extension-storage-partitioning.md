# Extension storage partitioning by user ID

All sync-related local data in the Notic extension is partitioned by user so that switching accounts does not mix or leak data.

## Mechanism

- **Partition**: Either the signed-in user's `userId` (from backend auth response) or `__local__` when not signed in.
- **Storage keys**: Sync-related keys include the partition, e.g. `notic_${partition}_workspaces`, `notic_${partition}_session_${sessionId}`.
- **Auth**: Backend returns `{ user, tokens, action }` on `POST /auth/authenticate`. The extension stores `user.id` in `notic_authUserId` and clears it on sign-out (with tokens).
- **Partition resolution**: `getStoragePartition()` (api-client) returns `getStoredUserId() ?? LOCAL_PARTITION`.

## Partition-scoped keys (storage-keys.ts)

- `workspacesKey(partition)`, `currentWorkspaceIdKey(partition)`, `workspacePrefsKey(partition)`
- `lastPullAtKey(partition)`, `syncChangeLogKey(partition)`
- `sessionKeyPartitioned(partition, sessionId)`, `metaKeyPartitioned(partition, sessionId)`, `noteFolderKeyPartitioned(partition, sessionId)`, `folderMetaKeyPartitioned(partition, folderId)`
- `partitionPrefix(partition)` for filtering `chrome.storage.local.get(null)` results

## Unpartitioned keys (global)

- Auth: `AUTH_ACCESS_TOKEN_KEY`, `AUTH_REFRESH_TOKEN_KEY`, `AUTH_USER_ID_KEY`, `AUTH_SIGNED_OUT_KEY`, `AUTH_LAST_PROFILE_KEY`
- UI/prefs: `SIDEBAR_COLLAPSED_KEY`, `NOTE_THEME_KEY`, layout, theme, etc.

## Files updated

- **storage-keys.ts**: Partition constant, `AUTH_USER_ID_KEY`, partition-scoped key builders.
- **api-client.ts**: Store/clear `userId` on auth, `getStoredUserId()`, `getStoragePartition()`.
- **sync.ts**, **sync-change-log.ts**: Use partition for workspaces, notes, folders, lastPullAt, sync log.
- **workspace.ts**: All workspace/currentWorkspaceId/prefs reads and writes use partition.
- **dashboard-notes.ts**, **dashboard-folders.ts**: Load/save notes and folders with partition.
- **dashboard.ts**, **dashboard-toolbar.ts**, **dashboard-pip.ts**, **dashboard-import.ts**, **background.ts**: Create/update/delete notes and folders with partition.

## Backend

Auth response must include `user.id` (already returns `user`; extension reads `data.user?.id`).
