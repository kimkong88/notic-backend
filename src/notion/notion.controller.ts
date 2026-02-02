import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { NotionService } from './notion.service';
import { SetSyncRootDto } from './notion.dto';
import { AuthGuard } from '../guards/authGuard';
import { ProSubscriptionGuard } from '../guards/pro-subscription.guard';
import { UserContext } from '../decorators/userContext';
import type { User } from '../../prisma/generated/prisma/client';

function getNotionOAuthBackendOrigin(): string {
  const uri = process.env.NOTION_OAUTH_REDIRECT_URI?.trim().replace(/\/+$/, '');
  if (uri) return new URL(uri).origin;
  return process.env.FRONTEND_URL?.replace(/\/$/, '') || 'https://getnotic.io';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const NOTION_SUCCESS_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Notion connected</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32em;margin:3em auto;padding:0 1em;text-align:center">
<h1 style="font-size:1.25rem">Notion connected</h1>
<p>You can close this tab and return to the extension.</p>
</body></html>`;

@Controller('notion')
export class NotionController {
  constructor(private readonly notionService: NotionService) {}

  /** Return Notion OAuth URL as JSON (for extensions that open it in a tab). User must be authenticated. */
  @Get('oauth/authorize-url')
  @UseGuards(AuthGuard)
  async authorizeUrl(@UserContext() { user }: { user: User }) {
    return this.notionService.getAuthorizeUrl(user.id);
  }

  /** Start OAuth: redirect to Notion. User must be authenticated. */
  @Get('oauth/authorize')
  @UseGuards(AuthGuard)
  async authorize(@UserContext() { user }: { user: User }, @Res() res: Response) {
    const { url } = this.notionService.getAuthorizeUrl(user.id);
    res.redirect(302, url);
  }

  /** OAuth callback: exchange code, store connection, redirect to backend success page (extension-friendly). */
  @Get('oauth/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const backendOrigin = getNotionOAuthBackendOrigin();
    if (error) {
      res.redirect(302, `${backendOrigin}/notion/oauth/error?error=${encodeURIComponent(error)}`);
      return;
    }
    if (!code || !state) {
      res.redirect(302, `${backendOrigin}/notion/oauth/error?error=missing_code_or_state`);
      return;
    }
    const { redirectTo } = await this.notionService.exchangeCode(state, code);
    res.redirect(302, redirectTo);
  }

  /** Success page after OAuth (extension: user can close this tab). */
  @Get('oauth/success')
  oauthSuccess(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(NOTION_SUCCESS_HTML);
  }

  /** Error page after OAuth (shows error message). */
  @Get('oauth/error')
  oauthError(@Query('error') error: string | undefined, @Res() res: Response) {
    const message = error && String(error).trim() ? decodeURIComponent(String(error)) : 'Something went wrong';
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Notion connection failed</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32em;margin:3em auto;padding:0 1em;text-align:center">
<h1 style="font-size:1.25rem">Notion connection failed</h1>
<p>${escapeHtml(message)}</p>
<p>You can close this tab and try again from the extension.</p>
</body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  /** Get Notion connection status (connected?, workspace, sync root, lastSyncAt). */
  @Get('status')
  @UseGuards(AuthGuard)
  async status(@UserContext() { user }: { user: User }) {
    return this.notionService.getStatus(user.id);
  }

  /** Set the Notion page under which we sync (sync root). */
  @Post('sync-root')
  @UseGuards(AuthGuard)
  async setSyncRoot(
    @UserContext() { user }: { user: User },
    @Body() dto: SetSyncRootDto,
  ) {
    return this.notionService.setSyncRoot(user.id, dto.syncRootPageIdOrUrl);
  }

  /** Manual sync: push workspaces, folders, notes to Notion. Pro only (402 if free). */
  @Post('sync')
  @UseGuards(AuthGuard, ProSubscriptionGuard)
  async sync(@UserContext() { user }: { user: User }) {
    return this.notionService.syncToNotion(user.id);
  }
}
