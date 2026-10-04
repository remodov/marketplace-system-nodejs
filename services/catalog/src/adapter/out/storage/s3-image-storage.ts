import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Clock, ImageStorage, PresignedUpload } from '../../../core/product/port/out/ports';

export type S3Settings = {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  uploadUrlTtlSeconds: number;
};

export class S3ImageStorage implements ImageStorage {
  private readonly client: S3Client;

  constructor(
    private readonly settings: S3Settings,
    private readonly clock: Clock,
  ) {
    this.client = new S3Client({
      endpoint: settings.endpoint,
      region: settings.region,
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      credentials: { accessKeyId: settings.accessKey, secretAccessKey: settings.secretKey },
    });
  }

  async presignUpload(key: string, contentType: string): Promise<PresignedUpload> {
    const signedAt = this.clock.now();
    const put = new PutObjectCommand({ Bucket: this.settings.bucket, Key: key, ContentType: contentType });
    const url = await getSignedUrl(this.client, put, {
      expiresIn: this.settings.uploadUrlTtlSeconds,
      signingDate: signedAt,
      signableHeaders: new Set(['content-type']),
    });
    return { key, url, expiresAt: new Date(signedAt.getTime() + this.settings.uploadUrlTtlSeconds * 1000) };
  }
}
