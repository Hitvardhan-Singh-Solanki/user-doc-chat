import { ISanitizeFile } from "../../interfaces/sanitize-file.interface";
import * as mammoth from "mammoth";
import TurndownService from "turndown";
import * as path from "path";
import * as fs from "fs";
import { v4 as uuid } from "uuid";

export class DocSanitizationService implements ISanitizeFile {
  private turndown = new TurndownService();

  async sanitize(fileBuffer: Buffer): Promise<string> {
    const { value: htmlContent } = await mammoth.convertToHtml(
      { buffer: fileBuffer },
      {
        convertImage: mammoth.images.imgElement(async (element) => {
          const base64 = await element.read("base64");
          return { src: `data:image/png;base64,${base64}` };
        })
      }
    );

    const markdown = this.turndown.turndown(htmlContent);

    return markdown
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
}
