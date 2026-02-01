import { prisma } from '../prisma/client';
import type { SubscriptionStatus } from '../../prisma/generated/prisma/enums';
import type { Prisma } from '../../prisma/generated/prisma/client';

/** Current subscription = latest by createdAt for user. Has access = expiredAt == null || now < expiredAt. */
export const getCurrentByUserId = async (userId: string) => {
  return prisma.subscription.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
};

export const findByBillingSubscriptionId = async (billingSubscriptionId: string) => {
  return prisma.subscription.findFirst({
    where: { billingSubscriptionId },
    orderBy: { createdAt: 'desc' },
  });
};

export const create = async (data: Prisma.SubscriptionCreateInput) => {
  return prisma.subscription.create({ data });
};

export const update = async (
  id: string,
  data: Prisma.SubscriptionUpdateInput,
) => {
  return prisma.subscription.update({
    where: { id },
    data,
  });
};

export const updateByBillingSubscriptionId = async (
  billingSubscriptionId: string,
  data: {
    status?: SubscriptionStatus;
    expiredAt?: Date | null;
    billingCustomerId?: string | null;
  },
) => {
  const sub = await findByBillingSubscriptionId(billingSubscriptionId);
  if (!sub) return null;
  return prisma.subscription.update({
    where: { id: sub.id },
    data,
  });
};
