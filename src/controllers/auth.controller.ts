import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { signJwt } from '../utils/jwt';
import { PostgresService } from '../services/postgres.service';

export class AuthController {
  private authService: AuthService;

  constructor() {
    const db = PostgresService.getInstance();
    const authService = new AuthService(db);
    this.authService = authService;
  }

  /**
   * Handles user signup
   */
  public signUp = async (req: Request, res: Response) => {
    const log = req.log.child({ handler: 'signUp' });
    log.info('Received signup request');

    try {
      const { email, password } = req.body as {
        email?: unknown;
        password?: unknown;
      };

      if (
        typeof email !== 'string' ||
        typeof password !== 'string' ||
        !email ||
        !password
      ) {
        log.warn('Missing email or password in request');
        return res
          .status(400)
          .json({ error: 'Email and password are required' });
      }

      const user = await this.authService.signUp(email, password);
      const token = signJwt({ userId: user.id, email: user.email });

      log.info(
        { userId: user.id, email: user.email },
        'User signed up successfully',
      );
      return res.status(201).json({ token });
    } catch (err: unknown) {
      if ((err as any)?.message === 'Email already in use') {
        log.warn('Attempted signup with an existing email');
        return res.status(409).json({ error: 'Email already in use' });
      }

      log.error(
        { err, stack: (err as Error).stack },
        'An unexpected error occurred during signup',
      );
      return res.status(500).json({ error: 'Something went wrong' });
    }
  };

  /**
   * Handles user login
   */
  public login = async (req: Request, res: Response) => {
    const log = req.log.child({ handler: 'login' });
    log.info('Received login request');

    try {
      const { email, password } = req.body as {
        email?: unknown;
        password?: unknown;
      };

      if (
        typeof email !== 'string' ||
        typeof password !== 'string' ||
        !email ||
        !password
      ) {
        log.warn('Missing email or password in request');
        return res
          .status(400)
          .json({ error: 'Email and password are required' });
      }

      const user = await this.authService.login(email, password);
      const token = signJwt({ userId: user.id, email: user.email });

      log.info({ userId: user.id }, 'User logged in successfully');
      return res.status(200).json({ token });
    } catch (err: unknown) {
      const msg = (err as any)?.message;
      if (msg === 'Invalid credentials') {
        log.warn('Attempted login with invalid credentials');
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      log.error(
        { err, stack: (err as Error).stack },
        'Unexpected error during login',
      );
      return res.status(500).json({ error: 'Something went wrong' });
    }
  };
}
