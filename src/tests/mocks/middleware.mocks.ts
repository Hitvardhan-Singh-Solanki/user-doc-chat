/**
 * Middleware mocks
 * Provides mocks for Express middleware (auth, rate limiting, etc.)
 */

import { vi } from 'vitest';
import type {
  AuthMiddlewareMock,
  RateLimitMock,
  MockFactory,
} from '../../shared/types/mock.types';

// Auth Middleware Mock Factory
export const createAuthMiddlewareMock = (): AuthMiddlewareMock => ({
  authenticate: vi.fn().mockImplementation((req, res, next) => {
    req.user = {
      id: 'user-123',
      email: 'test@example.com',
    };
    next();
  }),
  authorize: vi.fn().mockImplementation((req, res, next) => {
    // Mock authorization logic
    if (req.user && req.user.id) {
      next();
    } else {
      res.status(403).json({ error: 'Forbidden' });
    }
  }),
  validateToken: vi.fn().mockImplementation((req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token && token === 'valid-token') {
      req.user = {
        id: 'user-123',
        email: 'test@example.com',
      };
      next();
    } else {
      res.status(401).json({ error: 'Invalid token' });
    }
  }),
});

// Rate Limit Mock Factory
export const createRateLimitMock = (): RateLimitMock => ({
  checkLimit: vi.fn().mockResolvedValue({
    remainingPoints: 100,
    msBeforeNext: 0,
    isBlocked: false,
  }),
  consume: vi.fn().mockResolvedValue({
    remainingPoints: 99,
    msBeforeNext: 0,
    isBlocked: false,
  }),
  reset: vi.fn().mockResolvedValue(undefined),
  getInfo: vi.fn().mockResolvedValue({
    remainingPoints: 100,
    msBeforeNext: 0,
    totalHits: 0,
  }),
});

// Middleware Mock Factory Builder
export class MiddlewareMockFactory<T> implements MockFactory<T> {
  private defaultValues: T;
  private mockFunctions: Partial<Record<keyof T, () => unknown>>;

  constructor(
    defaultValues: T,
    mockFunctions?: Partial<Record<keyof T, () => unknown>>,
  ) {
    this.defaultValues = defaultValues;
    this.mockFunctions = mockFunctions || {};
  }

  create(): T {
    const result = { ...this.defaultValues };

    // Apply mock functions
    for (const [key, mockFn] of Object.entries(this.mockFunctions)) {
      if (mockFn && typeof mockFn === 'function') {
        (result as Record<string, unknown>)[key] = mockFn();
      }
    }

    return result;
  }

  createWith(overrides: Partial<T>): T {
    return { ...this.create(), ...overrides };
  }

  createArray(count: number): T[] {
    return Array.from({ length: count }, () => this.create());
  }

  createArrayWith(count: number, overrides: Partial<T>): T[] {
    return Array.from({ length: count }, () => this.createWith(overrides));
  }
}

// Pre-configured middleware mock instances
export const middlewareMocks = {
  auth: createAuthMiddlewareMock(),
  rateLimit: createRateLimitMock(),
};

// Middleware mock builders
export const authMiddlewareMockBuilder = new MiddlewareMockFactory(
  middlewareMocks.auth,
);
export const rateLimitMockBuilder = new MiddlewareMockFactory(
  middlewareMocks.rateLimit,
);

// Mock Express request/response objects
export const createMockRequest = (overrides = {}) => ({
  headers: {},
  body: {},
  query: {},
  params: {},
  user: null,
  ip: '127.0.0.1',
  method: 'GET',
  url: '/',
  ...overrides,
});

export const createMockResponse = () => {
  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    getHeader: vi.fn().mockReturnValue(undefined),
    removeHeader: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    render: vi.fn().mockReturnThis(),
    locals: {},
  };

  return res;
};

export const createMockNext = () => {
  const next = vi.fn();
  const mockNext = Object.assign(next, {
    called: false,
    error: null as Error | null,
  });

  // Wrap the mock to track calls
  const wrappedNext = (...args: unknown[]) => {
    mockNext.called = true;
    if (args.length > 0 && args[0] instanceof Error) {
      mockNext.error = args[0] as Error;
    }
    return next(...args);
  };

  return Object.assign(wrappedNext, mockNext);
};

// Mock middleware error scenarios
export const mockMiddlewareErrors = {
  auth: {
    noToken: {
      status: 401,
      error: 'No token provided',
    },
    invalidToken: {
      status: 401,
      error: 'Invalid token',
    },
    expiredToken: {
      status: 401,
      error: 'Token expired',
    },
    insufficientPermissions: {
      status: 403,
      error: 'Insufficient permissions',
    },
  },
  rateLimit: {
    exceeded: {
      status: 429,
      error: 'Rate limit exceeded',
      retryAfter: 60,
    },
    tooManyRequests: {
      status: 429,
      error: 'Too many requests',
      retryAfter: 300,
    },
  },
};

// Mock middleware success scenarios
export const mockMiddlewareSuccess = {
  auth: {
    validUser: {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        role: 'user',
      },
    },
    adminUser: {
      user: {
        id: 'admin-123',
        email: 'admin@example.com',
        role: 'admin',
      },
    },
  },
  rateLimit: {
    withinLimit: {
      remainingPoints: 100,
      msBeforeNext: 0,
      isBlocked: false,
    },
    nearLimit: {
      remainingPoints: 5,
      msBeforeNext: 0,
      isBlocked: false,
    },
  },
};
