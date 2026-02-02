import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { ExportModule } from './export/export.module';
import { NotionModule } from './notion/notion.module';
import { PublishModule } from './publish/publish.module';
import { SyncModule } from './sync/sync.module';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [AuthModule, BillingModule, ExportModule, NotionModule, PublishModule, SyncModule, UploadModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
