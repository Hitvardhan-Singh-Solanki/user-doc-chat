import { Request, Response } from "express";
import { FileUploadService } from "../services/file-upload.service";
import { MulterFile } from "../types";
import createHttpError from "http-errors";
import { sseEmitter } from "../services/notify.service";
import { PostgresService } from "../services/postgres.service";

export class FileController {
  private fileUploadService: FileUploadService;

  constructor(fileUploadService?: FileUploadService) {
    const dbAdapter = PostgresService.getInstance();
    this.fileUploadService =
      fileUploadService ?? new FileUploadService(dbAdapter);
  }

  /**
   * Handles uploading a file and queueing it for processing
   */
  public fileUploadAsync = async (req: Request, res: Response) => {
    try {
      const file = req.file as MulterFile;
      const userId = (req.user as any)?.userId as string;

      if (!file)
        throw createHttpError({ status: 400, message: "No file uploaded" });

      if (!userId)
        throw createHttpError({ status: 401, message: "Unauthorized" });

      await this.fileUploadService.upload(file, userId);

      res.status(201).json({
        message: "File uploaded and queued",
      });
    } catch (err) {
      console.error(err);
      if (err instanceof createHttpError.HttpError && "status" in err) {
        return res.status(err.status).json({ error: err.message });
      }
      res.status(500).json({ error: "Failed to upload file" });
    }
  };

  /**
   * SSE endpoint for clients to receive file processing updates
   */
  public getFileStatus = async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.userId as string;
      const fileId = req.params.fileId;

      if (!userId)
        throw createHttpError({ status: 401, message: "Unauthorized" });

      if (!fileId)
        throw createHttpError({ status: 400, message: "File ID is required" });

      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      // res.setHeader("X-Accel-Buffering", "no"); // for Nginx if needed
      res.flushHeaders?.();

      sseEmitter.addClient(userId, res);

      req.on("close", () => {
        sseEmitter.removeClient(userId, res);
      });
    } catch (err) {
      console.error(err);
      if (err instanceof createHttpError.HttpError && "status" in err) {
        return res.status(err.status).json({ error: err.message });
      }
      res.status(500).json({ error: "Failed to retrieve file status" });
    }
  };
}
