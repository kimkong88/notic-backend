import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { prisma } from '../prisma/client';
import * as workspacesRepository from '../repositories/workspaces.repository';
import * as foldersRepository from '../repositories/folders.repository';
import * as notesRepository from '../repositories/notes.repository';
import type { NotionStatusResponse } from './notion.dto';
import { noteContentToNotionBlocks } from './notion-content-to-blocks';

const NOTION_OAUTH_AUTHORIZE = 'https://api.notion.com/v1/oauth/authorize';
const NOTION_OAUTH_TOKEN = 'https://api.notion.com/v1/oauth/token';
const NOTION_API_VERSION = '2022-06-28';
const STATE_TTL_MS = 10 * 60 * 1000; // 10 min

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new BadRequestException(`Missing env: ${name}`);
  return v;
}

/** Redirect URI must match exactly what is configured in the Notion integration. Normalize to avoid .env quirks. */
function getRedirectUri(): string {
  return getEnv('NOTION_OAUTH_REDIRECT_URI').trim().replace(/\/+$/, '');
}

/** Create HMAC-signed state payload (userId + exp) for OAuth CSRF protection. */
function createState(userId: string): string {
  const secret = getEnv('NOTION_OAUTH_CLIENT_SECRET');
  const exp = Date.now() + STATE_TTL_MS;
  const payload = JSON.stringify({ userId, exp });
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

/** Verify state and return userId; throws if invalid or expired. */
function verifyState(state: string): string {
  const secret = getEnv('NOTION_OAUTH_CLIENT_SECRET');
  const [payloadB64, sig] = state.split('.');
  if (!payloadB64 || !sig) throw new UnauthorizedException('invalid_state');
  const expectedSig = createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');
  if (sig !== expectedSig) throw new UnauthorizedException('invalid_state');
  const payload = JSON.parse(
    Buffer.from(payloadB64, 'base64url').toString('utf8'),
  ) as { userId?: string; exp?: number };
  if (!payload.userId || typeof payload.exp !== 'number')
    throw new UnauthorizedException('invalid_state');
  if (Date.now() > payload.exp) throw new UnauthorizedException('state_expired');
  return payload.userId;
}

/** Extract Notion page ID from URL or return as-is if it looks like a UUID. */
function parseNotionPageId(input: string): string {
  const trimmed = input.trim();
  // UUID format (with or without hyphens)
  const uuidLike = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
  if (uuidLike.test(trimmed)) return trimmed.replace(/-/g, '');
  // Notion URL: https://www.notion.so/Title-page-id or https://notion.so/...
  const match = trimmed.match(/notion\.(?:so|site)\/[^#?]*-([0-9a-f]{32})/i);
  if (match) return match[1];
  // Short form: ...-page-id (32 hex at end)
  const endMatch = trimmed.match(/-([0-9a-f]{32})$/i);
  if (endMatch) return endMatch[1];
  throw new BadRequestException('Invalid Notion page ID or URL');
}

@Injectable()
export class NotionService {
  private readonly logger = new Logger(NotionService.name);

  /** Build Notion OAuth authorize URL; state is signed with userId for callback. */
  getAuthorizeUrl(userId: string): { url: string } {
    const clientId = getEnv('NOTION_OAUTH_CLIENT_ID');
    const redirectUri = getRedirectUri();
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`Notion OAuth redirect_uri sent to Notion: "${redirectUri}"`);
    }
    const state = createState(userId);
    const url = `${NOTION_OAUTH_AUTHORIZE}?${new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      owner: 'user',
      redirect_uri: redirectUri,
      state,
    }).toString()}`;
    return { url };
  }

  /** Exchange code for tokens and store NotionConnection. Redirect URI must match. */
  async exchangeCode(state: string, code: string): Promise<{ redirectTo: string }> {
    const userId = verifyState(state);
    const clientId = getEnv('NOTION_OAUTH_CLIENT_ID');
    const clientSecret = getEnv('NOTION_OAUTH_CLIENT_SECRET');
    const redirectUri = getRedirectUri();

    const credentials = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString(
      'base64',
    );
    const res = await fetch(NOTION_OAUTH_TOKEN, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new BadRequestException(
        err?.error || `Notion token exchange failed: ${res.status}`,
      );
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      workspace_id: string;
      workspace_name?: string;
      bot_id?: string;
    };

    await prisma.notionConnection.upsert({
      where: { userId },
      create: {
        userId,
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? null,
        notionWorkspaceId: data.workspace_id,
        notionWorkspaceName: data.workspace_name ?? null,
      },
      update: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? null,
        notionWorkspaceId: data.workspace_id,
        notionWorkspaceName: data.workspace_name ?? null,
      },
    });

    const backendOrigin = new URL(getRedirectUri()).origin;
    return {
      redirectTo: `${backendOrigin}/notion/oauth/success`,
    };
  }

  /** Get connection status for user. */
  async getStatus(userId: string): Promise<NotionStatusResponse> {
    const conn = await prisma.notionConnection.findUnique({
      where: { userId },
      select: {
        notionWorkspaceId: true,
        notionWorkspaceName: true,
        syncRootPageId: true,
        lastSyncAt: true,
      },
    });
    if (!conn)
      return {
        connected: false,
      };
    return {
      connected: true,
      notionWorkspaceId: conn.notionWorkspaceId,
      notionWorkspaceName: conn.notionWorkspaceName,
      syncRootPageId: conn.syncRootPageId,
      lastSyncAt: conn.lastSyncAt?.toISOString() ?? null,
    };
  }

  /** Set sync root page (where we create workspace/folders/notes). */
  async setSyncRoot(
    userId: string,
    syncRootPageIdOrUrl: string,
  ): Promise<{ syncRootPageId: string }> {
    const pageId = parseNotionPageId(syncRootPageIdOrUrl);
    const conn = await prisma.notionConnection.findUnique({
      where: { userId },
    });
    if (!conn) throw new BadRequestException('Notion not connected');
    await prisma.notionConnection.update({
      where: { userId },
      data: { syncRootPageId: pageId },
    });
    return { syncRootPageId: pageId };
  }

  /**
   * Run manual sync: push workspaces, folders, notes to Notion.
   * Uses mapping table to create or update pages; throttles to ~3 req/s.
   */
  async syncToNotion(userId: string): Promise<{ ok: true; lastSyncAt: string }> {
    const conn = await prisma.notionConnection.findUnique({
      where: { userId },
    });
    if (!conn) throw new BadRequestException('Notion not connected');
    if (!conn.syncRootPageId)
      throw new BadRequestException('Set a sync root page first');

    // Load all user data
    const [workspaces, folders, notes] = await Promise.all([
      workspacesRepository.findWorkspacesByUserId(userId),
      foldersRepository.findFoldersByUserId(userId),
      notesRepository.findNotesByUserIdPaginated(userId, 10_000),
    ]);

    const accessToken = conn.accessToken;
    const rootPageId = conn.syncRootPageId;
    const throttleMs = 340; // ~3 req/s

    const sleep = () =>
      new Promise<void>((r) => setTimeout(r, throttleMs));

    async function notionFetch(
      path: string,
      options: { method?: string; body?: string } = {},
    ): Promise<Response> {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'Notion-Version': NOTION_API_VERSION,
      };
      if (options.body) headers['Content-Type'] = 'application/json';
      const res = await fetch(`https://api.notion.com${path}`, {
        method: options.method ?? 'GET',
        headers,
        ...(options.body && { body: options.body }),
      });
      await sleep();
      return res;
    }

    // Resolve or create mapping; returns Notion page ID.
    const getOrCreateMapping = async (
      entityType: 'workspace' | 'folder' | 'note',
      clientId: string,
      createPage: () => Promise<string>,
    ): Promise<string> => {
      const existing = await prisma.notionSyncMapping.findUnique({
        where: {
          userId_entityType_clientId: { userId, entityType, clientId },
        },
      });
      if (existing) return existing.notionPageId;
      const notionPageId = await createPage();
      await prisma.notionSyncMapping.upsert({
        where: {
          userId_entityType_clientId: { userId, entityType, clientId },
        },
        create: {
          userId,
          entityType,
          clientId,
          notionPageId,
          notionWorkspaceId: conn.notionWorkspaceId,
        },
        update: { notionPageId, notionWorkspaceId: conn.notionWorkspaceId },
      });
      return notionPageId;
    };

    // Create a child page under parentId with title
    const createPage = async (
      parentId: string,
      title: string,
      children?: Array<{ type: string; [k: string]: unknown }>,
    ): Promise<string> => {
      const body: Record<string, unknown> = {
        parent: { page_id: parentId },
        properties: {
          title: {
            title: [{ type: 'text', text: { content: title.slice(0, 2000) } }],
          },
        },
      };
      if (children && children.length > 0) body.children = children;
      const res = await notionFetch('/v1/pages', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        throw new BadRequestException(
          err?.message || `Notion API error: ${res.status}`,
        );
      }
      const data = (await res.json()) as { id: string };
      return data.id;
    };

    // Update page title
    const updatePageTitle = async (pageId: string, title: string): Promise<void> => {
      const res = await notionFetch(`/v1/pages/${pageId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          properties: {
            title: {
              title: [{ type: 'text', text: { content: title.slice(0, 2000) } }],
            },
          },
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        throw new BadRequestException(
          err?.message || `Notion API error: ${res.status}`,
        );
      }
    };

    // Sync workspaces as top-level pages under root
    const workspacePageIds = new Map<string, string>();
    for (const ws of workspaces) {
      const pageId = await getOrCreateMapping('workspace', ws.clientId, () =>
        createPage(rootPageId, ws.name),
      );
      workspacePageIds.set(ws.clientId, pageId);
      // Update title if name changed (we don't track previous name; could skip if no mapping change)
    }

    // Sync folders: under workspace page (or root if no workspace match)
    const folderPageIds = new Map<string, string>();
    const sortedFolders = [...folders].sort((a, b) => {
      if (!a.parentId && b.parentId) return -1;
      if (a.parentId && !b.parentId) return 1;
      return 0;
    });
    for (const folder of sortedFolders) {
      const parentNotionId =
        folder.parentId != null
          ? folderPageIds.get(folder.parentId) ?? workspacePageIds.get(folder.workspaceId) ?? rootPageId
          : workspacePageIds.get(folder.workspaceId) ?? rootPageId;
      const pageId = await getOrCreateMapping('folder', folder.clientId, () =>
        createPage(parentNotionId, folder.displayName ?? folder.name),
      );
      folderPageIds.set(folder.clientId, pageId);
    }

    // Sync notes: under folder page (or workspace root). notesResult.notes from paginated call.
    const notesList = notes.notes;
    for (const note of notesList) {
      if (note.deletedAt) continue; // skip trashed notes or handle as archive
      const title =
        note.displayName ||
        (note.content?.slice(0, 100).replace(/\n/g, ' ').trim() || 'Untitled');
      const parentNotionId =
        note.folderId != null
          ? folderPageIds.get(note.folderId) ?? workspacePageIds.get(note.workspaceId) ?? rootPageId
          : workspacePageIds.get(note.workspaceId) ?? rootPageId;
      const contentBlocks = note.content?.trim()
        ? noteContentToNotionBlocks(note.content)
        : [];
      await getOrCreateMapping('note', note.clientId, () =>
        createPage(parentNotionId, title, contentBlocks),
      );
    }

    const now = new Date();
    await prisma.notionConnection.update({
      where: { userId },
      data: { lastSyncAt: now },
    });

    return { ok: true, lastSyncAt: now.toISOString() };
  }
}
