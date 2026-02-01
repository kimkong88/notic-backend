import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

/** Dynamic require so build works when @aws-sdk/client-s3 isn't resolved (e.g. multi-root workspace). */
function loadS3(): { S3Client: new (c: object) => { send: (cmd: object) => Promise<void> }; PutObjectCommand: new (p: object) => object } {
  return require('@aws-sdk/client-s3');
}

const ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly s3Client: { send: (cmd: object) => Promise<void> };
  private readonly putObjectCommandCtor: new (params: object) => object;
  private readonly bucketName: string;
  private readonly cloudfrontUrl: string;

  constructor() {
    const region = process.env.NOTIC_AWS_REGION || 'us-east-1';
    const accessKeyId = process.env.NOTIC_AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.NOTIC_AWS_SECRET_ACCESS_KEY;
    this.bucketName = process.env.NOTIC_S3_BUCKET_NAME || '';
    this.cloudfrontUrl =
      (process.env.NOTIC_CLOUDFRONT_URL || '').replace(/\/$/, '');

    if (!this.bucketName || !this.cloudfrontUrl) {
      this.logger.warn(
        'S3/CloudFront not configured: NOTIC_S3_BUCKET_NAME and NOTIC_CLOUDFRONT_URL must be set for image uploads',
      );
    }

    const { S3Client, PutObjectCommand } = loadS3();
    this.putObjectCommandCtor = PutObjectCommand;
    this.s3Client = new S3Client({
      region,
      ...(accessKeyId &&
        secretAccessKey && {
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
        }),
    });
  }

  /**
   * Upload image buffer to S3 and return the CloudFront URL.
   * Key format: images/YYYY/MM/DD/timestamp-random.ext
   */
  async uploadImage(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<string> {
    if (!this.bucketName || !this.cloudfrontUrl) {
      throw new BadRequestException(
        'Image upload is not configured (missing S3/CloudFront env)',
      );
    }

    if (!ALLOWED_MIMES.includes(mimeType)) {
      throw new BadRequestException(
        `Invalid image type: ${mimeType}. Allowed: ${ALLOWED_MIMES.join(', ')}`,
      );
    }

    if (buffer.length > MAX_SIZE_BYTES) {
      throw new BadRequestException(
        `Image too large (max ${MAX_SIZE_BYTES / 1024 / 1024} MB)`,
      );
    }

    const ext =
      mimeType === 'image/svg+xml'
        ? 'svg'
        : mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    // Strip existing extension from original name to avoid "file.png.png"
    const baseName = (originalName || 'image').replace(/\.[a-zA-Z0-9]{2,5}$/i, '').trim() || 'image';
    const safeName = baseName
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 80) || 'image';
    const rand = randomBytes(4).toString('hex');
    const key = `images/${year}/${month}/${day}/${Date.now()}-${rand}-${safeName}.${ext}`;

    const command = new this.putObjectCommandCtor({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    });

    await this.s3Client.send(command);
    const url = `${this.cloudfrontUrl}/${key}`;
    this.logger.log(`Image uploaded: ${url}`);
    return url;
  }
}
