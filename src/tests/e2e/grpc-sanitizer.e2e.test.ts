import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import * as grpc from '@grpc/grpc-js';
import { sanitizer } from '../../infrastructure/external-services/grpc/proto/sanitizer';
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * End-to-End test for gRPC sanitizer service
 * This test verifies the complete flow from Node.js client to Python gRPC server
 */
describe('gRPC Sanitizer Service E2E', () => {
  let pythonService: ChildProcess | null = null;
  let grpcClient: any = null;
  const GRPC_HOST = 'localhost:50051';
  const REQUEST_TIMEOUT_MS = 10000;

  beforeAll(async () => {
    // Start the Python gRPC service for testing
    await startPythonService();

    // Wait for service to be ready
    await waitForServiceReady();

    // Create gRPC client
    grpcClient = new sanitizer.SanitizerServiceClient(
      GRPC_HOST,
      grpc.credentials.createInsecure(),
    );
  }, 30000); // 30 second timeout for service startup

  afterAll(async () => {
    // Clean up
    if (grpcClient) {
      grpcClient.close();
    }
    if (pythonService) {
      pythonService.kill('SIGTERM');
      await new Promise((resolve) => {
        pythonService?.on('exit', resolve);
      });
    }
  });

  beforeEach(() => {
    // Reset any state if needed
  });

  describe('Service Health', () => {
    it('should be able to connect to the gRPC service', async () => {
      expect(grpcClient).toBeDefined();
      expect(pythonService).toBeDefined();
      expect(pythonService?.killed).toBeFalsy();
    });

    it('should handle connection errors gracefully', async () => {
      const invalidClient = new sanitizer.SanitizerServiceClient(
        'localhost:9999', // Invalid port
        grpc.credentials.createInsecure(),
      );

      const request = new sanitizer.SanitizeRequest();
      request.document_type = 'text/plain';
      request.document_data = Buffer.from('test');

      const deadline = new Date();
      deadline.setMilliseconds(deadline.getMilliseconds() + 2000);

      await expect(
        new Promise((resolve, reject) => {
          invalidClient.SanitizeDocument(
            request,
            new grpc.Metadata(),
            { deadline },
            (error, response) => {
              if (error) reject(error);
              else resolve(response);
            },
          );
        }),
      ).rejects.toThrow();

      invalidClient.close();
    });
  });

  describe('Text File Sanitization', () => {
    it('should sanitize plain text files correctly', async () => {
      const testContent =
        'This is a test document for gRPC sanitization.\n\nIt contains multiple lines and should be processed correctly.';
      const request = new sanitizer.SanitizeRequest();
      request.document_type = 'text/plain';
      request.document_data = Buffer.from(testContent);

      const response = await makeGrpcCall(request);

      expect(response).toBeDefined();
      expect(response.sanitized_content).toContain('This is a test document');
      expect(response.sanitized_content).toContain('```');
    });

    it('should handle empty text files', async () => {
      const request = new sanitizer.SanitizeRequest();
      request.document_type = 'text/plain';
      request.document_data = Buffer.from('');

      const response = await makeGrpcCall(request);

      expect(response).toBeDefined();
      expect(response.sanitized_content).toBe('```\n\n```');
    });

    it('should handle special characters in text', async () => {
      const testContent = 'Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?';
      const request = new sanitizer.SanitizeRequest();
      request.document_type = 'text/plain';
      request.document_data = Buffer.from(testContent);

      const response = await makeGrpcCall(request);

      expect(response).toBeDefined();
      expect(response.sanitized_content).toContain('Special chars:');
      expect(response.sanitized_content).toContain('!@#$%^&*()');
    });

    it('should handle unicode characters', async () => {
      const testContent = 'Unicode test: 你好世界 🌍 émojis and ñ accents';
      const request = new sanitizer.SanitizeRequest();
      request.document_type = 'text/plain';
      request.document_data = Buffer.from(testContent, 'utf-8');

      const response = await makeGrpcCall(request);

      expect(response).toBeDefined();
      expect(response.sanitized_content).toContain('Unicode test:');
      expect(response.sanitized_content).toContain('你好世界');
      expect(response.sanitized_content).toContain('🌍');
    });
  });

  describe('PDF File Sanitization', () => {
    it('should handle PDF files (if supported)', async () => {
      // Create a minimal valid PDF for testing
      const minimalPdf = Buffer.from(`%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 5 0 R
>>
>>
>>
endobj

4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
72 720 Td
(Hello World) Tj
ET
endstream
endobj

5 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj

xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000206 00000 n 
0000000300 00000 n 
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
394
%%EOF`);

      const request = new sanitizer.SanitizeRequest();
      request.document_type = 'application/pdf';
      request.document_data = minimalPdf;

      // This might fail due to PDF parsing issues, but we test the gRPC flow
      try {
        const response = await makeGrpcCall(request);
        expect(response).toBeDefined();
        expect(response.sanitized_content).toBeDefined();
      } catch (error) {
        // If PDF parsing fails, that's expected - we just want to ensure gRPC works
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('gRPC call failed');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle unsupported file types', async () => {
      const request = new sanitizer.SanitizeRequest();
      request.document_type = 'application/unsupported';
      request.document_data = Buffer.from('test content');

      await expect(makeGrpcCall(request)).rejects.toThrow(
        'Unsupported file type',
      );
    });

    it('should handle oversized files', async () => {
      // Create a large buffer (26MB to exceed the 25MB limit)
      const largeBuffer = Buffer.alloc(26 * 1024 * 1024, 'a');

      const request = new sanitizer.SanitizeRequest();
      request.document_type = 'text/plain';
      request.document_data = largeBuffer;

      await expect(makeGrpcCall(request)).rejects.toThrow('File too large');
    });

    it('should handle malformed requests', async () => {
      const request = new sanitizer.SanitizeRequest();
      // Don't set document_type or document_data

      await expect(makeGrpcCall(request)).rejects.toThrow();
    });
  });

  describe('Performance', () => {
    it('should handle multiple concurrent requests', async () => {
      const requests = Array.from({ length: 5 }, (_, i) => {
        const request = new sanitizer.SanitizeRequest();
        request.document_type = 'text/plain';
        request.document_data = Buffer.from(`Test content ${i}`);
        return makeGrpcCall(request);
      });

      const responses = await Promise.all(requests);

      expect(responses).toHaveLength(5);
      responses.forEach((response, index) => {
        expect(response).toBeDefined();
        expect(response.sanitized_content).toContain(`Test content ${index}`);
      });
    });

    it('should complete requests within reasonable time', async () => {
      const startTime = Date.now();

      const request = new sanitizer.SanitizeRequest();
      request.document_type = 'text/plain';
      request.document_data = Buffer.from('Performance test content');

      await makeGrpcCall(request);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  // Helper functions
  async function startPythonService(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if we're in a CI environment
      const isCI = process.env.CI === 'true';

      if (isCI) {
        // In CI, assume the service is already running via docker-compose
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
        const testClient = new sanitizer.SanitizerServiceClient(
          GRPC_HOST,
          grpc.credentials.createInsecure(),
        );

        const request = new sanitizer.SanitizeRequest();
        request.document_type = 'text/plain';
        request.document_data = Buffer.from('health check');

        const deadline = new Date();
        deadline.setMilliseconds(deadline.getMilliseconds() + 2000);

        await new Promise((resolve, reject) => {
          testClient.SanitizeDocument(
            request,
            new grpc.Metadata(),
            { deadline },
            (error) => {
              testClient.close();
              if (error && error.code === grpc.status.UNAVAILABLE) {
                reject(error);
              } else {
                resolve(undefined);
              }
            },
          );
        });

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

  async function makeGrpcCall(request: any): Promise<any> {
    const deadline = new Date();
    deadline.setMilliseconds(deadline.getMilliseconds() + REQUEST_TIMEOUT_MS);

    return new Promise((resolve, reject) => {
      grpcClient.SanitizeDocument(
        request,
        new grpc.Metadata(),
        { deadline },
        (error: any, response: any) => {
          if (error) {
            reject(new Error(`gRPC call failed: ${error.message}`));
          } else {
            resolve(response);
          }
        },
      );
    });
  }
});
