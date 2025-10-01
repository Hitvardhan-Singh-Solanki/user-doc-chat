import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PostgresService } from './postgres.repository';

// Mock the database connection
vi.mock('./db.repo', () => ({
  db: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

describe('PostgresService', () => {
  let postgresService: PostgresService;
  let mockDb: any;

  beforeEach(async () => {
    // Reset environment variables
    delete process.env.VECTOR_DISTANCE_OPERATOR;

    // Clear all mocks
    vi.clearAllMocks();

    // Get the mocked db
    const dbModule = await import('./db.repo');
    mockDb = dbModule.db;

    // Reset the singleton instance to pick up new environment variables
    (PostgresService as any).instance = undefined;

    // Get fresh instance
    postgresService = PostgresService.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('distance-to-score conversion', () => {
    it('should correctly convert cosine distance to similarity score', async () => {
      // Set cosine distance operator
      process.env.VECTOR_DISTANCE_OPERATOR = 'cosine';
      postgresService = PostgresService.getInstance();

      // Mock database response with cosine distances
      mockDb.query.mockResolvedValue({
        rows: [
          {
            id: 'vector1',
            distance: 0.0, // Identical vectors
            metadata: { userId: 'user1', fileId: 'file1' },
            embedding: [0.1, 0.2, 0.3],
          },
          {
            id: 'vector2',
            distance: 1.0, // 90 degrees apart
            metadata: { userId: 'user1', fileId: 'file1' },
            embedding: [0.4, 0.5, 0.6],
          },
          {
            id: 'vector3',
            distance: 2.0, // Opposite vectors
            metadata: { userId: 'user1', fileId: 'file1' },
            embedding: [-0.1, -0.2, -0.3],
          },
        ],
      });

      const result = await postgresService.queryVector(
        [0.1, 0.2, 0.3],
        'user1',
        'file1',
        3,
      );

      expect(result.matches).toHaveLength(3);

      // Cosine distance 0.0 should give score 1.0 (identical)
      expect(result.matches[0].score).toBeCloseTo(1.0, 5);

      // Cosine distance 1.0 should give score 0.5 (90 degrees)
      expect(result.matches[1].score).toBeCloseTo(0.5, 5);

      // Cosine distance 2.0 should give score 0.0 (opposite)
      expect(result.matches[2].score).toBeCloseTo(0.0, 5);
    });

    it('should correctly convert euclidean distance to similarity score', async () => {
      // Set euclidean distance operator
      process.env.VECTOR_DISTANCE_OPERATOR = 'euclidean';
      (PostgresService as any).instance = undefined;
      postgresService = PostgresService.getInstance();

      // Mock database response with euclidean distances
      mockDb.query.mockResolvedValue({
        rows: [
          {
            id: 'vector1',
            distance: 0.0, // Identical vectors
            metadata: { userId: 'user1', fileId: 'file1' },
            embedding: [0.1, 0.2, 0.3],
          },
          {
            id: 'vector2',
            distance: 1.0, // Distance of 1
            metadata: { userId: 'user1', fileId: 'file1' },
            embedding: [0.4, 0.5, 0.6],
          },
          {
            id: 'vector3',
            distance: 5.0, // Larger distance
            metadata: { userId: 'user1', fileId: 'file1' },
            embedding: [1.0, 2.0, 3.0],
          },
        ],
      });

      const result = await postgresService.queryVector(
        [0.1, 0.2, 0.3],
        'user1',
        'file1',
        3,
      );

      expect(result.matches).toHaveLength(3);

      // Euclidean distance 0.0 should give score 1.0 (identical)
      expect(result.matches[0].score).toBeCloseTo(1.0, 5);

      // Euclidean distance 1.0 should give score 0.5 (1/(1+1))
      expect(result.matches[1].score).toBeCloseTo(0.5, 5);

      // Euclidean distance 5.0 should give score 0.167 (1/(1+5))
      expect(result.matches[2].score).toBeCloseTo(0.1666666667, 5);
    });

    it('should correctly convert inner product to similarity score', async () => {
      // Set inner product operator
      process.env.VECTOR_DISTANCE_OPERATOR = 'inner_product';
      (PostgresService as any).instance = undefined;
      postgresService = PostgresService.getInstance();

      // Mock database response with inner product distances (negative values)
      mockDb.query.mockResolvedValue({
        rows: [
          {
            id: 'vector1',
            distance: -1.0, // High similarity (negative inner product)
            metadata: { userId: 'user1', fileId: 'file1' },
            embedding: [0.1, 0.2, 0.3],
          },
          {
            id: 'vector2',
            distance: -0.5, // Medium similarity
            metadata: { userId: 'user1', fileId: 'file1' },
            embedding: [0.4, 0.5, 0.6],
          },
          {
            id: 'vector3',
            distance: 0.0, // No similarity
            metadata: { userId: 'user1', fileId: 'file1' },
            embedding: [0.0, 0.0, 0.0],
          },
        ],
      });

      const result = await postgresService.queryVector(
        [0.1, 0.2, 0.3],
        'user1',
        'file1',
        3,
      );

      expect(result.matches).toHaveLength(3);

      // Inner product -1.0 should give score 1.0 (high similarity)
      expect(result.matches[0].score).toBeCloseTo(1.0, 5);

      // Inner product -0.5 should give score 0.5 (medium similarity)
      expect(result.matches[1].score).toBeCloseTo(0.5, 5);

      // Inner product 0.0 should give score 0.0 (no similarity)
      expect(result.matches[2].score).toBeCloseTo(0.0, 5);
    });

    it('should default to cosine distance when no operator is specified', async () => {
      // No environment variable set
      delete process.env.VECTOR_DISTANCE_OPERATOR;
      (PostgresService as any).instance = undefined;
      postgresService = PostgresService.getInstance();

      // Mock database response
      mockDb.query.mockResolvedValue({
        rows: [
          {
            id: 'vector1',
            distance: 1.0,
            metadata: { userId: 'user1', fileId: 'file1' },
            embedding: [0.1, 0.2, 0.3],
          },
        ],
      });

      const result = await postgresService.queryVector(
        [0.1, 0.2, 0.3],
        'user1',
        'file1',
        1,
      );

      expect(result.matches).toHaveLength(1);
      // Should use cosine normalization: 1 - (1.0 / 2) = 0.5
      expect(result.matches[0].score).toBeCloseTo(0.5, 5);
    });

    it('should use correct SQL operator for each distance type', async () => {
      // Test cosine operator
      process.env.VECTOR_DISTANCE_OPERATOR = 'cosine';
      postgresService = PostgresService.getInstance();

      mockDb.query.mockResolvedValue({ rows: [] });

      await postgresService.queryVector([0.1, 0.2, 0.3], 'user1', 'file1', 1);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('embedding <->'),
        expect.any(Array),
      );

      // Test euclidean operator
      process.env.VECTOR_DISTANCE_OPERATOR = 'euclidean';
      (PostgresService as any).instance = undefined;
      postgresService = PostgresService.getInstance();

      mockDb.query.mockResolvedValue({ rows: [] });

      await postgresService.queryVector([0.1, 0.2, 0.3], 'user1', 'file1', 1);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('embedding <#>'),
        expect.any(Array),
      );

      // Test inner product operator
      process.env.VECTOR_DISTANCE_OPERATOR = 'inner_product';
      (PostgresService as any).instance = undefined;
      postgresService = PostgresService.getInstance();

      mockDb.query.mockResolvedValue({ rows: [] });

      await postgresService.queryVector([0.1, 0.2, 0.3], 'user1', 'file1', 1);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('embedding <#>'),
        expect.any(Array),
      );
    });
  });

  describe('input validation', () => {
    it('should throw error for empty embedding array', async () => {
      await expect(
        postgresService.queryVector([], 'user1', 'file1', 5),
      ).rejects.toThrow('Embedding array cannot be empty');
    });

    it('should throw error for invalid topK values', async () => {
      await expect(
        postgresService.queryVector([0.1, 0.2], 'user1', 'file1', 0),
      ).rejects.toThrow('topK must be a positive integer');

      await expect(
        postgresService.queryVector([0.1, 0.2], 'user1', 'file1', -1),
      ).rejects.toThrow('topK must be a positive integer');

      await expect(
        postgresService.queryVector([0.1, 0.2], 'user1', 'file1', -1.5),
      ).rejects.toThrow('topK must be a positive integer');
    });
  });
});
