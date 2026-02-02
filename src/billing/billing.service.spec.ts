import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingService } from './billing.service';

const getCurrentByUserIdMock = vi.fn();

vi.mock('../repositories/subscriptions.repository', () => ({
  getCurrentByUserId: (...args: unknown[]) => getCurrentByUserIdMock(...args),
}));

describe('BillingService', () => {
  let service: BillingService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new BillingService({} as never);
  });

  describe('getStatus', () => {
    it('no subscription: returns plan free', async () => {
      getCurrentByUserIdMock.mockResolvedValue(null);

      const result = await service.getStatus('user-1');

      expect(result).toEqual({
        plan: 'free',
        status: undefined,
        expiredAt: undefined,
      });
    });

    it('subscription with expiredAt null: returns plan pro (access = expiredAt only)', async () => {
      getCurrentByUserIdMock.mockResolvedValue({
        id: 'sub-1',
        userId: 'user-1',
        status: 'paid',
        expiredAt: null,
      });

      const result = await service.getStatus('user-1');

      expect(result.plan).toBe('pro');
      expect(result.status).toBe('paid');
      expect(result.expiredAt).toBeUndefined();
    });

    it('subscription with expiredAt in future: returns plan pro', async () => {
      const future = new Date(Date.now() + 86400000);
      getCurrentByUserIdMock.mockResolvedValue({
        id: 'sub-2',
        userId: 'user-2',
        status: 'paid',
        expiredAt: future,
      });

      const result = await service.getStatus('user-2');

      expect(result.plan).toBe('pro');
      expect(result.expiredAt).toEqual(future);
    });

    it('subscription with expiredAt in past: returns plan free', async () => {
      const past = new Date(Date.now() - 86400000);
      getCurrentByUserIdMock.mockResolvedValue({
        id: 'sub-3',
        userId: 'user-3',
        status: 'canceled',
        expiredAt: past,
      });

      const result = await service.getStatus('user-3');

      expect(result.plan).toBe('free');
      expect(result.status).toBe('canceled');
      expect(result.expiredAt).toEqual(past);
    });

    it('past_due with expiredAt in future: returns plan pro (we do not revoke on past_due)', async () => {
      const future = new Date(Date.now() + 86400000);
      getCurrentByUserIdMock.mockResolvedValue({
        id: 'sub-4',
        userId: 'user-4',
        status: 'past_due',
        expiredAt: future,
      });

      const result = await service.getStatus('user-4');

      expect(result.plan).toBe('pro');
      expect(result.status).toBe('past_due');
    });
  });
});
