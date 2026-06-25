import {
  migratePostgresLedgerDb,
  openPostgresLedgerDb,
  type LedgerDb,
} from "../../src/db.js";
import { postgresRequiredTables } from "../../src/postgres-schema.js";

export function readPostgresDatabaseUrl(env = process.env) {
  return optionalEnv(env.AGENT_BOARD_LEDGER_DATABASE_URL)
    ?? optionalEnv(env.DATABASE_URL)
    ?? optionalEnv(env.ledgerDatabaseUrl);
}

export async function migratePostgres(databaseUrl: string) {
  const db = openPostgresLedgerDb(databaseUrl);
  try {
    await migratePostgresLedgerDb(db);
    return await checkPostgresSchemaWithDb(db, databaseUrl);
  } finally {
    await db.close();
  }
}

export async function freshPostgres(databaseUrl: string) {
  const db = openPostgresLedgerDb(databaseUrl);
  try {
    await db.run("DROP SCHEMA IF EXISTS public CASCADE");
    await db.run("CREATE SCHEMA IF NOT EXISTS public");
    await db.run("GRANT ALL ON SCHEMA public TO CURRENT_USER");
    await db.run("GRANT USAGE ON SCHEMA public TO public");
    await migratePostgresLedgerDb(db);
    return await checkPostgresSchemaWithDb(db, databaseUrl);
  } finally {
    await db.close();
  }
}

export async function checkPostgresSchema(databaseUrl: string) {
  const db = openPostgresLedgerDb(databaseUrl);
  try {
    return await checkPostgresSchemaWithDb(db, databaseUrl);
  } finally {
    await db.close();
  }
}

export function requirePostgresDatabaseUrl() {
  const databaseUrl = readPostgresDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("Missing AGENT_BOARD_LEDGER_DATABASE_URL or DATABASE_URL for Postgres");
  }
  return databaseUrl;
}

async function checkPostgresSchemaWithDb(db: LedgerDb, databaseUrl: string) {
  const rows = await db.all<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY(?)
      ORDER BY table_name
    `,
    [Array.from(postgresRequiredTables)],
  );
  const existing = new Set(rows.map((row) => row.table_name));
  const missing = postgresRequiredTables.filter((table) => !existing.has(table));
  if (missing.length > 0) {
    return {
      ok: false,
      provider: db.provider,
      connection: redactDatabaseUrl(databaseUrl),
      tables: rows.map((row) => row.table_name),
      missing,
      counts: {
        boards: "0",
        events: "0",
        pnl_snapshots: "0",
        paper_accounts: "0",
        paper_orders: "0",
      },
    };
  }

  const counts = await db.get<{
    boards: string;
    events: string;
    pnl_snapshots: string;
    paper_accounts: string;
    paper_orders: string;
  }>(
    `
      SELECT
        (SELECT COUNT(*) FROM boards)::text AS boards,
        (SELECT COUNT(*) FROM events)::text AS events,
        (SELECT COUNT(*) FROM pnl_snapshots)::text AS pnl_snapshots,
        (SELECT COUNT(*) FROM paper_accounts)::text AS paper_accounts,
        (SELECT COUNT(*) FROM paper_orders)::text AS paper_orders
    `,
  );

  return {
    ok: missing.length === 0,
    provider: db.provider,
    connection: redactDatabaseUrl(databaseUrl),
    tables: rows.map((row) => row.table_name),
    missing,
    counts: counts ?? {
      boards: "0",
      events: "0",
      pnl_snapshots: "0",
      paper_accounts: "0",
      paper_orders: "0",
    },
  };
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
