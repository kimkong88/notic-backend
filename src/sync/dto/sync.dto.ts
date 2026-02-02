import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// --- Limits (tune for product + abuse prevention) ---
const ID_MAX = 128;
const CONTENT_MAX = 2_000_000; // ~2MB text per note
const DISPLAY_NAME_MAX = 512;
const NAME_MAX = 256;
const NOTES_ARRAY_MAX = 10_000;
const FOLDERS_ARRAY_MAX = 2_000;
const WORKSPACES_ARRAY_MAX = 200;
const EPOCH_MS_MIN = 0;
const EPOCH_MS_MAX = 8640000000000000; // safe integer range for Date

const COLOR_MAX = 32; // hex or short color name

export class SyncWorkspaceItemDto {
  @IsString()
  @MaxLength(ID_MAX)
  id: string;

  @IsString()
  @MaxLength(NAME_MAX)
  name: string;

  @IsBoolean()
  isDefault: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(COLOR_MAX)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  icon?: string;
}

export class SyncFolderItemDto {
  @IsString()
  @MaxLength(ID_MAX)
  id: string;

  @IsString()
  @MaxLength(NAME_MAX)
  name: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(ID_MAX)
  parentId?: string | null;

  @IsNumber()
  @Min(EPOCH_MS_MIN)
  @Max(EPOCH_MS_MAX)
  createdAt: number;

  @IsOptional()
  @IsString()
  @MaxLength(DISPLAY_NAME_MAX)
  displayName?: string;

  @IsString()
  @MaxLength(ID_MAX)
  workspaceId: string;

  @IsOptional()
  @IsString()
  @MaxLength(COLOR_MAX)
  color?: string;
}

export class SyncNoteItemDto {
  @IsString()
  @MaxLength(ID_MAX)
  id: string;

  @IsString()
  @MaxLength(CONTENT_MAX)
  content: string;

  @IsNumber()
  @Min(EPOCH_MS_MIN)
  @Max(EPOCH_MS_MAX)
  lastModified: number;

  @IsNumber()
  @Min(EPOCH_MS_MIN)
  @Max(EPOCH_MS_MAX)
  createdAt: number;

  @IsOptional()
  @IsString()
  @MaxLength(DISPLAY_NAME_MAX)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(ID_MAX)
  folderId?: string;

  @IsString()
  @MaxLength(ID_MAX)
  workspaceId: string;

  @IsOptional()
  @IsNumber()
  @Min(EPOCH_MS_MIN)
  @Max(EPOCH_MS_MAX)
  deletedAt?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string;

  @IsOptional()
  @IsBoolean()
  isBookmarked?: boolean;

  /** When set, note is publicly viewable at GET /p/:shareCode. Server-only (not sent in push). */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  shareCode?: string;
}

export class SyncPushDto {
  @IsArray()
  @ArrayMaxSize(NOTES_ARRAY_MAX)
  @ValidateNested({ each: true })
  @Type(() => SyncNoteItemDto)
  notes: SyncNoteItemDto[];

  @IsArray()
  @ArrayMaxSize(FOLDERS_ARRAY_MAX)
  @ValidateNested({ each: true })
  @Type(() => SyncFolderItemDto)
  folders: SyncFolderItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(WORKSPACES_ARRAY_MAX)
  @ValidateNested({ each: true })
  @Type(() => SyncWorkspaceItemDto)
  workspaces?: SyncWorkspaceItemDto[];

  /** Delta sync: explicit hard-deleted note clientIds. If present, only these are deleted (no full-replace). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(NOTES_ARRAY_MAX)
  @IsString({ each: true })
  @MaxLength(ID_MAX, { each: true })
  deletedNoteIds?: string[];

  /** Delta sync: explicit hard-deleted folder clientIds. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(FOLDERS_ARRAY_MAX)
  @IsString({ each: true })
  @MaxLength(ID_MAX, { each: true })
  deletedFolderIds?: string[];

  /** Delta sync: explicit hard-deleted workspace clientIds. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(WORKSPACES_ARRAY_MAX)
  @IsString({ each: true })
  @MaxLength(ID_MAX, { each: true })
  deletedWorkspaceIds?: string[];
}

// --- Pull response (GET /sync): always paginated; same shape every page ---

export interface SyncPullResponse {
  notes: Array<{
    id: string;
    content: string;
    lastModified: number;
    createdAt: number;
    displayName?: string;
    folderId?: string;
    workspaceId: string;
    deletedAt?: number;
    color?: string;
    isBookmarked?: boolean;
    shareCode?: string;
  }>;
  folders: Array<{
    id: string;
    name: string;
    parentId: string | null;
    createdAt: number;
    displayName?: string;
    workspaceId: string;
    color?: string;
  }>;
  workspaces: Array<{
    id: string;
    name: string;
    isDefault: boolean;
    /** Epoch ms; for "newer wins" merge on client. */
    updatedAt: number;
  }>;
  /** Present when more notes exist; client calls GET /sync?cursor=... for next page. */
  nextCursor?: string;
  /** First page only, when since > 0: clientIds of notes deleted on server since that time. */
  deletedNoteIds?: string[];
  /** First page only, when since > 0: clientIds of folders deleted on server since that time. */
  deletedFolderIds?: string[];
  /** First page only, when since > 0: clientIds of workspaces deleted on server since that time. */
  deletedWorkspaceIds?: string[];
}

// --- Sync status (GET /sync/status): lightweight "server last updated when?" for periodic pull-only check ---

export interface SyncStatusResponse {
  /** Epoch ms of most recent sync activity (push or pull) for this user. */
  lastUpdatedAt: number;
}
