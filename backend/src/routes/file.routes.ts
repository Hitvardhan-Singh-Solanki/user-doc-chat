import { Router, Request, Response } from "express";
import multer from "multer";
import { Queue } from "bullmq";

import { requireAuth } from "../middleware/auth.middleware";
import { uploadFileToMinio } from "../services/minio.service";
import { FileJob } from "../types";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// BullMQ queue
const fileQueue = new Queue("file-processing", {
  connection: { host: "redis", port: Number(process.env.REDIS_PORT || 6379) },
});

router.post(
  "/upload",
  requireAuth,
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      const userId = req.body.userId;

      if (!file) return res.status(400).json({ error: "No file uploaded" });

      // Upload to MinIO
      const bucket = "user-files";
      const key = `${Date.now()}-${file.originalname}`;
      await uploadFileToMinio(bucket, key, file.buffer);

      // Add job to queue
      const job: FileJob = { bucket, key, userId };
      await fileQueue.add("process-file", job);

      res.json({ message: "File uploaded and queued", bucket, key });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to upload file" });
    }
  }
);

export default router;
