import { Readable } from 'stream';
import { minioClient } from '../../database/repositories/minio.repo';

const bucket = 'user-files';

export async function uploadFileToMinio(key: string, buffer: Buffer) {
  try {
    await minioClient.makeBucket(bucket);
  } catch (error: any) {
    // Ignore bucket already exists errors, rethrow others
    if (
      error.code === 'BucketAlreadyOwnedByYou' ||
      error.code === 'BucketAlreadyExists' ||
      error.statusCode === 409
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
    let _total = 0;
    stream.on('data', (chunk: Buffer) => {
      _total += chunk.length;
      chunks.push(chunk);
    });
    stream.once('end', () => resolve(Buffer.concat(chunks)));
    stream.once('error', (err) => {
      stream.destroy();
      reject(err);
    });
  });
}
