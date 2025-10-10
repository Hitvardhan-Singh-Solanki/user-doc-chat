/**
 * Memory usage monitoring utilities
 * Provides comprehensive memory tracking for tests
 */

import type {
  MemoryMetrics,
  MemoryLeakResult,
} from '../../shared/types/performance.types';

export class MemoryTracker {
  private snapshots: Array<{
    name: string;
    timestamp: number;
    memory: MemoryMetrics;
  }> = [];

  takeSnapshot(name: string): MemoryMetrics {
    const memory = process.memoryUsage();
    const snapshot = {
      name,
      timestamp: Date.now(),
      memory: {
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        heapLimit: 0, // heapLimit is not available in NodeJS.MemoryUsage
        external: memory.external,
        rss: memory.rss,
        arrayBuffers: memory.arrayBuffers,
        timestamp: Date.now(),
      },
    };

    this.snapshots.push(snapshot);
    return snapshot.memory;
  }

  getMemoryDelta(
    fromSnapshot: string,
    toSnapshot: string,
  ): {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  } {
    const from = this.snapshots.find((s) => s.name === fromSnapshot);
    const to = this.snapshots.find((s) => s.name === toSnapshot);

    if (!from || !to) {
      throw new Error(`Snapshot not found: ${fromSnapshot} or ${toSnapshot}`);
    }

    return {
      heapUsed: to.memory.heapUsed - from.memory.heapUsed,
      heapTotal: to.memory.heapTotal - from.memory.heapTotal,
      external: to.memory.external - from.memory.external,
      rss: to.memory.rss - from.memory.rss,
    };
  }

  detectLeak(threshold: number = 10 * 1024 * 1024): MemoryLeakResult {
    if (this.snapshots.length < 2) {
      return {
        baseline: this.snapshots[0]?.memory || this.getCurrentMemory(),
        afterTest: this.getCurrentMemory(),
        afterCleanup: this.getCurrentMemory(),
        leakDetected: false,
        leakSize: 0,
        threshold,
        details: { heapGrowth: 0, externalGrowth: 0, rssGrowth: 0 },
      };
    }

    const latest = this.snapshots[this.snapshots.length - 1];
    const previous = this.snapshots[this.snapshots.length - 2];

    const delta = this.getMemoryDelta(previous.name, latest.name);
    const leakDetected = delta.heapUsed > threshold;

    return {
      baseline: previous.memory,
      afterTest: latest.memory,
      afterCleanup: this.getCurrentMemory(),
      leakDetected,
      leakSize: leakDetected ? delta.heapUsed : 0,
      threshold,
      details: {
        heapGrowth: delta.heapUsed,
        externalGrowth: delta.external,
        rssGrowth: delta.rss,
      },
    };
  }

  getCurrentMemory(): MemoryMetrics {
    const memory = process.memoryUsage();
    return {
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      heapLimit: 0, // heapLimit is not available in NodeJS.MemoryUsage
      external: memory.external,
      rss: memory.rss,
      arrayBuffers: memory.arrayBuffers,
      timestamp: Date.now(),
    };
  }

  clear(): void {
    this.snapshots = [];
  }

  getSnapshots(): typeof this.snapshots {
    return [...this.snapshots];
  }
}

export const memoryTracker = new MemoryTracker();
