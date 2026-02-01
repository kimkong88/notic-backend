import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../guards/authGuard';
import { UserContext } from '../decorators/userContext';
import { SyncService } from './sync.service';
import {
  SyncPushDto,
  SyncPullResponse,
  SyncStatusResponse,
} from './dto/sync.dto';

const DEFAULT_PULL_LIMIT = 1000;

@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('status')
  @UseGuards(AuthGuard)
  getSyncStatus(
    @UserContext() userContext: { user: { id: string } },
  ): Promise<SyncStatusResponse> {
    return this.syncService.getSyncStatus(userContext.user.id);
  }

  @Get()
  @UseGuards(AuthGuard)
  pull(
    @UserContext() userContext: { user: { id: string } },
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('since') since?: string,
  ): Promise<SyncPullResponse> {
    const limitNum =
      limit != null ? parseInt(limit, 10) : DEFAULT_PULL_LIMIT;
    const limitSafe = Number.isNaN(limitNum) ? DEFAULT_PULL_LIMIT : limitNum;
    const sinceNum = since != null ? parseInt(since, 10) : undefined;
    return this.syncService.pull(
      userContext.user.id,
      limitSafe,
      cursor ?? undefined,
      Number.isNaN(sinceNum) ? undefined : sinceNum,
    );
  }

  @Post()
  @UseGuards(AuthGuard)
  push(
    @UserContext() userContext: { user: { id: string } },
    @Body() dto: SyncPushDto,
  ): Promise<void> {
    return this.syncService.push(userContext.user.id, dto);
  }
}
