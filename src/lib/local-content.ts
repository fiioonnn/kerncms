import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { join, relative } from "path";

type TreeEntry = {
  path: string;
  type: "blob" | "tree";
};

export function getLocalTree(localPath: string, srcDir?: string | null): TreeEntry[] {
  const root = srcDir ? join(localPath, srcDir) : localPath;
  if (!existsSync(root)) return [];

  const entries: TreeEntry[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const fullPath = join(dir, entry.name);
      const rel = relative(srcDir ? join(localPath, srcDir) : localPath, fullPath);
      if (entry.isDirectory()) {
        entries.push({ path: rel, type: "tree" });
        walk(fullPath);
      } else {
        entries.push({ path: rel, type: "blob" });
      }
    }
  }

  walk(root);
  return entries;
}

export function getLocalFileContent(localPath: string, filePath: string): string | null {
  const full = join(localPath, filePath);
  try {
    return readFileSync(full, "utf-8");
  } catch {
    return null;
  }
}

export function writeLocalFile(localPath: string, filePath: string, content: string): void {
  const full = join(localPath, filePath);
  const dir = full.substring(0, full.lastIndexOf("/"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(full, content, "utf-8");
}

export function deleteLocalFile(localPath: string, filePath: string): void {
  const full = join(localPath, filePath);
  try {
    unlinkSync(full);
  } catch {
    // file may not exist
  }
}
