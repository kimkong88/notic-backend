import { Body, Controller, Get, Param, Post, Delete, UseGuards } from '@nestjs/common';
import { PublishService } from './publish.service';
import { PublishNoteDto, UnpublishNoteDto } from './publish.dto';
import { AuthGuard } from '../guards/authGuard';
import { UserContext } from '../decorators/userContext';
import type { User } from '../../prisma/generated/prisma/client';

@Controller()
export class PublishController {
  constructor(private readonly publishService: PublishService) {}

  /** Publish a note: generate unique share code and return share URL. Auth required. */
  @Post('publish')
  @UseGuards(AuthGuard)
  async publish(
    @UserContext() { user }: { user: User },
    @Body() dto: PublishNoteDto,
  ) {
    return this.publishService.publishNote(user.id, dto.clientId);
  }

  /** Unpublish: clear share code for the note. Auth required. */
  @Delete('publish')
  @UseGuards(AuthGuard)
  async unpublish(
    @UserContext() { user }: { user: User },
    @Body() dto: UnpublishNoteDto,
  ) {
    await this.publishService.unpublishNote(user.id, dto.clientId);
    return { ok: true };
  }

  /** Public: get shared note by code (read-only). No auth. */
  @Get('p/:code')
  async getShared(@Param('code') code: string) {
    const note = await this.publishService.getSharedNote(code);
    if (!note) {
      return {
        error: 'not_found',
        content: null,
        displayName: null,
        lastModified: null,
      };
    }
    return {
      content: note.content,
      displayName: note.displayName,
      lastModified: note.lastModified.toISOString(),
    };
  }
}
