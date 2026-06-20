import { neon } from "@neondatabase/serverless";
import { neonRequiredTables, neonSchemaStatements } from "../../src/neon-schema.js";

export function readNeonDatabaseUrl(env = process.env) {
  return optionalEnv(env.AGENT_BOARD_LEDGER_DATABASE_URL)
    ?? optionalEnv(env.DATABASE_URL)
    ?? optionalEnv(env.ledgerDatabaseUrl);
}

export async function migrateNeon(databaseUrl: string) {
  const sql = neon(databaseUrl);
  for (const statement of neonSchemaStatements) {
    await sql.query(statement, []);
  }
  return await checkNeonSchema(databaseUrl);
}

export async function checkNeonSchema(databaseUrl: string) {
  const sql = neon(databaseUrl);
  const rows = await sql.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1)
      ORDER BY table_name
    `,
    [Array.from(neonRequiredTables)],
  );
  const tableRows = rows as Array<{ table_name: string }>;
  const existing = new Set(tableRows.map((row) => row.table_name));
  const missing = neonRequiredTables.filter((table) => !existing.has(table));
  const counts = await sql.query(
    `
      SELECT
        (SELECT COUNT(*) FROM boards)::text AS boards,
        (SELECT COUNT(*) FROM events)::text AS events,
        (SELECT COUNT(*) FROM pnl_snapshots)::text AS pnl_snapshots
    `,
    [],
  );

  return {
    ok: missing.length === 0,
    provider: "neon-postgres",
    connection: redactDatabaseUrl(databaseUrl),
    tables: tableRows.map((row) => row.table_name),
    missing,
    counts: (counts as Array<{ boards: string; events: string; pnl_snapshots: string }>)[0]
      ?? { boards: "0", events: "0", pnl_snapshots: "0" },
  };
}

export function requireNeonDatabaseUrl() {
  const databaseUrl = readNeonDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("Missing AGENT_BOARD_LEDGER_DATABASE_URL or DATABASE_URL for Neon");
  }
  return databaseUrl;
}

function optionalEnv(value: string | undefined) {
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function redactDatabaseUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.password) url.password = "redacted";
    if (url.username) url.username = "redacted";
    return url.toString();
  } catch {
    return "[invalid-url-redacted]";
  }
}
