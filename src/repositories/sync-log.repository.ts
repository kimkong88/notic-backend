import { prisma } from '../prisma/client';
import { SyncDirection } from '../../prisma/generated/prisma/enums';
import type { TransactionClient } from './transaction.runner';

export interface CreateSyncLogInput {
  userId: string;
  direction: SyncDirection;
  succeeded: boolean;
  errorMessage?: string;
  notesCount?: number;
  foldersCount?: number;
  workspacesCount?: number;
}

export async function createSyncLog(
  data: CreateSyncLogInput,
  tx?: TransactionClient | null,
): Promise<void> {
  const client = tx ?? prisma;
  await client.syncLog.create({
    data: {
      userId: data.userId,
      direction: data.direction,
      succeeded: data.succeeded,
      errorMessage: data.errorMessage,
      notesCount: data.notesCount,
      foldersCount: data.foldersCount,
      workspacesCount: data.workspacesCount,
    },
  });
}

/** Most recent sync activity (any direction) for this user; used for periodic "server newer?" check. */
export async function getLastSyncActivityAt(userId: string): Promise<Date | null> {
  const row = await prisma.syncLog.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}
