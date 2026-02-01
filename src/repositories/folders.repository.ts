import { prisma } from '../prisma/client';
import type { TransactionClient } from './transaction.runner';

export interface UpsertFolderInput {
  clientId: string;
  name: string;
  parentId: string | null;
  createdAt: Date;
  displayName?: string;
  workspaceId: string;
  color?: string;
}

export async function upsertFolder(
  userId: string,
  data: UpsertFolderInput,
  tx?: TransactionClient,
): Promise<void> {
  const client = tx ?? prisma;
  await client.folder.upsert({
    where: {
      userId_clientId: { userId, clientId: data.clientId },
    },
    create: {
      userId,
      clientId: data.clientId,
      name: data.name,
      parentId: data.parentId ?? undefined,
      createdAt: data.createdAt,
      displayName: data.displayName,
      workspaceId: data.workspaceId,
      color: data.color ?? undefined,
    },
    update: {
      name: data.name,
      parentId: data.parentId ?? undefined,
      createdAt: data.createdAt,
      displayName: data.displayName,
      workspaceId: data.workspaceId,
      color: data.color,
    },
  });
}

/** Fetch all folders for user (for pull). */
export async function findFoldersByUserId(userId: string) {
  return prisma.folder.findMany({
    where: { userId },
  });
}

/** Return clientIds that would be deleted by deleteByUserIdExceptClientIds (for logging before full-replace). */
export async function findClientIdsByUserIdExcept(
  userId: string,
  keepClientIds: Set<string>,
  tx?: TransactionClient,
): Promise<string[]> {
  const client = tx ?? prisma;
  const rows = await client.folder.findMany({
    where: {
      userId,
      clientId: { notIn: Array.from(keepClientIds) },
    },
    select: { clientId: true },
  });
  return rows.map((r) => r.clientId);
}

/** Delta sync: delete folders for user whose clientId is in clientIds. */
export async function deleteByUserIdAndClientIds(
  userId: string,
  clientIds: string[],
  tx?: TransactionClient,
): Promise<number> {
  if (clientIds.length === 0) return 0;
  const client = tx ?? prisma;
  const result = await client.folder.deleteMany({
    where: {
      userId,
      clientId: { in: clientIds },
    },
  });
  return result.count;
}

/** Delete folders for user whose clientId is not in keepClientIds (full-replace sync). */
export async function deleteByUserIdExceptClientIds(
  userId: string,
  keepClientIds: Set<string>,
  tx?: TransactionClient,
): Promise<number> {
  const client = tx ?? prisma;
  const result = await client.folder.deleteMany({
    where: {
      userId,
      clientId: { notIn: Array.from(keepClientIds) },
    },
  });
  return result.count;
}
