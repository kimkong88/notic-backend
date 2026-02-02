import { Inject, Injectable } from '@nestjs/common';
import type { IBillingProvider } from './interfaces/billing-provider.interface';
import { BILLING_PROVIDER } from './billing.constants';
import * as subscriptionsRepository from '../repositories/subscriptions.repository';

export interface BillingStatus {
  plan: 'free' | 'pro';
  status?: string;
  expiredAt?: Date | null;
}

@Injectable()
export class BillingService {
  constructor(
    @Inject(BILLING_PROVIDER) private readonly provider: IBillingProvider,
  ) {}

  async getStatus(userId: string): Promise<BillingStatus> {
    const sub = await subscriptionsRepository.getCurrentByUserId(userId);
    const hasAccess =
      sub != null &&
      (sub.expiredAt == null || new Date() < sub.expiredAt);
    return {
      plan: hasAccess ? 'pro' : 'free',
      status: sub?.status ?? undefined,
      expiredAt: sub?.expiredAt ?? undefined,
    };
  }

  async createCheckoutSession(
    userId: string,
    options: { successUrl?: string; cancelUrl?: string; priceKey?: 'monthly' | 'yearly' | 'trial' },
  ): Promise<{ url: string }> {
    return this.provider.createCheckoutSession(userId, options);
  }

  async createPortalSession(userId: string, returnUrl?: string): Promise<{ url: string }> {
    return this.provider.createPortalSession(userId, returnUrl);
  }
}
