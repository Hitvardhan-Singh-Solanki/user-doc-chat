import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.middleware";
import { FileController } from "../controllers/file-upload.controller";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const fileController = new FileController();

router.post(
  "/upload",
  requireAuth,
  upload.single("file"),
  fileController.fileUploadAsync
);

router.get("/status/:fileId", requireAuth, fileController.getFileStatus);

export default router;
