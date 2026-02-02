import { Controller, Get, UseGuards } from '@nestjs/common';
import { ExportService } from './export.service';
import { AuthGuard } from '../guards/authGuard';
import { ProSubscriptionGuard } from '../guards/pro-subscription.guard';
import { UserContext } from '../decorators/userContext';
import type { User } from '../../prisma/generated/prisma/client';

@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  /**
   * GET /export/obsidian
   * Returns { files: [{ path, content }] } for Obsidian export. Pro only (402 if free).
   */
  @Get('obsidian')
  @UseGuards(AuthGuard, ProSubscriptionGuard)
  async getObsidianExport(@UserContext() { user }: { user: User }) {
    return this.exportService.getObsidianExport(user.id);
  }
}
