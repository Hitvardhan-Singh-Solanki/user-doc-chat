import { fileTypeFromBuffer } from "file-type";
import { uploadFileToMinio } from "./minio.service";
import { db } from "../repos/db.repo";
import { FileJob, MulterFile } from "../types";
import { fileQueue } from "../repos/bullmq.repo";
import { v4 as uuid } from "uuid";
import createHttpError from "http-errors";

const acceptedMimeTypes = [
  "application/pdf",
  "text/plain",
  "application/msword",
];

export async function fileUpload(file: MulterFile, userId: string) {
  try {
    if (!file?.buffer || file.buffer.length === 0) {
      throw createHttpError({
        status: 400,
        message: "No file content uploaded",
      });
    }

    const type = await fileTypeFromBuffer(file.buffer!);
    if (!type || !acceptedMimeTypes.includes(type.mime)) {
      throw createHttpError({ status: 400, message: "Unsupported file type" });
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
    console.log("Adding job to queue:", job);
    await fileQueue.add("process-file", job);
  } catch (error) {
    console.error("File upload failed:", error);
    if (error instanceof createHttpError.HttpError) {
      throw error;
    }

    throw createHttpError({ status: 500, message: "File upload failed" });
  }
}
