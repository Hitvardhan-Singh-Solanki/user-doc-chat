import { Router, Request, Response } from "express";
import multer from "multer";
import { Queue } from "bullmq";

import { requireAuth } from "../middleware/auth.middleware";
import { fileUploadAsync } from "../controllers/fileUpload.controller";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/upload", requireAuth, upload.single("file"), fileUploadAsync);

export default router;
