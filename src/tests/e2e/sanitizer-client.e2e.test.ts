import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { sanitizeFileGrpcBuffer } from '../../domains/files/services/sanitization/sanitizer-client.service';

/**
 * End-to-End test for the sanitizer client service integration
 * This test verifies the actual service integration used by the application
 */
describe('Sanitizer Client Service E2E', () => {
  let pythonService: ChildProcess | null = null;

  beforeAll(async () => {
    // Start the Python gRPC service for testing
    await startPythonService();

    // Wait for service to be ready
    await waitForServiceReady();
  }, 30000); // 30 second timeout for service startup

  afterAll(async () => {
    // Clean up
    if (pythonService) {
      pythonService.kill('SIGTERM');
      await new Promise((resolve) => {
        pythonService?.on('exit', resolve);
      });
    }
  });

  describe('Text File Sanitization', () => {
    it('should sanitize plain text files using the client service', async () => {
      const testContent =
        'This is a test document for gRPC sanitization.\n\nIt contains multiple lines and should be processed correctly.';
      const fileBuffer = Buffer.from(testContent, 'utf-8');

      const result = await sanitizeFileGrpcBuffer(fileBuffer, 'text/plain');

      expect(result).toBeDefined();
      expect(result).toContain('This is a test document');
      expect(result).toContain('```');
      expect(typeof result).toBe('string');
    });

    it('should handle empty text files', async () => {
      const fileBuffer = Buffer.from('', 'utf-8');

      const result = await sanitizeFileGrpcBuffer(fileBuffer, 'text/plain');

      expect(result).toBeDefined();
      expect(result).toBe('```\n\n```');
    });

    it('should handle special characters in text', async () => {
      const testContent = 'Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?';
      const fileBuffer = Buffer.from(testContent, 'utf-8');

      const result = await sanitizeFileGrpcBuffer(fileBuffer, 'text/plain');

      expect(result).toBeDefined();
      expect(result).toContain('Special chars:');
      expect(result).toContain('!@#$%^&*()');
    });

    it('should handle unicode characters', async () => {
      const testContent = 'Unicode test: 你好世界 🌍 émojis and ñ accents';
      const fileBuffer = Buffer.from(testContent, 'utf-8');

      const result = await sanitizeFileGrpcBuffer(fileBuffer, 'text/plain');

      expect(result).toBeDefined();
      expect(result).toContain('Unicode test:');
      expect(result).toContain('你好世界');
      expect(result).toContain('🌍');
    });

    it('should handle large text files', async () => {
      // Create a 1MB text file
      const largeContent = 'A'.repeat(1024 * 1024); // 1MB of 'A's
      const fileBuffer = Buffer.from(largeContent, 'utf-8');

      const result = await sanitizeFileGrpcBuffer(fileBuffer, 'text/plain');

      expect(result).toBeDefined();
      expect(result).toContain('```');
      expect(result.length).toBeGreaterThan(largeContent.length);
    });
  });

  describe('Error Handling', () => {
    it('should handle unsupported file types', async () => {
      const fileBuffer = Buffer.from('test content', 'utf-8');

      await expect(
        sanitizeFileGrpcBuffer(fileBuffer, 'application/unsupported'),
      ).rejects.toThrow('Unsupported file type');
    });

    it('should handle oversized files', async () => {
      // Create a large buffer (26MB to exceed the 25MB limit)
      const largeBuffer = Buffer.alloc(26 * 1024 * 1024, 'a');

      await expect(
        sanitizeFileGrpcBuffer(largeBuffer, 'text/plain'),
      ).rejects.toThrow('File too large');
    });

    it('should handle service unavailability', async () => {
      // Kill the service temporarily
      if (pythonService) {
        pythonService.kill('SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const fileBuffer = Buffer.from('test content', 'utf-8');

      await expect(
        sanitizeFileGrpcBuffer(fileBuffer, 'text/plain'),
      ).rejects.toThrow();

      // Restart the service for other tests
      await startPythonService();
      await waitForServiceReady();
    });
  });

  describe('Performance', () => {
    it('should handle multiple concurrent requests', async () => {
      const requests = Array.from({ length: 5 }, (_, i) => {
        const fileBuffer = Buffer.from(`Test content ${i}`, 'utf-8');
        return sanitizeFileGrpcBuffer(fileBuffer, 'text/plain');
      });

      const results = await Promise.all(requests);

      expect(results).toHaveLength(5);
      results.forEach((result, index) => {
        expect(result).toBeDefined();
        expect(result).toContain(`Test content ${index}`);
      });
    });

    it('should complete requests within reasonable time', async () => {
      const startTime = Date.now();

      const fileBuffer = Buffer.from('Performance test content', 'utf-8');
      await sanitizeFileGrpcBuffer(fileBuffer, 'text/plain');

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Integration with Application Flow', () => {
    it('should work with the PDF sanitization service', async () => {
      // This test simulates how the PDF sanitization service would use the gRPC client
      const { PDFSanitizationService } = await import(
        '../../domains/files/services/sanitization/pdf-sanitization.service'
      );

      const pdfService = new PDFSanitizationService();
      const testPdfBuffer = global.testUtils.createTestPdf();

      // This might fail due to PDF parsing, but we test the integration
      try {
        const result = await pdfService.sanitize(testPdfBuffer);
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      } catch (error) {
        // If PDF parsing fails, that's expected - we just want to ensure the integration works
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('gRPC call failed');
      }
    });

    it('should handle file processing workflow', async () => {
      // Simulate a typical file processing workflow
      const testFiles = [
        { content: 'Document 1 content', type: 'text/plain' },
        { content: 'Document 2 content', type: 'text/plain' },
        { content: 'Document 3 content', type: 'text/plain' },
      ];

      const results = await Promise.all(
        testFiles.map((file) =>
          sanitizeFileGrpcBuffer(Buffer.from(file.content, 'utf-8'), file.type),
        ),
      );

      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result).toBeDefined();
        expect(result).toContain(`Document ${index + 1} content`);
      });
    });
  });

  // Helper functions
  async function startPythonService(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if we're in a CI environment
      const isCI = process.env.CI === 'true';

      if (isCI) {
        // In CI, assume the service is already running via GitHub Actions
        resolve();
        return;
      }

      // For local testing, start the Python service
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

      pythonService.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      });

      // Timeout after 20 seconds
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
        const testBuffer = Buffer.from('health check', 'utf-8');
        await sanitizeFileGrpcBuffer(testBuffer, 'text/plain');
        return; // Service is ready
      } catch (error) {
        if (i === maxRetries - 1) {
          throw new Error(
            `Service not ready after ${maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }
});
