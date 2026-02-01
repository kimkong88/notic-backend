import { prisma } from '../prisma/client';
import { TokenType } from '../../prisma/generated/prisma/enums';

export const createToken = async (
  token: string,
  userId: string,
  expires: number,
  type: TokenType,
) => {
  return prisma.token.create({
    data: {
      token,
      userId,
      expires: new Date(expires),
      type,
    },
  });
};

export const findUnique = async (token: string, type: TokenType) => {
  return prisma.token.findUnique({
    where: {
      token_type: { token, type },
    },
  });
};

export const deleteToken = async (token: string, type: TokenType) => {
  await prisma.token.delete({
    where: {
      token_type: { token, type },
    },
  });
};
