import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import pg from "pg";
import { postgresSchemaStatements } from "./postgres-schema.js";
import type {
  AttachmentRow,
  Board,
  EventRow,
  HoldingSnapshot,
  JsonObject,
  ObservationRow,
  PnlSnapshot,
} from "./types.js";
import type { Database } from "bun:sqlite";

export type RunResult = {
  changes?: number;
};

export type LedgerDb = {
  provider: "sqlite" | "postgres";
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<RunResult>;
  transaction<T>(callback: (tx: LedgerDb) => Promise<T>): Promise<T>;
  close(): void | Promise<void>;
};

export function openSqliteLedgerDb(path: string): SqliteLedgerDb {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });

  const db = new (loadSqliteDatabase())(path);
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

type OpenPostgresLedgerDb = (databaseUrl: string) => LedgerDb;

export async function openRuntimeLedgerDb(env = process.env, openPostgresDb: OpenPostgresLedgerDb = openPostgresLedgerDb): Promise<LedgerDb> {
  const databaseUrl = readRuntimeDatabaseUrl(env);
  if (!databaseUrl) {
    throw new Error("Missing AGENT_BOARD_LEDGER_DATABASE_URL, DATABASE_URL, or ledgerDatabaseUrl; runtime storage must use Postgres");
  }

  return openPostgresDb(databaseUrl);
}

