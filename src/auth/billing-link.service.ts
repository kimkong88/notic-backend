import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { TokenType } from '../../prisma/generated/prisma/enums';
import * as tokensRepository from '../repositories/tokens.repository';

const BILLING_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes
const TOKEN_BYTES = 32;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://getnotic.io';

@Injectable()
export class BillingLinkService {
  /** Generate a short-lived one-time billing token and redirect URL for the given user. */
  async generateBillingToken(userId: string): Promise<{
    billingToken: string;
    expiresAt: Date;
    redirectUrl: string;
  }> {
    const token = randomBytes(TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + BILLING_TOKEN_TTL_MS);
    await tokensRepository.createToken(
      token,
      userId,
      expiresAt.getTime(),
      TokenType.billing,
    );
    const redirectUrl = `${FRONTEND_URL.replace(/\/$/, '')}/billing?token=${token}`;
    return {
      billingToken: token,
      expiresAt,
      redirectUrl,
    };
  }

  /** Resolve billing token to userId and invalidate it (one-time use). Returns null if invalid or expired. */
  async resolveAndConsumeBillingToken(token: string): Promise<string | null> {
    const row = await tokensRepository.findUnique(token, TokenType.billing);
    if (!row) return null;
    if (new Date() > row.expires) return null;
    await tokensRepository.deleteToken(token, TokenType.billing);
    return row.userId;
  }
}
