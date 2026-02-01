import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { BillingLinkService } from './billing-link.service';
import { AuthenticateDto, RefreshDto } from './auth.dto';
import { AuthGuard } from '../guards/authGuard';
import { UserContext } from '../decorators/userContext';
import type { User } from '../../prisma/generated/prisma/client';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly billingLinkService: BillingLinkService,
  ) {}

  @Post('authenticate')
  authenticate(@Body() authenticateDto: AuthenticateDto) {
    return this.authService.authenticate(authenticateDto);
  }

  @Post('refresh')
  refresh(@Body() refreshDto: RefreshDto) {
    return this.authService.refreshTokens(refreshDto.refreshToken);
  }

  /** Issue a short-lived one-time billing token (extension → open cloud billing page for this user). */
  @Post('billing-link')
  @UseGuards(AuthGuard)
  async billingLink(@UserContext() { user }: { user: User }) {
    return this.billingLinkService.generateBillingToken(user.id);
  }
}
