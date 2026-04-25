import path from "node:path";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const projectRoot = process.cwd();
const nextCliPath = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const wasmDir = path.join(projectRoot, "node_modules", "@next", "swc-wasm-nodejs");

const child = spawn(process.execPath, [nextCliPath, ...args], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_TEST_WASM_DIR: process.env.NEXT_TEST_WASM_DIR || wasmDir,
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
