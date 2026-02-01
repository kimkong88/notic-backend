import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncService } from './sync.service';
import type { SyncPushDto } from './dto/sync.dto';

vi.mock('../../prisma/generated/prisma/enums', () => ({
  SyncDirection: { push: 'push', pull: 'pull' },
  DeletedEntityType: { note: 'note', folder: 'folder', workspace: 'workspace' },
}));

const fakeTx = {} as unknown;

vi.mock('../repositories/transaction.runner', () => ({
  runTransaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx)),
}));

vi.mock('../repositories/workspaces.repository', () => ({
  upsertWorkspace: vi.fn(() => Promise.resolve()),
  deleteByUserIdExceptClientIds: vi.fn(() => Promise.resolve(0)),
  deleteByUserIdAndClientIds: vi.fn(() => Promise.resolve(0)),
  findClientIdsByUserIdExcept: vi.fn(() => Promise.resolve([])),
  findWorkspacesByUserId: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../repositories/folders.repository', () => ({
  upsertFolder: vi.fn(() => Promise.resolve()),
  deleteByUserIdExceptClientIds: vi.fn(() => Promise.resolve(0)),
  deleteByUserIdAndClientIds: vi.fn(() => Promise.resolve(0)),
  findClientIdsByUserIdExcept: vi.fn(() => Promise.resolve([])),
  findFoldersByUserId: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../repositories/notes.repository', () => ({
  upsertNote: vi.fn(() => Promise.resolve()),
  deleteByUserIdExceptClientIds: vi.fn(() => Promise.resolve(0)),
  deleteByUserIdAndClientIds: vi.fn(() => Promise.resolve(0)),
  findClientIdsByUserIdExcept: vi.fn(() => Promise.resolve([])),
  findNotesByUserIdPaginated: vi.fn(() =>
    Promise.resolve({ notes: [], nextCursor: null }),
  ),
}));

vi.mock('../repositories/sync-log.repository', () => ({
  createSyncLog: vi.fn(() => Promise.resolve()),
}));

vi.mock('../repositories/sync-deletion-log.repository', () => ({
  insertMany: vi.fn(() => Promise.resolve()),
  findDeletedSince: vi.fn(() =>
    Promise.resolve({ noteIds: [], folderIds: [], workspaceIds: [] }),
  ),
}));

