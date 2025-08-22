import { Router, Request, Response } from "express";
import multer from "multer";
import { Queue } from "bullmq";

import { requireAuth } from "../middleware/auth.middleware";
import { uploadFileToMinio } from "../services/minio.service";
import { FileJob } from "../types";
import { fileUploadAsync } from "../controllers/fileUpload.controller";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// BullMQ queue
const fileQueue = new Queue("file-processing", {
  connection: { host: "redis", port: Number(process.env.REDIS_PORT || 6379) },
});

router.post("/upload", requireAuth, upload.single("file"), fileUploadAsync);

export default router;
