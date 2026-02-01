import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

vi.mock('../../prisma/generated/prisma/enums', () => ({
  SubscriptionStatus: {
    active: 'active',
    trial: 'trial',
    beta: 'beta',
    canceled: 'canceled',
    past_due: 'past_due',
    expired: 'expired',
  },
}));

import { BillingWebhookController } from './billing.webhook.controller';
import { SubscriptionEventHandler } from './handlers/subscription-event.handler';

const WEBHOOK_SECRET = 'test-webhook-secret';

function sign(secret: string, body: Buffer | string): string {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  return createHmac('sha256', secret).update(buf).digest('hex');
}

function mockRequest(opts: {
  rawBody?: Buffer;
  body?: unknown;
  signature?: string;
}): Request & { rawBody?: Buffer } {
  const rawBody = opts.rawBody ?? (opts.body != null ? Buffer.from(JSON.stringify(opts.body), 'utf8') : undefined);
  return {
    body: opts.body ?? (rawBody ? JSON.parse(rawBody.toString('utf8')) : undefined),
    headers: opts.signature != null ? { 'x-signature': opts.signature } : {},
    rawBody,
  } as Request & { rawBody?: Buffer };
}

vi.mock('../repositories/subscriptions.repository', () => ({
  findByBillingSubscriptionId: vi.fn(),
}));

