import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadFile } from "../service/minio";
import { Readable } from "stream";
import { Client } from "minio";

describe("downloadFile", () => {
  let getObjectMock: any;

  beforeEach(() => {
    const instance = new Client({} as any);
    getObjectMock = instance.getObject;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should download file and return buffer", async () => {
    const fakeData = ["mock ", "text"];
    const fakeStream = new Readable({
      read() {
        fakeData.forEach((chunk) => this.push(chunk));
        this.push(null);
      },
    });

    getObjectMock.mockResolvedValueOnce(fakeStream);

    const result = await downloadFile("my-bucket", "my-key");

    expect(result.toString()).toBe("mock text");
  });
});
