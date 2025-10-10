import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreakerService } from './circuit-breaker';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  beforeEach(() => {
    service = CircuitBreakerService.getInstance();
    // Clear any existing breakers
    service.clearAllBreakers();
  });

  describe('getBreaker', () => {
    it('should create a new breaker for a new name', async () => {
      const testFunction = async (...args: unknown[]) =>
        (args[0] as number) * 2;
      const breaker = service.getBreaker('test-breaker', testFunction);

      expect(breaker).toBeDefined();
      expect(breaker.name).toBe('test-breaker');
    });

    it('should return existing breaker for same name and function', async () => {
      const testFunction = async (...args: unknown[]) =>
        (args[0] as number) * 2;
      const breaker1 = service.getBreaker('test-breaker', testFunction);
      const breaker2 = service.getBreaker('test-breaker', testFunction);

      expect(breaker1).toBe(breaker2);
    });

    it('should throw error when same name is used with different function', async () => {
      const testFunction1 = async (...args: unknown[]) =>
        (args[0] as number) * 2;
      const testFunction2 = async (...args: unknown[]) =>
        (args[0] as number) * 3;

      service.getBreaker('test-breaker', testFunction1);

      expect(() => {
        service.getBreaker('test-breaker', testFunction2);
      }).toThrow(
        'Circuit breaker "test-breaker" already exists with a different function',
      );
    });

    it('should allow different names with same function', async () => {
      const testFunction = async (...args: unknown[]) =>
        (args[0] as number) * 2;
      const breaker1 = service.getBreaker('breaker-1', testFunction);
      const breaker2 = service.getBreaker('breaker-2', testFunction);

      expect(breaker1).not.toBe(breaker2);
      expect(breaker1.name).toBe('breaker-1');
      expect(breaker2.name).toBe('breaker-2');
    });

    it('should handle async functions correctly', async () => {
      const asyncFunction = async (...args: unknown[]) => {
        const delay = args[0] as number;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return 'success';
      };

      const breaker = service.getBreaker('async-breaker', asyncFunction);
      expect(breaker).toBeDefined();
    });

    it('should handle functions with different parameter types', async () => {
      const stringFunction = async (...args: unknown[]) =>
        (args[0] as string).toUpperCase();
      const numberFunction = async (...args: unknown[]) =>
        (args[0] as number).toString();

      const breaker1 = service.getBreaker('string-breaker', stringFunction);
      const breaker2 = service.getBreaker('number-breaker', numberFunction);

      expect(breaker1).toBeDefined();
      expect(breaker2).toBeDefined();
      expect(breaker1).not.toBe(breaker2);
    });

    it('should preserve breaker options when reusing', async () => {
      const testFunction = async (...args: unknown[]) =>
        (args[0] as number) * 2;
      const options = { timeout: 5000, errorThresholdPercentage: 30 };

      const breaker1 = service.getBreaker(
        'test-breaker',
        testFunction,
        options,
      );
      const breaker2 = service.getBreaker('test-breaker', testFunction);

      expect(breaker1).toBe(breaker2);
    });
  });

  describe('getBreakerStatus', () => {
    it('should return null for non-existent breaker', () => {
      const status = service.getBreakerStatus('non-existent');
      expect(status).toBeNull();
    });

    it('should return breaker status for existing breaker', async () => {
      const testFunction = async (...args: unknown[]) =>
        (args[0] as number) * 2;
      service.getBreaker('test-breaker', testFunction);

      const status = service.getBreakerStatus('test-breaker');
      expect(status).toBeDefined();
      expect(status?.name).toBe('test-breaker');
      expect(status?.stats).toBeDefined();
    });
  });

  describe('getAllBreakerStatuses', () => {
    it('should return empty object when no breakers exist', () => {
      const statuses = service.getAllBreakerStatuses();
      expect(statuses).toEqual({});
    });

    it('should return all breaker statuses', async () => {
      const testFunction1 = async (...args: unknown[]) =>
        (args[0] as number) * 2;
      const testFunction2 = async (...args: unknown[]) =>
        (args[0] as number) * 3;

      service.getBreaker('breaker-1', testFunction1);
      service.getBreaker('breaker-2', testFunction2);

      const statuses = service.getAllBreakerStatuses();
      expect(Object.keys(statuses)).toHaveLength(2);
      expect(statuses['breaker-1']).toBeDefined();
      expect(statuses['breaker-2']).toBeDefined();
    });
  });

  describe('resetBreaker', () => {
    it('should reset specific breaker', async () => {
      const testFunction = async (...args: unknown[]) =>
        (args[0] as number) * 2;
      const breaker = service.getBreaker('test-breaker', testFunction);

      const closeSpy = vi.spyOn(breaker, 'close');
      service.resetBreaker('test-breaker');

      expect(closeSpy).toHaveBeenCalled();
    });

    it('should handle reset of non-existent breaker gracefully', () => {
      expect(() => {
        service.resetBreaker('non-existent');
      }).not.toThrow();
    });
  });

  describe('resetAllBreakers', () => {
    it('should reset all breakers', async () => {
      const testFunction1 = async (...args: unknown[]) =>
        (args[0] as number) * 2;
      const testFunction2 = async (...args: unknown[]) =>
        (args[0] as number) * 3;

      const breaker1 = service.getBreaker('breaker-1', testFunction1);
      const breaker2 = service.getBreaker('breaker-2', testFunction2);

      const closeSpy1 = vi.spyOn(breaker1, 'close');
      const closeSpy2 = vi.spyOn(breaker2, 'close');

      service.resetAllBreakers();

      expect(closeSpy1).toHaveBeenCalled();
      expect(closeSpy2).toHaveBeenCalled();
    });
  });

  describe('clearAllBreakers', () => {
    it('should clear all breakers and allow reuse of names', async () => {
      const testFunction1 = async (...args: unknown[]) =>
        (args[0] as number) * 2;
      const testFunction2 = async (...args: unknown[]) =>
        (args[0] as number) * 3;

      service.getBreaker('test-breaker', testFunction1);
      service.clearAllBreakers();

      // Should be able to reuse the same name with a different function
      expect(() => {
        service.getBreaker('test-breaker', testFunction2);
      }).not.toThrow();
    });
  });

  describe('singleton pattern', () => {
    it('should return same instance', () => {
      const instance1 = CircuitBreakerService.getInstance();
      const instance2 = CircuitBreakerService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });
});
