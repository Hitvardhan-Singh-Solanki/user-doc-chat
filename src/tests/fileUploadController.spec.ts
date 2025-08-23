/**
 * Tests for fileUploadAsync controller
 *
 * Testing library/framework: Jest (ts-jest style). If this repo uses Vitest, replace:
 *   - jest.fn() -> vi.fn()
 *   - jest.mock -> vi.mock
 *   - expect(...).toHaveBeenCalled... -> same in Vitest
 */
import type { Request, Response } from "express";

// We import the function under test. Adjust the path if controller lives elsewhere.
// If the controller is not exported from this path, update the import accordingly.
import { fileUploadAsync } from "../controllers/fileUpload.controller"; // <-- adjust if needed

// Mock the fileUpload service
jest.mock("../services/file-upload.service", () => ({
  fileUpload: jest.fn(),
}));

import { fileUpload } from "../services/file-upload.service";

// Minimal MulterFile shape for our tests. If there's a real type, import it instead.
type MulterFile = {
  originalname?: string;
  buffer?: Buffer;
  mimetype?: string;
  size?: number;
  [key: string]: any;
};

function createMockRes() {
  const res: Partial<Response> & {
    status: jest.Mock;
    json: jest.Mock;
  } = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as any;
  return res;
}

describe("fileUploadAsync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should enqueue upload and respond 201 on success (happy path)", async () => {
    // Arrange
    const mockFile: MulterFile = {
      originalname: "test.csv",
      buffer: Buffer.from("a,b,c"),
      mimetype: "text/csv",
      size: 6,
    };

    const req = {
      file: mockFile,
      user: { id: "user-123" },
    } as unknown as Request;

    const res = createMockRes();

    (fileUpload as jest.Mock).mockResolvedValueOnce(undefined);

    // Act
    await fileUploadAsync(req, res as unknown as Response);

    // Assert
    expect(fileUpload).toHaveBeenCalledTimes(1);
    expect(fileUpload).toHaveBeenCalledWith(mockFile, "user-123");

    expect(res.status).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: "File uploaded and queued",
    });
  });

  it("should return 201 even if user is undefined and still call service with undefined userId", async () => {
    const mockFile: MulterFile = {
      originalname: "no-user.txt",
      buffer: Buffer.from("data"),
      mimetype: "text/plain",
      size: 4,
    };

    const req = {
      file: mockFile,
      user: undefined,
    } as unknown as Request;

    const res = createMockRes();
    (fileUpload as jest.Mock).mockResolvedValueOnce(undefined);

    await fileUploadAsync(req, res as unknown as Response);

    expect(fileUpload).toHaveBeenCalledWith(mockFile, undefined);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: "File uploaded and queued",
    });
  });

  it("should handle service failure and respond with 500", async () => {
    const mockFile: MulterFile = {
      originalname: "bad.bin",
      buffer: Buffer.from([1, 2, 3]),
      mimetype: "application/octet-stream",
      size: 3,
    };

    const req = {
      file: mockFile,
      user: { id: "user-err" },
    } as unknown as Request;

    const res = createMockRes();
    (fileUpload as jest.Mock).mockRejectedValueOnce(new Error("queue failure"));

    await fileUploadAsync(req, res as unknown as Response);

    // Service attempted
    expect(fileUpload).toHaveBeenCalledTimes(1);

    // Responded with 500
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Failed to upload file" });
  });

  it("should respond 400 when no file is provided and not call service (desired behavior)", async () => {
    const req = {
      file: undefined,
      user: { id: "user-xyz" },
    } as unknown as Request;

    const res = createMockRes();

    await fileUploadAsync(req, res as unknown as Response);

    // Desired contract: should not call the service at all when file is missing
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "No file uploaded" });

    // This assertion encodes the intended behavior; if the implementation does not early-return,
    // this test will fail, prompting a fix.
    expect(fileUpload).not.toHaveBeenCalled();
  });
});

/**
 * Note:
 * - If the controller actually resides at a different path, update the import at the top accordingly.
 * - If this repo uses Vitest instead of Jest:
 *     import { describe, it, expect, vi, beforeEach } from "vitest";
 *     Replace jest.fn() with vi.fn(), jest.mock with vi.mock, etc.
 */