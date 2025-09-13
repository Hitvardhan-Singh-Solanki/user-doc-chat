const { readdir, stat } = require("fs").promises;
const path = require("path");

async function analyzeDirectory(dir, ignore = []) {
  const files = [];

  async function scan(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);

      // Skip ignored directories/files
      if (ignore.some((i) => entryPath.includes(i))) continue;

      if (entry.isDirectory()) {
        await scan(entryPath);
      } else {
        const stats = await stat(entryPath);
        files.push({
          path: entryPath,
          size: stats.size,
          ext: path.extname(entryPath),
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
