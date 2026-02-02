import { Injectable } from '@nestjs/common';
import { DeletedEntityType, SyncDirection } from '../../prisma/generated/prisma/enums';
import * as transactionRunner from '../repositories/transaction.runner';
import * as workspacesRepository from '../repositories/workspaces.repository';
import * as foldersRepository from '../repositories/folders.repository';
import * as notesRepository from '../repositories/notes.repository';
import * as syncLogRepository from '../repositories/sync-log.repository';
import * as syncDeletionLogRepository from '../repositories/sync-deletion-log.repository';
import type {
  SyncPushDto,
  SyncPullResponse,
  SyncStatusResponse,
} from './dto/sync.dto';
import { toDate, chunk, decodeSyncCursor } from '../util/helpers';

function toEpochMs(d: Date): number {
  return d.getTime();
}

const DEFAULT_WORKSPACE_CLIENT_ID = 'workspace_1';
const DEFAULT_WORKSPACE_NAME = 'Workspace 1';

/** Chunk size for parallel upserts; avoids exhausting connection pool on large syncs (e.g. long-time local user). */
const FOLDER_CHUNK_SIZE = 100;
const NOTE_CHUNK_SIZE = 100;

/** Pull pagination: default and max notes per page (consistent response shape). */
const DEFAULT_PULL_LIMIT = 1000;
const MAX_PULL_LIMIT = 5000;