describe('BillingWebhookController', () => {
  let controller: BillingWebhookController;
  let handler: { handle: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    handler = { handle: vi.fn().mockResolvedValue(undefined) };
    controller = new BillingWebhookController(handler as unknown as SubscriptionEventHandler);
  });

  afterEach(() => {
    delete process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  });

  describe('handleWebhook', () => {
    it('throws BadRequestException when signature is missing', async () => {
      const body = { meta: { event_name: 'subscription_created' } };
      const req = mockRequest({ rawBody: Buffer.from(JSON.stringify(body)), signature: undefined });

      await expect(controller.handleWebhook(req)).rejects.toThrow(BadRequestException);
      expect(handler.handle).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when body is missing', async () => {
      const req = mockRequest({ rawBody: undefined, body: undefined, signature: 'abc' });

      await expect(controller.handleWebhook(req)).rejects.toThrow(BadRequestException);
      expect(handler.handle).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when LEMONSQUEEZY_WEBHOOK_SECRET is not set', async () => {
      delete process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
      controller = new BillingWebhookController(handler as unknown as SubscriptionEventHandler);
      const body = { meta: { event_name: 'subscription_created' } };
      const raw = Buffer.from(JSON.stringify(body), 'utf8');
      const req = mockRequest({ rawBody: raw, signature: sign(WEBHOOK_SECRET, raw) });

      await expect(controller.handleWebhook(req)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when signature is invalid', async () => {
      const body = { meta: { event_name: 'subscription_created' } };
      const raw = Buffer.from(JSON.stringify(body), 'utf8');
      const req = mockRequest({ rawBody: raw, signature: 'wrong-signature' });

      await expect(controller.handleWebhook(req)).rejects.toThrow(UnauthorizedException);
      await expect(controller.handleWebhook(req)).rejects.toThrow('invalid_signature');
      expect(handler.handle).not.toHaveBeenCalled();
    });

    it('returns { received: true } and does not call handler for unknown event', async () => {
      const body = { meta: { event_name: 'order_created' }, data: {} };
      const raw = Buffer.from(JSON.stringify(body), 'utf8');
      const req = mockRequest({ rawBody: raw, signature: sign(WEBHOOK_SECRET, raw) });

      const result = await controller.handleWebhook(req);

      expect(result).toEqual({ received: true });
      expect(handler.handle).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when user_id is missing and subscription not found', async () => {
      const { findByBillingSubscriptionId } = await import('../repositories/subscriptions.repository');
      vi.mocked(findByBillingSubscriptionId).mockResolvedValue(null);

      const body = {
        meta: { event_name: 'subscription_created' },
        data: { id: 'sub-123', attributes: { status: 'active' } },
      };
      const raw = Buffer.from(JSON.stringify(body), 'utf8');
      const req = mockRequest({ rawBody: raw, signature: sign(WEBHOOK_SECRET, raw) });

      await expect(controller.handleWebhook(req)).rejects.toThrow(BadRequestException);
      expect(handler.handle).not.toHaveBeenCalled();
    });

    it('calls handler with subscription_activated when subscription_created and custom_data.user_id present', async () => {
      const body = {
        meta: {
          event_name: 'subscription_created',
          custom_data: { user_id: 'user-abc' },
        },
        data: {
          id: 'sub-1',
          attributes: {
            customer_id: 999,
            status: 'active',
            renews_at: '2025-02-01T00:00:00.000Z',
          },
        },
      };
      const raw = Buffer.from(JSON.stringify(body), 'utf8');
      const req = mockRequest({ rawBody: raw, signature: sign(WEBHOOK_SECRET, raw) });

      const result = await controller.handleWebhook(req);

      expect(result).toEqual({ received: true });
      expect(handler.handle).toHaveBeenCalledTimes(1);
      expect(handler.handle).toHaveBeenCalledWith({
        type: 'subscription_activated',
        userId: 'user-abc',
        data: {
          billingProvider: 'lemon_squeezy',
          billingCustomerId: '999',
          billingSubscriptionId: 'sub-1',
          status: 'active',
          expiredAt: new Date('2025-02-01T00:00:00.000Z'),
        },
      });
    });

    it('resolves userId from existing subscription when custom_data.user_id missing', async () => {
      const { findByBillingSubscriptionId } = await import('../repositories/subscriptions.repository');
      vi.mocked(findByBillingSubscriptionId).mockResolvedValue({
        id: 'our-sub-id',
        userId: 'user-from-db',
        billingSubscriptionId: 'sub-1',
      } as never);

      const body = {
        meta: { event_name: 'subscription_cancelled' },
        data: {
          id: 'sub-1',
          attributes: { status: 'cancelled', ends_at: '2025-03-01T00:00:00.000Z' },
        },
      };
      const raw = Buffer.from(JSON.stringify(body), 'utf8');
      const req = mockRequest({ rawBody: raw, signature: sign(WEBHOOK_SECRET, raw) });

      const result = await controller.handleWebhook(req);

      expect(result).toEqual({ received: true });
      expect(handler.handle).toHaveBeenCalledWith({
        type: 'subscription_canceled',
        userId: 'user-from-db',
        data: {
          billingSubscriptionId: 'sub-1',
          expiredAt: new Date('2025-03-01T00:00:00.000Z'),
        },
      });
    });

    it('calls handler with subscription_updated for subscription_updated event', async () => {
      const body = {
        meta: { event_name: 'subscription_updated', custom_data: { user_id: 'u2' } },
        data: {
          id: 'sub-2',
          attributes: {
            status: 'past_due',
            renews_at: '2025-04-01T00:00:00.000Z',
          },
        },
      };
      const raw = Buffer.from(JSON.stringify(body), 'utf8');
      const req = mockRequest({ rawBody: raw, signature: sign(WEBHOOK_SECRET, raw) });

      const result = await controller.handleWebhook(req);

      expect(result).toEqual({ received: true });
      expect(handler.handle).toHaveBeenCalledWith({
        type: 'subscription_updated',
        userId: 'u2',
        data: {
          billingSubscriptionId: 'sub-2',
          status: 'past_due',
          expiredAt: new Date('2025-04-01T00:00:00.000Z'),
        },
      });
    });

    it('calls handler with subscription_canceled for subscription_expired event', async () => {
      const body = {
        meta: { event_name: 'subscription_expired', custom_data: { userId: 'u3' } },
        data: {
          id: 'sub-3',
          attributes: { status: 'expired', ends_at: '2025-05-01T00:00:00.000Z' },
        },
      };
      const raw = Buffer.from(JSON.stringify(body), 'utf8');
      const req = mockRequest({ rawBody: raw, signature: sign(WEBHOOK_SECRET, raw) });

      const result = await controller.handleWebhook(req);

      expect(result).toEqual({ received: true });
      expect(handler.handle).toHaveBeenCalledWith({
        type: 'subscription_canceled',
        userId: 'u3',
        data: {
          billingSubscriptionId: 'sub-3',
          expiredAt: new Date('2025-05-01T00:00:00.000Z'),
        },
      });
    });
  });
});
