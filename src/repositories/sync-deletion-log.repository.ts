import { prisma } from '../prisma/client';
import type { TransactionClient } from './transaction.runner';
import { DeletedEntityType } from '../../prisma/generated/prisma/enums';

/** Insert one row per deleted clientId (for delta or full-replace push). */
export async function insertMany(
  userId: string,
  entityType: DeletedEntityType,
  clientIds: string[],
  tx?: TransactionClient,
): Promise<void> {
  if (clientIds.length === 0) return;
  const client = tx ?? prisma;
  const now = new Date();
  await client.syncDeletionLog.createMany({
    data: clientIds.map((clientId) => ({
      userId,
      entityType,
      clientId,
      deletedAt: now,
    })),
  });
}

export interface DeletedSinceResult {
  noteIds: string[];
  folderIds: string[];
  workspaceIds: string[];
}

/** Fetch clientIds deleted for this user after `since` (for pull response). */
export async function findDeletedSince(
  userId: string,
  since: Date,
): Promise<DeletedSinceResult> {
  const rows = await prisma.syncDeletionLog.findMany({
    where: {
      userId,
      deletedAt: { gt: since },
    },
    select: { entityType: true, clientId: true },
  });
  const noteIds: string[] = [];
  const folderIds: string[] = [];
  const workspaceIds: string[] = [];
  for (const row of rows) {
    if (row.entityType === DeletedEntityType.note) noteIds.push(row.clientId);
    else if (row.entityType === DeletedEntityType.folder) folderIds.push(row.clientId);
    else workspaceIds.push(row.clientId);
  }
  return { noteIds, folderIds, workspaceIds };
}
