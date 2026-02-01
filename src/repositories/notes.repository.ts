import { prisma } from '../prisma/client';
import type { TransactionClient } from './transaction.runner';
import { encodeSyncCursor } from '../util/helpers';

export interface UpsertNoteInput {
  clientId: string;
  content: string;
  lastModified: Date;
  createdAt: Date;
  displayName?: string;
  folderId?: string;
  workspaceId: string;
  deletedAt: Date | null;
  color?: string;
  isBookmarked?: boolean;
}

export async function upsertNote(
  userId: string,
  data: UpsertNoteInput,
  tx?: TransactionClient,
): Promise<void> {
  const client = tx ?? prisma;
  await client.note.upsert({
    where: {
      userId_clientId: { userId, clientId: data.clientId },
    },
    create: {
      userId,
      clientId: data.clientId,
      content: data.content,
      lastModified: data.lastModified,
      createdAt: data.createdAt,
      displayName: data.displayName,
      folderId: data.folderId,
      workspaceId: data.workspaceId,
      deletedAt: data.deletedAt ?? undefined,
      color: data.color ?? undefined,
      isBookmarked: data.isBookmarked ?? false,
    },
    update: {
      content: data.content,
      lastModified: data.lastModified,
      createdAt: data.createdAt,
      displayName: data.displayName,
      folderId: data.folderId,
      workspaceId: data.workspaceId,
      deletedAt: data.deletedAt,
      color: data.color,
      isBookmarked: data.isBookmarked,
    },
  });
}

/** Cursor for paginated notes (order: lastModified desc, clientId desc). */
export interface NotesCursor {
  lastModified: Date;
  clientId: string;
}

/**
 * Fetch a page of notes for user, ordered by lastModified desc, clientId desc.
 * Returns nextCursor (opaque string) when there are more notes.
 */
export async function findNotesByUserIdPaginated(
  userId: string,
  limit: number,
  cursor?: NotesCursor,
): Promise<{ notes: Awaited<ReturnType<typeof prisma.note.findMany>>; nextCursor: string | null }> {
  const take = limit + 1;
  const orderBy = [{ lastModified: 'desc' as const }, { clientId: 'desc' as const }];
  const where = cursor
    ? {
        userId,
        OR: [
          { lastModified: { lt: cursor.lastModified } },
          {
            lastModified: cursor.lastModified,
            clientId: { lt: cursor.clientId },
          },
        ],
      }
    : { userId };

  const notes = await prisma.note.findMany({
    where,
    orderBy,
    take,
  });

  const hasMore = notes.length > limit;
  const page = hasMore ? notes.slice(0, limit) : notes;
  const last = hasMore ? notes[limit - 1] : null;
  const nextCursor =
    last && hasMore
      ? encodeSyncCursor({
          lastModified: last.lastModified.getTime(),
          clientId: last.clientId,
        })
      : null;

  return { notes: page, nextCursor };
}

/** Return clientIds that would be deleted by deleteByUserIdExceptClientIds (for logging before full-replace). */
export async function findClientIdsByUserIdExcept(
  userId: string,
  keepClientIds: Set<string>,
  tx?: TransactionClient,
): Promise<string[]> {
  const client = tx ?? prisma;
  const rows = await client.note.findMany({
    where: {
      userId,
      clientId: { notIn: Array.from(keepClientIds) },
    },
    select: { clientId: true },
  });
  return rows.map((r) => r.clientId);
}

/** Delta sync: delete notes for user whose clientId is in clientIds. */
export async function deleteByUserIdAndClientIds(
  userId: string,
  clientIds: string[],
  tx?: TransactionClient,
): Promise<number> {
  if (clientIds.length === 0) return 0;
  const client = tx ?? prisma;
  const result = await client.note.deleteMany({
    where: {
      userId,
      clientId: { in: clientIds },
    },
  });
  return result.count;
}

/** Delete notes for user whose clientId is not in keepClientIds (full-replace sync: permanently remove server-side notes no longer in payload). */
export async function deleteByUserIdExceptClientIds(
  userId: string,
  keepClientIds: Set<string>,
  tx?: TransactionClient,
): Promise<number> {
  const client = tx ?? prisma;
  const result = await client.note.deleteMany({
    where: {
      userId,
      clientId: { notIn: Array.from(keepClientIds) },
    },
  });
  return result.count;
}
