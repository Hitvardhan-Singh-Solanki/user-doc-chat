import { Readable } from 'stream';
import { minioClient } from '../repos/minio.repo';

const bucket = 'user-files';

export async function uploadFileToMinio(key: string, buffer: Buffer) {
  const exists = await minioClient.bucketExists(bucket);
  if (!exists) await minioClient.makeBucket(bucket);

  await minioClient.putObject(bucket, key, buffer);
}

export async function downloadFile(key: string): Promise<Buffer> {
  const stream: Readable = await minioClient.getObject(bucket, key);
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    let total = 0;
    stream.on('data', (chunk: Buffer) => {
      total += chunk.length;
      chunks.push(chunk);
    });
    stream.once('end', () => resolve(Buffer.concat(chunks)));
    stream.once('error', (err) => {
      stream.destroy();
      reject(err);
    });
  });
}
