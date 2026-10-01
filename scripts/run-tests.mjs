/**
 * 测试运行器：用 esbuild 把 node:test 测试（含库源码）打成一个 ESM 包再执行。
 * 用法：node scripts/run-tests.mjs
 */
import { build } from "esbuild";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "node_modules", ".test-bundle.mjs");

await build({
  entryPoints: [path.join(root, "tests", "library.test.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: out,
  logLevel: "warning",
});

const res = spawnSync(process.execPath, ["--test", out], { stdio: "inherit" });
rmSync(out, { force: true });
process.exit(res.status ?? 1);
