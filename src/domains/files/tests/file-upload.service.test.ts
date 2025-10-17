import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileUploadService } from '../services/file-upload.service';
import { IDBStore } from '@interfaces/db-store.interface';
import { MulterFile, UserFileRecord } from '@shared/types';
import * as minioService from '@storage/providers/minio.provider';
import { queueAdapter } from '@queue/providers/bullmq.provider';
import { fileTypeFromBuffer } from 'file-type';
import createHttpError from 'http-errors';
import { createDatabaseMock } from '@tests/mocks';

// Mock external dependencies
vi.mock('file-type', () => ({
  fileTypeFromBuffer: vi.fn(),
}));

vi.mock('@storage/providers/minio.provider', () => ({
  uploadFileToMinio: vi.fn(),
}));

vi.mock('@queue/providers/bullmq.provider', () => ({
  queueAdapter: {
    enqueue: vi.fn(),
  },
  fileQueueName: 'file-processing',
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-1234'),
}));

describe('FileUploadService', () => {
  let fileUploadService: FileUploadService;
  let mockDb: IDBStore;
  let mockFileTypeFromBuffer: ReturnType<typeof vi.fn>;
  let mockUploadFileToMinio: ReturnType<typeof vi.fn>;
  let mockQueueAdapter: {
    enqueue: ReturnType<typeof vi.fn>;
    getJobStatus: ReturnType<typeof vi.fn>;
    getQueueEvents: ReturnType<typeof vi.fn>;
    getQueue: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Setup mocks using common mock builders
    mockDb = createDatabaseMock();

    mockFileTypeFromBuffer = vi.mocked(fileTypeFromBuffer);
    mockUploadFileToMinio = vi.mocked(minioService.uploadFileToMinio);
    mockQueueAdapter = vi.mocked(queueAdapter);

    fileUploadService = new FileUploadService(mockDb);

    // Reset mocks
    vi.clearAllMocks();
  });

  const createMockFile = (
    mimetype: string = 'application/pdf',
    originalname: string = 'test.pdf',
    size: number = 1024,
    buffer: Buffer = Buffer.from('test content'),
  ): MulterFile => ({
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype,
    size,
    buffer,
    destination: '',
    filename: '',
    path: '',
  });

  describe('upload', () => {
    it('should successfully upload a PDF file', async () => {
      const mockFile = createMockFile('application/pdf', 'document.pdf', 2048);
      const userId = 'user123';
      const mockFileRecord: UserFileRecord = {
        id: 'file123',
        file_name: 'document.pdf',
        file_size: '2048',
        owner_id: userId,
        status: 'uploaded',
        created_at: new Date().toDateString(),
        updated_at: new Date().toDateString(),
      };

      mockFileTypeFromBuffer.mockResolvedValue({ mime: 'application/pdf' });
      mockUploadFileToMinio.mockResolvedValue(undefined);
      mockDb.query = vi.fn().mockResolvedValue({
        rows: [mockFileRecord],
      });
      mockQueueAdapter.enqueue.mockResolvedValue(undefined);

      const result = await fileUploadService.upload(mockFile, userId);

      expect(mockFileTypeFromBuffer).toHaveBeenCalledWith(mockFile.buffer);
      expect(mockUploadFileToMinio).toHaveBeenCalledWith(
        expect.stringMatching(
          /^user-uploads\/user123\/mock-uuid-1234-document\.pdf$/,
        ),
        mockFile.buffer,
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_files'),
        ['document.pdf', 2048, userId, 'uploaded'],
      );
      expect(mockQueueAdapter.enqueue).toHaveBeenCalledWith(
        'file-processing',
        'process-file',
        {
          key: expect.stringMatching(
            /^user-uploads\/user123\/mock-uuid-1234-document\.pdf$/,
          ),
          userId,
          fileId: 'file123',
        },
      );
      expect(result).toEqual(mockFileRecord);
    });

    it('should successfully upload a text file', async () => {
      const mockFile = createMockFile('text/plain', 'document.txt', 512);
      const userId = 'user123';
      const mockFileRecord: UserFileRecord = {
        id: 'file123',
        file_name: 'document.txt',
        file_size: '512',
        owner_id: userId,
        status: 'uploaded',
        created_at: new Date().toDateString(),
        updated_at: new Date().toDateString(),
      };

      mockFileTypeFromBuffer.mockResolvedValue({ mime: 'text/plain' });
      mockUploadFileToMinio.mockResolvedValue(undefined);
      mockDb.query = vi.fn().mockResolvedValue({
        rows: [mockFileRecord],
      });
      mockQueueAdapter.enqueue.mockResolvedValue(undefined);

      const result = await fileUploadService.upload(mockFile, userId);

      expect(result).toEqual(mockFileRecord);
    });

    it('should successfully upload a Word document', async () => {
      const mockFile = createMockFile(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'document.docx',
        4096,
      );
      const userId = 'user123';
      const mockFileRecord: UserFileRecord = {
        id: 'file123',
        file_name: 'document.docx',
        file_size: '4096',
        owner_id: userId,
        status: 'uploaded',
        created_at: new Date().toDateString(),
        updated_at: new Date().toDateString(),
      };

      mockFileTypeFromBuffer.mockResolvedValue({
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      mockUploadFileToMinio.mockResolvedValue(undefined);
      mockDb.query = vi.fn().mockResolvedValue({
        rows: [mockFileRecord],
      });
      mockQueueAdapter.enqueue.mockResolvedValue(undefined);

      const result = await fileUploadService.upload(mockFile, userId);

      expect(result).toEqual(mockFileRecord);
    });

    it('should throw error when file buffer is empty', async () => {
      const mockFile = createMockFile(
        'application/pdf',
        'test.pdf',
        0,
        Buffer.alloc(0),
      );
      const userId = 'user123';

      await expect(fileUploadService.upload(mockFile, userId)).rejects.toThrow(
        'No file content uploaded',
      );

      expect(mockFileTypeFromBuffer).not.toHaveBeenCalled();
      expect(mockUploadFileToMinio).not.toHaveBeenCalled();
    });

    it('should throw error when file buffer is undefined', async () => {
      const mockFile: MulterFile = {
        ...createMockFile(),
        buffer: undefined as Buffer | undefined,
      };
      const userId = 'user123';

      await expect(fileUploadService.upload(mockFile, userId)).rejects.toThrow(
        'No file content uploaded',
      );
    });

    it('should throw error for unsupported file type', async () => {
      const mockFile = createMockFile('image/jpeg', 'image.jpg', 1024);
      const userId = 'user123';

      mockFileTypeFromBuffer.mockResolvedValue({ mime: 'image/jpeg' });

      await expect(fileUploadService.upload(mockFile, userId)).rejects.toThrow(
        'File type image/jpeg not supported',
      );

      expect(mockUploadFileToMinio).not.toHaveBeenCalled();
    });

    it('should reject upload when file-type detection returns null', async () => {
      const mockFile = createMockFile('image/jpeg', 'document.pdf', 1024);
      const userId = 'user123';

      mockFileTypeFromBuffer.mockResolvedValue(null);

      await expect(fileUploadService.upload(mockFile, userId)).rejects.toThrow(
        'Unable to verify file type. File signature detection failed.',
      );

      expect(mockUploadFileToMinio).not.toHaveBeenCalled();
      expect(mockQueueAdapter.enqueue).not.toHaveBeenCalled();
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it('should reject upload when file-type detection throws an error', async () => {
      const mockFile = createMockFile('application/pdf', 'document.pdf', 1024);
      const userId = 'user123';

      mockFileTypeFromBuffer.mockRejectedValue(
        new Error('File type detection failed'),
      );

      await expect(fileUploadService.upload(mockFile, userId)).rejects.toThrow(
        'File upload failed',
      );

      expect(mockUploadFileToMinio).not.toHaveBeenCalled();
      expect(mockQueueAdapter.enqueue).not.toHaveBeenCalled();
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it('should throw error when detected mimetype is unsupported', async () => {
      const mockFile = createMockFile('application/pdf', 'fake.pdf', 1024);
      const userId = 'user123';

      // Simulate file with PDF extension but actually JPEG content
      mockFileTypeFromBuffer.mockResolvedValue({ mime: 'image/jpeg' });

      await expect(fileUploadService.upload(mockFile, userId)).rejects.toThrow(
        'File type image/jpeg not supported',
      );
    });

    it('should handle minio upload failure', async () => {
      const mockFile = createMockFile('application/pdf', 'document.pdf', 1024);
      const userId = 'user123';

      mockFileTypeFromBuffer.mockResolvedValue({ mime: 'application/pdf' });
      mockUploadFileToMinio.mockRejectedValue(new Error('Minio upload failed'));

      await expect(fileUploadService.upload(mockFile, userId)).rejects.toThrow(
        'File upload failed',
      );

      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it('should handle database insertion failure', async () => {
      const mockFile = createMockFile('application/pdf', 'document.pdf', 1024);
      const userId = 'user123';

      mockFileTypeFromBuffer.mockResolvedValue({ mime: 'application/pdf' });
      mockUploadFileToMinio.mockResolvedValue(undefined);
      mockDb.query = vi.fn().mockRejectedValue(new Error('Database error'));

      await expect(fileUploadService.upload(mockFile, userId)).rejects.toThrow(
        'File upload failed',
      );

      expect(mockQueueAdapter.enqueue).not.toHaveBeenCalled();
    });

    it('should update file status to failed when queue job fails', async () => {
      const mockFile = createMockFile('application/pdf', 'document.pdf', 1024);
      const userId = 'user123';
      const mockFileRecord: UserFileRecord = {
        id: 'file123',
        file_name: 'document.pdf',
        file_size: '1024',
        owner_id: userId,
        status: 'uploaded',
        created_at: new Date().toDateString(),
        updated_at: new Date().toDateString(),
      };
      const queueError = new Error('Queue processing failed');

      mockFileTypeFromBuffer.mockResolvedValue({ mime: 'application/pdf' });
      mockUploadFileToMinio.mockResolvedValue(undefined);
      mockDb.query = vi
        .fn()
        .mockResolvedValueOnce({
          rows: [mockFileRecord],
        })
        .mockResolvedValueOnce({ rows: [] }); // For the update query
      mockQueueAdapter.enqueue.mockRejectedValue(queueError);

      await expect(fileUploadService.upload(mockFile, userId)).rejects.toThrow(
        'File upload failed',
      );

      expect(mockDb.query).toHaveBeenCalledTimes(2);
      expect(mockDb.query).toHaveBeenLastCalledWith(
        'UPDATE user_files\n                 SET status = $1,\n                     error_message = $2\n                 WHERE id = $3',
        ['failed', 'Queue processing failed', 'file123'],
      );
    });

    it('should handle unknown errors and wrap them in HTTP errors', async () => {
      const mockFile = createMockFile('application/pdf', 'document.pdf', 1024);
      const userId = 'user123';

      mockFileTypeFromBuffer.mockRejectedValue(new Error('Unknown error'));

      await expect(fileUploadService.upload(mockFile, userId)).rejects.toThrow(
        'File upload failed',
      );
    });

    it('should preserve HTTP errors without wrapping', async () => {
      const mockFile = createMockFile('application/pdf', 'document.pdf', 1024);
      const userId = 'user123';
      const httpError = createHttpError(400, 'Custom HTTP error');

      mockFileTypeFromBuffer.mockRejectedValue(httpError);

      await expect(fileUploadService.upload(mockFile, userId)).rejects.toThrow(
        'Custom HTTP error',
      );
    });

    it('should handle empty original filename', async () => {
      const mockFile = createMockFile('application/pdf', '', 1024);
      const userId = 'user123';
      const mockFileRecord: UserFileRecord = {
        id: 'file123',
        file_name: '',
        file_size: '1024',
        owner_id: userId,
        status: 'uploaded',
        created_at: new Date().toDateString(),
        updated_at: new Date().toDateString(),
      };

      mockFileTypeFromBuffer.mockResolvedValue({ mime: 'application/pdf' });
      mockUploadFileToMinio.mockResolvedValue(undefined);
      mockDb.query = vi.fn().mockResolvedValue({
        rows: [mockFileRecord],
      });
      mockQueueAdapter.enqueue.mockResolvedValue(undefined);

      await expect(fileUploadService.upload(mockFile, userId)).rejects.toThrow(
        'Invalid filename',
      );

      expect(mockUploadFileToMinio).not.toHaveBeenCalled();
    });

    it('should handle special characters in filename', async () => {
      const mockFile = createMockFile(
        'application/pdf',
        'test file (1) @#$.pdf',
        1024,
      );
      const userId = 'user123';
      const mockFileRecord: UserFileRecord = {
        id: 'file123',
        file_name: 'test file (1) @#$.pdf',
        file_size: '1024',
        owner_id: userId,
        status: 'uploaded',
        created_at: new Date().toDateString(),
        updated_at: new Date().toDateString(),
      };

      mockFileTypeFromBuffer.mockResolvedValue({ mime: 'application/pdf' });
      mockUploadFileToMinio.mockResolvedValue(undefined);
      mockDb.query = vi.fn().mockResolvedValue({
        rows: [mockFileRecord],
      });
      mockQueueAdapter.enqueue.mockResolvedValue(undefined);

      const result = await fileUploadService.upload(mockFile, userId);

      expect(mockUploadFileToMinio).toHaveBeenCalledWith(
        expect.stringMatching(
          /^user-uploads\/user123\/mock-uuid-1234-test_file__1_____\.pdf$/,
        ),
        mockFile.buffer,
      );
      expect(result).toEqual(mockFileRecord);
    });
  });

  describe('Queue failure scenarios', () => {
    it('should handle queue enqueue failure and update database status', async () => {
      const mockFile = createMockFile('application/pdf', 'test.pdf', 1024);
      const userId = 'user123';
      const mockFileRecord: UserFileRecord = {
        id: 'file123',
        file_name: 'test.pdf',
        file_size: '1024',
        owner_id: userId,
        status: 'uploaded',
        created_at: new Date().toDateString(),
        updated_at: new Date().toDateString(),
      };

      mockFileTypeFromBuffer.mockResolvedValue({ mime: 'application/pdf' });
      mockUploadFileToMinio.mockResolvedValue(undefined);
      mockDb.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [mockFileRecord] })
        .mockResolvedValueOnce({ rows: [] });
      mockQueueAdapter.enqueue.mockRejectedValue(
        new Error('Queue connection failed'),
      );

      await expect(fileUploadService.upload(mockFile, userId)).rejects.toThrow(
        'File upload failed',
      );

      expect(mockDb.query).toHaveBeenCalledWith(
        'UPDATE user_files\n                 SET status = $1,\n                     error_message = $2\n                 WHERE id = $3',
        ['failed', 'Queue connection failed', 'file123'],
      );
    });

    it('should handle both queue and database update failures', async () => {
      const mockFile = createMockFile('application/pdf', 'test.pdf', 1024);
      const userId = 'user123';
      const mockFileRecord: UserFileRecord = {
        id: 'file123',
        file_name: 'test.pdf',
        file_size: '1024',
        owner_id: userId,
        status: 'uploaded',
        created_at: new Date().toDateString(),
        updated_at: new Date().toDateString(),
      };

      mockFileTypeFromBuffer.mockResolvedValue({ mime: 'application/pdf' });
      mockUploadFileToMinio.mockResolvedValue(undefined);
      mockDb.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [mockFileRecord] })
        .mockRejectedValueOnce(new Error('Database update failed'));
      mockQueueAdapter.enqueue.mockRejectedValue(
        new Error('Queue connection failed'),
      );

      const queueError = new Error('Queue connection failed');
      (queueError as Error & { dbError?: Error }).dbError = new Error(
        'Database update failed',
      );

      await expect(fileUploadService.upload(mockFile, userId)).rejects.toThrow(
        'File upload failed',
      );
    });
  });

  describe('MinIO upload failure scenarios', () => {
    it('should handle MinIO upload failure', async () => {
      const mockFile = createMockFile('application/pdf', 'test.pdf', 1024);
      const userId = 'user123';

      mockFileTypeFromBuffer.mockResolvedValue({ mime: 'application/pdf' });
      mockUploadFileToMinio.mockRejectedValue(
        new Error('MinIO connection failed'),
      );

      await expect(fileUploadService.upload(mockFile, userId)).rejects.toThrow(
        'File upload failed',
      );

      expect(mockDb.query).not.toHaveBeenCalled();
      expect(mockQueueAdapter.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('Accepted MIME types', () => {
    const acceptedTypes = [
      'application/pdf',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    acceptedTypes.forEach((mimeType) => {
      it(`should accept ${mimeType}`, async () => {
        const mockFile = createMockFile(mimeType, 'test.ext', 1024);
        const userId = 'user123';
        const mockFileRecord: UserFileRecord = {
          id: 'file123',
          file_name: 'test.ext',
          file_size: '1024',
          owner_id: userId,
          status: 'uploaded',
          created_at: new Date().toDateString(),
          updated_at: new Date().toDateString(),
        };

        mockFileTypeFromBuffer.mockResolvedValue({ mime: mimeType });
        mockUploadFileToMinio.mockResolvedValue(undefined);
        mockDb.query = vi.fn().mockResolvedValue({
          rows: [mockFileRecord],
        });
        mockQueueAdapter.enqueue.mockResolvedValue(undefined);

        const result = await fileUploadService.upload(mockFile, userId);

        expect(result).toEqual(mockFileRecord);
      });
    });

    const rejectedTypes = [
      'image/jpeg',
      'image/png',
      'video/mp4',
      'application/json',
      'text/html',
    ];

    rejectedTypes.forEach((mimeType) => {
      it(`should reject ${mimeType}`, async () => {
        const mockFile = createMockFile(mimeType, 'test.ext', 1024);
        const userId = 'user123';

        mockFileTypeFromBuffer.mockResolvedValue({ mime: mimeType });

        await expect(
          fileUploadService.upload(mockFile, userId),
        ).rejects.toThrow(`File type ${mimeType} not supported`);
      });
    });
  });
});
