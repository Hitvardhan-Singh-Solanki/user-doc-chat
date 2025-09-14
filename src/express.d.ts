import { JwtPayload } from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload | { [key: string]: any };
      log: PinoLogger;
    }
  }
}
