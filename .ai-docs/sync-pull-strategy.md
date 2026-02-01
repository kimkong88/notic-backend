# Sync pull strategy (GET /sync)

Pull is for "restore from server" or full sync (pull + merge + targeted push): client requests full state from the backend. **Implemented**: GET /sync is **always paginated** so the extension never has to handle inconsistent response shapes.

## Contract

- **Endpoint**: `GET /sync` (auth required: `Authorization: Bearer <access_token>`).
- **Query**: `limit` (optional, default 1000, max 5000 notes per page), `cursor` (optional, opaque string from previous `nextCursor`).
- **Response**: Same shape every page: `{ notes, folders, workspaces, nextCursor? }`. First page (no cursor): notes (up to limit), full folders, full workspaces; SyncLog created. Next pages (with cursor): notes (up to limit), empty folders/workspaces; no SyncLog. Client loops until `nextCursor` is absent.

## Shape (align with push payload)

- **notes**: `Array<{ id, content, lastModified, createdAt, displayName?, folderId?, workspaceId, deletedAt? }>` — `id` = clientId; timestamps as epoch ms for the extension.
- **folders**: `Array<{ id, name, parentId, createdAt, displayName?, workspaceId }>`.
- **workspaces**: `Array<{ id, name, isDefault }>`.

Backend stores `DateTime`; convert to epoch ms when returning (e.g. `date.getTime()`).

## Ordering

- Return notes ordered by `lastModified` desc (or `createdAt`) so the client can show "recent first" without re-sorting.
- Folders can be returned in any order; client builds tree from `parentId`.
- Workspaces: any order.

## Scope

- Return only data for the authenticated user (from JWT). Filter by `userId` on Note, Folder, Workspace.

## SyncLog

- After a successful pull response, create a SyncLog row: `direction: pull`, `succeeded: true`, and optional counts (`notesCount`, `foldersCount`, `workspacesCount`) for support/debugging.

## Implementation outline

1. **Repos**: Add `findNotesByUserId`, `findFoldersByUserId`, `findWorkspacesByUserId` (or a single "get sync state" that returns all three).
2. **SyncService**: Add `pull(userId)` that fetches notes, folders, workspaces, maps to the response shape (DateTime → epoch ms), creates SyncLog (pull, success, counts), returns payload.
3. **SyncController**: Add `GET /sync` with `@UseGuards(AuthGuard)` and `@UserContext()`, call `syncService.pull(userContext.user.id)`, return JSON.

## Optional: incremental pull later

- Add `If-None-Match: <syncLogId>` or `?after=<syncLogId>` and return 304 or only changes after that sync; requires storing "generation" or "last sync id" per user. Defer until needed.