@Injectable()
export class SyncService {
  /**
   * Pull a page of sync state. Always returns { notes, folders, workspaces, nextCursor? }.
   * First page (no cursor): notes (limit), full folders, full workspaces; optional deleted*Ids when since > 0; SyncLog created.
   * Next pages (cursor): notes (limit), empty folders/workspaces; no SyncLog.
   * @param since Epoch ms of client's last full sync (lastPullAt). When present and > 0 on first page, response includes deletedNoteIds, deletedFolderIds, deletedWorkspaceIds.
   */
  async pull(
    userId: string,
    limit: number = DEFAULT_PULL_LIMIT,
    cursor?: string,
    since?: number,
  ): Promise<SyncPullResponse> {
    const cappedLimit = Math.min(Math.max(1, limit), MAX_PULL_LIMIT);
    const decodedCursor =
      cursor != null && cursor !== '' ? decodeSyncCursor(cursor) : null;
    const isFirstPage = decodedCursor === null;

    try {
      if (isFirstPage) {
        const [notesResult, folders, workspaces, deletedSince] = await Promise.all([
          notesRepository.findNotesByUserIdPaginated(userId, cappedLimit),
          foldersRepository.findFoldersByUserId(userId),
          workspacesRepository.findWorkspacesByUserId(userId),
          since != null && since > 0
            ? syncDeletionLogRepository.findDeletedSince(userId, new Date(since))
            : Promise.resolve({ noteIds: [], folderIds: [], workspaceIds: [] }),
        ]);

        const response: SyncPullResponse = {
          notes: notesResult.notes.map((n) => {
            const row = n as { isBookmarked?: boolean };
            return {
              id: n.clientId,
              content: n.content,
              lastModified: toEpochMs(n.lastModified),
              createdAt: toEpochMs(n.createdAt),
              ...(n.displayName != null && { displayName: n.displayName }),
              ...(n.folderId != null && { folderId: n.folderId }),
              workspaceId: n.workspaceId,
              ...(n.deletedAt != null && { deletedAt: toEpochMs(n.deletedAt) }),
              ...(n.color != null && { color: n.color }),
              ...(row.isBookmarked != null && { isBookmarked: row.isBookmarked }),
              ...(n.shareCode != null && { shareCode: n.shareCode }),
            };
          }),
          folders: folders.map((f) => ({
            id: f.clientId,
            name: f.name,
            parentId: f.parentId ?? null,
            createdAt: toEpochMs(f.createdAt),
            ...(f.displayName != null && { displayName: f.displayName }),
            workspaceId: f.workspaceId,
            ...(f.color != null && { color: f.color }),
          })),
          workspaces: workspaces.map((w) => {
            const row = w as { updatedAt?: Date; color?: string | null; icon?: string | null };
            return {
              id: w.clientId,
              name: w.name,
              isDefault: w.isDefault,
              updatedAt: toEpochMs(row.updatedAt instanceof Date ? row.updatedAt : new Date()),
              ...(row.color != null && row.color !== '' && { color: row.color }),
              ...(row.icon != null && row.icon !== '' && { icon: row.icon }),
            };
          }),
          ...(notesResult.nextCursor != null && {
            nextCursor: notesResult.nextCursor,
          }),
          ...(deletedSince.noteIds.length > 0 && { deletedNoteIds: deletedSince.noteIds }),
          ...(deletedSince.folderIds.length > 0 && { deletedFolderIds: deletedSince.folderIds }),
          ...(deletedSince.workspaceIds.length > 0 && { deletedWorkspaceIds: deletedSince.workspaceIds }),
        };

        await syncLogRepository.createSyncLog(
          {
            userId,
            direction: SyncDirection.pull,
            succeeded: true,
            notesCount: response.notes.length,
            foldersCount: response.folders.length,
            workspacesCount: response.workspaces.length,
          },
          null,
        );

        return response;
      }

      const notesCursor = {
        lastModified: new Date(decodedCursor!.lastModified),
        clientId: decodedCursor!.clientId,
      };
      const notesResult = await notesRepository.findNotesByUserIdPaginated(
        userId,
        cappedLimit,
        notesCursor,
      );

      const response: SyncPullResponse = {
        notes: notesResult.notes.map((n) => {
          const row = n as { isBookmarked?: boolean };
          return {
            id: n.clientId,
            content: n.content,
            lastModified: toEpochMs(n.lastModified),
            createdAt: toEpochMs(n.createdAt),
            ...(n.displayName != null && { displayName: n.displayName }),
            ...(n.folderId != null && { folderId: n.folderId }),
            workspaceId: n.workspaceId,
            ...(n.deletedAt != null && { deletedAt: toEpochMs(n.deletedAt) }),
            ...(n.color != null && { color: n.color }),
            ...(row.isBookmarked != null && { isBookmarked: row.isBookmarked }),
            ...(n.shareCode != null && { shareCode: n.shareCode }),
          };
        }),
        folders: [],
        workspaces: [],
        ...(notesResult.nextCursor != null && {
          nextCursor: notesResult.nextCursor,
        }),
      };

      return response;
    } catch (err) {
      if (isFirstPage) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown pull error';
        await syncLogRepository.createSyncLog(
          {
            userId,
            direction: SyncDirection.pull,
            succeeded: false,
            errorMessage,
          },
          null,
        );
      }
      throw err;
    }
  }

  /**
   * Lightweight status for periodic "server newer?" check. Returns last sync activity time (any direction).
   */
  async getSyncStatus(userId: string): Promise<SyncStatusResponse> {
    const at = await syncLogRepository.getLastSyncActivityAt(userId);
    return {
      lastUpdatedAt: at ? toEpochMs(at) : 0,
    };
  }

  /**
   * Push full sync payload from the client. Upserts workspaces, folders, notes;
   * ensures at least one default workspace exists. Logs the sync (push, succeeded/counts).
   */
  async push(userId: string, dto: SyncPushDto): Promise<void> {
    const notesCount = dto.notes.length;
    const foldersCount = dto.folders.length;
    const payloadWorkspacesCount = dto.workspaces?.length ?? 0;
    const effectiveWorkspacesCount =
      payloadWorkspacesCount > 0 ? payloadWorkspacesCount : 1;

    try {
      await transactionRunner.runTransaction(async (tx) => {
        const workspaceList =
          payloadWorkspacesCount > 0
            ? dto.workspaces!
            : [
                {
                  id: DEFAULT_WORKSPACE_CLIENT_ID,
                  name: DEFAULT_WORKSPACE_NAME,
                  isDefault: true,
                },
              ];

        // Workspaces: typically few; run in parallel (no chunk).
        await Promise.all(
          workspaceList.map((w) =>
            workspacesRepository.upsertWorkspace(
              userId,
              {
                clientId: w.id,
                name: w.name,
                isDefault: w.isDefault,
                ...(w.color != null && { color: w.color }),
                ...(w.icon != null && { icon: w.icon }),
              },
              tx,
            ),
          ),
        );

        // Folders: chunk to avoid exhausting pool on large syncs (e.g. long-time local user).
        for (const folderChunk of chunk(dto.folders, FOLDER_CHUNK_SIZE)) {
          await Promise.all(
            folderChunk.map((f) =>
              foldersRepository.upsertFolder(
                userId,
                {
                  clientId: f.id,
                  name: f.name,
                  parentId: f.parentId ?? null,
                  createdAt: toDate(f.createdAt),
                  displayName: f.displayName,
                  workspaceId: f.workspaceId,
                },
                tx,
              ),
            ),
          );
        }

        // Notes: chunk for same reason (can be thousands after long local use).
        for (const noteChunk of chunk(dto.notes, NOTE_CHUNK_SIZE)) {
          await Promise.all(
            noteChunk.map((n) =>
              notesRepository.upsertNote(
                userId,
                {
                  clientId: n.id,
                  content: n.content,
                  lastModified: toDate(n.lastModified),
                  createdAt: toDate(n.createdAt),
                  displayName: n.displayName,
                  folderId: n.folderId,
                  workspaceId: n.workspaceId,
                  deletedAt:
                    n.deletedAt != null ? toDate(n.deletedAt) : null,
                  ...(n.color != null && { color: n.color }),
                  ...(n.isBookmarked != null && { isBookmarked: n.isBookmarked }),
                },
                tx,
              ),
            ),
          );
        }

        // Delta: if deleted*Ids present, delete only those. Else full-replace (delete items not in payload).
        const isDeltaDelete =
          dto.deletedNoteIds !== undefined ||
          dto.deletedFolderIds !== undefined ||
          dto.deletedWorkspaceIds !== undefined;

        if (isDeltaDelete) {
          const noteIds = dto.deletedNoteIds ?? [];
          const folderIds = dto.deletedFolderIds ?? [];
          const workspaceIds = dto.deletedWorkspaceIds ?? [];
          await notesRepository.deleteByUserIdAndClientIds(userId, noteIds, tx);
          await syncDeletionLogRepository.insertMany(userId, DeletedEntityType.note, noteIds, tx);
          await foldersRepository.deleteByUserIdAndClientIds(userId, folderIds, tx);
          await syncDeletionLogRepository.insertMany(userId, DeletedEntityType.folder, folderIds, tx);
          await workspacesRepository.deleteByUserIdAndClientIds(userId, workspaceIds, tx);
          await syncDeletionLogRepository.insertMany(userId, DeletedEntityType.workspace, workspaceIds, tx);
        } else {
          const noteClientIds = new Set(dto.notes.map((n) => n.id));
          const folderClientIds = new Set(dto.folders.map((f) => f.id));
          const workspaceClientIds = new Set(workspaceList.map((w) => w.id));
          const noteIdsToDelete = await notesRepository.findClientIdsByUserIdExcept(userId, noteClientIds, tx);
          await syncDeletionLogRepository.insertMany(userId, DeletedEntityType.note, noteIdsToDelete, tx);
          await notesRepository.deleteByUserIdExceptClientIds(userId, noteClientIds, tx);
          const folderIdsToDelete = await foldersRepository.findClientIdsByUserIdExcept(userId, folderClientIds, tx);
          await syncDeletionLogRepository.insertMany(userId, DeletedEntityType.folder, folderIdsToDelete, tx);
          await foldersRepository.deleteByUserIdExceptClientIds(userId, folderClientIds, tx);
          const workspaceIdsToDelete = await workspacesRepository.findClientIdsByUserIdExcept(userId, workspaceClientIds, tx);
          await syncDeletionLogRepository.insertMany(userId, DeletedEntityType.workspace, workspaceIdsToDelete, tx);
          await workspacesRepository.deleteByUserIdExceptClientIds(userId, workspaceClientIds, tx);
        }

        await syncLogRepository.createSyncLog(
          {
            userId,
            direction: SyncDirection.push,
            succeeded: true,
            notesCount,
            foldersCount,
            workspacesCount: effectiveWorkspacesCount,
          },
          tx,
        );
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown sync error';
      await syncLogRepository.createSyncLog(
        {
          userId,
          direction: SyncDirection.push,
          succeeded: false,
          errorMessage,
          notesCount,
          foldersCount,
          workspacesCount: effectiveWorkspacesCount,
        },
        null,
      );
      throw err;
    }
  }
}
