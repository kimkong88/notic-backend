import { Injectable } from '@nestjs/common';
import { SubscriptionStatus } from '../../../prisma/generated/prisma/enums';
import * as subscriptionsRepository from '../../repositories/subscriptions.repository';

export type CanonicalSubscriptionEvent =
  | { type: 'subscription_activated'; userId: string; data: SubscriptionActivatedData }
  | { type: 'subscription_updated'; userId: string; data: SubscriptionUpdatedData }
  | { type: 'subscription_canceled'; userId: string; data: SubscriptionCanceledData };

export interface SubscriptionActivatedData {
  billingProvider: string;
  billingCustomerId?: string | null;
  billingSubscriptionId?: string | null;
  status: SubscriptionStatus;
  expiredAt: Date | null;
}

export interface SubscriptionUpdatedData {
  billingSubscriptionId?: string | null;
  status?: SubscriptionStatus;
  expiredAt?: Date | null;
}

export interface SubscriptionCanceledData {
  billingSubscriptionId?: string | null;
  expiredAt?: Date | null;
}

@Injectable()
export class SubscriptionEventHandler {
  async handle(event: CanonicalSubscriptionEvent): Promise<void> {
    switch (event.type) {
      case 'subscription_activated':
        await this.handleActivated(event.userId, event.data);
        break;
      case 'subscription_updated':
        await this.handleUpdated(event.userId, event.data);
        break;
      case 'subscription_canceled':
        await this.handleCanceled(event.userId, event.data);
        break;
    }
  }

  private async handleActivated(userId: string, data: SubscriptionActivatedData): Promise<void> {
    await subscriptionsRepository.create({
      user: { connect: { id: userId } },
      billingProvider: data.billingProvider,
      billingCustomerId: data.billingCustomerId ?? undefined,
      billingSubscriptionId: data.billingSubscriptionId ?? undefined,
      status: data.status,
      expiredAt: data.expiredAt ?? undefined,
    });
  }

  private async handleUpdated(userId: string, data: SubscriptionUpdatedData): Promise<void> {
    if (data.billingSubscriptionId) {
      const sub = await subscriptionsRepository.findByBillingSubscriptionId(data.billingSubscriptionId);
      if (sub && sub.userId === userId) {
        await subscriptionsRepository.update(sub.id, {
          ...(data.status != null && { status: data.status }),
          ...(data.expiredAt !== undefined && { expiredAt: data.expiredAt }),
        });
      }
    } else {
      const current = await subscriptionsRepository.getCurrentByUserId(userId);
      if (current) {
        await subscriptionsRepository.update(current.id, {
          ...(data.status != null && { status: data.status }),
          ...(data.expiredAt !== undefined && { expiredAt: data.expiredAt }),
        });
      }
    }
  }

  private async handleCanceled(userId: string, data: SubscriptionCanceledData): Promise<void> {
    if (data.billingSubscriptionId) {
      await subscriptionsRepository.updateByBillingSubscriptionId(data.billingSubscriptionId, {
        status: SubscriptionStatus.canceled,
        ...(data.expiredAt !== undefined && { expiredAt: data.expiredAt }),
      });
    } else {
      const current = await subscriptionsRepository.getCurrentByUserId(userId);
      if (current) {
        await subscriptionsRepository.update(current.id, {
          status: SubscriptionStatus.canceled,
          ...(data.expiredAt !== undefined && { expiredAt: data.expiredAt }),
        });
      }
    }
  }
}
