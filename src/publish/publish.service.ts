import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as notesRepository from '../repositories/notes.repository';
import { generateRandomString } from '../util/helpers';

const SHARE_CODE_LENGTH = 8;
const MAX_UNIQUE_ATTEMPTS = 10;

const PUBLIC_BASE_URL =
  process.env.FRONTEND_URL?.replace(/\/$/, '') || 'https://getnotic.io';

@Injectable()
export class PublishService {
  /** Generate a unique share code (same pattern as my-saju-backend). */
  private async generateUniqueShareCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_UNIQUE_ATTEMPTS; attempt++) {
      const code = generateRandomString(SHARE_CODE_LENGTH);
      const taken = await notesRepository.isShareCodeTaken(code);
      if (!taken) return code;
    }
    throw new BadRequestException('failed_to_generate_share_code');
  }

  /**
   * Publish a note: assign a unique share code. Note must exist and belong to userId.
   * Returns shareCode and shareUrl. If note already has a shareCode, returns existing.
   */
  async publishNote(
    userId: string,
    clientId: string,
  ): Promise<{ shareCode: string; shareUrl: string }> {
    const existing = await notesRepository.findNoteByUserIdAndClientId(
      userId,
      clientId,
    );
    if (!existing) {
      throw new NotFoundException('note_not_found');
    }
    if (existing.shareCode) {
      return {
        shareCode: existing.shareCode,
        shareUrl: `${PUBLIC_BASE_URL}/p/${existing.shareCode}`,
      };
    }
    const shareCode = await this.generateUniqueShareCode();
    await notesRepository.setNoteShareCode(userId, clientId, shareCode);
    return {
      shareCode,
      shareUrl: `${PUBLIC_BASE_URL}/p/${shareCode}`,
    };
  }

  /** Unpublish: clear shareCode for the note. */
  async unpublishNote(userId: string, clientId: string): Promise<void> {
    const updated = await notesRepository.setNoteShareCode(
      userId,
      clientId,
      null,
    );
    if (!updated) {
      throw new NotFoundException('note_not_found');
    }
  }

  /** Get shared note by code (public, read-only). Returns null if not found or deleted. */
  async getSharedNote(code: string): Promise<{
    content: string;
    displayName: string | null;
    lastModified: Date;
  } | null> {
    const note = await notesRepository.findNoteByShareCode(code);
    return note;
  }
}
