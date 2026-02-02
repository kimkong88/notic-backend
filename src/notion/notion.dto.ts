import { IsString, MaxLength } from 'class-validator';

/** Set or update the Notion page under which we sync (sync root). */
export class SetSyncRootDto {
  /** Notion page ID (UUID format) or full page URL. If URL, we parse the page ID. */
  @IsString()
  @MaxLength(500)
  syncRootPageIdOrUrl!: string;
}

/** Response shape for GET /notion/status. */
export interface NotionStatusResponse {
  connected: boolean;
  notionWorkspaceId?: string;
  notionWorkspaceName?: string | null;
  syncRootPageId?: string | null;
  lastSyncAt?: string | null;
}
