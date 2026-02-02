import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  IBillingProvider,
  CreateCheckoutSessionOptions,
} from '../interfaces/billing-provider.interface';
import * as subscriptionsRepository from '../../repositories/subscriptions.repository';

const LEMON_API = 'https://api.lemonsqueezy.com/v1';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://getnotic.io';

interface LemonCheckoutResponse {
  data?: {
    attributes?: {
      url?: string;
    };
  };
}

@Injectable()
export class LemonSqueezyProvider implements IBillingProvider {
  async createCheckoutSession(
    userId: string,
    options: CreateCheckoutSessionOptions,
  ): Promise<{ url: string }> {
    const apiKey = process.env.LEMONSQUEEZY_API_KEY;
    const storeId = process.env.LEMONSQUEEZY_STORE_ID;
    const variantIdMonthly = process.env.LEMONSQUEEZY_VARIANT_ID_MONTHLY;
    const variantIdYearly = process.env.LEMONSQUEEZY_VARIANT_ID_YEARLY;
    const variantIdTrial = process.env.LEMONSQUEEZY_VARIANT_ID_TRIAL;

    if (!apiKey || !storeId) {
      throw new BadRequestException(
        'LEMONSQUEEZY_API_KEY and LEMONSQUEEZY_STORE_ID are required for checkout',
      );
    }

    const successUrl =
      options.successUrl ?? `${FRONTEND_URL}/billing?checkout=success`;
    const cancelUrl =
      options.cancelUrl ?? `${FRONTEND_URL}/billing?checkout=canceled`;

    const priceKey = options.priceKey ?? 'yearly';
    const variantId =
      priceKey === 'trial'
        ? variantIdTrial ?? variantIdMonthly ?? variantIdYearly
        : priceKey === 'yearly'
          ? variantIdYearly ?? variantIdMonthly
          : variantIdMonthly ?? variantIdYearly;

    if (!variantId) {
      const required =
        priceKey === 'trial'
          ? 'LEMONSQUEEZY_VARIANT_ID_TRIAL (or MONTHLY/YEARLY)'
          : 'LEMONSQUEEZY_VARIANT_ID_MONTHLY or LEMONSQUEEZY_VARIANT_ID_YEARLY';
      throw new BadRequestException(`${required} is required`);
    }

    const testMode =
      process.env.LEMONSQUEEZY_TEST_MODE === 'true' ||
      process.env.LEMONSQUEEZY_TEST_MODE === '1';

    const body = {
      data: {
        type: 'checkouts',
        attributes: {
          product_options: {
            redirect_url: successUrl,
          },
          checkout_data: {
            custom: {
              user_id: userId,
            },
          },
          ...(testMode && { test_mode: true }),
        },
        relationships: {
          store: {
            data: {
              type: 'stores',
              id: String(storeId),
            },
          },
          variant: {
            data: {
              type: 'variants',
              id: String(variantId),
            },
          },
        },
      },
    };

    const res = await fetch(`${LEMON_API}/checkouts`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new BadRequestException(
        `Lemon Squeezy checkout failed: ${res.status} ${text.slice(0, 200)}`,
      );
    }

    const json = (await res.json()) as LemonCheckoutResponse;
    const url = json?.data?.attributes?.url;

    if (!url) {
      throw new BadRequestException(
        'Lemon Squeezy did not return a checkout URL',
      );
    }

    return { url };
  }

  async createPortalSession(userId: string, returnUrl?: string): Promise<{ url: string }> {
    const apiKey = process.env.LEMONSQUEEZY_API_KEY;
    if (!apiKey) {
      throw new BadRequestException(
        'LEMONSQUEEZY_API_KEY is required for customer portal',
      );
    }

    const sub = await subscriptionsRepository.getCurrentByUserId(userId);
    if (!sub?.billingSubscriptionId) {
      throw new BadRequestException(
        'No active subscription found. Upgrade to Pro first.',
      );
    }

    const res = await fetch(
      `${LEMON_API}/subscriptions/${encodeURIComponent(sub.billingSubscriptionId)}`,
      {
        headers: {
          Accept: 'application/vnd.api+json',
          'Content-Type': 'application/vnd.api+json',
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new BadRequestException(
        `Lemon Squeezy subscription fetch failed: ${res.status} ${text.slice(0, 200)}`,
      );
    }

    const json = (await res.json()) as {
      data?: { attributes?: { urls?: { customer_portal?: string } } };
    };
    const portalUrl = json?.data?.attributes?.urls?.customer_portal;

    if (!portalUrl) {
      throw new BadRequestException(
        'Lemon Squeezy did not return a customer portal URL',
      );
    }

    return { url: portalUrl };
  }
}
