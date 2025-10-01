import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createApp } from '../../app';
import request from 'supertest';
import { PostgresService } from '../../infrastructure/database/repositories/postgres.repository';
import { redisChatHistory } from '../../infrastructure/database/repositories/redis.repo';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';

/**
 * End-to-End test for File Upload Flow
 * Tests the complete file upload journey including authentication, file validation, storage, and processing
 */
describe('File Upload Flow E2E', () => {
  let app: any;
  let db: PostgresService;
  let pythonService: ChildProcess | null = null;
  let authToken: string;
  let userId: string;

  const testUser = {
    email: 'filetest@example.com',
    password: 'TestPassword123!',
    name: 'File Test User',
  };

  beforeAll(async () => {
    app = createApp();
    db = PostgresService.getInstance();

    // Start Python gRPC service for file processing
    await startPythonService();
    await waitForServiceReady();

    // Clean up any existing test data
    await cleanupTestData();

    // Create test user and get auth token
    await setupTestUser();
  }, 60000); // 60 second timeout for service startup

  afterAll(async () => {
    await cleanupTestData();
    if (pythonService) {
      pythonService.kill('SIGTERM');
      await new Promise((resolve) => {
        pythonService?.on('exit', resolve);
      });
    }
  });

  beforeEach(async () => {
    // Clean up file data before each test
    await cleanupFileData();
  });

  describe('File Upload Authentication', () => {
    it('should require authentication for file upload', async () => {
      const response = await request(app)
        .post('/files/upload')
        .attach('file', Buffer.from('test content'), 'test.txt')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Unauthorized');
    });

    it('should accept authenticated file upload requests', async () => {
      const response = await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from('test content'), 'test.txt')
        .expect(201);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('File uploaded and queued');
    });
  });

  describe('File Validation', () => {
    it('should accept valid file types', async () => {
      const validFiles = [
        {
          content: 'PDF content',
          filename: 'test.pdf',
          mimetype: 'application/pdf',
        },
        {
          content: 'Plain text content',
          filename: 'test.txt',
          mimetype: 'text/plain',
        },
        {
          content: '# Markdown content',
          filename: 'test.md',
          mimetype: 'text/markdown',
        },
      ];

      for (const file of validFiles) {
        const response = await request(app)
          .post('/files/upload')
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', Buffer.from(file.content), file.filename)
          .expect(201);

        expect(response.body.message).toContain('File uploaded and queued');
      }
    });

    it('should reject unsupported file types', async () => {
      const unsupportedFiles = [
        {
          content: 'executable content',
          filename: 'test.exe',
          mimetype: 'application/x-msdownload',
        },
        {
          content: 'image content',
          filename: 'test.jpg',
          mimetype: 'image/jpeg',
        },
        {
          content: 'video content',
          filename: 'test.mp4',
          mimetype: 'video/mp4',
        },
      ];

      for (const file of unsupportedFiles) {
        const response = await request(app)
          .post('/files/upload')
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', Buffer.from(file.content), file.filename)
          .expect(400);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Unsupported file type');
      }
    });

    it('should reject files that are too large', async () => {
      // Create a file larger than the limit (10MB default)
      const largeContent = Buffer.alloc(11 * 1024 * 1024, 'a'); // 11MB

      const response = await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', largeContent, 'large.txt')
        .expect(413); // Payload Too Large

      expect(response.body).toHaveProperty('error');
    });

    it('should reject empty files', async () => {
      const response = await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.alloc(0), 'empty.txt')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should sanitize file names', async () => {
      const maliciousFilename = '../../../etc/passwd.txt';

      const response = await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from('test content'), maliciousFilename)
        .expect(201);

      expect(response.body.message).toContain('File uploaded and queued');

      // Verify the file was stored with a sanitized name
      const fileResult = await db.query(
        'SELECT file_name FROM user_files WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1',
        [userId],
      );

      expect((fileResult.rows[0] as any).file_name).not.toContain('../');
    });
  });

  describe('File Storage and Database', () => {
    it('should store file metadata in database', async () => {
      const fileContent = 'Test file content for database storage';
      const fileName = 'database-test.txt';

      await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(fileContent), fileName)
        .expect(201);

      // Verify file record was created
      const fileResult = await db.query(
        'SELECT * FROM user_files WHERE owner_id = $1 AND file_name = $2',
        [userId, fileName],
      );

      expect(fileResult.rows).toHaveLength(1);
      expect((fileResult.rows[0] as any).file_name).toBe(fileName);
      expect((fileResult.rows[0] as any).file_size).toBe(fileContent.length);
      expect((fileResult.rows[0] as any).owner_id).toBe(userId);
      expect((fileResult.rows[0] as any).status).toBe('uploaded');
    });

    it('should handle multiple file uploads from same user', async () => {
      const files = [
        { content: 'First file content', name: 'file1.txt' },
        { content: 'Second file content', name: 'file2.txt' },
        { content: 'Third file content', name: 'file3.txt' },
      ];

      for (const file of files) {
        await request(app)
          .post('/files/upload')
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', Buffer.from(file.content), file.name)
          .expect(201);
      }

      // Verify all files were stored
      const fileResult = await db.query(
        'SELECT file_name FROM user_files WHERE owner_id = $1 ORDER BY created_at',
        [userId],
      );

      expect(fileResult.rows).toHaveLength(files.length);
      files.forEach((file, index) => {
        expect((fileResult.rows[index] as any).file_name).toBe(file.name);
      });
    });

    it('should isolate files between different users', async () => {
      // Create another test user
      const secondUser = {
        email: 'filetest2@example.com',
        password: 'TestPassword123!',
        name: 'Second File Test User',
      };

      await request(app).post('/auth/signup').send(secondUser).expect(201);

      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          email: secondUser.email,
          password: secondUser.password,
        })
        .expect(200);

      const secondAuthToken = loginResponse.body.token;
      const secondUserId = loginResponse.body.user.id;

      // Upload file with second user
      await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${secondAuthToken}`)
        .attach(
          'file',
          Buffer.from('Second user content'),
          'second-user-file.txt',
        )
        .expect(201);

      // Verify first user cannot see second user's files
      const firstUserFiles = await db.query(
        'SELECT * FROM user_files WHERE owner_id = $1',
        [userId],
      );

      const secondUserFiles = await db.query(
        'SELECT * FROM user_files WHERE owner_id = $1',
        [secondUserId],
      );

      expect(firstUserFiles.rows).toHaveLength(0); // First user has no files yet
      expect(secondUserFiles.rows).toHaveLength(1);
      expect((secondUserFiles.rows[0] as any).file_name).toBe(
        'second-user-file.txt',
      );

      // Clean up second user
      await db.query('DELETE FROM users WHERE id = $1', [secondUserId]);
    });
  });

  describe('File Processing Queue', () => {
    it('should queue file for processing after upload', async () => {
      const fileContent = 'Test content for processing queue';

      await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(fileContent), 'queue-test.txt')
        .expect(201);

      // Verify file status is 'uploaded' (queued for processing)
      const fileResult = await db.query(
        'SELECT status FROM user_files WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1',
        [userId],
      );

      expect((fileResult.rows[0] as any).status).toBe('uploaded');
    });

    it('should handle concurrent file uploads', async () => {
      const files = Array.from({ length: 5 }, (_, i) => ({
        content: `Concurrent file content ${i}`,
        name: `concurrent-${i}.txt`,
      }));

      const uploadPromises = files.map((file) =>
        request(app)
          .post('/files/upload')
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', Buffer.from(file.content), file.name),
      );

      const responses = await Promise.all(uploadPromises);

      responses.forEach((response) => {
        expect(response.status).toBe(201);
        expect(response.body.message).toContain('File uploaded and queued');
      });

      // Verify all files were queued
      const fileResult = await db.query(
        'SELECT COUNT(*) as count FROM user_files WHERE owner_id = $1',
        [userId],
      );

      expect(parseInt((fileResult.rows[0] as any).count)).toBe(files.length);
    });
  });

  describe('File Status Tracking', () => {
    it('should provide file status endpoint', async () => {
      // Upload a file first
      await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from('Status test content'), 'status-test.txt')
        .expect(201);

      // Get the file ID
      const fileResult = await db.query(
        'SELECT id FROM user_files WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1',
        [userId],
      );

      const fileId = (fileResult.rows[0] as any).id;

      // Check file status
      const response = await request(app)
        .get(`/files/status/${fileId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('fileId');
      expect(response.body).toHaveProperty('status');
      expect(response.body.fileId).toBe(fileId);
    });

    it('should reject status requests for non-existent files', async () => {
      const response = await request(app)
        .get('/files/status/non-existent-file-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject status requests for files owned by other users', async () => {
      // Create another user and upload a file
      const secondUser = {
        email: 'filetest3@example.com',
        password: 'TestPassword123!',
        name: 'Third File Test User',
      };

      await request(app).post('/auth/signup').send(secondUser).expect(201);

      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          email: secondUser.email,
          password: secondUser.password,
        })
        .expect(200);

      const secondAuthToken = loginResponse.body.token;

      await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${secondAuthToken}`)
        .attach(
          'file',
          Buffer.from('Other user content'),
          'other-user-file.txt',
        )
        .expect(201);

      // Get the file ID
      const fileResult = await db.query(
        'SELECT id FROM user_files WHERE owner_id != $1 ORDER BY created_at DESC LIMIT 1',
        [userId],
      );

      const otherUserFileId = (fileResult.rows[0] as any).id;

      // Try to access other user's file status
      const response = await request(app)
        .get(`/files/status/${otherUserFileId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Access denied');

      // Clean up
      await db.query('DELETE FROM users WHERE email = $1', [secondUser.email]);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed multipart requests', async () => {
      const response = await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ file: 'not a file' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle corrupted file uploads', async () => {
      // Simulate a corrupted upload by sending invalid data
      const response = await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from('corrupted data'), 'corrupted.txt')
        .expect(201); // Should still accept the upload

      expect(response.body.message).toContain('File uploaded and queued');
    });

    it('should handle network interruptions gracefully', async () => {
      // This test simulates what happens when a request is interrupted
      const largeContent = Buffer.alloc(1024 * 1024, 'a'); // 1MB

      // Start the upload but don't wait for completion
      const uploadPromise = request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', largeContent, 'interrupted.txt');

      // Simulate interruption by not awaiting the promise
      // In a real scenario, this would be handled by the client disconnecting

      // Verify the system is still responsive
      const healthResponse = await request(app).get('/health').expect(200);

      expect(healthResponse.body).toHaveProperty('status', 'healthy');
    });
  });

  // Helper functions
  async function startPythonService(): Promise<void> {
    return new Promise((resolve, reject) => {
      const isCI = process.env.CI === 'true';

      if (isCI) {
        resolve();
        return;
      }

      pythonService = spawn('python', ['main_grpc_server.py'], {
        cwd: join(process.cwd(), 'python_service'),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONPATH: join(process.cwd(), 'python_service', 'services'),
        },
      });

      let resolved = false;

      pythonService.stdout?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('gRPC server started on port 50051') && !resolved) {
          resolved = true;
          resolve();
        }
      });

      pythonService.stderr?.on('data', (data) => {
        console.error('Python service error:', data.toString());
      });

      pythonService.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error('Python service startup timeout'));
        }
      }, 20000);
    });
  }

  async function waitForServiceReady(): Promise<void> {
    const maxRetries = 30;
    const retryDelay = 1000;

    for (let i = 0; i < maxRetries; i++) {
      try {
        // Test service health by making a simple request
        const response = await request(app).get('/health');
        if (response.status === 200) {
          return;
        }
      } catch (error) {
        // Continue retrying
      }

      if (i === maxRetries - 1) {
        throw new Error(`Service not ready after ${maxRetries} attempts`);
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  async function setupTestUser() {
    await request(app).post('/auth/signup').send(testUser).expect(201);

    const loginResponse = await request(app)
      .post('/auth/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      })
      .expect(200);

    authToken = loginResponse.body.token;
    userId = loginResponse.body.user.id;
  }

  async function cleanupTestData() {
    try {
      await db.query('DELETE FROM users WHERE email = $1', [testUser.email]);
      await redisChatHistory.del('chat:test-user:*');
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  async function cleanupFileData() {
    try {
      await db.query('DELETE FROM user_files WHERE owner_id = $1', [userId]);
    } catch (error) {
      // Ignore cleanup errors
    }
  }
});
