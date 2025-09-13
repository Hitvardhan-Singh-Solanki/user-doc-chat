import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';

const router = Router();

const authController = new AuthController();

router.post('/signup', authController.signUp);
router.post('/login', authController.login);

export default router;
