import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../../../shared/middleware/auth.middleware';
import { FileController } from '../controllers/file.controller';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024),
  },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['application/pdf', 'text/plain', 'text/markdown']);
    if (allowed.has(file.mimetype)) return cb(null, true);
    cb(new Error('Unsupported file type'));
  },
});

const fileController = new FileController();

router.post(
  '/upload',
  requireAuth,
  upload.single('file'),
  fileController.fileUploadAsync,
);

router.get('/status/:fileId', requireAuth, fileController.getFileStatus);

export default router;
