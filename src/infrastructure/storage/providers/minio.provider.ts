import { Readable } from 'stream';
import { minioClient } from '@database/repositories/minio.repo';

import { config } from '@config';

const bucket = config.MINIO_DEFAULT_BUCKET;

if (!bucket || !bucket.trim()) {
  throw new Error('MINIO_DEFAULT_BUCKET is required');
}

export async function uploadFileToMinio(key: string, buffer: Buffer) {
  try {
    await minioClient.makeBucket(bucket);
  } catch (error: unknown) {
    // Ignore bucket already exists errors, rethrow others
    if (
      (error as { code?: string }).code === 'BucketAlreadyOwnedByYou' ||
      (error as { code?: string }).code === 'BucketAlreadyExists' ||
      (error as { statusCode?: number }).statusCode === 409
    ) {
      // Bucket already exists, continue
    } else {
      throw error;
    }
  }

  await minioClient.putObject(bucket, key, buffer);
}

export async function downloadFile(key: string): Promise<Buffer> {
  const stream: Readable = await minioClient.getObject(bucket, key);
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    stream.once('end', () => resolve(Buffer.concat(chunks)));
    stream.once('error', (err) => {
      stream.destroy();
      reject(err);
    });
  });
}
