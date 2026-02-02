import { Module } from '@nestjs/common';
import { PublishController } from './publish.controller';
import { PublishService } from './publish.service';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ProSubscriptionGuard } from '../guards/pro-subscription.guard';

@Module({
  imports: [AuthModule, BillingModule],
  controllers: [PublishController],
  providers: [PublishService, ProSubscriptionGuard],
})
export class PublishModule {}
