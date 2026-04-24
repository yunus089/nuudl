import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const args = process.argv.slice(2);
const strict = args.includes("--strict");

const requiredScripts = [
  "backoffice:break-glass",
  "build:api",
  "build:consumer",
  "build:deploy",
  "preflight:private-beta",
  "preflight:soft-launch",
  "start:api",
  "start:consumer",
];

const requiredIgnorePatterns = [
  ".env",
  "*.log",
  "*.tsbuildinfo",
  ".next-build/",
  ".next-dev/",
  "apps/api/.data/",
  "backups/",
  "dist/",
  "node_modules/",
];

const requiredDocs = [
  "docs/deploy/README.md",
  "docs/deploy/BACKOFFICE_BREAK_GLASS.md",
  "docs/deploy/BETA_LAUNCH_SWITCHES.md",
  "docs/deploy/COOLIFY_HOSTINGER.md",
];

const forbiddenTrackedPatterns = [
  { label: "local backup", test: (path) => path.startsWith("backups/") },
  { label: "environment secret", test: (path) => path === ".env" || path.endsWith("/.env") },
  { label: "log file", test: (path) => path.endsWith(".log") },
  { label: "TypeScript build info", test: (path) => path.endsWith(".tsbuildinfo") },
  { label: "node_modules", test: (path) => path === "node_modules" || path.includes("/node_modules/") },
  { label: "Next build output", test: (path) => path.includes("/.next/") || path.includes("/.next-build/") || path.includes("/.next-dev/") },
  { label: "compiled dist output", test: (path) => path === "dist" || path.includes("/dist/") || path.endsWith("/dist") },
  { label: "API runtime data", test: (path) => path.startsWith("apps/api/.data/") },
];

const runGit = async (args) => {
  const command = process.platform === "win32" ? "cmd.exe" : "git";
  const commandArgs = process.platform === "win32" ? ["/c", "git", ...args] : args;
  const { stdout } = await execFileAsync(command, commandArgs, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  });
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
};

const addFailure = (failures, message) => {
  failures.push(message);
};

const main = async () => {
  const failures = [];
  const notes = [];
  const warnings = [];
  const trackedFiles = await runGit(["ls-files"]);
  const statusLines = await runGit(["status", "--short"]);
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const gitignore = await readFile(".gitignore", "utf8");

  const forbiddenTrackedFiles = trackedFiles.flatMap((path) => {
    const match = forbiddenTrackedPatterns.find((pattern) => pattern.test(path));
    return match ? [{ path, reason: match.label }] : [];
  });

  if (forbiddenTrackedFiles.length > 0) {
    forbiddenTrackedFiles.slice(0, 20).forEach((file) => {
      addFailure(failures, `Tracked ${file.reason} must be removed from Git index: ${file.path}`);
    });

    if (forbiddenTrackedFiles.length > 20) {
      addFailure(failures, `Tracked generated/sensitive artifacts continue for ${forbiddenTrackedFiles.length - 20} more file(s).`);
    }
  }

  requiredScripts.forEach((scriptName) => {
    if (!packageJson.scripts?.[scriptName]) {
      addFailure(failures, `Missing package script: ${scriptName}`);
    }
  });

  requiredIgnorePatterns.forEach((pattern) => {
    if (!gitignore.split(/\r?\n/).includes(pattern)) {
      addFailure(failures, `Missing .gitignore pattern: ${pattern}`);
    }
  });

  requiredDocs.forEach((path) => {
    if (!trackedFiles.includes(path) && !statusLines.some((line) => line.endsWith(path))) {
      addFailure(failures, `Missing deploy documentation file: ${path}`);
    }
  });

  const generatedDeletions = statusLines.filter((line) => {
    const path = line.replace(/^.. /, "");
    return line.startsWith("D ") && forbiddenTrackedPatterns.some((pattern) => pattern.test(path));
  });

  if (generatedDeletions.length > 0) {
    notes.push(`${generatedDeletions.length} generated artifact deletion(s) are staged. That is expected when cleaning old tracked build output.`);
  }

  if (statusLines.length > 0) {
    const message = `Working tree is not clean (${statusLines.length} status line(s)). Finish or review changes before final deploy.`;
    if (strict) {
      warnings.push(message);
    } else {
      notes.push(message);
    }
  }

  const result = {
    checked: {
      docs: requiredDocs.length,
      gitignorePatterns: requiredIgnorePatterns.length,
      packageScripts: requiredScripts.length,
      trackedFiles: trackedFiles.length,
    },
    failures,
    notes,
    mode: strict ? "strict" : "standard",
    status: failures.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready",
    warnings,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (failures.length > 0) {
    process.exit(1);
  }
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
