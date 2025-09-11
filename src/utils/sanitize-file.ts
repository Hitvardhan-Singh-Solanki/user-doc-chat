// utils/sanitize-file-md.ts
import fs from "fs";
import pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";
import { PdfDocument } from "pdf-tables-parser";
import mammoth from "mammoth";
import { fileTypeFromBuffer } from "file-type";

const CONTROL_CHARS = new RegExp(
  "[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]",
  "g"
);

// Sanitize plain text
function sanitizeText(content: string): string {
  return content.replace(CONTROL_CHARS, "");
}

// Convert table array to Markdown
function tableToMarkdown(table: string[][]): string {
  if (!table.length) return "";
  const header = table[0].map((c) => `| ${c} `).join("") + "|";
  const separator = table[0].map(() => "| --- ").join("") + "|";
  const rows = table
    .slice(1)
    .map((r) => r.map((c) => `| ${c} `).join("") + "|");
  return [header, separator, ...rows].join("\n");
}

// Extract PDF text with positions using PDF.js
async function extractPdfTextWithCoords(buffer: Buffer) {
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;

  const pages: {
    text: string;
    x: number;
    y: number;
    page: number;
  }[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    content.items.forEach((item: any) => {
      const transform = item.transform;
      const x = transform[4];
      const y = transform[5];
      pages.push({
        text: item.str,
        x,
        y,
        page: i,
      });
    });
  }

  return pages;
}

// Extract tables using pdf-tables-parser
async function extractPdfTables(buffer: Buffer) {
  const pdfDoc = new PdfDocument();
  await pdfDoc.load(buffer);
  return pdfDoc.getTables(); // returns string[][]
}

// Merge text blocks and tables based on y-coordinates
function mergeTextAndTables(
  textBlocks: { text: string; x: number; y: number; page: number }[],
  tables: { table: string[][]; y: number; page: number }[]
) {
  const items: {
    type: "text" | "table";
    content: string;
    y: number;
    page: number;
  }[] = [];

  textBlocks.forEach((t) =>
    items.push({ type: "text", content: t.text, y: t.y, page: t.page })
  );
  tables.forEach((t) =>
    items.push({
      type: "table",
      content: tableToMarkdown(t.table),
      y: t.y,
      page: t.page,
    })
  );

  // Sort by page, then y coordinate ascending
  items.sort((a, b) => a.page - b.page || a.y - b.y);
  return items.map((i) => i.content).join("\n\n");
}

// Sanitize PDF content with flow + tables
async function sanitizePdf(buffer: Buffer): Promise<string> {
  const textBlocks = await extractPdfTextWithCoords(buffer);
  const rawTables = await extractPdfTables(buffer);

  // Assign approximate y for tables (take first text block in table for now)
  const tables = rawTables.map((t: unknown, i: number) => ({
    table: t,
    y: textBlocks[i]?.y || 0,
    page: textBlocks[i]?.page || 1,
  }));

  return mergeTextAndTables(textBlocks, tables);
}

// Sanitize DOCX content
async function sanitizeDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

// Determine file type and sanitize
export async function sanitizeFileToMarkdown(buffer: Buffer): Promise<string> {
  const type = await fileTypeFromBuffer(buffer);
  if (!type) throw new Error("Unable to determine file type");

  switch (type.mime) {
    case "application/pdf":
      return sanitizePdf(buffer);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return sanitizeDocx(buffer);
    case "text/plain":
      return sanitizeText(buffer.toString("utf-8"));
    default:
      throw new Error(`Unsupported file type: ${type.mime}`);
  }
}
