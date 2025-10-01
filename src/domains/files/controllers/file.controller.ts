import { Request, Response } from 'express';
import { FileUploadService } from '../services/file-upload.service';
import { MulterFile } from '../../../shared/types';
import createHttpError from 'http-errors';
import { sseEmitter } from '../../../infrastructure/monitoring/notification.service';
import { PostgresService } from '../../../infrastructure/database/repositories/postgres.repository';

export class FileController {
  private fileUploadService: FileUploadService;

  constructor(fileUploadService?: FileUploadService) {
    const dbAdapter = PostgresService.getInstance();
    this.fileUploadService =
      fileUploadService ?? new FileUploadService(dbAdapter);
  }

  /**
   * Extracts user ID from request with RFC-7519 compliant logic
   * @param req Express request object
   * @returns User ID string or undefined if not found
   */
  private extractUserId(req: Request): string | undefined {
    const user = req.user as any;

    // RFC-7519 compliant: prioritize 'sub' claim
    if (user?.sub) {
      return user.sub;
    }

    // Migration fallback for legacy tokens (deprecated)
    const legacyId = user?.userId ?? user?.id;
    if (legacyId) {
      req.log?.warn(
        {
          legacyClaim: user?.userId ? 'userId' : 'id',
          tokenIssuedAt: user?.iat,
          tokenExpiresAt: user?.exp,
        },
        'Using legacy JWT claim for user identification. Please re-authenticate to receive RFC-7519 compliant token.',
      );
      return legacyId;
    }

    return undefined;
  }

  /**
   * Handles uploading a file and queueing it for processing
   */
  public fileUploadAsync = async (req: Request, res: Response) => {
    const log = req.log.child({ handler: 'fileUpload' });
    log.info('Received file upload request');

    try {
      const file = req.file as MulterFile;
      const userId = this.extractUserId(req);

      if (!file) {
        log.warn('No file was uploaded');
        throw createHttpError({ status: 400, message: 'No file uploaded' });
      }

      if (!userId) {
        log.error('Unauthorized user for file upload');
        throw createHttpError({ status: 401, message: 'Unauthorized' });
      }

      log.info(
        {
          userId,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
        },
        'Validating and queuing file',
      );
      await this.fileUploadService.upload(file, userId);

      log.info('File successfully uploaded and queued');
      res.status(201).json({
        message: 'File uploaded and queued',
      });
    } catch (err) {
      if (err instanceof createHttpError.HttpError && 'status' in err) {
        log.warn(
          { status: err.status, message: err.message },
          'Client error during file upload',
        );
        return res.status(err.status).json({ error: err.message });
      }

      log.error(
        { err, stack: (err as Error).stack },
        'An unexpected error occurred during file upload',
      );
      return res.status(500).json({ error: 'Failed to upload file' });
    }
  };

  /**
   * SSE endpoint for clients to receive file processing updates
   */
  public getFileStatus = async (req: Request, res: Response) => {
    const log = req.log.child({ handler: 'getFileStatus' });
    log.info('Received request for file status via SSE');

    // Validate all inputs and perform operations that can throw BEFORE setting SSE headers
    const userId = this.extractUserId(req);
    const fileId = req.params.fileId;

    if (!userId) {
      log.error('Unauthorized user for SSE connection');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!fileId) {
      log.warn('File ID is missing from request parameters');
      return res.status(400).json({ error: 'File ID is required' });
    }

    try {
      // Verify user has access to the specified file before setting SSE headers
      log.info({ userId, fileId }, 'Verifying file access permissions');
      const hasAccess = await this.fileUploadService.verifyFileAccess(
        userId,
        fileId,
      );

      if (!hasAccess) {
        log.warn({ userId, fileId }, 'User denied access to file');
        return res.status(403).json({ error: 'Forbidden' });
      }

      log.info(
        { userId, fileId },
        'File access verified, setting up SSE connection',
      );

      // Set SSE headers only after all validation and authorization passes
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      log.info({ userId, fileId }, 'Adding new client to SSE emitter');
      sseEmitter.addClient(userId, res);

      req.on('close', () => {
        log.info('Client disconnected from SSE');
        sseEmitter.removeClient(userId, res);
      });
    } catch (err) {
      // Graceful shutdown: log error and close connection cleanly
      log.error(
        { err, stack: (err as Error).stack },
        'An unexpected error occurred while setting up SSE connection',
      );

      // Send a final SSE comment to indicate error and close connection
      try {
        res.write(': SSE connection error occurred\n\n');
      } catch (writeErr) {
        log.warn({ writeErr }, 'Failed to write final SSE comment');
      }

      // End the response to close the connection cleanly
      res.end();
      return; // Explicit return to ensure handler exits immediately
    }
  };
}
