import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service';
import { IDBStore } from '../interfaces/db-store.interface';
import * as hashUtils from '../utils/hash';

// Mock the hash utilities
vi.mock('../utils/hash', () => ({
  hashPassword: vi.fn(),
  comparePassword: vi.fn(),
}));

describe('AuthService', () => {
  let authService: AuthService;
  let mockDb: IDBStore;
  let mockHashPassword: any;
  let mockComparePassword: any;

  beforeEach(() => {
    // Setup mocks
    mockDb = {
      query: vi.fn(),
      withTransaction: vi.fn(),
    };

    mockHashPassword = vi.mocked(hashUtils.hashPassword);
    mockComparePassword = vi.mocked(hashUtils.comparePassword);

    authService = new AuthService(mockDb);

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('signUp', () => {
    it('should successfully create a new user', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const hashedPassword = 'hashedPassword123';
      const mockUser = {
        id: 'user1',
        email: 'test@example.com',
        created_at: new Date(),
      };

      mockHashPassword.mockResolvedValue(hashedPassword);
      mockDb.query = vi.fn().mockResolvedValue({
        rows: [mockUser],
      });

      const result = await authService.signUp(email, password);

      expect(mockHashPassword).toHaveBeenCalledWith(password);
      expect(mockDb.query).toHaveBeenCalledWith(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
        ['test@example.com', hashedPassword],
      );
      expect(result).toEqual(mockUser);
    });

    it('should normalize email to lowercase and trim', async () => {
      const email = '  TEST@EXAMPLE.COM  ';
      const password = 'password123';
      const hashedPassword = 'hashedPassword123';

      mockHashPassword.mockResolvedValue(hashedPassword);
      mockDb.query = vi.fn().mockResolvedValue({
        rows: [
          { id: 'user1', email: 'test@example.com', created_at: new Date() },
        ],
      });

      await authService.signUp(email, password);

      expect(mockDb.query).toHaveBeenCalledWith(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
        ['test@example.com', hashedPassword],
      );
    });

    it("should throw 'Email already in use' error for unique constraint violation", async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const uniqueViolationError = {
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      };

      mockHashPassword.mockResolvedValue('hashedPassword123');
      mockDb.query = vi.fn().mockRejectedValue(uniqueViolationError);

      await expect(authService.signUp(email, password)).rejects.toThrow(
        'Email already in use',
      );
    });

    it('should rethrow non-unique constraint errors', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const otherError = new Error('Database connection failed');

      mockHashPassword.mockResolvedValue('hashedPassword123');
      mockDb.query = vi.fn().mockRejectedValue(otherError);

      await expect(authService.signUp(email, password)).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('should handle hash password failure', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const hashError = new Error('Hashing failed');

      mockHashPassword.mockRejectedValue(hashError);

      await expect(authService.signUp(email, password)).rejects.toThrow(
        'Hashing failed',
      );
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const mockUser = {
        id: 'user1',
        email: 'test@example.com',
        password_hash: 'hashedPassword123',
        created_at: new Date(),
      };

      mockDb.query = vi.fn().mockResolvedValue({
        rows: [mockUser],
      });
      mockComparePassword.mockResolvedValue(true);

      const result = await authService.login(email, password);

      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT id, email, password_hash, created_at FROM users WHERE email = $1',
        [email],
      );
      expect(mockComparePassword).toHaveBeenCalledWith(
        password,
        mockUser.password_hash,
      );
      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
      });
    });

    it("should throw 'Invalid credentials' when user not found", async () => {
      const email = 'nonexistent@example.com';
      const password = 'password123';

      mockDb.query = vi.fn().mockResolvedValue({
        rows: [],
      });

      await expect(authService.login(email, password)).rejects.toThrow(
        'Invalid credentials',
      );
      expect(mockComparePassword).not.toHaveBeenCalled();
    });

    it("should throw 'Invalid credentials' when password is incorrect", async () => {
      const email = 'test@example.com';
      const password = 'wrongpassword';
      const mockUser = {
        id: 'user1',
        email: 'test@example.com',
        password_hash: 'hashedPassword123',
        created_at: new Date(),
      };

      mockDb.query = vi.fn().mockResolvedValue({
        rows: [mockUser],
      });
      mockComparePassword.mockResolvedValue(false);

      await expect(authService.login(email, password)).rejects.toThrow(
        'Invalid credentials',
      );
      expect(mockComparePassword).toHaveBeenCalledWith(
        password,
        mockUser.password_hash,
      );
    });

    it('should handle database query errors', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const dbError = new Error('Database connection failed');

      mockDb.query = vi.fn().mockRejectedValue(dbError);

      await expect(authService.login(email, password)).rejects.toThrow(
        'Database connection failed',
      );
      expect(mockComparePassword).not.toHaveBeenCalled();
    });

    it('should handle password comparison errors', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const mockUser = {
        id: 'user1',
        email: 'test@example.com',
        password_hash: 'hashedPassword123',
        created_at: new Date(),
      };
      const compareError = new Error('Password comparison failed');

      mockDb.query = vi.fn().mockResolvedValue({
        rows: [mockUser],
      });
      mockComparePassword.mockRejectedValue(compareError);

      await expect(authService.login(email, password)).rejects.toThrow(
        'Password comparison failed',
      );
    });
  });

  describe('isUniqueViolation (private method)', () => {
    it('should identify unique constraint violations through public methods', async () => {
      const uniqueViolationError = {
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      };

      mockHashPassword.mockResolvedValue('hashedPassword123');
      mockDb.query = vi.fn().mockRejectedValue(uniqueViolationError);

      await expect(
        authService.signUp('test@example.com', 'password123'),
      ).rejects.toThrow('Email already in use');
    });

    it('should not identify non-unique constraint errors as unique violations', async () => {
      const otherError = {
        code: '23502', // NOT NULL violation
        message: 'null value in column violates not-null constraint',
      };

      mockHashPassword.mockResolvedValue('hashedPassword123');
      mockDb.query = vi.fn().mockRejectedValue(otherError);

      await expect(
        authService.signUp('test@example.com', 'password123'),
      ).rejects.toThrow('null value in column violates not-null constraint');
    });

    it('should handle non-object errors', async () => {
      const stringError = 'Some string error';

      mockHashPassword.mockResolvedValue('hashedPassword123');
      mockDb.query = vi.fn().mockRejectedValue(stringError);

      await expect(
        authService.signUp('test@example.com', 'password123'),
      ).rejects.toThrow('Some string error');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty email', async () => {
      const email = '';
      const password = 'password123';

      mockHashPassword.mockResolvedValue('hashedPassword123');
      mockDb.query = vi.fn().mockResolvedValue({
        rows: [{ id: 'user1', email: '', created_at: new Date() }],
      });

      const result = await authService.signUp(email, password);

      expect(mockDb.query).toHaveBeenCalledWith(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
        ['', 'hashedPassword123'],
      );
    });

    it('should handle whitespace-only email', async () => {
      const email = '   ';
      const password = 'password123';

      mockHashPassword.mockResolvedValue('hashedPassword123');
      mockDb.query = vi.fn().mockResolvedValue({
        rows: [{ id: 'user1', email: '', created_at: new Date() }],
      });

      await authService.signUp(email, password);

      expect(mockDb.query).toHaveBeenCalledWith(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
        ['', 'hashedPassword123'],
      );
    });
  });
});
