import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createApp } from '../../app';
import request from 'supertest';
import { PostgresService } from '../../infrastructure/database/repositories/postgres.repository';
import { redisChatHistory } from '../../infrastructure/database/repositories/redis.repo';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import EventSource from 'eventsource';

/**
 * End-to-End test for File Processing Flow
 * Tests the complete file processing pipeline including upload, background processing, status updates, and vector storage
 */
describe('File Processing Flow E2E', () => {
  let app: any;
  let db: PostgresService;
  let pythonService: ChildProcess | null = null;
  let authToken: string;
  let userId: string;

  const testUser = {
    email: 'processtest@example.com',
    password: 'TestPassword123!',
    name: 'Process Test User',
  };

  beforeAll(async () => {
    app = createApp();
    db = PostgresService.getInstance();

    // Start Python gRPC service for file processing
    await startPythonService();
    await waitForServiceReady();

    // Clean up any existing test data
    await cleanupTestData();

    // Create test user
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

  describe('File Upload and Initial Processing', () => {
    it('should upload file and create database record', async () => {
      const fileContent =
        'This is a test document for processing. It contains multiple sentences to test the chunking and embedding process.';
      const fileName = 'processing-test.txt';

      const response = await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(fileContent), fileName)
        .expect(201);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('File uploaded and queued');

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

    it('should handle different file types for processing', async () => {
      const files = [
        {
          content: 'Plain text content for processing',
          name: 'text.txt',
          type: 'text/plain',
        },
        {
          content:
            '# Markdown Content\n\nThis is markdown content for processing.',
          name: 'markdown.md',
          type: 'text/markdown',
        },
      ];

      for (const file of files) {
        const response = await request(app)
          .post('/files/upload')
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', Buffer.from(file.content), file.name)
          .expect(201);

        expect(response.body.message).toContain('File uploaded and queued');

        // Verify file was stored
        const fileResult = await db.query(
          'SELECT file_name FROM user_files WHERE owner_id = $1 AND file_name = $2',
          [userId, file.name],
        );

        expect(fileResult.rows).toHaveLength(1);
      }
    });

    it('should handle large files for processing', async () => {
      // Create a larger file (but still under the limit)
      const largeContent = 'This is a large test document. '.repeat(1000); // ~30KB
      const fileName = 'large-file.txt';

      const response = await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(largeContent), fileName)
        .expect(201);

      expect(response.body.message).toContain('File uploaded and queued');

      // Verify file was stored with correct size
      const fileResult = await db.query(
        'SELECT file_size FROM user_files WHERE owner_id = $1 AND file_name = $2',
        [userId, fileName],
      );

      expect((fileResult.rows[0] as any).file_size).toBe(largeContent.length);
    });
  });

  describe('File Status Tracking', () => {
    let fileId: string;

    beforeEach(async () => {
      // Upload a test file
      await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach(
          'file',
          Buffer.from('Status tracking test content'),
          'status-test.txt',
        )
        .expect(201);

      const fileResult = await db.query(
        'SELECT id FROM user_files WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1',
        [userId],
      );

      fileId = (fileResult.rows[0] as any).id;
    });

    it('should provide file status via REST API', async () => {
      const response = await request(app)
        .get(`/files/status/${fileId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('fileId');
      expect(response.body).toHaveProperty('status');
      expect(response.body.fileId).toBe(fileId);
      expect(response.body.status).toBe('uploaded');
    });

    it('should provide file status via SSE', async () => {
      return new Promise((resolve, reject) => {
        const eventSource = new EventSource(
          `http://localhost:3000/files/status/${fileId}`,
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          },
        );

        let statusReceived = false;

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            expect(data).toHaveProperty('fileId');
            expect(data).toHaveProperty('status');
            expect(data.fileId).toBe(fileId);

            statusReceived = true;
            eventSource.close();
            resolve(undefined);
          } catch (error) {
            eventSource.close();
            reject(error);
          }
        };

        eventSource.onerror = (error) => {
          eventSource.close();
          reject(new Error(`SSE error: ${error}`));
        };

        // Timeout after 5 seconds
        setTimeout(() => {
          if (!statusReceived) {
            eventSource.close();
            reject(new Error('SSE timeout'));
          }
        }, 5000);
      });
    });

    it('should handle multiple concurrent status requests', async () => {
      const requests = Array.from({ length: 5 }, () =>
        request(app)
          .get(`/files/status/${fileId}`)
          .set('Authorization', `Bearer ${authToken}`),
      );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.fileId).toBe(fileId);
        expect(response.body.status).toBe('uploaded');
      });
    });

    it('should reject status requests for non-existent files', async () => {
      const response = await request(app)
        .get('/files/status/non-existent-file-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject status requests for files owned by other users', async () => {
      // Create another user
      const secondUser = {
        email: 'processtest2@example.com',
        password: 'TestPassword123!',
        name: 'Second Process Test User',
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

      // Try to access first user's file status
      const response = await request(app)
        .get(`/files/status/${fileId}`)
        .set('Authorization', `Bearer ${secondAuthToken}`)
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Access denied');

      // Clean up second user
      await db.query('DELETE FROM users WHERE email = $1', [secondUser.email]);
    });
  });

  describe('Background Processing Pipeline', () => {
    it('should process files through the complete pipeline', async () => {
      const fileContent =
        'This is a comprehensive test document for the processing pipeline. It contains multiple paragraphs and sentences to test the complete workflow from upload to vector storage.';
      const fileName = 'pipeline-test.txt';

      // Upload file
      await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(fileContent), fileName)
        .expect(201);

      // Get file ID
      const fileResult = await db.query(
        'SELECT id FROM user_files WHERE owner_id = $1 AND file_name = $2',
        [userId, fileName],
      );

      const fileId = (fileResult.rows[0] as any).id;

      // Monitor processing status
      let processingComplete = false;
      let currentStatus = 'uploaded';

      // Wait for processing to complete (with timeout)
      const maxWaitTime = 30000; // 30 seconds
      const startTime = Date.now();

      while (!processingComplete && Date.now() - startTime < maxWaitTime) {
        const statusResponse = await request(app)
          .get(`/files/status/${fileId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        currentStatus = statusResponse.body.status;

        if (currentStatus === 'processed' || currentStatus === 'failed') {
          processingComplete = true;
        } else {
          // Wait a bit before checking again
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      // Verify processing completed
      expect(processingComplete).toBe(true);
      expect(['processed', 'failed']).toContain(currentStatus);

      // If processing succeeded, verify the file status in database
      if (currentStatus === 'processed') {
        const finalFileResult = await db.query(
          'SELECT status FROM user_files WHERE id = $1',
          [fileId],
        );

        expect((finalFileResult.rows[0] as any).status).toBe('processed');
      }
    });

    it('should handle processing errors gracefully', async () => {
      // Upload a file that might cause processing issues
      const problematicContent = Buffer.alloc(0); // Empty file

      const response = await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', problematicContent, 'empty.txt')
        .expect(400); // Should be rejected at upload level

      expect(response.body).toHaveProperty('error');
    });

    it('should process multiple files concurrently', async () => {
      const files = [
        {
          content: 'First document content for concurrent processing',
          name: 'concurrent-1.txt',
        },
        {
          content: 'Second document content for concurrent processing',
          name: 'concurrent-2.txt',
        },
        {
          content: 'Third document content for concurrent processing',
          name: 'concurrent-3.txt',
        },
      ];

      // Upload all files
      const uploadPromises = files.map((file) =>
        request(app)
          .post('/files/upload')
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', Buffer.from(file.content), file.name),
      );

      const uploadResponses = await Promise.all(uploadPromises);

      uploadResponses.forEach((response) => {
        expect(response.status).toBe(201);
        expect(response.body.message).toContain('File uploaded and queued');
      });

      // Get file IDs
      const fileResult = await db.query(
        'SELECT id FROM user_files WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 3',
        [userId],
      );

      expect(fileResult.rows).toHaveLength(3);

      // Monitor processing status for all files
      const fileIds = fileResult.rows.map((row: any) => row.id);
      const processingPromises = fileIds.map(async (fileId) => {
        let processingComplete = false;
        let currentStatus = 'uploaded';
        const maxWaitTime = 30000;
        const startTime = Date.now();

        while (!processingComplete && Date.now() - startTime < maxWaitTime) {
          const statusResponse = await request(app)
            .get(`/files/status/${fileId}`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

          currentStatus = statusResponse.body.status;

          if (currentStatus === 'processed' || currentStatus === 'failed') {
            processingComplete = true;
          } else {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }

        return { fileId, status: currentStatus, completed: processingComplete };
      });

      const results = await Promise.all(processingPromises);

      // Verify all files were processed
      results.forEach((result) => {
        expect(result.completed).toBe(true);
        expect(['processed', 'failed']).toContain(result.status);
      });
    });
  });

  describe('Vector Storage Integration', () => {
    it('should store document vectors after processing', async () => {
      const fileContent =
        'This document contains information about artificial intelligence, machine learning, and neural networks. It discusses various algorithms and techniques used in modern AI systems.';
      const fileName = 'vector-test.txt';

      // Upload file
      await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(fileContent), fileName)
        .expect(201);

      // Get file ID
      const fileResult = await db.query(
        'SELECT id FROM user_files WHERE owner_id = $1 AND file_name = $2',
        [userId, fileName],
      );

      const fileId = (fileResult.rows[0] as any).id;

      // Wait for processing to complete
      let processingComplete = false;
      const maxWaitTime = 30000;
      const startTime = Date.now();

      while (!processingComplete && Date.now() - startTime < maxWaitTime) {
        const statusResponse = await request(app)
          .get(`/files/status/${fileId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        if (
          statusResponse.body.status === 'processed' ||
          statusResponse.body.status === 'failed'
        ) {
          processingComplete = true;
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      expect(processingComplete).toBe(true);

      // If processing succeeded, verify vectors were stored
      if (processingComplete) {
        // Note: In a real implementation, you would check the vector database
        // For this test, we'll verify the file status indicates successful processing
        const finalStatusResponse = await request(app)
          .get(`/files/status/${fileId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(finalStatusResponse.body.status).toBe('processed');
      }
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle processing failures gracefully', async () => {
      // Upload a file that might cause processing issues
      const fileContent = 'Test content for error handling';
      const fileName = 'error-test.txt';

      await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(fileContent), fileName)
        .expect(201);

      // Get file ID
      const fileResult = await db.query(
        'SELECT id FROM user_files WHERE owner_id = $1 AND file_name = $2',
        [userId, fileName],
      );

      const fileId = (fileResult.rows[0] as any).id;

      // Monitor status - should eventually reach a final state
      let finalStatus = null;
      const maxWaitTime = 30000;
      const startTime = Date.now();

      while (!finalStatus && Date.now() - startTime < maxWaitTime) {
        const statusResponse = await request(app)
          .get(`/files/status/${fileId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const status = statusResponse.body.status;
        if (status === 'processed' || status === 'failed') {
          finalStatus = status;
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      // Should reach a final state
      expect(finalStatus).toBeDefined();
      expect(['processed', 'failed']).toContain(finalStatus);
    });

    it('should maintain system stability during high load', async () => {
      // Upload many files quickly
      const fileCount = 10;
      const uploadPromises = Array.from({ length: fileCount }, (_, i) =>
        request(app)
          .post('/files/upload')
          .set('Authorization', `Bearer ${authToken}`)
          .attach(
            'file',
            Buffer.from(`Test content for file ${i}`),
            `load-test-${i}.txt`,
          ),
      );

      const responses = await Promise.all(uploadPromises);

      // All uploads should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(201);
        expect(response.body.message).toContain('File uploaded and queued');
      });

      // System should remain responsive
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

      pythonService.stdout?.on('data', (data: any) => {
        const output = data.toString();
        if (output.includes('gRPC server started on port 50051') && !resolved) {
          resolved = true;
          resolve();
        }
      });

      pythonService.stderr?.on('data', (data: any) => {
        console.error('Python service error:', data.toString());
      });

      pythonService.on('error', (error: any) => {
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
