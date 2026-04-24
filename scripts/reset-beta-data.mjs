import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CONFIRM_FLAG = "--confirm-clean-beta";
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const apiDataDir = resolve(repoRoot, "apps", "api", ".data");
const snapshotPath = resolve(apiDataDir, "api-store.json");
const uploadsPath = resolve(apiDataDir, "uploads");
const backupRoot = resolve(repoRoot, "backups", "beta");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const targetRoot = resolve(backupRoot, `${timestamp}-pre-reset`);

const pathExists = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

const assertInsideRepo = (path) => {
  const relativePath = relative(repoRoot, path);
  if (relativePath.startsWith("..") || relativePath === "" || relativePath.includes(":")) {
    throw new Error(`Refusing to touch path outside repo: ${path}`);
  }
};

const main = async () => {
  if (!process.argv.includes(CONFIRM_FLAG)) {
    process.stderr.write(
      [
        "Refusing to reset beta data without explicit confirmation.",
        `Run: npm run reset:beta-data -- ${CONFIRM_FLAG}`,
      ].join("\n") + "\n",
    );
    process.exit(1);
  }

  assertInsideRepo(snapshotPath);
  assertInsideRepo(uploadsPath);
  assertInsideRepo(targetRoot);

  const snapshotExists = await pathExists(snapshotPath);
  const uploadsExist = await pathExists(uploadsPath);

  if (snapshotExists || uploadsExist) {
    await mkdir(targetRoot, { recursive: true });
  }

  if (snapshotExists) {
    await cp(snapshotPath, resolve(targetRoot, "api-store.json"));
    await rm(snapshotPath, { force: true });
  }

  if (uploadsExist) {
    await cp(uploadsPath, resolve(targetRoot, "uploads"), { recursive: true });
    await rm(uploadsPath, { force: true, recursive: true });
  }

  const manifest = {
    backupCreated: snapshotExists || uploadsExist,
    createdAt: new Date().toISOString(),
    removed: {
      snapshot: snapshotExists,
      uploads: uploadsExist,
    },
    targetRoot: snapshotExists || uploadsExist ? targetRoot : null,
  };

  if (snapshotExists || uploadsExist) {
    await writeFile(resolve(targetRoot, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  }

  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
