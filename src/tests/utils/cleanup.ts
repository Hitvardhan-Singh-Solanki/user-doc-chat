/**
 * Resource cleanup helpers with validation
 * Ensures proper cleanup of test resources
 */

// import { vi } from 'vitest';
import { logger } from '../../config/logger.config';

export class ResourceCleanup {
  private resources: Set<{
    type: string;
    cleanup: () => Promise<void> | void;
  }> = new Set();
  private timers: Set<NodeJS.Timeout> = new Set();
  private intervals: Set<NodeJS.Timeout> = new Set();
  private eventListeners: Array<{
    target: EventTarget;
    event: string;
    listener: EventListener;
  }> = [];

  addResource(type: string, cleanup: () => Promise<void> | void): void {
    this.resources.add({ type, cleanup });
  }

  addTimer(timer: NodeJS.Timeout): void {
    this.timers.add(timer);
  }

  addInterval(interval: NodeJS.Timeout): void {
    this.intervals.add(interval);
  }

  addEventListener(
    target: EventTarget,
    event: string,
    listener: EventListener,
  ): void {
    this.eventListeners.push({ target, event, listener });
  }

  async cleanup(): Promise<void> {
    // Clear timers and intervals
    this.timers.forEach((timer) => clearTimeout(timer));
    this.intervals.forEach((interval) => clearInterval(interval));
    this.timers.clear();
    this.intervals.clear();

    // Remove event listeners
    this.eventListeners.forEach(({ target, event, listener }) => {
      target.removeEventListener(event, listener);
    });
    this.eventListeners = [];

    // Clean up resources
    for (const resource of this.resources) {
      try {
        await resource.cleanup();
      } catch (error) {
        logger.warn(
          { error, resourceType: resource.type },
          'Failed to cleanup resource',
        );
      }
    }
    this.resources.clear();
  }

  validateCleanup(): {
    hasLeaks: boolean;
    details: {
      timers: number;
      intervals: number;
      eventListeners: number;
      resources: number;
    };
  } {
    const hasLeaks =
      this.timers.size > 0 ||
      this.intervals.size > 0 ||
      this.eventListeners.length > 0 ||
      this.resources.size > 0;

    return {
      hasLeaks,
      details: {
        timers: this.timers.size,
        intervals: this.intervals.size,
        eventListeners: this.eventListeners.length,
        resources: this.resources.size,
      },
    };
  }
}

export const resourceCleanup = new ResourceCleanup();
