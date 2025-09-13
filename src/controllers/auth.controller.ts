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
        return res
          .status(400)
          .json({ error: 'Email and password are required' });
      }

      const user = await this.authService.signUp(email, password);
      const token = signJwt({ userId: user.id, email: user.email });

      return res.status(201).json(token);
    } catch (err: unknown) {
      if ((err as any)?.message === 'Email already in use') {
        return res.status(409).json({ error: 'Email already in use' });
      }
      console.error(err);
      return res.status(500).json({ error: 'Something went wrong' });
    }
  };

  /**
   * Handles user login
   */
  public login = async (req: Request, res: Response) => {
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
        return res
          .status(400)
          .json({ error: 'Email and password are required' });
      }

      const user = await this.authService.login(email, password);
      const token = signJwt({ userId: user.id, email: user.email });

      return res.status(200).json(token);
    } catch (_err: unknown) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
  };
}
