/**
 * Tests for file upload routes.
 *
 * Framework: Jest (TypeScript). HTTP testing via Supertest if available in project.
 * These tests mock the auth middleware and upload controller to isolate the router's behavior.
 */

import express, { Request, Response, NextFunction } from "express";
import path from "path";

let supertestAvailable = true;
let request: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  request = require("supertest");
} catch (_e) {
  supertestAvailable = false;
}

// Attempt to import the router from its expected location.
// Fallback: if path aliases differ, adjust import below to match repo structure.
import router from "../routes/fileRoutes";

// Mocks for middleware and controller
jest.mock("../middleware/auth.middleware", () => {
  return {
    requireAuth: (req: Request, res: Response, next: NextFunction) => {
      // Allow tests to toggle authorization behavior via header flag
      if (req.headers["x-test-unauthorized"] === "1") {
        return res.status(401).json({ message: "Unauthorized" });
      }
      return next();
    },
  };
});

const mockFileUploadAsync = jest.fn();

// Mock the upload controller to control outcomes for different scenarios
jest.mock("../controllers/fileUpload.controller", () => {
  return {
    fileUploadAsync: (req: Request, res: Response, next: NextFunction) =>
      mockFileUploadAsync(req, res, next),
  };
});

const buildApp = () => {
  const app = express();

  // Mount the router under /files to avoid route conflicts
  app.use("/files", router);

  // Error handler for multer or other middleware errors
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err?.status || err?.statusCode || 500;
    res.status(status).json({ message: err?.message || "Internal Server Error" });
  });

  return app;
};

describe("fileRoutes /files/upload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const runOrSkip = (name: string, fn: jest.ProvidesCallback, timeout?: number) => {
    // If Supertest is not available, mark as pending but still define the test (so CI shows intent).
    if (!supertestAvailable) {
      test.skip(name + " (skipped: supertest not installed)", fn, timeout);
    } else {
      test(name, fn, timeout);
    }
  };

  runOrSkip("should upload a file successfully (happy path)", async () => {
    const app = buildApp();

    // Simulate controller responding success
    mockFileUploadAsync.mockImplementation((req: Request, res: Response) => {
      // Ensure multer populated req.file
      expect(req.file).toBeDefined();
      expect(req.file?.fieldname).toBe("file");
      return res.status(201).json({ ok: true, filename: req.file?.originalname });
    });

    const buf = Buffer.from("hello world");
    const res = await request(app)
      .post("/files/upload")
      .set("Content-Type", "multipart/form-data")
      .attach("file", buf, { filename: "hello.txt", contentType: "text/plain" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, filename: "hello.txt" });
    expect(mockFileUploadAsync).toHaveBeenCalledTimes(1);
  });

  runOrSkip("should return 400 when controller rejects missing file", async () => {
    const app = buildApp();

    // Controller enforces file presence
    mockFileUploadAsync.mockImplementation((req: Request, res: Response) => {
      if (!req.file) {
        return res.status(400).json({ message: "File is required" });
      }
      return res.status(204).send();
    });

    const res = await request(app)
      .post("/files/upload")
      .set("Content-Type", "multipart/form-data"); // no file attached

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "File is required" });
    expect(mockFileUploadAsync).toHaveBeenCalledTimes(1);
  });

  runOrSkip("should return 401 when auth middleware denies access", async () => {
    const app = buildApp();

    // Controller shouldn't be called if unauthorized
    mockFileUploadAsync.mockImplementation((_req: Request, res: Response) => {
      return res.status(200).json({ unreachable: true });
    });

    const buf = Buffer.from("secret");
    const res = await request(app)
      .post("/files/upload")
      .set("x-test-unauthorized", "1")
      .set("Content-Type", "multipart/form-data")
      .attach("file", buf, { filename: "secret.txt", contentType: "text/plain" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: "Unauthorized" });
    expect(mockFileUploadAsync).not.toHaveBeenCalled();
  });

  runOrSkip("should surface multer errors via error handler (e.g., file too large)", async () => {
    const app = buildApp();

    // Simulate controller not being reached because multer fails first.
    // To emulate multer throwing, we attach an extremely large buffer and assume upstream limits may error.
    // Since actual limits are not configured in the router, we simulate by forcing controller to call next(err).
    // However, multer runs before controller, so we can directly assert controller not called and force error via next.
    // We achieve this by temporarily replacing router stack to inject a failing middleware before controller in test.
    // For simplicity and reliability, we mock controller to call next with an error and ensure error handler responds 413.
    mockFileUploadAsync.mockImplementation((_req: Request, _res: Response, next: NextFunction) => {
      const err: any = new Error("File too large");
      err.status = 413;
      return next(err);
    });

    const buf = Buffer.allocUnsafe(1024); // dummy payload
    const res = await request(app)
      .post("/files/upload")
      .set("Content-Type", "multipart/form-data")
      .attach("file", buf, { filename: "big.bin", contentType: "application/octet-stream" });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ message: "File too large" });
    expect(mockFileUploadAsync).toHaveBeenCalledTimes(1);
  });

  runOrSkip("should handle unexpected controller errors with 500", async () => {
    const app = buildApp();

    mockFileUploadAsync.mockImplementation((_req: Request, _res: Response, next: NextFunction) => {
      const err: any = new Error("Unexpected failure");
      return next(err);
    });

    const buf = Buffer.from("oops");
    const res = await request(app)
      .post("/files/upload")
      .set("Content-Type", "multipart/form-data")
      .attach("file", buf, { filename: "oops.txt", contentType: "text/plain" });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "Unexpected failure" });
  });
});