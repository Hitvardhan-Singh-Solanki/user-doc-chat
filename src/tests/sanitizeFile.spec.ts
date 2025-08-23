/**
 * sanitizeFile.spec.ts
 *
 * Test focus: Thoroughly validate sanitizeFile behavior based on PR diff.
 * Scenarios covered:
 *  - text/plain path sanitizes ASCII control characters (0x00-0x1F, 0x7F)
 *  - application/pdf path returns parsed PDF text and calls pdf-parse with the buffer
 *  - DOCX path returns mammoth raw text and calls extractRawText with { buffer }
 *  - Throws when file type cannot be determined
 *  - Throws for unsupported file types
 *
 * Testing library/framework note:
 *  - This spec is written to work with either Jest or Vitest. It conditionally uses jest.mock/vi.mock
 *    and the shared "expect/describe/test" APIs. No new dependencies are introduced.
 *  - If your repository uses only one of these, the other branch will be inert.
 */

 /* eslint-disable @typescript-eslint/no-explicit-any */

declare const vi: any;   // Vitest global (if present)
declare const jest: any; // Jest global (if present)

// Detect runner
const isVitest = typeof vi !== "undefined";
const mocker = isVitest ? vi : jest;

// ---- Module mocks (declared before imports of the module under test) ----
if (isVitest) {
  vi.mock("pdf-parse", () => ({
    __esModule: true,
    default: vi.fn(async (_buffer: Buffer) => ({ text: "MOCK_PDF_TEXT" })),
  }));
  vi.mock("mammoth", () => ({
    __esModule: true,
    default: {
      extractRawText: vi.fn(async (_opts: { buffer: Buffer }) => ({ value: "MOCK_DOCX_TEXT" })),
    },
  }));
  vi.mock("file-type", () => ({
    __esModule: true,
    fileTypeFromBuffer: vi.fn(), // will be controlled per-test
  }));
} else {
  // Jest
  jest.mock("pdf-parse", () => ({
    __esModule: true,
    default: jest.fn(async (_buffer: Buffer) => ({ text: "MOCK_PDF_TEXT" })),
  }));
  jest.mock("mammoth", () => ({
    __esModule: true,
    default: {
      extractRawText: jest.fn(async (_opts: { buffer: Buffer }) => ({ value: "MOCK_DOCX_TEXT" })),
    },
  }));
  jest.mock("file-type", () => ({
    __esModule: true,
    fileTypeFromBuffer: jest.fn(), // will be controlled per-test
  }));
}

// Import mocked dependencies so we can assert/drive their behavior
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { fileTypeFromBuffer } from "file-type";

// Adjust this import path to match your implementation location if different
import { sanitizeFile } from "../utils/sanitizeFile";

// Small helper to treat a function as a mock across Jest/Vitest
function asMock<T extends Function>(fn: T): any {
  return fn as unknown as {
    mockClear: () => void;
    mockReset?: () => void;
    mockResolvedValue: (v: any) => any;
    mockImplementation: (cb: any) => any;
    mockReturnValue: (v: any) => any;
  };
}

const fileTypeFromBufferMock = asMock(fileTypeFromBuffer);
const pdfParseMock = asMock(pdfParse as any);
const extractRawTextMock = asMock((mammoth as any).extractRawText);

beforeEach(() => {
  if (mocker && typeof mocker.clearAllMocks === "function") {
    mocker.clearAllMocks();
  } else {
    // Fallback: clear individual mocks
    fileTypeFromBufferMock.mockClear();
    pdfParseMock.mockClear();
    extractRawTextMock.mockClear();
  }
});

describe("sanitizeFile", () => {
  test("text/plain: removes ASCII control characters including \\x00, \\n, \\t, and DEL (0x7F)", async () => {
    fileTypeFromBufferMock.mockResolvedValue({ mime: "text/plain", ext: "txt" });

    const input = "Hello\x00World\n\t\u007FGoodbye";
    const buf = Buffer.from(input, "utf-8");

    const result = await sanitizeFile(buf);

    // Expect all control characters stripped
    expect(result).toBe("HelloWorldGoodbye");
  });

  test("application/pdf: returns PDF text and invokes pdf-parse with provided buffer", async () => {
    fileTypeFromBufferMock.mockResolvedValue({ mime: "application/pdf", ext: "pdf" });

    const pdfBuf = Buffer.from("%PDF-1.7 mock", "utf-8");
    pdfParseMock.mockResolvedValue({ text: "Parsed PDF Content" });

    const result = await sanitizeFile(pdfBuf);

    expect(result).toBe("Parsed PDF Content");
    expect(pdfParseMock).toHaveBeenCalledTimes(1);
    expect(pdfParseMock).toHaveBeenCalledWith(pdfBuf);
  });

  test("DOCX: returns mammoth raw text and calls extractRawText with { buffer }", async () => {
    fileTypeFromBufferMock.mockResolvedValue({
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ext: "docx",
    });

    const docxBuf = Buffer.from("PK\u0003\u0004 mock", "binary"); // ZIP container signature start
    extractRawTextMock.mockResolvedValue({ value: "Extracted DOCX Text" });

    const result = await sanitizeFile(docxBuf);

    expect(result).toBe("Extracted DOCX Text");
    expect(extractRawTextMock).toHaveBeenCalledTimes(1);
    // Called with an object holding the same buffer
    expect(extractRawTextMock).toHaveBeenCalledWith({ buffer: docxBuf });
  });

  test("throws when file type cannot be determined", async () => {
    fileTypeFromBufferMock.mockResolvedValue(null);

    const buf = Buffer.from("unknown", "utf-8");

    await expect(sanitizeFile(buf)).rejects.toThrow("Unable to determine file type");
    expect(pdfParseMock).not.toHaveBeenCalled();
    expect(extractRawTextMock).not.toHaveBeenCalled();
  });

  test("throws for unsupported file types (e.g., image/png)", async () => {
    fileTypeFromBufferMock.mockResolvedValue({ mime: "image/png", ext: "png" });

    const pngBuf = Buffer.from("\x89PNG\r\n\x1a\n...", "binary");

    await expect(sanitizeFile(pngBuf)).rejects.toThrow("Unsupported file type: image/png");
    expect(pdfParseMock).not.toHaveBeenCalled();
    expect(extractRawTextMock).not.toHaveBeenCalled();
  });

  test("text/plain: preserves visible characters and strips only control range [\\x00-\\x1F\\x7F]", async () => {
    fileTypeFromBufferMock.mockResolvedValue({ mime: "text/plain", ext: "txt" });

    // Include some boundary characters around the control set
    const visibleBefore = String.fromCharCode(0x20); // ' '
    const visibleAfter = String.fromCharCode(0x7e);  // '~'
    const controlChars = String.fromCharCode(0x00, 0x1f, 0x7f); // NUL, US, DEL
    const input = `${visibleBefore}A${controlChars}B${visibleAfter}`;
    const buf = Buffer.from(input, "utf-8");

    const result = await sanitizeFile(buf);

    expect(result).toBe(`${visibleBefore}A` + "B" + `${visibleAfter}`);
  });
});