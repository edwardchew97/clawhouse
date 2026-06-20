import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cacheDir = join(process.cwd(), "node_modules", ".cache");
mkdirSync(cacheDir, { recursive: true });

const outDir = mkdtempSync(join(cacheDir, "agent-board-ledger-vercel-runtime-"));

try {
  const typecheck = spawnSync(
    "bun",
    [
      "run",
      "tsc",
      "--noEmit",
      "false",
      "--outDir",
      outDir,
      "--rootDir",
      ".",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      "--target",
      "ES2022",
      "--lib",
      "ES2022",
      "--types",
      "bun-types",
      "--strict",
      "--skipLibCheck",
      "api/ledger.ts",
      "api/cron.ts",
    ],
    {
      stdio: "inherit",
    },
  );

  if (typecheck.status !== 0) {
    process.exit(typecheck.status ?? 1);
  }

  const importCheck = spawnSync(
    "node",
    [
      "--input-type=module",
      "--eval",
      [
        `await import(${JSON.stringify(pathToFileURL(join(outDir, "api/ledger.js")).href)});`,
        `await import(${JSON.stringify(pathToFileURL(join(outDir, "api/cron.js")).href)});`,
      ].join("\n"),
    ],
    {
      stdio: "inherit",
    },
  );

  if (importCheck.status !== 0) {
    process.exit(importCheck.status ?? 1);
  }

  console.log("vercel runtime imports ok");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
