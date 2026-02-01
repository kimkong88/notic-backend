import { Prisma } from '../../prisma/generated/prisma/client';
import { prisma } from '../prisma/client';
import { Platform } from '../../prisma/generated/prisma/enums';

export const findById = async (userId: string) => {
  return prisma.user.findUnique({
    where: { id: userId },
  });
};

export const findByEmailAndPlatform = async (email: string, platform: Platform) => {
  return prisma.user.findFirst({
    where: { email, platform },
  });
};

export const createUser = async (data: Prisma.UserCreateInput) => {
  return prisma.user.create({
    data,
  });
};
