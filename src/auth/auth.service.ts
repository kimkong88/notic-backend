import { Platform } from '../../prisma/generated/prisma/enums';
import { AuthenticateDto } from './auth.dto';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as usersRepository from '../repositories/users.repository';
import type { User } from '../../prisma/generated/prisma/client';
import { TokensService } from '../tokens/tokens.service';
import { TokenType } from '../../prisma/generated/prisma/enums';

const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly tokensService: TokensService,
  ) {}

  /** Google OAuth: sign in or sign up (create user if not exists). Accepts Google access token (e.g. from Chrome Identity). */
  async authenticate(authenticateDto: AuthenticateDto) {
    const { token, provider } = authenticateDto;

    if (provider !== Platform.google) {
      throw new BadRequestException('only_google_supported');
    }

    const profile = await this.getGoogleUserFromAccessToken(token);
    let user = await usersRepository.findByEmailAndPlatform(
      profile.email,
      Platform.google,
    );

    const isSignUp = !user;
    if (!user) {
      user = await usersRepository.createUser({
        email: profile.email,
        name: profile.name ?? profile.email,
        imageUrl: profile.picture ?? null,
        platform: Platform.google,
      });
    }

    const tokens = await this.tokensService.generateAuthTokens(user.id);

    return {
      user,
      tokens,
      action: isSignUp ? 'sign_up' : 'sign_in',
    };
  }

  /** Verify Google access token and get user profile via userinfo API. */
  private async getGoogleUserFromAccessToken(accessToken: string): Promise<{
    email: string;
    name?: string;
    picture?: string;
  }> {
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new BadRequestException('invalid_token');
    }

    const data = (await res.json()) as {
      email?: string;
      name?: string;
      picture?: string;
    };

    if (!data?.email) {
      throw new BadRequestException('invalid_token');
    }

    return {
      email: data.email,
      name: data.name,
      picture: data.picture,
    };
  }

  /** Get user by id (e.g. for billing token resolution). */
  async getUserById(userId: string): Promise<User | null> {
    return usersRepository.findById(userId);
  }

  async validateToken(token: string): Promise<{ user: User }> {
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET,
      });
      const user = await usersRepository.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('invalid_or_expired_token');
      }
      return { user };
    } catch {
      throw new UnauthorizedException('invalid_or_expired_token');
    }
  }

  async refreshTokens(refreshToken: string) {
    const stored = await this.tokensService.verifyToken(
      refreshToken,
      TokenType.refresh,
    );

    const user = await usersRepository.findById(stored.userId);

    if (!user) {
      throw new BadRequestException('user_not_found');
    }

    await this.tokensService.deleteToken(refreshToken, TokenType.refresh);
    const tokens = await this.tokensService.generateAuthTokens(user.id);

    return { user, tokens };
  }
}
