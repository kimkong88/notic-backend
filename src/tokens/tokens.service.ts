import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { add } from 'date-fns';
import * as tokensRepository from '../repositories/tokens.repository';
import { TokenType } from '../../prisma/generated/prisma/enums';

/** Longer-lived tokens for a note app. Use env: ACCESS_TOKEN_DAYS, REFRESH_TOKEN_DAYS (defaults: 30, 90). */
const DEFAULT_ACCESS_TOKEN_DAYS = 30;
const DEFAULT_REFRESH_TOKEN_DAYS = 90;

@Injectable()
export class TokensService {
  constructor(private readonly jwtService: JwtService) {}

  decodeToken<T>(token: string) {
    return this.jwtService.decode<T>(token);
  }

  async generateToken(userId: string, expires: number) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new TypeError(
        'JWT_SECRET is required. Set it in your environment.',
      );
    }

    const payload = {
      sub: userId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(expires / 1000),
    };

    return this.jwtService.sign(payload, { secret });
  }

  async verifyToken(token: string, type: TokenType) {
    const foundToken = await tokensRepository.findUnique(token, type);

    if (!foundToken) {
      throw new UnauthorizedException('invalid_token');
    }

    return foundToken;
  }

  async saveToken(
    token: string,
    userId: string,
    expires: number,
    type: TokenType,
  ) {
    return tokensRepository.createToken(token, userId, expires, type);
  }

  async generateAuthTokens(userId: string) {
    const accessTokenDays =
      Number(process.env.ACCESS_TOKEN_DAYS) || DEFAULT_ACCESS_TOKEN_DAYS;
    const refreshTokenDays =
      Number(process.env.REFRESH_TOKEN_DAYS) || DEFAULT_REFRESH_TOKEN_DAYS;

    const accessTokenExpiration = add(new Date(), { days: accessTokenDays });
    const refreshTokenExpiration = add(new Date(), {
      days: refreshTokenDays,
    });

    const accessToken = await this.generateToken(
      userId,
      accessTokenExpiration.getTime(),
    );
    const refreshToken = await this.generateToken(
      userId,
      refreshTokenExpiration.getTime(),
    );

    await this.saveToken(
      refreshToken,
      userId,
      refreshTokenExpiration.getTime(),
      TokenType.refresh,
    );

    return {
      access: {
        token: accessToken,
        expires: accessTokenExpiration.getTime(),
      },
      refresh: {
        token: refreshToken,
        expires: refreshTokenExpiration.getTime(),
      },
    };
  }

  async deleteToken(token: string, type: TokenType) {
    await tokensRepository.deleteToken(token, type);
  }
}
