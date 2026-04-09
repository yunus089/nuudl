import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sharedRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distRoot = resolve(sharedRoot, "dist");

const needsSuffix = (specifier) => specifier.startsWith("./") && !specifier.endsWith(".js") && !specifier.endsWith(".json");

const rewriteImports = (source) =>
  source.replace(/from\s+["'](\.[^"']+)["']/g, (full, specifier) =>
    needsSuffix(specifier) ? full.replace(specifier, `${specifier}.js`) : full,
  );

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const target = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(target);
      continue;
    }

    if (!entry.name.endsWith(".js")) {
      continue;
    }

    const current = await readFile(target, "utf8");
    const next = rewriteImports(current);
    if (next !== current) {
      await writeFile(target, next, "utf8");
    }
  }
};

const main = async () => {
  const distStats = await stat(distRoot);
  if (!distStats.isDirectory()) {
    throw new Error("Shared dist directory not found.");
  }

  await walk(distRoot);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
