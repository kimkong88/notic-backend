import { Module } from '@nestjs/common';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ProSubscriptionGuard } from '../guards/pro-subscription.guard';

@Module({
  imports: [AuthModule, BillingModule],
  controllers: [ExportController],
  providers: [ExportService, ProSubscriptionGuard],
  exports: [ExportService],
})
export class ExportModule {}
