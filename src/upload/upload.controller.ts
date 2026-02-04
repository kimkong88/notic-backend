import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /**
   * POST /upload/image
   * Body: multipart/form-data with field "file" (image file).
   * Returns: { url: string } CloudFront URL of the uploaded image.
   * No auth required (e.g. for use in PiP or unauthenticated contexts).
   */
  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ url: string }> {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file provided; use form field "file"');
    }
    const url = await this.uploadService.uploadImage(
      file.buffer,
      file.originalname || 'image',
      file.mimetype || 'application/octet-stream',
    );
    return { url };
  }
}
