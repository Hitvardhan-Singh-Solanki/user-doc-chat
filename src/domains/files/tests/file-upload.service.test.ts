import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileUploadService } from '../services/file-upload.service';
import { IDBStore } from '../../../shared/interfaces/db-store.interface';
import { MulterFile, UserFileRecord } from '../../../shared/types';
import * as minioService from '../../../infrastructure/storage/providers/minio.provider';
import { queueAdapter } from '../../../infrastructure/queue/providers/bullmq.provider';
import { fileTypeFromBuffer } from 'file-type';
import createHttpError from 'http-errors';
import { mockFile, mockFileUploadData } from '../../../tests/fixtures';

// Mock external dependencies
vi.mock('file-type', () => ({
  fileTypeFromBuffer: vi.fn(),
}));

vi.mock('../../../infrastructure/storage/providers/minio.provider', () => ({
  uploadFileToMinio: vi.fn(),
}));

vi.mock('../../../infrastructure/queue/providers/bullmq.provider', () => ({
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
  let mockFileTypeFromBuffer: any;
  let mockUploadFileToMinio: any;
  let mockQueueAdapter: any;

  beforeEach(() => {
    // Setup mocks
    mockDb = {
      query: vi.fn(),
      withTransaction: vi.fn(),
    };

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
        'mock-uuid-1234-document.pdf',
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
          key: 'mock-uuid-1234-document.pdf',
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
        buffer: undefined as any,
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
        'Unsupported file type',
      );

      expect(mockUploadFileToMinio).not.toHaveBeenCalled();
    });

    it('should use original mimetype when file-type detection returns null', async () => {
      const mockFile = createMockFile('application/pdf', 'document.pdf', 1024);
      const userId = 'user123';

      mockFileTypeFromBuffer.mockResolvedValue(null);

      const mockFileRecord: UserFileRecord = {
        id: 'file123',
        file_name: 'document.pdf',
        file_size: '1024',
        owner_id: userId,
        status: 'uploaded',
        created_at: new Date().toDateString(),
        updated_at: new Date().toDateString(),
      };

      mockUploadFileToMinio.mockResolvedValue(undefined);
      mockDb.query = vi.fn().mockResolvedValue({
        rows: [mockFileRecord],
      });
      mockQueueAdapter.enqueue.mockResolvedValue(undefined);

      const result = await fileUploadService.upload(mockFile, userId);

      expect(result).toEqual(mockFileRecord);
    });

    it('should throw error when detected mimetype is unsupported', async () => {
      const mockFile = createMockFile('application/pdf', 'fake.pdf', 1024);
      const userId = 'user123';

      // Simulate file with PDF extension but actually JPEG content
      mockFileTypeFromBuffer.mockResolvedValue({ mime: 'image/jpeg' });

      await expect(fileUploadService.upload(mockFile, userId)).rejects.toThrow(
        'Unsupported file type',
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
        'UPDATE user_files SET status = $1, error_message = $2 WHERE id = $3',
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

      const result = await fileUploadService.upload(mockFile, userId);

      expect(mockUploadFileToMinio).toHaveBeenCalledWith(
        'mock-uuid-1234-',
        mockFile.buffer,
      );
      expect(result).toEqual(mockFileRecord);
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
        'mock-uuid-1234-test%20file%20(1)%20%40%23%24.pdf',
        mockFile.buffer,
      );
      expect(result).toEqual(mockFileRecord);
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
        ).rejects.toThrow('Unsupported file type');
      });
    });
  });
});
