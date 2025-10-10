# Testing Infrastructure Documentation

## Overview

This project implements a comprehensive testing infrastructure with three distinct test suites:

1. **Unit Tests** - Fast, isolated tests with mocked dependencies
2. **Integration Tests** - Tests with real services using Testcontainers
3. **Performance Tests** - Memory leak detection and blocking operation monitoring

## Test Configuration

### Environment Setup

Tests use the `env.test` file for configuration. This file contains all required environment variables for testing without exposing real secrets.

### Vitest Configurations

- `vitest.config.ts` - Unit tests (default)
- `vitest.integration.config.ts` - Integration tests with containers
- `vitest.performance.config.ts` - Performance and memory tests

## Running Tests

### Unit Tests
```bash
npm run test:unit
```

### Integration Tests
```bash
npm run test:integration
```

### Performance Tests
```bash
npm run test:performance
```

### All Tests
```bash
npm run test:all
```

### Specific Test Types
```bash
npm run test:memory      # Memory leak detection only
npm run test:blocking    # Blocking operation tests only
```

### Coverage Reports
```bash
npm run coverage:unit        # Unit test coverage
npm run coverage:integration # Integration test coverage
npm run coverage:performance # Performance test coverage
```

## Test Structure

### Unit Tests
- Location: `src/**/*.test.ts` (excluding integration and performance)
- Purpose: Fast, isolated testing of individual components
- Dependencies: Mocked using comprehensive mock system
- Timeout: Default (5s)

### Integration Tests
- Location: `src/tests/integration/**/*.test.ts`
- Purpose: Test with real PostgreSQL, Redis, and MinIO containers
- Dependencies: Testcontainers for service isolation
- Timeout: 60s (for container startup)

### Performance Tests
- Location: `src/tests/performance/**/*.test.ts`
- Purpose: Memory leak detection and blocking operation monitoring
- Dependencies: Real services with performance monitoring
- Timeout: 5 minutes (for performance analysis)

## Mock System

### Common Mocks (`src/tests/mocks/common.mocks.ts`)
- Database mocks (PostgreSQL)
- Redis mocks
- MinIO mocks
- BullMQ mocks
- Memory tracking utilities

### Service Mocks (`src/tests/mocks/services.mocks.ts`)
- Auth service mocks
- LLM service mocks
- File service mocks
- Vector service mocks

### External API Mocks (`src/tests/mocks/external-apis.mocks.ts`)
- HuggingFace API mocks
- Pinecone API mocks
- HTTP response mocks

### Middleware Mocks (`src/tests/mocks/middleware.mocks.ts`)
- Authentication middleware
- Rate limiting middleware
- Express request/response mocks

## Test Utilities

### Memory Tracking (`src/tests/utils/memory-tracker.ts`)
```typescript
import { memoryTracker } from '@tests/utils/memory-tracker';

// Take memory snapshots
memoryTracker.takeSnapshot('before-test');
// ... test operations ...
memoryTracker.takeSnapshot('after-test');

// Detect memory leaks
const leakResult = memoryTracker.detectLeak(1024 * 1024); // 1MB threshold
expect(leakResult.leakDetected).toBe(false);
```

### Resource Cleanup (`src/tests/utils/cleanup.ts`)
```typescript
import { resourceCleanup } from '@tests/utils/cleanup';

// Add resources for cleanup
resourceCleanup.addResource('database-connection', () => connection.close());
resourceCleanup.addTimer(setTimeout(() => {}, 1000));

// Cleanup all resources
await resourceCleanup.cleanup();
```

## Integration Testing

### Container Management
Integration tests use Testcontainers to provide real service instances:

```typescript
import { testContainerManager } from '@tests/integration/setup/container-manager';

beforeAll(async () => {
  await testContainerManager.startAll();
  const isHealthy = await testContainerManager.isHealthy();
  expect(isHealthy).toBe(true);
});

afterAll(async () => {
  await testContainerManager.cleanup();
});
```

### Database Testing
```typescript
import { postgresContainerManager } from '@tests/integration/setup/postgres.container';

const container = await postgresContainerManager.start();
await container.executeSql('CREATE TABLE test_users (id SERIAL PRIMARY KEY)');
```

### Redis Testing
```typescript
import { redisContainerManager } from '@tests/integration/setup/redis.container';

const container = await redisContainerManager.start();
const isHealthy = await container.isHealthy();
expect(isHealthy).toBe(true);
```

## Performance Testing

