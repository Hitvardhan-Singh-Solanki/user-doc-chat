import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CircuitBreakerService } from './circuit-breaker';

describe('CircuitBreakerService Memory Management - Final Tests', () => {
  let service: CircuitBreakerService;
  const mockFunction = vi.fn().mockResolvedValue('success');

  beforeEach(() => {
    service = CircuitBreakerService.getInstance({
      maxBreakers: 2,
      ttlMs: 1000,
      cleanupIntervalMs: 500,
      alertThreshold: 1,
    });
  });

  afterEach(() => {
    service.destroy();
    vi.clearAllMocks();
  });

  it('should enforce maximum breaker limit with LRU eviction', () => {
    // Create breakers up to the limit
    service.getBreaker('breaker1', mockFunction);
    service.getBreaker('breaker2', mockFunction);

    expect(service.getServiceStats().totalBreakers).toBe(2);

    // Adding one more should evict the least recently used
    service.getBreaker('breaker3', mockFunction);

    expect(service.getServiceStats().totalBreakers).toBe(2);
    // One of the original breakers should be evicted
    const breaker1Exists = service.getBreakerStatus('breaker1') !== null;
    const breaker2Exists = service.getBreakerStatus('breaker2') !== null;
    const breaker3Exists = service.getBreakerStatus('breaker3') !== null;

    expect(breaker3Exists).toBe(true);
    expect(breaker1Exists || breaker2Exists).toBe(true);
    expect(breaker1Exists && breaker2Exists).toBe(false);
  });

  it('should remove individual breakers', () => {
    service.getBreaker('breaker1', mockFunction);
    service.getBreaker('breaker2', mockFunction);

    expect(service.getServiceStats().totalBreakers).toBe(2);

    const removed = service.removeBreaker('breaker1');
    expect(removed).toBe(true);
    expect(service.getServiceStats().totalBreakers).toBe(1);
    expect(service.getBreakerStatus('breaker1')).toBeNull();
  });

  it('should handle TTL-based eviction', async () => {
    service.getBreaker('breaker1', mockFunction);
    service.getBreaker('breaker2', mockFunction);

    expect(service.getServiceStats().totalBreakers).toBe(2);

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // Trigger cleanup by accessing a breaker
    service.getBreaker('breaker3', mockFunction);

    // Should have cleaned up expired breakers
    expect(service.getServiceStats().totalBreakers).toBe(1);
    expect(service.getBreakerStatus('breaker1')).toBeNull();
    expect(service.getBreakerStatus('breaker2')).toBeNull();
  });

  it('should provide service statistics', () => {
    service.getBreaker('breaker1', mockFunction);
    service.getBreaker('breaker2', mockFunction);

    const stats = service.getServiceStats();

    expect(stats.totalBreakers).toBe(2);
    expect(stats.maxBreakers).toBe(2);
    expect(stats.utilizationPercentage).toBe(100);
    expect(stats.isNearCapacity).toBe(true);
  });

  it('should clear all breakers', () => {
    service.getBreaker('breaker1', mockFunction);
    service.getBreaker('breaker2', mockFunction);

    expect(service.getServiceStats().totalBreakers).toBe(2);

    service.clearAllBreakers();

    expect(service.getServiceStats().totalBreakers).toBe(0);
    expect(service.getBreakerStatus('breaker1')).toBeNull();
    expect(service.getBreakerStatus('breaker2')).toBeNull();
  });

  it('should handle edge case with empty metadata arrays', () => {
    const stats = service.getServiceStats();
    expect(stats.oldestBreakerAge).toBe(0);
    expect(stats.newestBreakerAge).toBe(0);
  });
});