export async function openMigratedRuntimeLedgerDb(env = process.env, openPostgresDb: OpenPostgresLedgerDb = openPostgresLedgerDb): Promise<LedgerDb> {
  const db = await openRuntimeLedgerDb(env, openPostgresDb);
  try {
    await migratePostgresLedgerDb(db);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

export function openPostgresLedgerDb(databaseUrl: string): LedgerDb {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  return new PostgresLedgerDb(pool, pool);
}

export async function migratePostgresLedgerDb(db: LedgerDb) {
  for (const statement of postgresSchemaStatements) {
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

const requireFromHere = createRequire(import.meta.url);
type BunSqliteDatabaseConstructor = new (path: string) => Database;

function loadSqliteDatabase(): BunSqliteDatabaseConstructor {
  try {
    return (requireFromHere("bun:sqlite") as { Database: BunSqliteDatabaseConstructor }).Database;
  } catch {
    throw new Error("SQLite ledger storage requires Bun; hosted runtime storage must use Postgres");
  }
}

type PostgresPool = pg.Pool;
type PostgresClient = pg.PoolClient;
type PostgresQueryRunner = Pick<PostgresPool, "query"> | Pick<PostgresClient, "query">;

class PostgresLedgerDb implements LedgerDb {
  readonly provider = "postgres" as const;

  constructor(
    private readonly runner: PostgresQueryRunner,
    private readonly pool?: PostgresPool,
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
    const tx = new PostgresLedgerDb(client);
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
	      agent_public_key TEXT,
	      wallet_address TEXT NOT NULL,
	      public_key TEXT NOT NULL,
      chain TEXT DEFAULT 'near',
      venue_namespace TEXT DEFAULT 'near-intents',
      tracking_started_at TEXT,
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

	    CREATE TABLE IF NOT EXISTS agent_registrations (
	      agent_id TEXT PRIMARY KEY,
	      agent_public_key TEXT NOT NULL,
	      status TEXT NOT NULL DEFAULT 'active',
	      metadata_json TEXT,
	      created_at TEXT NOT NULL,
	      updated_at TEXT NOT NULL
	    );

	    CREATE TABLE IF NOT EXISTS agent_auth_nonces (
	      id TEXT PRIMARY KEY,
	      agent_id TEXT NOT NULL,
	      agent_public_key TEXT NOT NULL,
	      purpose TEXT NOT NULL,
	      nonce TEXT NOT NULL,
	      timestamp TEXT NOT NULL,
	      body_hash TEXT NOT NULL,
	      created_at TEXT NOT NULL,
	      UNIQUE(agent_id, agent_public_key, purpose, nonce)
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
    CREATE UNIQUE INDEX IF NOT EXISTS events_client_event_unique_idx
      ON events(board_id, client_event_id)
      WHERE client_event_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS events_tx_hash_unique_idx
      ON events(board_id, tx_hash)
      WHERE tx_hash IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS events_intent_unique_idx
      ON events(board_id, intent_id)
      WHERE intent_id IS NOT NULL;

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

    CREATE TABLE IF NOT EXISTS paper_accounts (
      id TEXT PRIMARY KEY,
      board_id TEXT REFERENCES boards(id),
      agent_id TEXT NOT NULL,
      agent_public_key TEXT NOT NULL,
      base_currency TEXT NOT NULL DEFAULT 'USD',
      quote_decimals INTEGER NOT NULL DEFAULT 8,
      starting_balance_raw TEXT,
      starting_balance_usd REAL NOT NULL,
      cash_balance_raw TEXT,
      cash_balance_usd REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      allowed_markets_json TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS paper_accounts_board_unique_idx
      ON paper_accounts(board_id)
      WHERE board_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS paper_auth_nonces (
      id TEXT PRIMARY KEY,
      paper_account_id TEXT NOT NULL REFERENCES paper_accounts(id),
      nonce TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      body_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(paper_account_id, nonce)
    );

    CREATE TABLE IF NOT EXISTS paper_market_snapshots (
      id TEXT PRIMARY KEY,
      ingest_sequence INTEGER,
      market_type TEXT NOT NULL DEFAULT 'perp',
      coin TEXT NOT NULL,
      source TEXT NOT NULL,
      price_decimals INTEGER NOT NULL DEFAULT 8,
      mark_px_raw TEXT,
      mark_px REAL NOT NULL,
      oracle_px_raw TEXT,
      oracle_px REAL,
      funding_rate REAL,
      max_leverage REAL,
      maintenance_margin_rate REAL NOT NULL,
      book_json TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      staleness_status TEXT NOT NULL DEFAULT 'fresh',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS paper_market_snapshots_coin_observed_idx
      ON paper_market_snapshots(market_type, coin, observed_at);

    CREATE TABLE IF NOT EXISTS paper_orders (
      id TEXT PRIMARY KEY,
      paper_account_id TEXT NOT NULL REFERENCES paper_accounts(id),
      agent_id TEXT NOT NULL,
      client_order_id TEXT NOT NULL,
      market_type TEXT NOT NULL DEFAULT 'perp',
      coin TEXT NOT NULL,
      side TEXT NOT NULL,
      tif TEXT NOT NULL,
      price_decimals INTEGER NOT NULL DEFAULT 8,
      size_decimals INTEGER NOT NULL DEFAULT 8,
      quote_decimals INTEGER NOT NULL DEFAULT 8,
      limit_px_raw TEXT,
      limit_px REAL,
      size_raw TEXT,
      size REAL NOT NULL,
      remaining_size_raw TEXT,
      remaining_size REAL NOT NULL,
      reduce_only INTEGER NOT NULL DEFAULT 0,
      margin_mode TEXT NOT NULL,
      leverage REAL NOT NULL,
      max_slippage_bps REAL NOT NULL,
      reference_px_raw TEXT,
      reference_px REAL,
      max_reference_deviation_bps REAL,
      reference_deviation_bps REAL,
      status TEXT NOT NULL,
      reject_reason TEXT,
      reason TEXT,
      strategy_hash TEXT,
      market_snapshot_id TEXT REFERENCES paper_market_snapshots(id),
      avg_fill_px_raw TEXT,
      avg_fill_px REAL,
      notional_raw TEXT,
      notional_usd REAL NOT NULL DEFAULT 0,
      fee_raw TEXT,
      fee_usd REAL NOT NULL DEFAULT 0,
      body_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(paper_account_id, client_order_id)
    );

    CREATE INDEX IF NOT EXISTS paper_orders_account_created_idx
      ON paper_orders(paper_account_id, created_at);
    CREATE INDEX IF NOT EXISTS paper_orders_status_idx
      ON paper_orders(status, market_type, coin);

    CREATE TABLE IF NOT EXISTS paper_fills (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES paper_orders(id),
      paper_account_id TEXT NOT NULL REFERENCES paper_accounts(id),
      market_type TEXT NOT NULL DEFAULT 'perp',
      coin TEXT NOT NULL,
      side TEXT NOT NULL,
      price_decimals INTEGER NOT NULL DEFAULT 8,
      size_decimals INTEGER NOT NULL DEFAULT 8,
      quote_decimals INTEGER NOT NULL DEFAULT 8,
      px_raw TEXT,
      px REAL NOT NULL,
      size_raw TEXT,
      size REAL NOT NULL,
      notional_raw TEXT,
      notional_usd REAL NOT NULL,
      fee_raw TEXT,
      fee_usd REAL NOT NULL,
      liquidity TEXT NOT NULL,
      market_snapshot_id TEXT NOT NULL REFERENCES paper_market_snapshots(id),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS paper_fills_account_created_idx
      ON paper_fills(paper_account_id, created_at);

    CREATE TABLE IF NOT EXISTS paper_positions (
      id TEXT PRIMARY KEY,
      paper_account_id TEXT NOT NULL REFERENCES paper_accounts(id),
      market_type TEXT NOT NULL DEFAULT 'perp',
      coin TEXT NOT NULL,
      margin_mode TEXT NOT NULL,
      price_decimals INTEGER NOT NULL DEFAULT 8,
      size_decimals INTEGER NOT NULL DEFAULT 8,
      quote_decimals INTEGER NOT NULL DEFAULT 8,
      signed_size_raw TEXT,
      signed_size REAL NOT NULL,
      entry_px_raw TEXT,
      entry_px REAL NOT NULL,
      leverage REAL NOT NULL,
      isolated_margin_raw TEXT,
      isolated_margin_usd REAL NOT NULL DEFAULT 0,
      realized_pnl_raw TEXT,
      realized_pnl_usd REAL NOT NULL DEFAULT 0,
      funding_raw TEXT,
      funding_usd REAL NOT NULL DEFAULT 0,
      fee_raw TEXT,
      fee_usd REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(paper_account_id, market_type, coin, margin_mode)
    );

    CREATE TABLE IF NOT EXISTS paper_risk_snapshots (
      id TEXT PRIMARY KEY,
      ingest_sequence INTEGER,
      paper_account_id TEXT NOT NULL REFERENCES paper_accounts(id),
      quote_decimals INTEGER NOT NULL DEFAULT 8,
      equity_raw TEXT,
      equity_usd REAL NOT NULL,
      cash_balance_raw TEXT,
      cash_balance_usd REAL NOT NULL,
      total_notional_raw TEXT,
      total_notional_usd REAL NOT NULL,
      maintenance_margin_raw TEXT,
      maintenance_margin_usd REAL NOT NULL,
      unrealized_pnl_raw TEXT,
      unrealized_pnl_usd REAL NOT NULL,
      staleness_status TEXT NOT NULL,
      source_market_snapshot_id TEXT REFERENCES paper_market_snapshots(id),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS paper_risk_snapshots_account_created_idx
      ON paper_risk_snapshots(paper_account_id, created_at);

    CREATE TABLE IF NOT EXISTS paper_liquidation_events (
      id TEXT PRIMARY KEY,
      paper_account_id TEXT NOT NULL REFERENCES paper_accounts(id),
      position_id TEXT REFERENCES paper_positions(id),
      coin TEXT,
      price_decimals INTEGER NOT NULL DEFAULT 8,
      quote_decimals INTEGER NOT NULL DEFAULT 8,
      trigger_px_raw TEXT,
      trigger_px REAL,
      liquidation_px_raw TEXT,
      liquidation_px REAL,
      equity_raw TEXT,
      equity_usd REAL NOT NULL,
      maintenance_margin_raw TEXT,
      maintenance_margin_usd REAL NOT NULL,
      reason TEXT NOT NULL,
      market_snapshot_id TEXT REFERENCES paper_market_snapshots(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS paper_leaderboard_snapshots (
      id TEXT PRIMARY KEY,
      paper_account_id TEXT NOT NULL REFERENCES paper_accounts(id),
      agent_id TEXT NOT NULL,
      quote_decimals INTEGER NOT NULL DEFAULT 8,
      equity_raw TEXT,
      equity_usd REAL NOT NULL,
      paper_pnl_raw TEXT,
      paper_pnl_usd REAL NOT NULL,
      paper_pnl_pct REAL NOT NULL,
      max_drawdown_pct REAL NOT NULL,
      liquidation_count INTEGER NOT NULL,
      stale_data_status TEXT NOT NULL,
      source_risk_snapshot_id TEXT REFERENCES paper_risk_snapshots(id),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS paper_leaderboard_snapshots_rank_idx
      ON paper_leaderboard_snapshots(created_at, paper_pnl_pct);

    CREATE TABLE IF NOT EXISTS paper_audit_events (
      id TEXT PRIMARY KEY,
      ingest_sequence INTEGER,
      paper_account_id TEXT REFERENCES paper_accounts(id),
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      action TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      previous_hash TEXT,
      event_hash TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS paper_audit_events_subject_idx
      ON paper_audit_events(subject_type, subject_id);

    CREATE TABLE IF NOT EXISTS key_market_trades (
      id TEXT PRIMARY KEY,
      network_id TEXT NOT NULL,
      contract_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      trader_id TEXT NOT NULL,
      side TEXT NOT NULL,
      amount TEXT NOT NULL,
      tx_hash TEXT NOT NULL,
      receipt_id TEXT,
      block_hash TEXT,
      block_height TEXT,
      supply_after TEXT,
      trader_balance_after TEXT,
      reserve_after TEXT,
      price TEXT,
      protocol_fee TEXT,
      creator_fee TEXT,
      total_cost TEXT,
      payout TEXT,
      source TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(network_id, tx_hash)
    );

    CREATE INDEX IF NOT EXISTS key_market_trades_agent_created_idx
      ON key_market_trades(network_id, contract_id, agent_id, created_at);
    CREATE INDEX IF NOT EXISTS key_market_trades_trader_created_idx
      ON key_market_trades(network_id, trader_id, created_at);

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
	  ensureColumn(db, "boards", "agent_public_key", "TEXT");
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
  ensureColumn(db, "paper_market_snapshots", "ingest_sequence", "INTEGER");
  ensureColumn(db, "paper_market_snapshots", "market_type", "TEXT NOT NULL DEFAULT 'perp'");
  ensureColumn(db, "paper_market_snapshots", "max_leverage", "REAL");
  ensureColumn(db, "paper_accounts", "quote_decimals", "INTEGER NOT NULL DEFAULT 8");
  ensureColumn(db, "paper_accounts", "starting_balance_raw", "TEXT");
  ensureColumn(db, "paper_accounts", "cash_balance_raw", "TEXT");
  ensureColumn(db, "paper_market_snapshots", "price_decimals", "INTEGER NOT NULL DEFAULT 8");
  ensureColumn(db, "paper_market_snapshots", "mark_px_raw", "TEXT");
  ensureColumn(db, "paper_market_snapshots", "oracle_px_raw", "TEXT");
  ensureColumn(db, "paper_risk_snapshots", "ingest_sequence", "INTEGER");
  ensureColumn(db, "paper_audit_events", "ingest_sequence", "INTEGER");
  ensureColumn(db, "paper_orders", "market_type", "TEXT NOT NULL DEFAULT 'perp'");
  ensureColumn(db, "paper_orders", "price_decimals", "INTEGER NOT NULL DEFAULT 8");
  ensureColumn(db, "paper_orders", "size_decimals", "INTEGER NOT NULL DEFAULT 8");
  ensureColumn(db, "paper_orders", "quote_decimals", "INTEGER NOT NULL DEFAULT 8");
  ensureColumn(db, "paper_orders", "limit_px_raw", "TEXT");
  ensureColumn(db, "paper_orders", "size_raw", "TEXT");
  ensureColumn(db, "paper_orders", "remaining_size_raw", "TEXT");
  ensureColumn(db, "paper_orders", "reference_px_raw", "TEXT");
  ensureColumn(db, "paper_orders", "reference_px", "REAL");
  ensureColumn(db, "paper_orders", "max_reference_deviation_bps", "REAL");
  ensureColumn(db, "paper_orders", "reference_deviation_bps", "REAL");
  ensureColumn(db, "paper_orders", "avg_fill_px_raw", "TEXT");
  ensureColumn(db, "paper_orders", "notional_raw", "TEXT");
  ensureColumn(db, "paper_orders", "fee_raw", "TEXT");
  ensureColumn(db, "paper_fills", "market_type", "TEXT NOT NULL DEFAULT 'perp'");
  ensureColumn(db, "paper_fills", "price_decimals", "INTEGER NOT NULL DEFAULT 8");
  ensureColumn(db, "paper_fills", "size_decimals", "INTEGER NOT NULL DEFAULT 8");
  ensureColumn(db, "paper_fills", "quote_decimals", "INTEGER NOT NULL DEFAULT 8");
  ensureColumn(db, "paper_fills", "px_raw", "TEXT");
  ensureColumn(db, "paper_fills", "size_raw", "TEXT");
  ensureColumn(db, "paper_fills", "notional_raw", "TEXT");
  ensureColumn(db, "paper_fills", "fee_raw", "TEXT");
	  ensureColumn(db, "paper_positions", "market_type", "TEXT NOT NULL DEFAULT 'perp'");
  ensureColumn(db, "paper_positions", "price_decimals", "INTEGER NOT NULL DEFAULT 8");
  ensureColumn(db, "paper_positions", "size_decimals", "INTEGER NOT NULL DEFAULT 8");
  ensureColumn(db, "paper_positions", "quote_decimals", "INTEGER NOT NULL DEFAULT 8");
  ensureColumn(db, "paper_positions", "signed_size_raw", "TEXT");
  ensureColumn(db, "paper_positions", "entry_px_raw", "TEXT");
  ensureColumn(db, "paper_positions", "isolated_margin_raw", "TEXT");
  ensureColumn(db, "paper_positions", "realized_pnl_raw", "TEXT");
  ensureColumn(db, "paper_positions", "funding_raw", "TEXT");
  ensureColumn(db, "paper_positions", "fee_raw", "TEXT");
  ensureColumn(db, "paper_risk_snapshots", "quote_decimals", "INTEGER NOT NULL DEFAULT 8");
  ensureColumn(db, "paper_risk_snapshots", "equity_raw", "TEXT");
  ensureColumn(db, "paper_risk_snapshots", "cash_balance_raw", "TEXT");
  ensureColumn(db, "paper_risk_snapshots", "total_notional_raw", "TEXT");
  ensureColumn(db, "paper_risk_snapshots", "maintenance_margin_raw", "TEXT");
  ensureColumn(db, "paper_risk_snapshots", "unrealized_pnl_raw", "TEXT");
  ensureColumn(db, "paper_liquidation_events", "price_decimals", "INTEGER NOT NULL DEFAULT 8");
  ensureColumn(db, "paper_liquidation_events", "quote_decimals", "INTEGER NOT NULL DEFAULT 8");
  ensureColumn(db, "paper_liquidation_events", "trigger_px_raw", "TEXT");
  ensureColumn(db, "paper_liquidation_events", "liquidation_px_raw", "TEXT");
  ensureColumn(db, "paper_liquidation_events", "equity_raw", "TEXT");
  ensureColumn(db, "paper_liquidation_events", "maintenance_margin_raw", "TEXT");
  ensureColumn(db, "paper_leaderboard_snapshots", "quote_decimals", "INTEGER NOT NULL DEFAULT 8");
  ensureColumn(db, "paper_leaderboard_snapshots", "equity_raw", "TEXT");
  ensureColumn(db, "paper_leaderboard_snapshots", "paper_pnl_raw", "TEXT");

	  db.exec(`
	    UPDATE boards
	      SET agent_public_key = public_key
	      WHERE agent_public_key IS NULL OR agent_public_key = '';
	  `);

  if (hasColumn(db, "pnl_snapshots", "starting_value_usd")) {
    db.exec(`
      UPDATE pnl_snapshots
        SET total_pnl_pct = CASE
          WHEN starting_value_usd = 0 THEN NULL
          ELSE pnl_usd / starting_value_usd
        END
        WHERE total_pnl_pct IS NULL;
    `);
  }

  if (hasColumn(db, "boards", "starting_value_usd")) {
    db.exec(`
      INSERT OR IGNORE INTO paper_accounts
        (id, board_id, agent_id, agent_public_key, base_currency, quote_decimals,
         starting_balance_raw, starting_balance_usd, cash_balance_raw, cash_balance_usd,
         status, allowed_markets_json, metadata_json, created_at, updated_at)
        SELECT
          'paper_legacy_' || id,
	          id,
	          agent_id,
	          COALESCE(NULLIF(agent_public_key, ''), public_key),
          COALESCE(NULLIF(base_currency, ''), 'USD'),
          8,
          printf('%.0f', starting_value_usd * 100000000),
          starting_value_usd,
          printf('%.0f', starting_value_usd * 100000000),
          starting_value_usd,
          'active',
          NULL,
          '{"source":"migration","reason":"legacy_board_starting_value"}',
          created_at,
          created_at
        FROM boards
        WHERE starting_value_usd > 0
          AND NOT EXISTS (
            SELECT 1 FROM paper_accounts WHERE paper_accounts.board_id = boards.id
          );
    `);
  }

  dropColumnIfExists(db, "pnl_snapshots", "starting_value_usd");
  dropColumnIfExists(db, "boards", "starting_value_usd");

  backfillPaperAtomColumns(db);

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

function backfillPaperAtomColumns(db: Database) {
  db.exec(`
    UPDATE paper_accounts
      SET starting_balance_raw = COALESCE(starting_balance_raw, printf('%.0f', starting_balance_usd * 100000000)),
          cash_balance_raw = COALESCE(cash_balance_raw, printf('%.0f', cash_balance_usd * 100000000)),
          quote_decimals = COALESCE(quote_decimals, 8);

    UPDATE paper_market_snapshots
      SET mark_px_raw = COALESCE(mark_px_raw, printf('%.0f', mark_px * 100000000)),
          oracle_px_raw = CASE
            WHEN oracle_px IS NULL THEN oracle_px_raw
            ELSE COALESCE(oracle_px_raw, printf('%.0f', oracle_px * 100000000))
          END,
          price_decimals = COALESCE(price_decimals, 8);

    UPDATE paper_orders
      SET limit_px_raw = CASE
            WHEN limit_px IS NULL THEN limit_px_raw
            ELSE COALESCE(limit_px_raw, printf('%.0f', limit_px * 100000000))
          END,
          size_raw = COALESCE(size_raw, printf('%.0f', size * 100000000)),
          remaining_size_raw = COALESCE(remaining_size_raw, printf('%.0f', remaining_size * 100000000)),
          reference_px_raw = CASE
            WHEN reference_px IS NULL THEN reference_px_raw
            ELSE COALESCE(reference_px_raw, printf('%.0f', reference_px * 100000000))
          END,
          avg_fill_px_raw = CASE
            WHEN avg_fill_px IS NULL THEN avg_fill_px_raw
            ELSE COALESCE(avg_fill_px_raw, printf('%.0f', avg_fill_px * 100000000))
          END,
          notional_raw = COALESCE(notional_raw, printf('%.0f', notional_usd * 100000000)),
          fee_raw = COALESCE(fee_raw, printf('%.0f', fee_usd * 100000000)),
          price_decimals = COALESCE(price_decimals, 8),
          size_decimals = COALESCE(size_decimals, 8),
          quote_decimals = COALESCE(quote_decimals, 8);

    UPDATE paper_fills
      SET px_raw = COALESCE(px_raw, printf('%.0f', px * 100000000)),
          size_raw = COALESCE(size_raw, printf('%.0f', size * 100000000)),
          notional_raw = COALESCE(notional_raw, printf('%.0f', notional_usd * 100000000)),
          fee_raw = COALESCE(fee_raw, printf('%.0f', fee_usd * 100000000)),
          price_decimals = COALESCE(price_decimals, 8),
          size_decimals = COALESCE(size_decimals, 8),
          quote_decimals = COALESCE(quote_decimals, 8);

    UPDATE paper_positions
      SET signed_size_raw = COALESCE(signed_size_raw, printf('%.0f', signed_size * 100000000)),
          entry_px_raw = COALESCE(entry_px_raw, printf('%.0f', entry_px * 100000000)),
          isolated_margin_raw = COALESCE(isolated_margin_raw, printf('%.0f', isolated_margin_usd * 100000000)),
          realized_pnl_raw = COALESCE(realized_pnl_raw, printf('%.0f', realized_pnl_usd * 100000000)),
          funding_raw = COALESCE(funding_raw, printf('%.0f', funding_usd * 100000000)),
          fee_raw = COALESCE(fee_raw, printf('%.0f', fee_usd * 100000000)),
          price_decimals = COALESCE(price_decimals, 8),
          size_decimals = COALESCE(size_decimals, 8),
          quote_decimals = COALESCE(quote_decimals, 8);

    UPDATE paper_risk_snapshots
      SET equity_raw = COALESCE(equity_raw, printf('%.0f', equity_usd * 100000000)),
          cash_balance_raw = COALESCE(cash_balance_raw, printf('%.0f', cash_balance_usd * 100000000)),
          total_notional_raw = COALESCE(total_notional_raw, printf('%.0f', total_notional_usd * 100000000)),
          maintenance_margin_raw = COALESCE(maintenance_margin_raw, printf('%.0f', maintenance_margin_usd * 100000000)),
          unrealized_pnl_raw = COALESCE(unrealized_pnl_raw, printf('%.0f', unrealized_pnl_usd * 100000000)),
          quote_decimals = COALESCE(quote_decimals, 8);

    UPDATE paper_liquidation_events
      SET trigger_px_raw = CASE
            WHEN trigger_px IS NULL THEN trigger_px_raw
            ELSE COALESCE(trigger_px_raw, printf('%.0f', trigger_px * 100000000))
          END,
          liquidation_px_raw = CASE
            WHEN liquidation_px IS NULL THEN liquidation_px_raw
            ELSE COALESCE(liquidation_px_raw, printf('%.0f', liquidation_px * 100000000))
          END,
          equity_raw = COALESCE(equity_raw, printf('%.0f', equity_usd * 100000000)),
          maintenance_margin_raw = COALESCE(maintenance_margin_raw, printf('%.0f', maintenance_margin_usd * 100000000)),
          price_decimals = COALESCE(price_decimals, 8),
          quote_decimals = COALESCE(quote_decimals, 8);

    UPDATE paper_leaderboard_snapshots
      SET equity_raw = COALESCE(equity_raw, printf('%.0f', equity_usd * 100000000)),
          paper_pnl_raw = COALESCE(paper_pnl_raw, printf('%.0f', paper_pnl_usd * 100000000)),
          quote_decimals = COALESCE(quote_decimals, 8);
  `);
}

function ensureColumn(db: Database, table: string, column: string, definition: string) {
  const columns = db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all();
  if (columns.some((existing) => existing.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function hasColumn(db: Database, table: string, column: string) {
  const columns = db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all();
  return columns.some((existing) => existing.name === column);
}

function dropColumnIfExists(db: Database, table: string, column: string) {
  if (!hasColumn(db, table, column)) return;
  db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
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

export function requiredPositiveNumber(value: unknown, name: string) {
  const parsed = requiredNumber(value, name);
  if (parsed <= 0) throw new RequestError(`${name} must be greater than 0`, 400);
  return parsed;
}

export function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError("Request body must be a JSON object", 400);
  }
  return value as JsonObject;
}

export function normalizeBodyFields(value: unknown): JsonObject {
  const raw = asObject(value);
  const normalized: JsonObject = { ...raw };
  for (const [key, fieldValue] of Object.entries(raw)) {
    if (!key.includes("_")) continue;
    const camelKey = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    normalized[camelKey] ??= fieldValue;
  }
  return normalized;
}

export function stringifyOptional(value: unknown) {
  return value === undefined ? null : JSON.stringify(value);
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
