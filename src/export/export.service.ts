import { Injectable } from '@nestjs/common';
import * as workspacesRepository from '../repositories/workspaces.repository';
import * as foldersRepository from '../repositories/folders.repository';
import * as notesRepository from '../repositories/notes.repository';
import type { ObsidianExportResponse } from './export.dto';
import { decodeSyncCursor } from '../util/helpers';
import { normalizeUrl } from '../notion/notion-content-to-blocks';

const MAX_EXPORT_NOTES = 20_000;
const PAGE_SIZE = 5000;

/** Cursor for notes pagination (lastModified as Date for Prisma). */
interface NotesCursorForExport {
  lastModified: Date;
  clientId: string;
}

/** Normalize URLs in markdown (e.g. \\/ -> /, \\_ -> _) so image and link URLs work in Obsidian. */
function normalizeMarkdownUrls(content: string): string {
  return content.replace(/\]\((.*?)\)/g, (_, url) => `](${normalizeUrl(url)})`);
}

/** Sanitize a path segment for use in file paths (works on Windows and Unix). */
function sanitizePathSegment(name: string): string {
  const invalid = /[\\/:*?"<>|]/g;
  const trimmed = name.trim().replace(invalid, '_').replace(/\s+/g, ' ');
  return trimmed || 'Untitled';
}

@Injectable()
export class ExportService {
  /**
   * Build Obsidian export: list of { path, content } for all workspaces/folders/notes.
   * Path format: {workspaceName}/{folderPath}/{noteTitle}.md (deterministic; re-export overwrites).
   */
  async getObsidianExport(userId: string): Promise<ObsidianExportResponse> {
    const [workspaces, folders] = await Promise.all([
      workspacesRepository.findWorkspacesByUserId(userId),
      foldersRepository.findFoldersByUserId(userId),
    ]);

    const workspaceNameByClientId = new Map(
      workspaces.map((w) => [w.clientId, sanitizePathSegment(w.name)]),
    );

    // Build folder clientId -> full path (within workspace). Sort so parents before children.
    const folderPathByClientId = new Map<string, string>();
    const sortedFolders = [...folders].sort((a, b) => {
      if (!a.parentId && b.parentId) return -1;
      if (a.parentId && !b.parentId) return 1;
      return 0;
    });
    for (const folder of sortedFolders) {
      const segment = sanitizePathSegment(folder.displayName ?? folder.name);
      const parentPath = folder.parentId
        ? folderPathByClientId.get(folder.parentId)
        : undefined;
      folderPathByClientId.set(
        folder.clientId,
        parentPath ? `${parentPath}/${segment}` : segment,
      );
    }

    // Collect all active notes (paginated).
    const allNotes: Awaited<
      ReturnType<typeof notesRepository.findNotesByUserIdPaginated>
    >['notes'] = [];
    let cursor: NotesCursorForExport | undefined;
    let cursorEncoded: string | null = null;
    do {
      const result = await notesRepository.findNotesByUserIdPaginated(
        userId,
        PAGE_SIZE,
        cursor,
      );
      for (const note of result.notes) {
        if (!note.deletedAt) allNotes.push(note);
      }
      cursorEncoded = result.nextCursor;
      if (cursorEncoded) {
        const decoded = decodeSyncCursor(cursorEncoded);
        cursor =
          decoded != null
            ? {
                lastModified: new Date(decoded.lastModified),
                clientId: decoded.clientId,
              }
            : undefined;
      } else {
        cursor = undefined;
      }
      if (allNotes.length >= MAX_EXPORT_NOTES) break;
    } while (cursorEncoded);

    const files: Array<{ path: string; content: string }> = [];
    for (const note of allNotes) {
      const workspaceName =
        workspaceNameByClientId.get(note.workspaceId) ?? 'Workspace';
      const folderPath = note.folderId
        ? folderPathByClientId.get(note.folderId)
        : undefined;
      const title =
        note.displayName ??
        (note.content?.slice(0, 50).replace(/\n/g, ' ').trim() || 'Untitled');
      const fileName = sanitizePathSegment(title) + '.md';
      const pathSegments = [workspaceName];
      if (folderPath) pathSegments.push(folderPath);
      pathSegments.push(fileName);
      const path = pathSegments.join('/');
      const content = normalizeMarkdownUrls(note.content ?? '');
      files.push({ path, content });
    }

    return { files };
  }
}
