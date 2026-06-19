import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import { neonSchemaStatements } from "./neon-schema";
import type {
  AttachmentRow,
  Board,
  EventRow,
  HoldingSnapshot,
  ObservationRow,
  PnlSnapshot,
} from "./types";

export type RunResult = {
  changes?: number;
};

export type LedgerDb = {
  provider: "sqlite" | "neon-postgres";
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<RunResult>;
  transaction<T>(callback: (tx: LedgerDb) => Promise<T>): Promise<T>;
  close(): void | Promise<void>;
};

export function openSqliteLedgerDb(path: string): SqliteLedgerDb {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  migrate(db);
  return new SqliteLedgerDb(db);
}

export function readRuntimeDatabaseUrl(env = process.env) {
  return cleanEnv(env.AGENT_BOARD_LEDGER_DATABASE_URL)
    ?? cleanEnv(env.DATABASE_URL)
    ?? cleanEnv(env.ledgerDatabaseUrl);
}

export async function openRuntimeLedgerDb(env = process.env): Promise<LedgerDb> {
  const databaseUrl = readRuntimeDatabaseUrl(env);
  if (!databaseUrl) {
    throw new Error("Missing AGENT_BOARD_LEDGER_DATABASE_URL, DATABASE_URL, or ledgerDatabaseUrl; runtime storage must use Neon/Postgres");
  }

  const db = openNeonLedgerDb(databaseUrl);
  await migrateNeonLedgerDb(db);
  return db;
}

export function openNeonLedgerDb(databaseUrl: string): LedgerDb {
  return new NeonLedgerDb(new Pool({ connectionString: databaseUrl }));
}

export async function migrateNeonLedgerDb(db: LedgerDb) {
  for (const statement of neonSchemaStatements) {
    await db.run(statement);
  }
}

export class SqliteLedgerDb implements LedgerDb {
  readonly provider = "sqlite" as const;

  constructor(readonly raw: Database) {}

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const row = this.raw.query(sql).get(...(params as never[])) as T | null | undefined;
    return row ?? undefined;
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.raw.query(sql).all(...(params as never[])) as T[];
  }

  async run(sql: string, params: unknown[] = []): Promise<RunResult> {
    const result = this.raw.query(sql).run(...(params as never[]));
    return { changes: result.changes };
  }

  async transaction<T>(callback: (tx: LedgerDb) => Promise<T>): Promise<T> {
    this.raw.exec("BEGIN");
    try {
      const result = await callback(this);
      this.raw.exec("COMMIT");
      return result;
    } catch (error) {
      this.raw.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.raw.close();
  }
}

type NeonQueryRunner = Pick<Pool, "query"> | Pick<PoolClient, "query">;

class NeonLedgerDb implements LedgerDb {
  readonly provider = "neon-postgres" as const;

  constructor(
    private readonly runner: NeonQueryRunner,
    private readonly pool?: Pool,
  ) {}

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const result = await this.runner.query(toPostgresPlaceholders(sql), params);
    return result.rows[0] as T | undefined;
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.runner.query(toPostgresPlaceholders(sql), params);
    return result.rows as T[];
  }

  async run(sql: string, params: unknown[] = []): Promise<RunResult> {
    const result = await this.runner.query(toPostgresPlaceholders(sql), params);
    return { changes: result.rowCount ?? undefined };
  }

  async transaction<T>(callback: (tx: LedgerDb) => Promise<T>): Promise<T> {
    if (!this.pool) return await callback(this);

    const client = await this.pool.connect();
    const tx = new NeonLedgerDb(client);
    try {
      await client.query("BEGIN");
      const result = await callback(tx);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    if (this.pool) await this.pool.end();
  }
}

function toPostgresPlaceholders(sql: string) {
  let index = 0;
  return sql.replaceAll("?", () => `$${++index}`);
}

function cleanEnv(value: string | undefined) {
  return value && value.trim() !== "" ? value.trim() : undefined;
}

