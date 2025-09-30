import { Request, Response, NextFunction } from 'express';
import { logger } from '../../config/logger';
import { v4 as uuidv4 } from 'uuid';

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const correlationId = req.headers['x-request-id'] || uuidv4();

  req.log = logger.child({
    correlationId,
    endpoint: req.originalUrl,
    method: req.method,
  });

  req.log.info('request started');

  res.on('finish', () => {
    req.log.info({ status: res.statusCode }, 'request completed');
  });

  res.setHeader('x-request-id', correlationId);

  next();
};
