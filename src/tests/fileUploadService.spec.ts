/**
 * Unit tests for fileUpload service.
 * Testing library/framework: Jest + ts-jest (assumed).
 * If your repo uses Vitest, replace jest.mock(...) with vi.mock(...),
 * and casts to jest.Mock with vi.Mock where applicable.
 */

import { fileUpload } from "../services/fileUploadService";
import { fileTypeFromBuffer } from "file-type";
import { uploadFileToMinio } from "../services/minio.service";
import { db } from "../repos/db.repo";
import { fileQueue } from "../repos/bullmq.repo";
import { v4 as uuid } from "uuid";

// Mocks (these will be hoisted by ts-jest/jest)
jest.mock("file-type", () => ({ fileTypeFromBuffer: jest.fn() }));
jest.mock("../services/minio.service", () => ({ uploadFileToMinio: jest.fn() }));
jest.mock("../repos/db.repo", () => ({ db: { query: jest.fn() } }));
jest.mock("../repos/bullmq.repo", () => ({ fileQueue: { add: jest.fn() } }));
jest.mock("uuid", () => ({ v4: jest.fn() }));

// Handy typed aliases for mocks
const mockedFileTypeFromBuffer = fileTypeFromBuffer as unknown as jest.Mock;
const mockedUploadFileToMinio = uploadFileToMinio as unknown as jest.Mock;
const mockedDbQuery = (db.query as unknown) as jest.Mock;
const mockedFileQueueAdd = (fileQueue.add as unknown) as jest.Mock;
const mockedUuid = uuid as unknown as jest.Mock;

type TestMulterFile = {
  originalname: string;
  size: number;
  buffer?: Buffer;
};

// Helper to build a minimal Multer-like file
function makeFile(
  originalname: string,
  size = 123,
  buffer: Buffer = Buffer.from("dummy")
): TestMulterFile {
  return { originalname, size, buffer };
}

