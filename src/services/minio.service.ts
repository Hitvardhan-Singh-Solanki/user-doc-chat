import { Client } from "minio";
import { Readable } from "stream";

const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT!,
  port: Number(process.env.MINIO_PORT || 9000),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!,
});

export async function uploadFileToMinio(
  bucket: string,
  key: string,
  buffer: Buffer
) {
  const exists = await minioClient.bucketExists(bucket);
  if (!exists) await minioClient.makeBucket(bucket);

  await minioClient.putObject(bucket, key, buffer);
}

export async function downloadFile(
  bucket: string,
  key: string
): Promise<Buffer> {
  const stream: Readable = await minioClient.getObject(bucket, key);
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}
