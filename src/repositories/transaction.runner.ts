import { prisma } from '../prisma/client';

export type TransactionClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

/** Options for interactive transactions (e.g. timeout in ms; default 5000). */
export type TransactionOptions = {
  timeout?: number;
  maxWait?: number;
};

export async function runTransaction<T>(
  fn: (tx: TransactionClient) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  return prisma.$transaction(fn, options);
}
