import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JwtOrBillingTokenGuard } from '../guards/jwt-or-billing-token.guard';
import { BillingController } from './billing.controller';
import { BillingWebhookController } from './billing.webhook.controller';
import { BillingService } from './billing.service';
import { BILLING_PROVIDER } from './billing.constants';
import { LemonSqueezyProvider } from './providers/lemon-squeezy.provider';
import { SubscriptionEventHandler } from './handlers/subscription-event.handler';

@Module({
  imports: [AuthModule],
  controllers: [BillingController, BillingWebhookController],
  providers: [
    BillingService,
    SubscriptionEventHandler,
    JwtOrBillingTokenGuard,
    {
      provide: BILLING_PROVIDER,
      useClass: LemonSqueezyProvider,
    },
  ],
  exports: [BillingService],
})
export class BillingModule {}
