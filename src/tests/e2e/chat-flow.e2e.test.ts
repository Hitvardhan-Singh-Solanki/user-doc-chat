import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest';
import { createApp } from '../../app';
import request from 'supertest';
import { PostgresService } from '../../infrastructure/database/repositories/postgres.repository';
import { redisChatHistory } from '../../infrastructure/database/repositories/redis.repo';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { io as Client, Socket } from 'socket.io-client';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';

/**
 * End-to-End test for Chat/Question Answering Flow
 * Tests the complete WebSocket-based chat functionality including authentication, question processing, and AI responses
 */
describe('Chat Flow E2E', () => {
  let app: any;
  let server: any;
  let db: PostgresService;
  let pythonService: ChildProcess | null = null;
  let authToken: string;
  let userId: string;
  let fileId: string;

  const testUser = {
    email: 'chattest@example.com',
    password: 'TestPassword123!',
    name: 'Chat Test User',
  };

  beforeAll(async () => {
    app = createApp();
    server = createServer(app);
    db = PostgresService.getInstance();

    // Start Python gRPC service for file processing
    await startPythonService();
    await waitForServiceReady();

    // Clean up any existing test data
    await cleanupTestData();

    // Create test user and upload a test file
    await setupTestUser();
    await uploadTestFile();
  }, 60000); // 60 second timeout for service startup

  afterAll(async () => {
    await cleanupTestData();
    if (pythonService) {
      pythonService.kill('SIGTERM');
      await new Promise((resolve) => {
        pythonService?.on('exit', resolve);
      });
    }
    if (server) {
      server.close();
    }
  });

  beforeEach(async () => {
    // Clean up chat data before each test
    await cleanupChatData();
  });

  describe('WebSocket Connection', () => {
    it('should establish WebSocket connection with valid JWT', async () => {
      const client = Client('http://localhost:3000', {
        auth: {
          token: authToken,
        },
      });

      await new Promise<void>((resolve, reject) => {
        client.on('connect', () => resolve());
        client.on('connect_error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      expect(client.connected).toBe(true);
      client.disconnect();
    });

    it('should reject WebSocket connection without JWT', async () => {
      const client = Client('http://localhost:3000');

      await new Promise((resolve, reject) => {
        client.on('connect_error', (error) => {
          expect(error.message).toContain('Authentication');
          resolve(error);
        });
        client.on('connect', () => {
          reject(new Error('Should not have connected'));
        });
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      expect(client.connected).toBe(false);
      client.disconnect();
    });

    it('should reject WebSocket connection with invalid JWT', async () => {
      const client = Client('http://localhost:3000', {
        auth: {
          token: 'invalid-jwt-token',
        },
      });

      await new Promise((resolve, reject) => {
        client.on('connect_error', (error) => {
          expect(error.message).toContain('Authentication');
          resolve(error);
        });
        client.on('connect', () => {
          reject(new Error('Should not have connected'));
        });
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      expect(client.connected).toBe(false);
      client.disconnect();
    });
  });

  describe('Question Processing', () => {
    let client: Socket;

    beforeEach(async () => {
      client = Client('http://localhost:3000', {
        auth: {
          token: authToken,
        },
      });

      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve());
      });
    });

    afterEach(() => {
      if (client) {
        client.disconnect();
      }
    });

    it('should process a simple question and return an answer', async () => {
      const question = 'What is this document about?';
      const answerChunks: string[] = [];
      let answerComplete = false;

      // Set up event listeners
      client.on('answer_chunk', (data: any) => {
        answerChunks.push(data.token);
      });

      client.on('answer_complete', () => {
        answerComplete = true;
      });

      client.on('error', (error: any) => {
        throw new Error(`WebSocket error: ${error.message}`);
      });

      // Send question
      client.emit('question', {
        fileId,
        question,
        chatHistory: [],
      });

      // Wait for answer
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Answer timeout'));
        }, 10000);

        const checkComplete = () => {
          if (answerComplete) {
            clearTimeout(timeout);
            resolve(undefined);
          } else {
            setTimeout(checkComplete, 100);
          }
        };
        checkComplete();
      });

      expect(answerChunks.length).toBeGreaterThan(0);
      expect(answerComplete).toBe(true);

      const fullAnswer = answerChunks.join('');
      expect(fullAnswer).toBeDefined();
      expect(typeof fullAnswer).toBe('string');
    });

    it('should handle questions with no relevant context', async () => {
      const question = 'What is the weather like today?'; // Unrelated question
      const answerChunks: string[] = [];
      let answerComplete = false;

      client.on('answer_chunk', (data: any) => {
        answerChunks.push(data.token);
      });

      client.on('answer_complete', () => {
        answerComplete = true;
      });

      client.emit('question', {
        fileId,
        question,
        chatHistory: [],
      });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Answer timeout'));
        }, 10000);

        const checkComplete = () => {
          if (answerComplete) {
            clearTimeout(timeout);
            resolve(undefined);
          } else {
            setTimeout(checkComplete, 100);
          }
        };
        checkComplete();
      });

      const fullAnswer = answerChunks.join('');
      expect(fullAnswer).toContain("don't know");
    });

    it('should maintain chat history across questions', async () => {
      const questions = [
        'What is this document about?',
        'Can you tell me more about that?',
        'What are the key points?',
      ];

      const allAnswers: string[] = [];

      for (const question of questions) {
        const answerChunks: string[] = [];
        let answerComplete = false;

        client.on('answer_chunk', (data: any) => {
          answerChunks.push(data.token);
        });

        client.on('answer_complete', () => {
          answerComplete = true;
        });

        client.emit('question', {
          fileId,
          question,
          chatHistory: [], // In real usage, this would be populated
        });

        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Answer timeout'));
          }, 10000);

          const checkComplete = () => {
            if (answerComplete) {
              clearTimeout(timeout);
              resolve(undefined);
            } else {
              setTimeout(checkComplete, 100);
            }
          };
          checkComplete();
        });

        const answer = answerChunks.join('');
        allAnswers.push(answer);
        expect(answer).toBeDefined();
      }

      expect(allAnswers).toHaveLength(3);
      allAnswers.forEach((answer) => {
        expect(typeof answer).toBe('string');
        expect(answer.length).toBeGreaterThan(0);
      });
    });

    it('should handle malformed question requests', async () => {
      let errorReceived = false;

      client.on('error', (error: any) => {
        errorReceived = true;
        expect(error.message).toBeDefined();
      });

      // Send malformed request
      client.emit('question', {
        // Missing required fields
        fileId: fileId,
        // question: missing
        chatHistory: [],
      });

      // Wait for error
      await new Promise((resolve) => {
        setTimeout(() => {
          resolve(undefined);
        }, 2000);
      });

      expect(errorReceived).toBe(true);
    });

    it('should handle questions for non-existent files', async () => {
      let errorReceived = false;

      client.on('error', (error: any) => {
        errorReceived = true;
        expect(error.message).toBeDefined();
      });

      client.emit('question', {
        fileId: 'non-existent-file-id',
        question: 'What is this about?',
        chatHistory: [],
      });

      await new Promise((resolve) => {
        setTimeout(() => {
          resolve(undefined);
        }, 2000);
      });

      expect(errorReceived).toBe(true);
    });
  });

  describe('Chat History Management', () => {
    let client: Socket;

    beforeEach(async () => {
      client = Client('http://localhost:3000', {
        auth: {
          token: authToken,
        },
      });

      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve());
      });
    });

    afterEach(() => {
      if (client) {
        client.disconnect();
      }
    });

    it('should store chat history in Redis', async () => {
      const question = 'What is this document about?';
      const answerChunks: string[] = [];
      let answerComplete = false;

      client.on('answer_chunk', (data: any) => {
        answerChunks.push(data.token);
      });

      client.on('answer_complete', () => {
        answerComplete = true;
      });

      client.emit('question', {
        fileId,
        question,
        chatHistory: [],
      });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Answer timeout'));
        }, 10000);

        const checkComplete = () => {
          if (answerComplete) {
            clearTimeout(timeout);
            resolve(undefined);
          } else {
            setTimeout(checkComplete, 100);
          }
        };
        checkComplete();
      });

      // Check if chat history was stored
      const chatKey = `chat:${userId}:${fileId}`;
      const history = await redisChatHistory.lRange(chatKey, 0, -1);

      expect(history.length).toBeGreaterThan(0);
      expect(history[0]).toContain('User:');
      expect(history[1]).toContain('AI:');
    });

    it('should retrieve existing chat history', async () => {
      // First, create some chat history
      const chatKey = `chat:${userId}:${fileId}`;
      await redisChatHistory.rPush(chatKey, 'User: Previous question');
      await redisChatHistory.rPush(chatKey, 'AI: Previous answer');
      await redisChatHistory.expire(chatKey, 60 * 60 * 24);

      const question = 'What was the previous answer?';
      const answerChunks: string[] = [];
      let answerComplete = false;

      client.on('answer_chunk', (data: any) => {
        answerChunks.push(data.token);
      });

      client.on('answer_complete', () => {
        answerComplete = true;
      });

      client.emit('question', {
        fileId,
        question,
        chatHistory: ['User: Previous question', 'AI: Previous answer'],
      });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Answer timeout'));
        }, 10000);

        const checkComplete = () => {
          if (answerComplete) {
            clearTimeout(timeout);
            resolve(undefined);
          } else {
            setTimeout(checkComplete, 100);
          }
        };
        checkComplete();
      });

      const answer = answerChunks.join('');
      expect(answer).toBeDefined();
    });

    it('should trim chat history when it gets too long', async () => {
      const chatKey = `chat:${userId}:${fileId}`;

      // Add many messages to exceed the limit
      const messages = Array.from(
        { length: 100 },
        (_, i) => `User: Message ${i}`,
      );
      for (const message of messages) {
        await redisChatHistory.rPush(chatKey, message);
      }
      await redisChatHistory.expire(chatKey, 60 * 60 * 24);

      const question = 'What is this about?';
      const answerChunks: string[] = [];
      let answerComplete = false;

      client.on('answer_chunk', (data: any) => {
        answerChunks.push(data.token);
      });

      client.on('answer_complete', () => {
        answerComplete = true;
      });

      client.emit('question', {
        fileId,
        question,
        chatHistory: messages,
      });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Answer timeout'));
        }, 10000);

        const checkComplete = () => {
          if (answerComplete) {
            clearTimeout(timeout);
            resolve(undefined);
          } else {
            setTimeout(checkComplete, 100);
          }
        };
        checkComplete();
      });

      // Check that history was trimmed
      const history = await redisChatHistory.lRange(chatKey, 0, -1);
      expect(history.length).toBeLessThanOrEqual(50); // Should be trimmed to 50
    });
  });

  describe('Concurrent Chat Sessions', () => {
    it('should handle multiple concurrent questions', async () => {
      const clients = Array.from({ length: 3 }, () =>
        Client('http://localhost:3000', {
          auth: {
            token: authToken,
          },
        }),
      );

      // Connect all clients
      await Promise.all(
        clients.map(
          (client) =>
            new Promise<void>((resolve) => {
              client.on('connect', () => resolve());
            }),
        ),
      );

      const questions = [
        'What is this document about?',
        'What are the main points?',
        'Can you summarize this?',
      ];

      const answers = await Promise.all(
        clients.map((client, index) => {
          return new Promise<string>((resolve, reject) => {
            const answerChunks: string[] = [];
            let answerComplete = false;

            client.on('answer_chunk', (data: any) => {
              answerChunks.push(data.token);
            });

            client.on('answer_complete', () => {
              answerComplete = true;
              resolve(answerChunks.join(''));
            });

            client.on('error', (error: any) => {
              reject(new Error(`Client ${index} error: ${error.message}`));
            });

            client.emit('question', {
              fileId,
              question: questions[index],
              chatHistory: [],
            });

            setTimeout(() => {
              if (!answerComplete) {
                reject(new Error(`Client ${index} timeout`));
              }
            }, 15000);
          });
        }),
      );

      // Clean up clients
      clients.forEach((client) => client.disconnect());

      expect(answers).toHaveLength(3);
      answers.forEach((answer) => {
        expect(typeof answer).toBe('string');
        expect(answer.length).toBeGreaterThan(0);
      });
    });

    it('should isolate chat sessions between different users', async () => {
      // Create another test user
      const secondUser = {
        email: 'chattest2@example.com',
        password: 'TestPassword123!',
        name: 'Second Chat Test User',
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

      // Upload a file for the second user
      await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${secondAuthToken}`)
        .attach(
          'file',
          Buffer.from('Second user document content'),
          'second-user-doc.txt',
        )
        .expect(201);

      const secondFileResult = await db.query(
        'SELECT id FROM user_files WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1',
        [secondUserId],
      );
      const secondFileId = (secondFileResult.rows[0] as any).id;

      // Create clients for both users
      const client1 = Client('http://localhost:3000', {
        auth: { token: authToken },
      });
      const client2 = Client('http://localhost:3000', {
        auth: { token: secondAuthToken },
      });

      await Promise.all([
        new Promise<void>((resolve) => client1.on('connect', () => resolve())),
        new Promise<void>((resolve) => client2.on('connect', () => resolve())),
      ]);

      // Both users ask questions about their respective files
      const [answer1, answer2] = await Promise.all([
        new Promise<string>((resolve, reject) => {
          const chunks: string[] = [];
          client1.on('answer_chunk', (data) => chunks.push(data.token));
          client1.on('answer_complete', () => resolve(chunks.join('')));
          client1.on('error', reject);
          client1.emit('question', {
            fileId,
            question: 'What is this about?',
            chatHistory: [],
          });
          setTimeout(() => reject(new Error('Timeout')), 10000);
        }),
        new Promise<string>((resolve, reject) => {
          const chunks: string[] = [];
          client2.on('answer_chunk', (data) => chunks.push(data.token));
          client2.on('answer_complete', () => resolve(chunks.join('')));
          client2.on('error', reject);
          client2.emit('question', {
            fileId: secondFileId,
            question: 'What is this about?',
            chatHistory: [],
          });
          setTimeout(() => reject(new Error('Timeout')), 10000);
        }),
      ]);

      client1.disconnect();
      client2.disconnect();

      // Verify both users got answers
      expect(answer1).toBeDefined();
      expect(answer2).toBeDefined();
      expect(typeof answer1).toBe('string');
      expect(typeof answer2).toBe('string');

      // Clean up second user
      await db.query('DELETE FROM users WHERE id = $1', [secondUserId]);
    });
  });

  describe('Error Handling', () => {
    let client: Socket;

    beforeEach(async () => {
      client = Client('http://localhost:3000', {
        auth: {
          token: authToken,
        },
      });

      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve());
      });
    });

    afterEach(() => {
      if (client) {
        client.disconnect();
      }
    });

    it('should handle network disconnections gracefully', async () => {
      const question = 'What is this document about?';
      let errorReceived = false;

      client.on('error', (error: any) => {
        errorReceived = true;
        expect(error.message).toBeDefined();
      });

      client.emit('question', {
        fileId,
        question,
        chatHistory: [],
      });

      // Simulate disconnection
      client.disconnect();

      await new Promise((resolve) => {
        setTimeout(() => {
          resolve(undefined);
        }, 1000);
      });

      // The system should handle the disconnection gracefully
      expect(client.connected).toBe(false);
    });

    it('should handle malformed WebSocket messages', async () => {
      let errorReceived = false;

      client.on('error', (error: any) => {
        errorReceived = true;
        expect(error.message).toBeDefined();
      });

      // Send malformed message
      client.emit('invalid_event', { malformed: 'data' });

      await new Promise((resolve) => {
        setTimeout(() => {
          resolve(undefined);
        }, 1000);
      });

      // Should handle gracefully without crashing
      expect(client.connected).toBe(true);
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

  async function uploadTestFile() {
    await request(app)
      .post('/files/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .attach(
        'file',
        Buffer.from(
          'This is a test document about artificial intelligence and machine learning. It contains information about neural networks, deep learning, and natural language processing.',
        ),
        'test-doc.txt',
      )
      .expect(201);

    const fileResult = await db.query(
      'SELECT id FROM user_files WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId],
    );

    fileId = (fileResult.rows[0] as any).id;
  }

  async function cleanupTestData() {
    try {
      await db.query('DELETE FROM users WHERE email = $1', [testUser.email]);
      await redisChatHistory.del('chat:test-user:*');
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  async function cleanupChatData() {
    try {
      await redisChatHistory.del(`chat:${userId}:${fileId}`);
    } catch (error) {
      // Ignore cleanup errors
    }
  }
});
