import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

const BILLING_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes
const TOKEN_BYTES = 32;

interface StoredToken {
  userId: string;
  expiresAt: number;
}

@Injectable()
export class BillingLinkService {
  private readonly store = new Map<string, StoredToken>();

  /** Generate a short-lived one-time billing token for the given user. */
  generateBillingToken(userId: string): { billingToken: string; expiresAt: Date } {
    const token = randomBytes(TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + BILLING_TOKEN_TTL_MS);
    this.store.set(token, { userId, expiresAt: expiresAt.getTime() });
    return { billingToken: token, expiresAt };
  }

  /** Resolve billing token to userId and invalidate it (one-time use). Returns null if invalid or expired. */
  resolveAndConsumeBillingToken(token: string): string | null {
    const stored = this.store.get(token);
    if (!stored) return null;
    this.store.delete(token);
    if (Date.now() > stored.expiresAt) return null;
    return stored.userId;
  }
}
