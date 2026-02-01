import { Injectable } from '@nestjs/common';
import type {
  IBillingProvider,
  CreateCheckoutSessionOptions,
} from '../interfaces/billing-provider.interface';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://getnotic.io';

@Injectable()
export class LemonSqueezyProvider implements IBillingProvider {
  async createCheckoutSession(
    userId: string,
    options: CreateCheckoutSessionOptions,
  ): Promise<{ url: string }> {
    const successUrl = options.successUrl ?? `${FRONTEND_URL}/billing?checkout=success`;
    const cancelUrl = options.cancelUrl ?? `${FRONTEND_URL}/billing?checkout=canceled`;
    const priceKey = options.priceKey ?? 'yearly';

    // TODO: call Lemon Squeezy API to create checkout (variant from LEMONSQUEEZY_VARIANT_ID_MONTHLY / YEARLY)
    // Pass custom_data.user_id = userId for webhook. Return checkout url.
    const _ = { userId, successUrl, cancelUrl, priceKey };
    return {
      url: `${FRONTEND_URL}/billing?checkout=not_implemented`,
    };
  }

  async createPortalSession(userId: string, returnUrl?: string): Promise<{ url: string }> {
    const url = returnUrl ?? `${FRONTEND_URL}/billing`;
    // TODO: get customer id for userId from Subscription, call Lemon Squeezy API for customer portal link
    const _ = { userId, url };
    return {
      url: `${FRONTEND_URL}/billing?portal=not_implemented`,
    };
  }
}
