import { cp, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const apiDataDir = resolve(repoRoot, "apps", "api", ".data");
const snapshotPath = resolve(apiDataDir, "api-store.json");
const uploadsPath = resolve(apiDataDir, "uploads");
const backupRoot = resolve(repoRoot, "backups", "beta");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const targetRoot = resolve(backupRoot, timestamp);

const pathExists = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

const getUploadManifest = async () => {
  if (!(await pathExists(uploadsPath))) {
    return {
      fileCount: 0,
      totalBytes: 0,
    };
  }

  const entries = await readdir(uploadsPath, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  const stats = await Promise.all(files.map((entry) => stat(resolve(uploadsPath, entry.name))));

  return {
    fileCount: files.length,
    totalBytes: stats.reduce((sum, current) => sum + current.size, 0),
  };
};

const main = async () => {
  await mkdir(targetRoot, { recursive: true });

  const snapshotExists = await pathExists(snapshotPath);
  const uploadsExist = await pathExists(uploadsPath);

  if (snapshotExists) {
    await cp(snapshotPath, resolve(targetRoot, "api-store.json"));
  }

  if (uploadsExist) {
    await cp(uploadsPath, resolve(targetRoot, "uploads"), { recursive: true });
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    snapshotExists,
    snapshotPath,
    targetRoot,
    uploads: await getUploadManifest(),
    uploadsExist,
  };

  await writeFile(resolve(targetRoot, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
