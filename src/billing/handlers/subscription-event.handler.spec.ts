import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionEventHandler } from './subscription-event.handler';

vi.mock('../../../prisma/generated/prisma/enums', () => ({
  SubscriptionStatus: {
    paid: 'paid',
    canceled: 'canceled',
    past_due: 'past_due',
  },
}));

const createMock = vi.fn();
const updateMock = vi.fn();
const findByBillingSubscriptionIdMock = vi.fn();
const getCurrentByUserIdMock = vi.fn();
const updateByBillingSubscriptionIdMock = vi.fn();

vi.mock('../../repositories/subscriptions.repository', () => ({
  create: (...args: unknown[]) => createMock(...args),
  update: (...args: unknown[]) => updateMock(...args),
  findByBillingSubscriptionId: (...args: unknown[]) => findByBillingSubscriptionIdMock(...args),
  getCurrentByUserId: (...args: unknown[]) => getCurrentByUserIdMock(...args),
  updateByBillingSubscriptionId: (...args: unknown[]) => updateByBillingSubscriptionIdMock(...args),
}));

describe('SubscriptionEventHandler', () => {
  let handler: SubscriptionEventHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new SubscriptionEventHandler();
  });

  describe('handle', () => {
    it('subscription_activated with new billingSubscriptionId: calls create', async () => {
      findByBillingSubscriptionIdMock.mockResolvedValue(null);

      const event = {
        type: 'subscription_activated' as const,
        userId: 'user-1',
        data: {
          billingProvider: 'lemon_squeezy',
          billingCustomerId: 'cust-1',
          billingSubscriptionId: 'sub-1',
          status: 'paid' as const,
          expiredAt: new Date('2025-06-01T00:00:00.000Z'),
        },
      };

      await handler.handle(event);

      expect(findByBillingSubscriptionIdMock).toHaveBeenCalledWith('sub-1');
      expect(createMock).toHaveBeenCalledTimes(1);
      expect(createMock).toHaveBeenCalledWith({
        user: { connect: { id: 'user-1' } },
        billingProvider: 'lemon_squeezy',
        billingCustomerId: 'cust-1',
        billingSubscriptionId: 'sub-1',
        status: 'paid',
        expiredAt: new Date('2025-06-01T00:00:00.000Z'),
      });
      expect(updateMock).not.toHaveBeenCalled();
    });

    it('subscription_activated when billingSubscriptionId already exists: upserts (update instead of create)', async () => {
      findByBillingSubscriptionIdMock.mockResolvedValue({
        id: 'existing-sub-id',
        userId: 'user-1',
        billingSubscriptionId: 'sub-1',
      });

      const event = {
        type: 'subscription_activated' as const,
        userId: 'user-1',
        data: {
          billingProvider: 'lemon_squeezy',
          billingCustomerId: 'cust-1',
          billingSubscriptionId: 'sub-1',
          status: 'paid' as const,
          expiredAt: new Date('2025-06-01T00:00:00.000Z'),
        },
      };

      await handler.handle(event);

      expect(findByBillingSubscriptionIdMock).toHaveBeenCalledWith('sub-1');
      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(updateMock).toHaveBeenCalledWith('existing-sub-id', {
        user: { connect: { id: 'user-1' } },
        billingProvider: 'lemon_squeezy',
        billingCustomerId: 'cust-1',
        status: 'paid',
        expiredAt: new Date('2025-06-01T00:00:00.000Z'),
      });
      expect(createMock).not.toHaveBeenCalled();
    });

    it('subscription_updated with billingSubscriptionId: finds sub and updates when userId matches', async () => {
      findByBillingSubscriptionIdMock.mockResolvedValue({
        id: 'our-sub-id',
        userId: 'user-2',
        billingSubscriptionId: 'sub-2',
      });

      const event = {
        type: 'subscription_updated' as const,
        userId: 'user-2',
        data: {
          billingSubscriptionId: 'sub-2',
          status: 'past_due' as const,
          expiredAt: new Date('2025-07-01T00:00:00.000Z'),
        },
      };

      await handler.handle(event);

      expect(findByBillingSubscriptionIdMock).toHaveBeenCalledWith('sub-2');
      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(updateMock).toHaveBeenCalledWith('our-sub-id', {
        status: 'past_due',
        expiredAt: new Date('2025-07-01T00:00:00.000Z'),
      });
      expect(updateByBillingSubscriptionIdMock).not.toHaveBeenCalled();
    });

    it('subscription_updated without billingSubscriptionId: gets current by userId and updates', async () => {
      getCurrentByUserIdMock.mockResolvedValue({
        id: 'current-sub-id',
        userId: 'user-3',
      });

      const event = {
        type: 'subscription_updated' as const,
        userId: 'user-3',
        data: {
          status: 'paid' as const,
          expiredAt: new Date('2025-08-01T00:00:00.000Z'),
        },
      };

      await handler.handle(event);

      expect(getCurrentByUserIdMock).toHaveBeenCalledWith('user-3');
      expect(updateMock).toHaveBeenCalledWith('current-sub-id', {
        status: 'paid',
        expiredAt: new Date('2025-08-01T00:00:00.000Z'),
      });
    });

    it('subscription_canceled: mutates existing record (updateByBillingSubscriptionId), does not create new row', async () => {
      const event = {
        type: 'subscription_canceled' as const,
        userId: 'user-4',
        data: {
          billingSubscriptionId: 'sub-4',
          expiredAt: new Date('2025-09-01T00:00:00.000Z'),
        },
      };

      await handler.handle(event);

      expect(updateByBillingSubscriptionIdMock).toHaveBeenCalledWith('sub-4', {
        status: 'canceled',
        expiredAt: new Date('2025-09-01T00:00:00.000Z'),
      });
      expect(updateMock).not.toHaveBeenCalled();
    });

    it('subscription_canceled without billingSubscriptionId: gets current by userId and updates', async () => {
      getCurrentByUserIdMock.mockResolvedValue({
        id: 'current-sub-5',
        userId: 'user-5',
      });

      const event = {
        type: 'subscription_canceled' as const,
        userId: 'user-5',
        data: {},
      };

      await handler.handle(event);

      expect(getCurrentByUserIdMock).toHaveBeenCalledWith('user-5');
      expect(updateMock).toHaveBeenCalledWith('current-sub-5', {
        status: 'canceled',
        expiredAt: undefined,
      });
    });
  });
});