describe("fileUpload()", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("throws Unauthorized when userId is empty string", async () => {
    const file = makeFile("doc.pdf");
    await expect(fileUpload(file as any, "")).rejects.toThrow("Unauthorized");

    expect(mockedFileTypeFromBuffer).not.toHaveBeenCalled();
    expect(mockedUploadFileToMinio).not.toHaveBeenCalled();
    expect(mockedDbQuery).not.toHaveBeenCalled();
    expect(mockedFileQueueAdd).not.toHaveBeenCalled();
  });

  it("throws Unauthorized when userId is undefined", async () => {
    const file = makeFile("doc.pdf");
    await expect(fileUpload(file as any, undefined as any)).rejects.toThrow(
      "Unauthorized"
    );
  });

  it("rejects when file type cannot be detected", async () => {
    const file = makeFile("unknown.bin");
    mockedFileTypeFromBuffer.mockResolvedValue(undefined);

    await expect(fileUpload(file as any, "user-1")).rejects.toThrow(
      "Unsupported file type"
    );

    expect(mockedFileTypeFromBuffer).toHaveBeenCalledWith(file.buffer);
    expect(mockedUploadFileToMinio).not.toHaveBeenCalled();
    expect(mockedDbQuery).not.toHaveBeenCalled();
    expect(mockedFileQueueAdd).not.toHaveBeenCalled();
  });

  it("rejects when file type is not accepted (e.g., image/png)", async () => {
    const file = makeFile("pic.png");
    mockedFileTypeFromBuffer.mockResolvedValue({ mime: "image/png", ext: "png" } as any);

    await expect(fileUpload(file as any, "user-1")).rejects.toThrow(
      "Unsupported file type"
    );

    expect(mockedFileTypeFromBuffer).toHaveBeenCalledWith(file.buffer);
    expect(mockedUploadFileToMinio).not.toHaveBeenCalled();
    expect(mockedDbQuery).not.toHaveBeenCalled();
    expect(mockedFileQueueAdd).not.toHaveBeenCalled();
  });

  it.each([
    ["application/pdf", "report.pdf"],
    ["text/plain", "notes.txt"],
    ["application/msword", "letter.doc"],
  ])(
    "uploads accepted type %s, persists DB record, and enqueues job",
    async (mime, originalname) => {
      const userId = "user-1";
      const buffer = Buffer.from("file-bytes");
      const file = makeFile(originalname, 987, buffer);

      // Arrange mocks
      mockedUuid.mockReturnValue("fixed-uuid-123");
      mockedFileTypeFromBuffer.mockResolvedValue({ mime } as any);
      mockedUploadFileToMinio.mockResolvedValue(undefined);

      const createdAt = new Date("2024-01-01T00:00:00.000Z");
      mockedDbQuery.mockResolvedValue({
        rows: [
          {
            id: 42,
            file_name: originalname,
            file_size: 987,
            status: "uploaded",
            created_at: createdAt,
          },
        ],
      });

      mockedFileQueueAdd.mockResolvedValue(undefined);

      // Act
      await expect(fileUpload(file as any, userId)).resolves.toBeUndefined();

      // Assert: type check was performed on buffer
      expect(mockedFileTypeFromBuffer).toHaveBeenCalledTimes(1);
      expect(mockedFileTypeFromBuffer).toHaveBeenCalledWith(buffer);

      // Assert: object storage upload used key with uuid + originalname
      const expectedKey = `fixed-uuid-123-${originalname}`;
      expect(mockedUploadFileToMinio).toHaveBeenCalledWith(expectedKey, buffer);

      // Assert: DB insert called with expected SQL and params
      expect(mockedDbQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockedDbQuery.mock.calls[0];
      expect(sql).toEqual(expect.stringContaining("INSERT INTO user_files"));
      expect(params).toEqual([originalname, 987, userId, "uploaded"]);

      // Assert: queue job created with correct payload
      expect(mockedFileQueueAdd).toHaveBeenCalledTimes(1);
      expect(mockedFileQueueAdd).toHaveBeenCalledWith("process-file", {
        key: expectedKey,
        userId,
        fileId: 42,
      });
    }
  );

  it("propagates error and skips DB + queue when upload to MinIO fails", async () => {
    const file = makeFile("report.pdf");
    mockedFileTypeFromBuffer.mockResolvedValue({ mime: "application/pdf" } as any);
    mockedUuid.mockReturnValue("u-1");
    mockedUploadFileToMinio.mockRejectedValue(new Error("MinIO failure"));

    await expect(fileUpload(file as any, "user-1")).rejects.toThrow("MinIO failure");

    expect(mockedDbQuery).not.toHaveBeenCalled();
    expect(mockedFileQueueAdd).not.toHaveBeenCalled();
  });

  it("propagates error and skips queue when DB insert fails", async () => {
    const file = makeFile("notes.txt", 10);
    mockedFileTypeFromBuffer.mockResolvedValue({ mime: "text/plain" } as any);
    mockedUuid.mockReturnValue("u-2");
    mockedUploadFileToMinio.mockResolvedValue(undefined);
    mockedDbQuery.mockRejectedValue(new Error("DB error"));

    await expect(fileUpload(file as any, "user-2")).rejects.toThrow("DB error");

    expect(mockedFileQueueAdd).not.toHaveBeenCalled();
  });

  it("throws TypeError when DB insert returns no rows (unexpected)", async () => {
    const file = makeFile("letter.doc", 55);
    mockedFileTypeFromBuffer.mockResolvedValue({ mime: "application/msword" } as any);
    mockedUuid.mockReturnValue("u-3");
    mockedUploadFileToMinio.mockResolvedValue(undefined);
    mockedDbQuery.mockResolvedValue({ rows: [] });

    await expect(fileUpload(file as any, "user-3")).rejects.toBeInstanceOf(TypeError);

    expect(mockedFileQueueAdd).not.toHaveBeenCalled();
  });

  it("propagates error when file type detection throws (e.g., invalid buffer)", async () => {
    const file = makeFile("bad.bin");
    mockedFileTypeFromBuffer.mockRejectedValue(new Error("file-type failure"));

    await expect(fileUpload(file as any, "user-4")).rejects.toThrow(
      "file-type failure"
    );

    expect(mockedUploadFileToMinio).not.toHaveBeenCalled();
    expect(mockedDbQuery).not.toHaveBeenCalled();
    expect(mockedFileQueueAdd).not.toHaveBeenCalled();
  });
});
// -----------------------------------------------------------------------------
// Additional unit tests for fileUpload() to broaden coverage.
// Testing library/framework detected: Jest (+ ts-jest).
// If your repo uses Vitest, replace jest.mock(...) with vi.mock(...)
// and casts to jest.Mock with vi.Mock where applicable.
// -----------------------------------------------------------------------------

