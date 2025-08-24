import { Request, Response } from "express";
import { fileUpload } from "../services/file-upload.service";
import { MulterFile } from "../types";
import createHttpError from "http-errors";
import { sseEmitter } from "../services/notify.service";

export async function fileUploadAsync(req: Request, res: Response) {
  try {
    const file = req.file as MulterFile;
    const userId = (req.user as any)?.userId as string;

    if (!file)
      throw createHttpError({ status: 400, message: "No file uploaded" });

    if (!userId)
      throw createHttpError({ status: 401, message: "Unauthorized" });

    await fileUpload(file, userId);

    res.status(201).json({
      message: "File uploaded and queued",
    });
  } catch (err) {
    console.error(err);
    if (err instanceof createHttpError.HttpError && "status" in err) {
      return res.status((err as any).status).json({ error: err.message });
    }
    res.status(500).json({ error: "Failed to upload file" });
  }
}

export async function getFileStatus(req: Request, res: Response) {
  try {
    const userId = (req.user as any)?.userId as string;
    const fileId = req.params.fileId;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    if (!userId)
      throw createHttpError({ status: 401, message: "Unauthorized" });

    if (!fileId)
      throw createHttpError({ status: 400, message: "File ID is required" });

    sseEmitter.addClient(userId, res);

    req.on("close", () => {
      sseEmitter.removeClient(userId, res);
    });
  } catch (err) {
    console.error(err);
    if (err instanceof createHttpError.HttpError && "status" in err) {
      return res.status((err as any).status).json({ error: err.message });
    }
    res.status(500).json({ error: "Failed to retrieve file status" });
  }
}
