import { Module } from '@nestjs/common';
import { NotionController } from './notion.controller';
import { NotionService } from './notion.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [NotionController],
  providers: [NotionService],
  exports: [NotionService],
})
export class NotionModule {}
