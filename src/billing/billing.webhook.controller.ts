import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Request } from 'express';
import { SubscriptionStatus } from '../../prisma/generated/prisma/enums';
import type { CanonicalSubscriptionEvent } from './handlers/subscription-event.handler';
import { SubscriptionEventHandler } from './handlers/subscription-event.handler';
import * as subscriptionsRepository from '../repositories/subscriptions.repository';

/** Lemon Squeezy webhook payload (subscription events). */
interface LemonSqueezyWebhookPayload {
  meta?: {
    event_name?: string;
    custom_data?: Record<string, string>;
  };
  data?: {
    type?: string;
    id?: string;
    attributes?: {
      customer_id?: number;
      status?: string;
      trial_ends_at?: string | null;
      renews_at?: string | null;
      ends_at?: string | null;
    };
  };
}

const LEMON_SUBSCRIPTION_EVENTS = [
  'subscription_created',
  'subscription_updated',
  'subscription_cancelled',
  'subscription_resumed',
  'subscription_expired',
] as const;

/** Map Lemon Squeezy status to our SubscriptionStatus. */
function mapLemonStatusToOurs(lem: string): SubscriptionStatus {
  switch (lem) {
    case 'on_trial':
      return SubscriptionStatus.trial;
    case 'active':
      return SubscriptionStatus.active;
    case 'paused':
      return SubscriptionStatus.active;
    case 'past_due':
      return SubscriptionStatus.past_due;
    case 'unpaid':
      return SubscriptionStatus.past_due;
    case 'cancelled':
      return SubscriptionStatus.canceled;
    case 'expired':
      return SubscriptionStatus.expired;
    default:
      return SubscriptionStatus.active;
  }
}

/** Compute expiredAt from Lemon Squeezy subscription attributes. */
function computeExpiredAt(attrs: {
  trial_ends_at?: string | null;
  renews_at?: string | null;
  ends_at?: string | null;
} | null | undefined): Date | null {
  if (!attrs) return null;
  const raw = attrs.ends_at ?? attrs.trial_ends_at ?? attrs.renews_at ?? null;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** No JWT. Verify signature with provider secret; map provider events to canonical events; call SubscriptionEventHandler. */
@Controller('billing')
export class BillingWebhookController {
  constructor(private readonly subscriptionEventHandler: SubscriptionEventHandler) {}

  @Post('webhook')
  async handleWebhook(@Req() req: Request): Promise<{ received: boolean }> {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody ?? req.body;
    const signature = req.headers['x-signature'] as string | undefined;

    if (!signature || !rawBody) {
      throw new BadRequestException('missing_signature_or_body');
    }

    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (!secret) {
      throw new UnauthorizedException('webhook_secret_not_configured');
    }

    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(JSON.stringify(rawBody));
    const hmac = createHmac('sha256', secret);
    const digest = Buffer.from(hmac.update(bodyBuffer).digest('hex'), 'utf8');
    const receivedSig = Buffer.from(signature, 'utf8');
    if (digest.length !== receivedSig.length || !timingSafeEqual(digest, receivedSig)) {
      throw new UnauthorizedException('invalid_signature');
    }

    const payload = (Buffer.isBuffer(rawBody) ? JSON.parse(rawBody.toString('utf8')) : req.body) as LemonSqueezyWebhookPayload;
    const eventName = payload?.meta?.event_name;
    if (!eventName || !LEMON_SUBSCRIPTION_EVENTS.includes(eventName as (typeof LEMON_SUBSCRIPTION_EVENTS)[number])) {
      return { received: true };
    }

    const data = payload?.data;
    const attrs = data?.attributes;
    const subscriptionId = data?.id ? String(data.id) : undefined;
    const customerId = attrs?.customer_id != null ? String(attrs.customer_id) : undefined;
    const status = attrs?.status ? mapLemonStatusToOurs(attrs.status) : undefined;
    const expiredAt = computeExpiredAt(attrs);

    const customData = payload?.meta?.custom_data ?? {};
    const userIdFromCustom = customData['user_id'] ?? customData['userId'];

    let userId: string | undefined = userIdFromCustom;
    if (!userId && subscriptionId) {
      const existing = await subscriptionsRepository.findByBillingSubscriptionId(subscriptionId);
      if (existing) userId = existing.userId;
    }

    if (!userId) {
      throw new BadRequestException('user_id_required');
    }

    let canonical: CanonicalSubscriptionEvent;

    if (eventName === 'subscription_created') {
      canonical = {
        type: 'subscription_activated',
        userId,
        data: {
          billingProvider: 'lemon_squeezy',
          billingCustomerId: customerId ?? null,
          billingSubscriptionId: subscriptionId ?? null,
          status: status ?? SubscriptionStatus.active,
          expiredAt,
        },
      };
    } else if (eventName === 'subscription_updated' || eventName === 'subscription_resumed') {
      canonical = {
        type: 'subscription_updated',
        userId,
        data: {
          billingSubscriptionId: subscriptionId ?? null,
          status: status ?? undefined,
          expiredAt: expiredAt ?? undefined,
        },
      };
    } else if (eventName === 'subscription_cancelled' || eventName === 'subscription_expired') {
      canonical = {
        type: 'subscription_canceled',
        userId,
        data: {
          billingSubscriptionId: subscriptionId ?? null,
          expiredAt: expiredAt ?? undefined,
        },
      };
    } else {
      return { received: true };
    }

    await this.subscriptionEventHandler.handle(canonical);
    return { received: true };
  }
}
