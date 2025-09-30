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
   * Handles uploading a file and queueing it for processing
   */
  public fileUploadAsync = async (req: Request, res: Response) => {
    const log = req.log?.child({ handler: 'fileUpload' });
    log.info('Received file upload request');

    try {
      const file = req.file as MulterFile;
      const userId = ((req.user as any)?.userId ??
        (req.user as any)?.id) as string;

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
      res.status(500).json({ error: 'Failed to upload file' });
    }
  };

  /**
   * SSE endpoint for clients to receive file processing updates
   */
  public getFileStatus = async (req: Request, res: Response) => {
    const log = req.log.child({ handler: 'getFileStatus' });
    log.info('Received request for file status via SSE');

    try {
      const userId = (req.user as any)?.userId as string;
      const fileId = req.params.fileId;

      if (!userId) {
        log.error('Unauthorized user for SSE connection');
        throw createHttpError({ status: 401, message: 'Unauthorized' });
      }

      if (!fileId) {
        log.warn('File ID is missing from request parameters');
        throw createHttpError({ status: 400, message: 'File ID is required' });
      }

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
      if (err instanceof createHttpError.HttpError && 'status' in err) {
        log.warn(
          { status: err.status, message: err.message },
          'Client error while setting up SSE',
        );
        return res.status(err.status).json({ error: err.message });
      }

      log.error(
        { err, stack: (err as Error).stack },
        'An unexpected error occurred while setting up SSE',
      );
      res.status(500).json({ error: 'Failed to retrieve file status' });
    }
  };
}
