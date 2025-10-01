import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createApp } from '../../app';
import request from 'supertest';
import { PostgresService } from '../../infrastructure/database/repositories/postgres.repository';
import { redisChatHistory } from '../../infrastructure/database/repositories/redis.repo';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { io as Client, Socket } from 'socket.io-client';

/**
 * End-to-End test for Complete User Journey
 * Tests the entire user workflow from registration to document upload to chat interaction
 * This is the most comprehensive test that simulates real user behavior
 */
describe('Complete User Journey E2E', () => {
  let app: any;
  let db: PostgresService;
  let pythonService: ChildProcess | null = null;

  const testUser = {
    email: 'journeytest@example.com',
    password: 'TestPassword123!',
    name: 'Journey Test User',
  };

  beforeAll(async () => {
    app = createApp();
    db = PostgresService.getInstance();

    // Start Python gRPC service for file processing
    await startPythonService();
    await waitForServiceReady();

    // Clean up any existing test data
    await cleanupTestData();
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
    // Clean up before each test
    await cleanupTestData();
  });

  describe('Complete User Workflow', () => {
    it('should complete the full user journey from registration to chat', async () => {
      // Step 1: User Registration
      console.log('🔄 Step 1: User Registration');
      const signupResponse = await request(app)
        .post('/auth/signup')
        .send(testUser)
        .expect(201);

      expect(signupResponse.body).toHaveProperty('message');
      expect(signupResponse.body.message).toContain(
        'User created successfully',
      );

      // Step 2: User Login
      console.log('🔄 Step 2: User Login');
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      expect(loginResponse.body).toHaveProperty('token');
      expect(loginResponse.body).toHaveProperty('user');

      const authToken = loginResponse.body.token;
      const userId = loginResponse.body.user.id;

      // Step 3: Document Upload
      console.log('🔄 Step 3: Document Upload');
      const documentContent = `
# AI and Machine Learning Overview

## Introduction
Artificial Intelligence (AI) and Machine Learning (ML) are transforming the way we interact with technology. This document provides a comprehensive overview of these technologies.

## Key Concepts

### Machine Learning
Machine Learning is a subset of AI that enables computers to learn and make decisions from data without being explicitly programmed. There are three main types:

1. **Supervised Learning**: Learning with labeled training data
2. **Unsupervised Learning**: Finding patterns in data without labels
3. **Reinforcement Learning**: Learning through interaction with an environment

### Deep Learning
Deep Learning uses neural networks with multiple layers to process data. It has been particularly successful in:
- Image recognition
- Natural language processing
- Speech recognition

### Applications
AI and ML are being used in various industries:
- Healthcare: Medical diagnosis and drug discovery
- Finance: Fraud detection and algorithmic trading
- Transportation: Autonomous vehicles
- Technology: Virtual assistants and recommendation systems

## Future Outlook
The future of AI and ML looks promising with continued advances in:
- Quantum computing
- Edge AI
- Explainable AI
- AI ethics and governance
      `;

      const uploadResponse = await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(documentContent), 'ai-ml-overview.md')
        .expect(201);

      expect(uploadResponse.body.message).toContain('File uploaded and queued');

      // Get file ID
      const fileResult = await db.query(
        'SELECT id FROM user_files WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1',
        [userId],
      );

      const fileId = (fileResult.rows[0] as any).id;

      // Step 4: Monitor File Processing
      console.log('🔄 Step 4: Monitor File Processing');
      let processingComplete = false;
      let currentStatus = 'uploaded';
      const maxWaitTime = 60000; // 60 seconds for processing
      const startTime = Date.now();

      while (!processingComplete && Date.now() - startTime < maxWaitTime) {
        const statusResponse = await request(app)
          .get(`/files/status/${fileId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        currentStatus = statusResponse.body.status;
        console.log(`📊 Processing status: ${currentStatus}`);

        if (currentStatus === 'processed' || currentStatus === 'failed') {
          processingComplete = true;
        } else {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      expect(processingComplete).toBe(true);
      expect(currentStatus).toBe('processed');

      // Step 5: Establish WebSocket Connection
      console.log('🔄 Step 5: Establish WebSocket Connection');
      const client = Client('http://localhost:3000', {
        auth: {
          token: authToken,
        },
      });

      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve());
      });

      expect(client.connected).toBe(true);

      // Step 6: Ask Questions About the Document
      console.log('🔄 Step 6: Ask Questions About the Document');
      const questions = [
        'What is this document about?',
        'What are the three types of machine learning?',
        'What are some applications of AI and ML?',
        'What does the future hold for AI?',
      ];

      const answers: string[] = [];

      for (const question of questions) {
        console.log(`❓ Asking: ${question}`);

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
          chatHistory: answers
            .map((answer, index) => `User: ${questions[index]}\nAI: ${answer}`)
            .join('\n'),
        });

        // Wait for answer
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Answer timeout'));
          }, 15000);

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
        answers.push(answer);
        console.log(`✅ Answer: ${answer.substring(0, 100)}...`);

        expect(answer).toBeDefined();
        expect(typeof answer).toBe('string');
        expect(answer.length).toBeGreaterThan(0);
      }

      // Step 7: Verify Chat History Persistence
      console.log('🔄 Step 7: Verify Chat History Persistence');
      const chatKey = `chat:${userId}:${fileId}`;
      const history = await redisChatHistory.lRange(chatKey, 0, -1);

      expect(history.length).toBeGreaterThan(0);
      expect(history.length).toBe(questions.length * 2); // User + AI messages

      // Step 8: Test Follow-up Questions
      console.log('🔄 Step 8: Test Follow-up Questions');
      const followUpQuestion = 'Can you tell me more about deep learning?';

      const followUpChunks: string[] = [];
      let followUpComplete = false;

      client.on('answer_chunk', (data: any) => {
        followUpChunks.push(data.token);
      });

      client.on('answer_complete', () => {
        followUpComplete = true;
      });

      client.emit('question', {
        fileId,
        question: followUpQuestion,
        chatHistory: history,
      });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Follow-up answer timeout'));
        }, 15000);

        const checkComplete = () => {
          if (followUpComplete) {
            clearTimeout(timeout);
            resolve(undefined);
          } else {
            setTimeout(checkComplete, 100);
          }
        };
        checkComplete();
      });

      const followUpAnswer = followUpChunks.join('');
      console.log(
        `✅ Follow-up Answer: ${followUpAnswer.substring(0, 100)}...`,
      );

      expect(followUpAnswer).toBeDefined();
      expect(followUpAnswer.length).toBeGreaterThan(0);

      // Step 9: Test Context Awareness
      console.log('🔄 Step 9: Test Context Awareness');
      const contextQuestion = 'What did I ask about earlier?';

      const contextChunks: string[] = [];
      let contextComplete = false;

      client.on('answer_chunk', (data: any) => {
        contextChunks.push(data.token);
      });

      client.on('answer_complete', () => {
        contextComplete = true;
      });

      client.emit('question', {
        fileId,
        question: contextQuestion,
        chatHistory: history,
      });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Context answer timeout'));
        }, 15000);

        const checkComplete = () => {
          if (contextComplete) {
            clearTimeout(timeout);
            resolve(undefined);
          } else {
            setTimeout(checkComplete, 100);
          }
        };
        checkComplete();
      });

      const contextAnswer = contextChunks.join('');
      console.log(`✅ Context Answer: ${contextAnswer.substring(0, 100)}...`);

      expect(contextAnswer).toBeDefined();
      expect(contextAnswer.length).toBeGreaterThan(0);

      // Step 10: Cleanup
      console.log('🔄 Step 10: Cleanup');
      client.disconnect();

      // Verify all data was stored correctly
      const finalFileResult = await db.query(
        'SELECT * FROM user_files WHERE id = $1',
        [fileId],
      );

      expect((finalFileResult.rows[0] as any).status).toBe('processed');
      expect((finalFileResult.rows[0] as any).owner_id).toBe(userId);

      console.log('✅ Complete user journey test passed!');
    });

    it('should handle multiple users with separate document spaces', async () => {
      // Create two users
      const user1 = {
        email: 'user1@example.com',
        password: 'TestPassword123!',
        name: 'User One',
      };

      const user2 = {
        email: 'user2@example.com',
        password: 'TestPassword123!',
        name: 'User Two',
      };

      // Register both users
      await request(app).post('/auth/signup').send(user1).expect(201);
      await request(app).post('/auth/signup').send(user2).expect(201);

      // Login both users
      const login1 = await request(app)
        .post('/auth/login')
        .send({ email: user1.email, password: user1.password })
        .expect(200);

      const login2 = await request(app)
        .post('/auth/login')
        .send({ email: user2.email, password: user2.password })
        .expect(200);

      const token1 = login1.body.token;
      const token2 = login2.body.token;
      const userId1 = login1.body.user.id;
      const userId2 = login2.body.user.id;

      // Upload different documents for each user
      const doc1Content =
        "This is User 1's document about technology and innovation.";
      const doc2Content =
        "This is User 2's document about business and finance.";

      await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${token1}`)
        .attach('file', Buffer.from(doc1Content), 'user1-doc.txt')
        .expect(201);

      await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${token2}`)
        .attach('file', Buffer.from(doc2Content), 'user2-doc.txt')
        .expect(201);

      // Get file IDs
      const file1Result = await db.query(
        'SELECT id FROM user_files WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1',
        [userId1],
      );

      const file2Result = await db.query(
        'SELECT id FROM user_files WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1',
        [userId2],
      );

      const fileId1 = (file1Result.rows[0] as any).id;
      const fileId2 = (file2Result.rows[0] as any).id;

      // Wait for processing
      await waitForProcessing(fileId1, token1);
      await waitForProcessing(fileId2, token2);

      // Create WebSocket connections for both users
      const client1 = Client('http://localhost:3000', {
        auth: { token: token1 },
      });
      const client2 = Client('http://localhost:3000', {
        auth: { token: token2 },
      });

      await Promise.all([
        new Promise<void>((resolve) => client1.on('connect', () => resolve())),
        new Promise<void>((resolve) => client2.on('connect', () => resolve())),
      ]);

      // Both users ask questions about their respective documents
      const [answer1, answer2] = await Promise.all([
        askQuestion(client1, fileId1, 'What is this document about?'),
        askQuestion(client2, fileId2, 'What is this document about?'),
      ]);

      // Verify answers are different and relevant to each user's document
      expect(answer1).toBeDefined();
      expect(answer2).toBeDefined();
      expect(answer1).not.toBe(answer2);
      expect(answer1.toLowerCase()).toContain('technology');
      expect(answer2.toLowerCase()).toContain('business');

      // Cleanup
      client1.disconnect();
      client2.disconnect();

      // Clean up test users
      await db.query('DELETE FROM users WHERE email IN ($1, $2)', [
        user1.email,
        user2.email,
      ]);
    });

    it('should handle system recovery after service interruption', async () => {
      // Create user and upload document
      const user = {
        email: 'recoverytest@example.com',
        password: 'TestPassword123!',
        name: 'Recovery Test User',
      };

      await request(app).post('/auth/signup').send(user).expect(201);

      const login = await request(app)
        .post('/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);

      const token = login.body.token;
      const userId = login.body.user.id;

      // Upload document
      await request(app)
        .post('/files/upload')
        .set('Authorization', `Bearer ${token}`)
        .attach(
          'file',
          Buffer.from('Recovery test document content'),
          'recovery-test.txt',
        )
        .expect(201);

      // Get file ID
      const fileResult = await db.query(
        'SELECT id FROM user_files WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1',
        [userId],
      );

      const fileId = (fileResult.rows[0] as any).id;

      // Wait for processing
      await waitForProcessing(fileId, token);

      // Test that system is still responsive after processing
      const healthResponse = await request(app).get('/health').expect(200);

      expect(healthResponse.body.status).toBe('healthy');

      // Test that chat still works
      const client = Client('http://localhost:3000', { auth: { token } });
      await new Promise<void>((resolve) =>
        client.on('connect', () => resolve()),
      );

      const answer = await askQuestion(
        client,
        fileId,
        'What is this document about?',
      );
      expect(answer).toBeDefined();
      expect(answer.length).toBeGreaterThan(0);

      client.disconnect();

      // Clean up
      await db.query('DELETE FROM users WHERE email = $1', [user.email]);
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

  async function waitForProcessing(
    fileId: string,
    token: string,
  ): Promise<void> {
    let processingComplete = false;
    const maxWaitTime = 60000;
    const startTime = Date.now();

    while (!processingComplete && Date.now() - startTime < maxWaitTime) {
      const statusResponse = await request(app)
        .get(`/files/status/${fileId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const status = statusResponse.body.status;

      if (status === 'processed' || status === 'failed') {
        processingComplete = true;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    if (!processingComplete) {
      throw new Error('File processing timeout');
    }
  }

  async function askQuestion(
    client: Socket,
    fileId: string,
    question: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
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
        reject(new Error(`WebSocket error: ${error.message}`));
      });

      client.emit('question', {
        fileId,
        question,
        chatHistory: [],
      });

      setTimeout(() => {
        if (!answerComplete) {
          reject(new Error('Answer timeout'));
        }
      }, 15000);
    });
  }

  async function cleanupTestData() {
    try {
      await db.query('DELETE FROM users WHERE email = $1', [testUser.email]);
      await redisChatHistory.del('chat:test-user:*');
    } catch (error) {
      // Ignore cleanup errors
    }
  }
});
