import { Module } from '@nestjs/common';
import { NotionController } from './notion.controller';
import { NotionService } from './notion.service';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ProSubscriptionGuard } from '../guards/pro-subscription.guard';

@Module({
  imports: [AuthModule, BillingModule],
  controllers: [NotionController],
  providers: [NotionService, ProSubscriptionGuard],
  exports: [NotionService],
})
export class NotionModule {}