### Memory Leak Detection
```typescript
import { memoryTracker } from '@tests/utils/memory-tracker';

it('should not leak memory', async () => {
  memoryTracker.takeSnapshot('start');
  
  // Perform operations that might leak memory
  for (let i = 0; i < 1000; i++) {
    // Simulate memory-intensive operations
  }
  
  memoryTracker.takeSnapshot('end');
  const leakResult = memoryTracker.detectLeak(1024 * 1024);
  expect(leakResult.leakDetected).toBe(false);
});
```

### Blocking Operation Detection
```typescript
import { performanceMonitor } from '@tests/utils/performance-monitor';

it('should not block for too long', async () => {
  performanceMonitor.start();
  
  // Perform potentially blocking operation
  await database.query('SELECT * FROM large_table');
  
  const result = performanceMonitor.stop();
  expect(result.duration).toBeLessThan(100); // 100ms threshold
});
```

## Writing Tests

### Unit Test Example
```typescript
import { describe, it, expect, vi } from 'vitest';
import { AuthService } from '@auth/services/auth.service';
import { createAuthServiceMock } from '@tests/mocks/services.mocks';

describe('AuthService', () => {
  it('should authenticate user', async () => {
    const mockAuthService = createAuthServiceMock();
    mockAuthService.login.mockResolvedValue({ id: 'user-123', token: 'jwt-token' });
    
    const result = await mockAuthService.login('test@example.com', 'password');
    expect(result.id).toBe('user-123');
  });
});
```

### Integration Test Example
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testContainerManager } from '@tests/integration/setup/container-manager';

describe('Database Integration', () => {
  beforeAll(async () => {
    await testContainerManager.startAll();
  });

  afterAll(async () => {
    await testContainerManager.cleanup();
  });

  it('should connect to real database', async () => {
    const env = testContainerManager.getTestEnvironment();
    expect(env.database.connectionString).toContain('postgresql://');
  });
});
```

### Performance Test Example
```typescript
import { describe, it, expect } from 'vitest';
import { memoryTracker } from '@tests/utils/memory-tracker';

describe('Memory Performance', () => {
  it('should not leak memory with repeated operations', async () => {
    memoryTracker.takeSnapshot('start');
    
    // Perform memory-intensive operations
    const data = Array.from({ length: 10000 }, () => ({ id: Math.random() }));
    
    memoryTracker.takeSnapshot('end');
    const leakResult = memoryTracker.detectLeak(1024 * 1024);
    expect(leakResult.leakDetected).toBe(false);
  });
});
```

## Best Practices

### Unit Tests
- Use mocks for all external dependencies
- Keep tests fast (< 100ms each)
- Test one thing at a time
- Use descriptive test names

### Integration Tests
- Use real services via Testcontainers
- Test complete workflows
- Clean up after each test
- Use appropriate timeouts

### Performance Tests
- Monitor memory usage patterns
- Test with realistic data volumes
- Set appropriate thresholds
- Document performance expectations

## Troubleshooting

### Common Issues

1. **Tests failing due to missing environment variables**
   - Ensure `env.test` file exists and contains all required variables
   - Check that test setup loads environment before imports

2. **Container startup failures**
   - Ensure Docker is running
   - Check available ports (5432, 6379, 9000)
   - Increase timeout values if needed

3. **Memory leak false positives**
   - Adjust memory thresholds based on test data size
   - Ensure proper cleanup in test teardown
   - Consider garbage collection timing

4. **Slow test execution**
   - Use unit tests for fast feedback
   - Run integration tests separately
   - Optimize test data sizes

### Debug Commands
```bash
# Run specific test file
npm run test:unit -- src/domains/auth/tests/auth.service.test.ts

# Run tests with verbose output
npm run test:unit -- --reporter=verbose

# Run tests with coverage
npm run coverage:unit

# Debug container logs
npm run test:integration -- --reporter=verbose
```

## CI/CD Integration

### GitHub Actions Example
```yaml
- name: Run Unit Tests
  run: npm run test:unit

- name: Run Integration Tests
  run: npm run test:integration

- name: Run Performance Tests
  run: npm run test:performance

- name: Generate Coverage Report
  run: npm run coverage
```

### Test Reports
- Unit test coverage: `coverage/unit/`
- Integration test coverage: `coverage/integration/`
- Performance test results: `coverage/performance/`

## Contributing

When adding new tests:

1. **Unit Tests**: Add to appropriate domain directory
2. **Integration Tests**: Add to `src/tests/integration/`
3. **Performance Tests**: Add to `src/tests/performance/`
4. **Mocks**: Add to appropriate mock file in `src/tests/mocks/`
5. **Utilities**: Add to `src/tests/utils/`

Follow the existing patterns and ensure all tests pass before submitting.
