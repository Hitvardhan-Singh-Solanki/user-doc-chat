import { ISanitizeFile } from "../../interfaces/sanitize-file.interface";
import * as mammoth from "mammoth";
import TurndownService from "turndown";
import * as path from "path";
import * as fs from "fs";
import { v4 as uuid } from "uuid";

export class DocSanitizationService implements ISanitizeFile {
  private turndown = new TurndownService();

  async sanitize(fileBuffer: Buffer): Promise<string> {
    const imageDir = path.join("/tmp", `docx_images_${uuid()}`);
    fs.mkdirSync(imageDir, { recursive: true });

    const { value: htmlContent } = await mammoth.convertToHtml(
      { buffer: fileBuffer },
      {
        convertImage: mammoth.images.imgElement(async (element) => {
          const imageName = `${uuid()}.png`;
          const imagePath = path.join(imageDir, imageName);
          const imageBuffer = await element.read("base64");
          fs.writeFileSync(imagePath, Buffer.from(imageBuffer, "base64"));
          return { src: `images/${imageName}` };
        }),
      }
    );

    const markdown = this.turndown.turndown(htmlContent);

    return markdown
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
}
