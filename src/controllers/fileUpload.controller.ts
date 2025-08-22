import { Request, Response } from "express";
import { uploadFileToMinio } from "../services/minio.service";
import { FileJob } from "../types";
import { Queue } from "bullmq";

const fileQueue = new Queue("file-processing", {
  connection: {
    host: process.env.REDIS_HOST || "redis",
    port: Number(process.env.REDIS_PORT || 6379),
  },
});

export async function fileUploadAsync(req: Request, res: Response) {
  try {
    const file = req.file;
    const userId = req.body.userId;

    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const bucket = "user-files";
    const key = `${Date.now()}-${file.originalname}`;
    await uploadFileToMinio(bucket, key, file.buffer);

    const job: FileJob = { bucket, key, userId };
    await fileQueue.add("process-file", job);

    res.json({ message: "File uploaded and queued", bucket, key });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload file" });
  }
}