describe("fileUpload() - additional cases", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("throws Unauthorized when userId is null", async () => {
    const file = makeFile("doc.pdf");
    await expect(fileUpload(file as any, null as any)).rejects.toThrow("Unauthorized");
    expect(mockedFileTypeFromBuffer).not.toHaveBeenCalled();
    expect(mockedUploadFileToMinio).not.toHaveBeenCalled();
    expect(mockedDbQuery).not.toHaveBeenCalled();
    expect(mockedFileQueueAdd).not.toHaveBeenCalled();
  });

  it("propagates error when queue job creation fails after successful upload and DB insert", async () => {
    const originalname = "report 2024-01-01 (final).txt";
    const buffer = Buffer.from("body");
    const file = makeFile(originalname, 321, buffer);

    mockedUuid.mockReturnValue("uuid-xyz");
    mockedFileTypeFromBuffer.mockResolvedValue({ mime: "text/plain" } as any);
    mockedUploadFileToMinio.mockResolvedValue(undefined);
    mockedDbQuery.mockResolvedValue({ rows: [{ id: 7 }] });
    mockedFileQueueAdd.mockRejectedValue(new Error("Queue failure"));

    await expect(fileUpload(file as any, "user-7")).rejects.toThrow("Queue failure");

    const expectedKey = `uuid-xyz-${originalname}`;
    expect(mockedFileTypeFromBuffer).toHaveBeenCalledWith(buffer);
    expect(mockedUploadFileToMinio).toHaveBeenCalledWith(expectedKey, buffer);
    expect(mockedDbQuery).toHaveBeenCalledTimes(1);
    expect(mockedFileQueueAdd).toHaveBeenCalledTimes(1);
  });

  it("calls uuid exactly once per successful upload and uses it in the object key (complex filename)", async () => {
    const buffer = Buffer.from("abc");
    const file = makeFile("weird path/with spaces & symbols.txt", 456, buffer);

    mockedFileTypeFromBuffer.mockResolvedValue({ mime: "text/plain" } as any);
    mockedUuid.mockReturnValueOnce("once-1");
    mockedUploadFileToMinio.mockResolvedValue(undefined);
    mockedDbQuery.mockResolvedValue({ rows: [{ id: 9 }] });
    mockedFileQueueAdd.mockResolvedValue(undefined);

    await expect(fileUpload(file as any, "user-9")).resolves.toBeUndefined();

    expect(mockedUuid).toHaveBeenCalledTimes(1);
    const expectedKey = "once-1-weird path/with spaces & symbols.txt";
    expect(mockedUploadFileToMinio).toHaveBeenCalledWith(expectedKey, buffer);
    expect(mockedFileQueueAdd).toHaveBeenCalledWith("process-file", {
      key: expectedKey,
      userId: "user-9",
      fileId: 9,
    });
  });

  it("rejects when file.buffer is missing (file-type invoked with undefined) and avoids side-effects", async () => {
    const fileWithoutBuffer = { originalname: "no-buffer.pdf", size: 10 } as any;

    // Simulate file-type library rejecting when buffer is invalid
    mockedFileTypeFromBuffer.mockRejectedValue(new TypeError("Expected a Buffer"));

    await expect(fileUpload(fileWithoutBuffer as any, "user-10")).rejects.toThrow();

    expect(mockedFileTypeFromBuffer).toHaveBeenCalledWith(undefined);
    expect(mockedUploadFileToMinio).not.toHaveBeenCalled();
    expect(mockedDbQuery).not.toHaveBeenCalled();
    expect(mockedFileQueueAdd).not.toHaveBeenCalled();
  });
});