import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtOrBillingTokenGuard } from '../guards/jwt-or-billing-token.guard';
import { UserContext } from '../decorators/userContext';
import { BillingService } from './billing.service';
import type { User } from '../../prisma/generated/prisma/client';

@Controller('billing')
@UseGuards(JwtOrBillingTokenGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('status')
  async getStatus(@UserContext() { user }: { user: User }) {
    return this.billingService.getStatus(user.id);
  }

  @Post('create-checkout-session')
  async createCheckoutSession(
    @UserContext() { user }: { user: User },
    @Body() body: { successUrl?: string; cancelUrl?: string; priceKey?: 'monthly' | 'yearly' },
  ) {
    return this.billingService.createCheckoutSession(user.id, {
      successUrl: body.successUrl,
      cancelUrl: body.cancelUrl,
      priceKey: body.priceKey,
    });
  }

  @Post('create-portal-session')
  async createPortalSession(
    @UserContext() { user }: { user: User },
    @Body() body: { returnUrl?: string },
  ) {
    return this.billingService.createPortalSession(user.id, body.returnUrl);
  }
}
