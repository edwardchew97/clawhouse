import { migrateNeon, readNeonDatabaseUrl } from "./lib/neon.js";

const vercelEnv = process.env.VERCEL_ENV?.trim();
const databaseUrl = readNeonDatabaseUrl();

try {
  if (vercelEnv !== "production") {
    printJson({
      ok: true,
      action: "skip_neon_migration",
      reason: "non_production_vercel_build",
      vercelEnv: vercelEnv || null,
    });
    process.exit(0);
  }

  if (!databaseUrl) {
    throw new Error("Missing AGENT_BOARD_LEDGER_DATABASE_URL or DATABASE_URL for production Vercel migration");
  }

  const result = await migrateNeon(databaseUrl);
  printJson({
    ...result,
    action: "migrate_neon_schema",
    vercelEnv,
  });
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  printJson({
    ok: false,
    action: "migrate_neon_schema",
    vercelEnv: vercelEnv || null,
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}

function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
