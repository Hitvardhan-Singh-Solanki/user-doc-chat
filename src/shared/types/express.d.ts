import { JwtPayload } from 'jsonwebtoken';
import type { Logger } from 'pino';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload | { [key: string]: any };
      log: Logger;
    }
  }
}
