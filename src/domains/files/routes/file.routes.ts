import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../../../shared/middleware/auth.middleware';
import { fileUploadRateLimit } from '../../../shared/middleware/security.middleware';
import { FileController } from '../controllers/file.controller';
import { config } from '@config';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.MAX_UPLOAD_BYTES,
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
  fileUploadRateLimit,
  upload.single('file'),
  fileController.fileUploadAsync,
);

router.get('/status/:fileId', requireAuth, fileController.getFileStatus);

export default router;
