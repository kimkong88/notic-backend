import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { SyncModule } from './sync/sync.module';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [AuthModule, BillingModule, SyncModule, UploadModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
