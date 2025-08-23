import { Request, Response } from "express";
import { fileUpload } from "../services/file-upload.service";
import { MulterFile } from "../types";

export async function fileUploadAsync(req: Request, res: Response) {
  try {
    const file = req.file as MulterFile;
    const userId = req.user?.id;

    if (!file) res.status(400).json({ error: "No file uploaded" });

    await fileUpload(file, userId);

    res.status(201).json({
      message: "File uploaded and queued",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload file" });
  }
}
