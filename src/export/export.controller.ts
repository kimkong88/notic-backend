import { Controller, Get, UseGuards } from '@nestjs/common';
import { ExportService } from './export.service';
import { AuthGuard } from '../guards/authGuard';
import { UserContext } from '../decorators/userContext';
import type { User } from '../../prisma/generated/prisma/client';

@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  /**
   * GET /export/obsidian
   * Returns { files: [{ path, content }] } for Obsidian export (extension writes via directory picker or ZIP fallback).
   */
  @Get('obsidian')
  @UseGuards(AuthGuard)
  async getObsidianExport(@UserContext() { user }: { user: User }) {
    return this.exportService.getObsidianExport(user.id);
  }
}
