import { JwtPayload } from 'jsonwebtoken';

declare global {
  namespace Express {
import type { Logger } from 'pino';
import { JwtPayload } from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload | { [key: string]: any };
      log: Logger;
    }
  }
}
  }
}
