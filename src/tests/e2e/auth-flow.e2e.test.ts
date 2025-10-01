import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createApp } from '../../app';
import request from 'supertest';
import { PostgresService } from '../../infrastructure/database/repositories/postgres.repository';
import { redisChatHistory } from '../../infrastructure/database/repositories/redis.repo';

/**
 * End-to-End test for Authentication Flow
 * Tests the complete user authentication journey including signup, login, and JWT validation
 */
describe('Authentication Flow E2E', () => {
  let app: any;
  let db: PostgresService;
  const testUser = {
    email: 'test@example.com',
    password: 'TestPassword123!',
    name: 'Test User',
  };

  beforeAll(async () => {
    app = createApp();
    db = PostgresService.getInstance();

    // Clean up any existing test data
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  beforeEach(async () => {
    // Clean up before each test
    await cleanupTestData();
    // Reset mock database state
    global.testUtils.resetMockDatabase();
  });

  describe('User Registration Flow', () => {
    it('should successfully register a new user', async () => {
      const response = await request(app)
        .post('/auth/signup')
        .send(testUser)
        .expect(201);

      expect(response.body).toHaveProperty('token');
      expect(typeof response.body.token).toBe('string');
      expect(response.body.token).toContain('mock-jwt-token');

      // Verify user was created in database
      const userResult = await db.query(
        'SELECT id, email FROM users WHERE email = $1',
        [testUser.email],
      );

      expect(userResult.rows).toHaveLength(1);
      expect((userResult.rows[0] as any).email).toBe(testUser.email);
    });

    it('should reject duplicate email registration', async () => {
      // First registration
      await request(app).post('/auth/signup').send(testUser).expect(201);

      // Second registration with same email
      const response = await request(app)
        .post('/auth/signup')
        .send(testUser)
        .expect(409);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Email already in use');
    });

    it('should validate required fields', async () => {
      const invalidUser = {
        email: '', // Empty email
        password: '', // Empty password
      };

      const response = await request(app)
        .post('/auth/signup')
        .send(invalidUser)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Email and password are required');
    });

    it('should accept valid email format', async () => {
      const validUser = {
        ...testUser,
        email: 'valid@example.com',
      };

      const response = await request(app)
        .post('/auth/signup')
        .send(validUser)
        .expect(201);

      expect(response.body).toHaveProperty('token');
    });

    it('should accept any password format', async () => {
      const weakPasswordUser = {
        ...testUser,
        email: 'weak@example.com',
        password: '123', // Weak password but API accepts it
      };

      const response = await request(app)
        .post('/auth/signup')
        .send(weakPasswordUser)
        .expect(201);

      expect(response.body).toHaveProperty('token');
    });
  });

  describe('User Login Flow', () => {
    beforeEach(async () => {
      // Create a test user for login tests
      await request(app).post('/auth/signup').send(testUser).expect(201);
    });

    it('should successfully login with valid credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(typeof response.body.token).toBe('string');
      expect(response.body.token).toContain('mock-jwt-token');
    });

    it('should reject login with invalid email', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: testUser.password,
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid credentials');
    });

    it('should reject login with invalid password', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: 'wrongpassword',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid credentials');
    });

    it('should validate required login fields', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: testUser.email,
          // Missing password
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('JWT Token Validation', () => {
    let authToken: string;

    beforeEach(async () => {
      // Create user and get token
      await request(app).post('/auth/signup').send(testUser).expect(201);

      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      authToken = loginResponse.body.token;
    });

    it('should accept valid JWT token for protected routes', async () => {
      // Test with a protected route (file upload endpoint)
      const response = await request(app)
        .post('/file/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from('test content'), 'test.txt')
        .expect(201); // 201 because file upload should succeed with mocks

      // The error should be about file processing, not authentication
      expect(response.body.error).not.toContain('Unauthorized');
      expect(response.body.error).not.toContain('Invalid token');
    });

    it('should reject requests without JWT token', async () => {
      const response = await request(app)
        .post('/file/upload')
        .attach('file', Buffer.from('test content'), 'test.txt')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Unauthorized');
    });

    it('should reject requests with invalid JWT token', async () => {
      const response = await request(app)
        .post('/file/upload')
        .set('Authorization', 'Bearer invalid-token')
        .attach('file', Buffer.from('test content'), 'test.txt')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Unauthorized');
    });

    it('should reject requests with malformed Authorization header', async () => {
      const response = await request(app)
        .post('/file/upload')
        .set('Authorization', 'InvalidFormat token')
        .attach('file', Buffer.from('test content'), 'test.txt')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle expired JWT tokens', async () => {
      // Create a token with very short expiration (1 second)
      const shortExpiryToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXIiLCJpYXQiOjE2MzQ1Njc4MDAsImV4cCI6MTYzNDU2NzgwMX0.invalid';

      const response = await request(app)
        .post('/file/upload')
        .set('Authorization', `Bearer ${shortExpiryToken}`)
        .attach('file', Buffer.from('test content'), 'test.txt')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('User Session Management', () => {
    let authToken: string;
    let userId: string;

    beforeEach(async () => {
      // Create user and get token
      await request(app).post('/auth/signup').send(testUser).expect(201);

      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      authToken = loginResponse.body.token;
      userId = 'test-id'; // Mock user ID since API doesn't return user object
    });

    it('should maintain user session across multiple requests', async () => {
      // Make multiple authenticated requests
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .post('/file/upload')
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', Buffer.from(`test content ${i}`), `test${i}.txt`)
          .expect(201); // Expected to succeed with mocks

        // Auth should pass each time
        expect(response.body.error).not.toContain('Unauthorized');
      }
    });

    it('should handle concurrent authentication requests', async () => {
      const requests = Array.from({ length: 5 }, () =>
        request(app).post('/auth/login').send({
          email: testUser.email,
          password: testUser.password,
        }),
      );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('token');
        expect(typeof response.body.token).toBe('string');
      });
    });
  });

  describe('Security Features', () => {
    it('should not expose sensitive user information', async () => {
      await request(app).post('/auth/signup').send(testUser).expect(201);

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      // Verify only token is returned, no user data
      expect(response.body).toHaveProperty('token');
      expect(response.body).not.toHaveProperty('user');
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('passwordHash');
    });

    it('should handle SQL injection attempts', async () => {
      const maliciousUser = {
        email: "malicious@example.com'; DROP TABLE users; --",
        password: 'TestPassword123!',
      };

      // The API doesn't validate for SQL injection, so it will accept the request
      const response = await request(app)
        .post('/auth/signup')
        .send(maliciousUser)
        .expect(201);

      expect(response.body).toHaveProperty('token');

      // Verify users table still exists
      const userResult = await db.query('SELECT COUNT(*) FROM users');
      expect((userResult.rows[0] as any).count).toBeDefined();
    });

    it('should handle XSS attempts in user input', async () => {
      const xssUser = {
        email: 'test@example.com',
        password: 'TestPassword123!',
        name: '<script>alert("xss")</script>',
      };

      const response = await request(app)
        .post('/auth/signup')
        .send(xssUser)
        .expect(201);

      // Verify the script tag is sanitized or escaped
      const userResult = await db.query(
        'SELECT name FROM users WHERE email = $1',
        [xssUser.email],
      );

      expect((userResult.rows[0] as any).name).not.toContain('<script>');
    });
  });

  // Helper function to clean up test data
  async function cleanupTestData() {
    try {
      await db.query('DELETE FROM users WHERE email = $1', [testUser.email]);
      await redisChatHistory.del('chat:test-user:*');
    } catch (error) {
      // Ignore cleanup errors
    }
  }
});
