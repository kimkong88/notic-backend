import { prisma } from '../prisma/client';
import type { TransactionClient } from './transaction.runner';

export interface UpsertWorkspaceInput {
  clientId: string;
  name: string;
  isDefault: boolean;
  color?: string;
  icon?: string;
}

/** Upsert workspace. Only updates when name, isDefault, color, or icon actually changed so updatedAt is not bumped on every sync push. */
export async function upsertWorkspace(
  userId: string,
  data: UpsertWorkspaceInput,
  tx?: TransactionClient,
): Promise<void> {
  const client = tx ?? prisma;
  const existing = await client.workspace.findUnique({
    where: { userId_clientId: { userId, clientId: data.clientId } },
    select: { id: true, name: true, isDefault: true, color: true, icon: true },
  });
  if (!existing) {
    await client.workspace.create({
      data: {
        userId,
        clientId: data.clientId,
        name: data.name,
        isDefault: data.isDefault,
        color: data.color ?? undefined,
        icon: data.icon ?? undefined,
      },
    });
    return;
  }
  const nameChanged = existing.name !== data.name;
  const isDefaultChanged = existing.isDefault !== data.isDefault;
  const colorChanged = (existing.color ?? null) !== (data.color ?? null);
  const iconChanged = (existing.icon ?? null) !== (data.icon ?? null);
  if (nameChanged || isDefaultChanged || colorChanged || iconChanged) {
    await client.workspace.update({
      where: { userId_clientId: { userId, clientId: data.clientId } },
      data: {
        name: data.name,
        isDefault: data.isDefault,
        color: data.color ?? undefined,
        icon: data.icon ?? undefined,
      },
    });
  }
}

/** Fetch all workspaces for user (for pull). Default first, then newest first by createdAt. */
export async function findWorkspacesByUserId(userId: string) {
  return prisma.workspace.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
}

/** Return clientIds that would be deleted by deleteByUserIdExceptClientIds (for logging before full-replace). */
export async function findClientIdsByUserIdExcept(
  userId: string,
  keepClientIds: Set<string>,
  tx?: TransactionClient,
): Promise<string[]> {
  const client = tx ?? prisma;
  const rows = await client.workspace.findMany({
    where: {
      userId,
      clientId: { notIn: Array.from(keepClientIds) },
    },
    select: { clientId: true },
  });
  return rows.map((r) => r.clientId);
}

/** Delta sync: delete workspaces for user whose clientId is in clientIds. */
export async function deleteByUserIdAndClientIds(
  userId: string,
  clientIds: string[],
  tx?: TransactionClient,
): Promise<number> {
  if (clientIds.length === 0) return 0;
  const client = tx ?? prisma;
  const result = await client.workspace.deleteMany({
    where: {
      userId,
      clientId: { in: clientIds },
    },
  });
  return result.count;
}

/** Delete workspaces for user whose clientId is not in keepClientIds (full-replace sync). Never remove the default workspace_1 if it is the only one. */
export async function deleteByUserIdExceptClientIds(
  userId: string,
  keepClientIds: Set<string>,
  tx?: TransactionClient,
): Promise<number> {
  const client = tx ?? prisma;
  const result = await client.workspace.deleteMany({
    where: {
      userId,
      clientId: { notIn: Array.from(keepClientIds) },
    },
  });
  return result.count;
}
