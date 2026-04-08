import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const consumerRoot = path.resolve(__dirname, "..");
const nextBin = path.resolve(consumerRoot, "..", "..", "node_modules", "next", "dist", "bin", "next");

const [, , command = "dev", ...args] = process.argv;
const distDir =
  command === "build" || command === "start"
    ? ".next-build"
    : ".next-dev";

const child = spawn(process.execPath, [nextBin, command, ...args], {
  cwd: consumerRoot,
  env: {
    ...process.env,
    NEXT_DIST_DIR: distDir,
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
