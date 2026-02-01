import { describe, it, expect } from 'vitest';
import { toDate, chunk, encodeSyncCursor, decodeSyncCursor } from './helpers';

describe('toDate', () => {
  it('converts epoch ms to Date', () => {
    const ms = 1609459200000; // 2021-01-01 00:00:00 UTC
    const d = toDate(ms);
    expect(d).toBeInstanceOf(Date);
    expect(d.getTime()).toBe(ms);
  });

  it('handles 0 as epoch', () => {
    const d = toDate(0);
    expect(d.getTime()).toBe(0);
  });
});

describe('chunk', () => {
  it('splits array into chunks of given size', () => {
    const arr = [1, 2, 3, 4, 5];
    expect(chunk(arr, 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns single chunk when size >= length', () => {
    const arr = [1, 2, 3];
    expect(chunk(arr, 10)).toEqual([[1, 2, 3]]);
  });

  it('returns empty array for empty input', () => {
    expect(chunk([], 5)).toEqual([]);
  });

  it('preserves chunk size for exact multiples', () => {
    const arr = [1, 2, 3, 4, 5, 6];
    expect(chunk(arr, 2)).toEqual([[1, 2], [3, 4], [5, 6]]);
  });
});

describe('encodeSyncCursor / decodeSyncCursor', () => {
  it('round-trips cursor', () => {
    const cursor = { lastModified: 1700000000000, clientId: 'note-abc' };
    const encoded = encodeSyncCursor(cursor);
    expect(typeof encoded).toBe('string');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    const decoded = decodeSyncCursor(encoded);
    expect(decoded).toEqual(cursor);
  });

  it('returns null for invalid cursor', () => {
    expect(decodeSyncCursor('not-base64!!!')).toBeNull();
    expect(decodeSyncCursor('')).toBeNull();
  });

  it('returns null when decoded JSON lacks required fields', () => {
    const bad = Buffer.from(JSON.stringify({ foo: 1 }), 'utf8').toString('base64url');
    expect(decodeSyncCursor(bad)).toBeNull();
  });
});
