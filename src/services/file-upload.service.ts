import { fileTypeFromBuffer } from "file-type";
import { uploadFileToMinio } from "./minio.service";
import { db } from "../repos/db.repo";
import { FileJob, MulterFile } from "../types";
import { fileQueue } from "../repos/bullmq.repo";
import { v4 as uuid } from "uuid";

const acceptedMimeTypes = [
  "application/pdf",
  "text/plain",
  "application/msword",
];

export async function fileUpload(file: MulterFile, userId: string) {
  if (!userId) throw new Error("Unauthorized");

  const type = await fileTypeFromBuffer(file.buffer!);
  if (!type || !acceptedMimeTypes.includes(type.mime)) {
    throw new Error("Unsupported file type");
  }

  const key = `${uuid()}-${file.originalname}`;
  await uploadFileToMinio(key, file.buffer!);

  const result = await db.query(
    `
      INSERT INTO user_files (file_name, file_size, owner_id, status)
      VALUES ($1, $2, $3, $4)
      RETURNING id, file_name, file_size, status, created_at
      `,
    [file.originalname, file.size, userId, "uploaded"]
  );
  const fileRecord = result.rows[0];

  const job: FileJob = { key, userId, fileId: fileRecord.id };
  await fileQueue.add("process-file", job);
}
