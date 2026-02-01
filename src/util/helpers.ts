/**
 * Convert epoch milliseconds to Date (for Prisma DateTime from client timestamps).
 */
export function toDate(epochMs: number): Date {
  return new Date(epochMs);
}

/**
 * Split array into chunks of given size (e.g. for batched parallel work).
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/** Cursor payload for sync pull pagination (notes ordered by lastModified desc, clientId desc). */
export interface SyncPullCursor {
  lastModified: number;
  clientId: string;
}

/** Encode cursor for GET /sync pagination (URL-safe, opaque to client). */
export function encodeSyncCursor(cursor: SyncPullCursor): string {
  const json = JSON.stringify({
    lastModified: cursor.lastModified,
    clientId: cursor.clientId,
  });
  return Buffer.from(json, 'utf8').toString('base64url');
}

/** Decode cursor; returns null if invalid (caller may treat as first page). */
export function decodeSyncCursor(cursor: string): SyncPullCursor | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as { lastModified?: number; clientId?: string };
    if (
      typeof parsed?.lastModified !== 'number' ||
      typeof parsed?.clientId !== 'string'
    ) {
      return null;
    }
    return { lastModified: parsed.lastModified, clientId: parsed.clientId };
  } catch {
    return null;
  }
}
