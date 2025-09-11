import { readdir, stat } from "fs/promises";
import { join, extname } from "path";

async function analyzeDirectory(dir, ignore = []) {
  const files = [];

  async function scan(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const path = join(currentDir, entry.name);

      // Skip ignored directories/files
      if (ignore.some((i) => path.includes(i))) continue;

      if (entry.isDirectory()) {
        await scan(path);
      } else {
        const stats = await stat(path);
        files.push({
          path,
          size: stats.size,
          ext: extname(path),
        });
      }
    }
  }

  await scan(dir);
  return files;
}

// Usage
const ignoreDirs = [
  "node_modules",
  ".git",
  ".env",
  ".idea",
  "__pycache__",
  "dist",
  "coverage",
  "venv",
  ".gitignore",
  "package-lock.json",
];

analyzeDirectory(".", ignoreDirs).then((files) => {
  console.table(files);
});
