import { prisma } from '../prisma/client';

export type TransactionClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

export async function runTransaction<T>(
  fn: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(fn);
}