describe('SyncService', () => {
  let service: SyncService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new SyncService();
  });

  describe('push', () => {
    const userId = 'user-1';

    it('runs inside a transaction', async () => {
      const { runTransaction } = await import(
        '../repositories/transaction.runner'
      );
      const dto: SyncPushDto = { notes: [], folders: [], workspaces: [] };
      await service.push(userId, dto);
      expect(runTransaction).toHaveBeenCalledTimes(1);
      expect(runTransaction).toHaveBeenCalledWith(expect.any(Function));
    });

    it('uses default workspace when workspaces is empty', async () => {
      const { upsertWorkspace } = await import(
        '../repositories/workspaces.repository'
      );
      const dto: SyncPushDto = { notes: [], folders: [], workspaces: [] };
      await service.push(userId, dto);
      expect(upsertWorkspace).toHaveBeenCalledWith(
        userId,
        {
          clientId: 'workspace_1',
          name: 'Workspace 1',
          isDefault: true,
        },
        fakeTx,
      );
    });

    it('uses payload workspaces when provided', async () => {
      const { upsertWorkspace } = await import(
        '../repositories/workspaces.repository'
      );
      const dto: SyncPushDto = {
        notes: [],
        folders: [],
        workspaces: [
          { id: 'ws-1', name: 'My Workspace', isDefault: true },
        ],
      };
      await service.push(userId, dto);
      expect(upsertWorkspace).toHaveBeenCalledWith(
        userId,
        { clientId: 'ws-1', name: 'My Workspace', isDefault: true },
        fakeTx,
      );
    });

    it('maps folder DTO to repo input with toDate and parentId', async () => {
      const { upsertFolder } = await import(
        '../repositories/folders.repository'
      );
      const createdAt = 1700000000000;
      const dto: SyncPushDto = {
        notes: [],
        folders: [
          {
            id: 'f1',
            name: 'Folder',
            parentId: null,
            createdAt,
            workspaceId: 'ws-1',
          },
        ],
        workspaces: [],
      };
      await service.push(userId, dto);
      expect(upsertFolder).toHaveBeenCalledWith(
        userId,
        {
          clientId: 'f1',
          name: 'Folder',
          parentId: null,
          createdAt: new Date(createdAt),
          displayName: undefined,
          workspaceId: 'ws-1',
        },
        fakeTx,
      );
    });

    it('maps note DTO to repo input including deletedAt', async () => {
      const { upsertNote } = await import('../repositories/notes.repository');
      const lastModified = 1700000001000;
      const createdAt = 1700000000000;
      const deletedAt = 1700000002000;
      const dto: SyncPushDto = {
        notes: [
          {
            id: 'n1',
            content: 'hi',
            lastModified,
            createdAt,
            folderId: 'f1',
            workspaceId: 'ws-1',
            deletedAt,
          },
        ],
        folders: [],
        workspaces: [],
      };
      await service.push(userId, dto);
      expect(upsertNote).toHaveBeenCalledWith(
        userId,
        {
          clientId: 'n1',
          content: 'hi',
          lastModified: new Date(lastModified),
          createdAt: new Date(createdAt),
          displayName: undefined,
          folderId: 'f1',
          workspaceId: 'ws-1',
          deletedAt: new Date(deletedAt),
        },
        fakeTx,
      );
    });

    it('creates SyncLog with succeeded true and counts', async () => {
      const { createSyncLog } = await import(
        '../repositories/sync-log.repository'
      );
      const dto: SyncPushDto = {
        notes: [{ id: 'n1', content: '', lastModified: 0, createdAt: 0, workspaceId: 'ws-1' }],
        folders: [{ id: 'f1', name: 'F', parentId: null, createdAt: 0, workspaceId: 'ws-1' }],
        workspaces: [],
      };
      await service.push(userId, dto);
      expect(createSyncLog).toHaveBeenCalledWith(
        {
          userId,
          direction: 'push',
          succeeded: true,
          notesCount: 1,
          foldersCount: 1,
          workspacesCount: 1,
        },
        fakeTx,
      );
    });

    it('on error creates SyncLog with succeeded false and rethrows', async () => {
      const { runTransaction } = await import(
        '../repositories/transaction.runner'
      );
      const { createSyncLog } = await import(
        '../repositories/sync-log.repository'
      );
      vi.mocked(runTransaction).mockRejectedValueOnce(new Error('db error'));
      const dto: SyncPushDto = { notes: [], folders: [], workspaces: [] };
      await expect(service.push(userId, dto)).rejects.toThrow('db error');
      expect(createSyncLog).toHaveBeenCalledWith(
        {
          userId,
          direction: 'push',
          succeeded: false,
          errorMessage: 'db error',
          notesCount: 0,
          foldersCount: 0,
          workspacesCount: 1,
        },
        null,
      );
    });

    it('chunks notes (e.g. 250 notes -> 3 batches)', async () => {
      const { upsertNote } = await import('../repositories/notes.repository');
      const notes = Array.from({ length: 250 }, (_, i) => ({
        id: `n-${i}`,
        content: '',
        lastModified: 0,
        createdAt: 0,
        workspaceId: 'ws-1',
      }));
      const dto: SyncPushDto = { notes, folders: [], workspaces: [] };
      await service.push(userId, dto);
      expect(upsertNote).toHaveBeenCalledTimes(250);
      // First and last call args
      expect(upsertNote).toHaveBeenNthCalledWith(
        1,
        userId,
        expect.objectContaining({ clientId: 'n-0' }),
        fakeTx,
      );
      expect(upsertNote).toHaveBeenNthCalledWith(
        250,
        userId,
        expect.objectContaining({ clientId: 'n-249' }),
        fakeTx,
      );
    });

    it('chunks folders (e.g. 150 folders)', async () => {
      const { upsertFolder } = await import(
        '../repositories/folders.repository'
      );
      const folders = Array.from({ length: 150 }, (_, i) => ({
        id: `f-${i}`,
        name: `Folder ${i}`,
        parentId: null,
        createdAt: 0,
        workspaceId: 'ws-1',
      }));
      const dto: SyncPushDto = { notes: [], folders, workspaces: [] };
      await service.push(userId, dto);
      expect(upsertFolder).toHaveBeenCalledTimes(150);
    });

    it('delta delete: when deletedNoteIds present, calls deleteByUserIdAndClientIds and logs to SyncDeletionLog', async () => {
      const notesRepo = await import('../repositories/notes.repository');
      const syncDeletionLogRepo = await import(
        '../repositories/sync-deletion-log.repository'
      );
      const dto: SyncPushDto = {
        notes: [],
        folders: [],
        workspaces: [],
        deletedNoteIds: ['n1', 'n2'],
      };
      await service.push(userId, dto);
      expect(notesRepo.deleteByUserIdAndClientIds).toHaveBeenCalledWith(
        userId,
        ['n1', 'n2'],
        fakeTx,
      );
      expect(syncDeletionLogRepo.insertMany).toHaveBeenCalledWith(
        userId,
        'note',
        ['n1', 'n2'],
        fakeTx,
      );
      expect(notesRepo.deleteByUserIdExceptClientIds).not.toHaveBeenCalled();
    });

    it('full replace: when deletedNoteIds absent, calls deleteByUserIdExceptClientIds', async () => {
      const notesRepo = await import('../repositories/notes.repository');
      const dto: SyncPushDto = {
        notes: [{ id: 'n1', content: '', lastModified: 0, createdAt: 0, workspaceId: 'ws-1' }],
        folders: [],
        workspaces: [],
      };
      await service.push(userId, dto);
      expect(notesRepo.deleteByUserIdExceptClientIds).toHaveBeenCalledWith(
        userId,
        expect.any(Set),
        fakeTx,
      );
    });
  });

  describe('pull', () => {
    const userId = 'user-1';

    it('when since > 0 on first page, calls findDeletedSince and includes deletedNoteIds in response', async () => {
      const syncDeletionLogRepo = await import(
        '../repositories/sync-deletion-log.repository'
      );
      vi.mocked(syncDeletionLogRepo.findDeletedSince).mockResolvedValue({
        noteIds: ['n1', 'n2'],
        folderIds: ['f1'],
        workspaceIds: [],
      });

      const result = await service.pull(userId, 100, undefined, 1700000000000);

      expect(syncDeletionLogRepo.findDeletedSince).toHaveBeenCalledWith(
        userId,
        expect.any(Date),
      );
      expect((syncDeletionLogRepo.findDeletedSince as ReturnType<typeof vi.fn>).mock.calls[0][1].getTime()).toBe(1700000000000);
      expect(result.deletedNoteIds).toEqual(['n1', 'n2']);
      expect(result.deletedFolderIds).toEqual(['f1']);
      expect(result.deletedWorkspaceIds).toBeUndefined();
    });

    it('when since is omitted, does not include deletedNoteIds in response', async () => {
      const syncDeletionLogRepo = await import(
        '../repositories/sync-deletion-log.repository'
      );

      await service.pull(userId, 100);

      expect(syncDeletionLogRepo.findDeletedSince).not.toHaveBeenCalled();
    });
  });
});
