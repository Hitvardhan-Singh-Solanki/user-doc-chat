import { fileTypeFromBuffer } from "file-type";
import { uploadFileToMinio } from "./minio.service";
import { FileJob, MulterFile, UserFileRecord } from "../types";
import { fileQueue } from "../repos/bullmq.repo";
import { v4 as uuid } from "uuid";
import createHttpError from "http-errors";
import { IDBStore } from "../interfaces/db-store.interface";

const acceptedMimeTypes = [
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export class FileUploadService {
  private db: IDBStore;

  constructor(dbStore: IDBStore) {
    this.db = dbStore;
  }

  public async upload(file: MulterFile, userId: string) {
    try {
      if (!file?.buffer || file.buffer.length === 0) {
        throw createHttpError({
          status: 400,
          message: "No file content uploaded",
        });
      }

      const detected = await fileTypeFromBuffer(file.buffer!);
      const mime = detected?.mime ?? file.mimetype;
      if (!mime || !acceptedMimeTypes.includes(mime)) {
        throw createHttpError({
          status: 400,
          message: "Unsupported file type",
        });
      }

      const key = `${uuid()}-${file.originalname}`;
      await uploadFileToMinio(key, file.buffer!);

      const result = await this.db.query<UserFileRecord>(
        `
        INSERT INTO user_files (file_name, file_size, owner_id, status)
        VALUES ($1, $2, $3, $4)
        RETURNING id, file_name, file_size, owner_id, status, created_at, updated_at
        `,
        [file.originalname, file.size, userId, "uploaded"]
      );
      const fileRecord = result.rows[0];

      const job: FileJob = { key, userId, fileId: fileRecord.id };
      console.log("Adding job to queue:", job);
      try {
        await fileQueue.add("process-file", job);
      } catch (e) {
        await this.db.query(
          `UPDATE user_files SET status = $1, error_message = $2 WHERE id = $3`,
          ["failed", (e as Error).message, fileRecord.id]
        );
        throw e;
      }
      return fileRecord;
    } catch (error) {
      console.error("File upload failed:", error);
      if (error instanceof createHttpError.HttpError) throw error;
      throw createHttpError({ status: 500, message: "File upload failed" });
    }
  }
}
