import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authRateLimit } from '@middleware/security.middleware';

const router = Router();

const authController = new AuthController();

router.post(
  '/signup',
  authRateLimit,
  authController.signUp.bind(authController),
);
router.post('/login', authRateLimit, authController.login.bind(authController));

export default router;