export function migrate(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      public_key TEXT NOT NULL,
      chain TEXT DEFAULT 'near',
      venue_namespace TEXT DEFAULT 'near-intents',
      tracking_started_at TEXT,
      starting_value_usd REAL NOT NULL,
      base_currency TEXT NOT NULL,
      public_status TEXT NOT NULL,
      visibility_mode TEXT NOT NULL,
      owner_wallet_address TEXT,
      funding_source TEXT,
      funding_tx_hash TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_nonces (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      nonce TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      body_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(board_id, wallet_address, nonce)
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id),
      agent_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      event_type TEXT NOT NULL,
      client_event_id TEXT,
      tx_hash TEXT,
      intent_id TEXT,
      status_claim TEXT,
      asset_in TEXT,
      amount_in REAL,
      asset_out TEXT,
      amount_out REAL,
      reason TEXT,
      metadata_json TEXT,
      reported_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS events_board_created_idx ON events(board_id, created_at);
    CREATE INDEX IF NOT EXISTS events_client_event_idx ON events(board_id, client_event_id);
    CREATE INDEX IF NOT EXISTS events_tx_hash_idx ON events(board_id, tx_hash);
    CREATE INDEX IF NOT EXISTS events_intent_idx ON events(board_id, intent_id);

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id),
      board_id TEXT NOT NULL REFERENCES boards(id),
      attachment_type TEXT NOT NULL,
      reason TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS observations (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id),
      wallet_address TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      current_value_usd REAL NOT NULL,
      topup_usd REAL NOT NULL DEFAULT 0,
      withdrawal_usd REAL NOT NULL DEFAULT 0,
      client_event_id TEXT,
      tx_hash TEXT,
      intent_id TEXT,
      status_claim TEXT,
      asset_in TEXT,
      amount_in REAL,
      asset_out TEXT,
      amount_out REAL,
      metadata_json TEXT,
      event_id TEXT REFERENCES events(id),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS observations_board_observed_idx ON observations(board_id, observed_at);

    CREATE TABLE IF NOT EXISTS holding_snapshots (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id),
      wallet_address TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      current_value_usd REAL NOT NULL,
      source_observation_id TEXT NOT NULL REFERENCES observations(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracked_wallets (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id),
      agent_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      public_key TEXT,
      chain TEXT NOT NULL DEFAULT 'near',
      venue_namespace TEXT NOT NULL DEFAULT 'near-intents',
      tracking_started_at TEXT NOT NULL,
      tracking_status TEXT NOT NULL DEFAULT 'active',
      source TEXT NOT NULL DEFAULT 'board_registration',
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(board_id, wallet_address)
    );

    CREATE TABLE IF NOT EXISTS balance_changes (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id),
      tracked_wallet_id TEXT REFERENCES tracked_wallets(id),
      wallet_address TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      asset_symbol TEXT,
      raw_amount TEXT,
      normalized_amount REAL,
      decimals INTEGER,
      delta_amount REAL,
      delta_value_usd REAL,
      change_type TEXT NOT NULL,
      source_observation_id TEXT REFERENCES observations(id),
      source_event_id TEXT REFERENCES events(id),
      tx_hash TEXT,
      intent_id TEXT,
      visibility_status TEXT NOT NULL DEFAULT 'complete',
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS balance_changes_board_observed_idx
      ON balance_changes(board_id, observed_at);
    CREATE INDEX IF NOT EXISTS balance_changes_wallet_asset_idx
      ON balance_changes(wallet_address, asset_id, observed_at);

    CREATE TABLE IF NOT EXISTS price_snapshots (
      id TEXT PRIMARY KEY,
      board_id TEXT REFERENCES boards(id),
      asset_id TEXT NOT NULL,
      asset_symbol TEXT,
      price_usd REAL,
      price_source TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      staleness_status TEXT NOT NULL DEFAULT 'fresh',
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS price_snapshots_asset_observed_idx
      ON price_snapshots(asset_id, observed_at);

    CREATE TABLE IF NOT EXISTS pnl_snapshots (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id),
      agent_id TEXT,
      observed_at TEXT NOT NULL,
      starting_value_usd REAL NOT NULL,
      current_value_usd REAL NOT NULL,
      net_topups_usd REAL NOT NULL,
      net_withdrawals_usd REAL NOT NULL,
      pnl_usd REAL NOT NULL,
      holding_snapshot_id TEXT REFERENCES holding_snapshots(id),
      price_snapshot_id TEXT REFERENCES price_snapshots(id),
      total_pnl_pct REAL,
      drawdown_pct REAL,
      high_water_mark_usd REAL,
      observed_trade_count INTEGER NOT NULL DEFAULT 0,
      failed_event_count INTEGER NOT NULL DEFAULT 0,
      reason_missing_count INTEGER NOT NULL DEFAULT 0,
      staleness_status TEXT NOT NULL DEFAULT 'unknown',
      completeness_status TEXT NOT NULL DEFAULT 'unknown',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS read_access_checks (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id),
      requester_wallet_address TEXT,
      access_level TEXT NOT NULL,
      access_result TEXT NOT NULL,
      reason TEXT,
      key_contract_id TEXT,
      checked_at TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS read_access_checks_board_checked_idx
      ON read_access_checks(board_id, checked_at);

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      board_id TEXT REFERENCES boards(id),
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      action TEXT NOT NULL,
      result TEXT NOT NULL,
      subject_type TEXT,
      subject_id TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS audit_events_board_created_idx
      ON audit_events(board_id, created_at);

    CREATE TRIGGER IF NOT EXISTS boards_after_insert_accounting_defaults
    AFTER INSERT ON boards
    BEGIN
      UPDATE boards
        SET
          chain = COALESCE(NULLIF(NEW.chain, ''), 'near'),
          venue_namespace = COALESCE(NULLIF(NEW.venue_namespace, ''), 'near-intents'),
          tracking_started_at = COALESCE(NULLIF(NEW.tracking_started_at, ''), NEW.created_at)
        WHERE id = NEW.id;

      INSERT OR IGNORE INTO tracked_wallets
        (id, board_id, agent_id, wallet_address, public_key, chain, venue_namespace,
         tracking_started_at, tracking_status, source, created_at)
        VALUES (
          'tw_' || NEW.id,
          NEW.id,
          NEW.agent_id,
          NEW.wallet_address,
          NEW.public_key,
          COALESCE(NULLIF(NEW.chain, ''), 'near'),
          COALESCE(NULLIF(NEW.venue_namespace, ''), 'near-intents'),
          COALESCE(NULLIF(NEW.tracking_started_at, ''), NEW.created_at),
          'active',
          'board_registration',
          NEW.created_at
        );
    END;
  `);

  ensureColumn(db, "boards", "chain", "TEXT DEFAULT 'near'");
  ensureColumn(db, "boards", "venue_namespace", "TEXT DEFAULT 'near-intents'");
  ensureColumn(db, "boards", "tracking_started_at", "TEXT");
  ensureColumn(db, "boards", "owner_wallet_address", "TEXT");
  ensureColumn(db, "boards", "funding_source", "TEXT");
  ensureColumn(db, "boards", "funding_tx_hash", "TEXT");
  ensureColumn(db, "boards", "metadata_json", "TEXT");
  ensureColumn(db, "auth_nonces", "body_hash", "TEXT");
  ensureColumn(db, "events", "reported_at", "TEXT");

  ensureColumn(db, "pnl_snapshots", "agent_id", "TEXT");
  ensureColumn(db, "pnl_snapshots", "holding_snapshot_id", "TEXT REFERENCES holding_snapshots(id)");
  ensureColumn(db, "pnl_snapshots", "price_snapshot_id", "TEXT REFERENCES price_snapshots(id)");
  ensureColumn(db, "pnl_snapshots", "total_pnl_pct", "REAL");
  ensureColumn(db, "pnl_snapshots", "drawdown_pct", "REAL");
  ensureColumn(db, "pnl_snapshots", "high_water_mark_usd", "REAL");
  ensureColumn(db, "pnl_snapshots", "observed_trade_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "pnl_snapshots", "failed_event_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "pnl_snapshots", "reason_missing_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "pnl_snapshots", "staleness_status", "TEXT NOT NULL DEFAULT 'unknown'");
  ensureColumn(db, "pnl_snapshots", "completeness_status", "TEXT NOT NULL DEFAULT 'unknown'");

  db.exec(`
    UPDATE boards
      SET chain = 'near'
      WHERE chain IS NULL OR chain = '';
    UPDATE boards
      SET venue_namespace = 'near-intents'
      WHERE venue_namespace IS NULL OR venue_namespace = '';
    UPDATE boards
      SET tracking_started_at = created_at
      WHERE tracking_started_at IS NULL OR tracking_started_at = '';
    UPDATE events
      SET reported_at = created_at
      WHERE (reported_at IS NULL OR reported_at = '')
        AND event_type != 'discovered_without_reason';

    INSERT OR IGNORE INTO tracked_wallets
      (id, board_id, agent_id, wallet_address, public_key, chain, venue_namespace,
       tracking_started_at, tracking_status, source, created_at)
      SELECT
        'tw_' || id,
        id,
        agent_id,
        wallet_address,
        public_key,
        COALESCE(NULLIF(chain, ''), 'near'),
        COALESCE(NULLIF(venue_namespace, ''), 'near-intents'),
        COALESCE(NULLIF(tracking_started_at, ''), created_at),
        'active',
        'board_registration',
        created_at
      FROM boards;

    UPDATE pnl_snapshots
      SET agent_id = (
        SELECT boards.agent_id FROM boards WHERE boards.id = pnl_snapshots.board_id
      )
      WHERE agent_id IS NULL;
    UPDATE pnl_snapshots
      SET total_pnl_pct = CASE
        WHEN starting_value_usd = 0 THEN NULL
        ELSE pnl_usd / starting_value_usd
      END
      WHERE total_pnl_pct IS NULL;
    UPDATE pnl_snapshots
      SET high_water_mark_usd = (
        SELECT MAX(prior.current_value_usd)
        FROM pnl_snapshots AS prior
        WHERE prior.board_id = pnl_snapshots.board_id
          AND prior.observed_at <= pnl_snapshots.observed_at
      )
      WHERE high_water_mark_usd IS NULL;
    UPDATE pnl_snapshots
      SET drawdown_pct = CASE
        WHEN high_water_mark_usd > 0 THEN (high_water_mark_usd - current_value_usd) / high_water_mark_usd
        ELSE 0
      END
      WHERE drawdown_pct IS NULL;
    UPDATE pnl_snapshots
      SET staleness_status = 'unknown'
      WHERE staleness_status IS NULL OR staleness_status = '';
    UPDATE pnl_snapshots
      SET completeness_status = 'unknown'
      WHERE completeness_status IS NULL OR completeness_status = '';
  `);
}

function ensureColumn(db: Database, table: string, column: string, definition: string) {
  const columns = db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all();
  if (columns.some((existing) => existing.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export async function getBoard(db: LedgerDb, boardId: string) {
  return await db.get<Board>("SELECT * FROM boards WHERE id = ?", [boardId]);
}

export async function listEvents(db: LedgerDb, boardId: string) {
  return await db.all<EventRow>("SELECT * FROM events WHERE board_id = ? ORDER BY created_at ASC, id ASC", [boardId]);
}

export async function listAttachments(db: LedgerDb, eventId: string) {
  return await db.all<AttachmentRow>(
    "SELECT * FROM attachments WHERE event_id = ? ORDER BY created_at ASC, id ASC",
    [eventId],
  );
}

export async function findEventByAssociations(
  db: LedgerDb,
  boardId: string,
  input: { client_event_id?: string | null; tx_hash?: string | null; intent_id?: string | null },
) {
  const clauses: string[] = [];
  const values: string[] = [boardId];

  for (const key of ["client_event_id", "tx_hash", "intent_id"] as const) {
    const value = cleanString(input[key]);
    if (!value) continue;
    clauses.push(`${key} = ?`);
    values.push(value);
  }

  if (clauses.length === 0) return undefined;

  return await db.get<EventRow>(
    `SELECT * FROM events WHERE board_id = ? AND (${clauses.join(" OR ")}) ORDER BY created_at ASC LIMIT 1`,
    values,
  );
}

export async function latestObservation(db: LedgerDb, boardId: string) {
  return await db.get<ObservationRow>(
    "SELECT * FROM observations WHERE board_id = ? ORDER BY observed_at DESC, created_at DESC, id DESC LIMIT 1",
    [boardId],
  );
}

export async function latestHoldingSnapshot(db: LedgerDb, boardId: string) {
  return await db.get<HoldingSnapshot>(
    "SELECT * FROM holding_snapshots WHERE board_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
    [boardId],
  );
}

export async function latestPnlSnapshot(db: LedgerDb, boardId: string) {
  return await db.get<PnlSnapshot>(
    "SELECT * FROM pnl_snapshots WHERE board_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
    [boardId],
  );
}

export function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function requiredString(value: unknown, name: string) {
  const cleaned = cleanString(value);
  if (!cleaned) throw new RequestError(`Missing ${name}`, 400);
  return cleaned;
}

export function optionalNumber(value: unknown, name: string) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new RequestError(`Invalid ${name}`, 400);
  return parsed;
}

export function requiredNumber(value: unknown, name: string) {
  const parsed = optionalNumber(value, name);
  if (parsed === null) throw new RequestError(`Missing ${name}`, 400);
  return parsed;
}

export function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export class RequestError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
