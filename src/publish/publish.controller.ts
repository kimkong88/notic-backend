import { Body, Controller, Get, Param, Post, Delete, UseGuards } from '@nestjs/common';
import { PublishService } from './publish.service';
import { PublishNoteDto, UnpublishNoteDto } from './publish.dto';
import { AuthGuard } from '../guards/authGuard';
import { ProSubscriptionGuard } from '../guards/pro-subscription.guard';
import { UserContext } from '../decorators/userContext';
import type { User } from '../../prisma/generated/prisma/client';

@Controller()
export class PublishController {
  constructor(private readonly publishService: PublishService) {}

  /** Publish a note: generate unique share code and return share URL. Auth + Pro required. */
  @Post('publish')
  @UseGuards(AuthGuard, ProSubscriptionGuard)
  async publish(
    @UserContext() { user }: { user: User },
    @Body() dto: PublishNoteDto,
  ) {
    return this.publishService.publishNote(user.id, dto.clientId);
  }

  /** Unpublish: clear share code for the note. Auth + Pro required. */
  @Delete('publish')
  @UseGuards(AuthGuard, ProSubscriptionGuard)
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
