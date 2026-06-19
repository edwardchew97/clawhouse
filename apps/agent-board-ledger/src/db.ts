import { mkdirSync } from "node:fs";
import { dirname, normalize, join } from "node:path";
import { Database } from "bun:sqlite";
import type {
  AttachmentRow,
  Board,
  EventRow,
  HoldingSnapshot,
  ObservationRow,
  PnlSnapshot,
} from "./types";

const repoRoot = normalize(join(import.meta.dir, "../../.."));

export function defaultDbPath() {
  return process.env.AGENT_BOARD_LEDGER_DB ?? join(repoRoot, "work/agent-board-ledger/dev.sqlite");
}

export function openLedgerDb(path = defaultDbPath()) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  migrate(db);
  return db;
}

export function migrate(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      public_key TEXT NOT NULL,
      starting_value_usd REAL NOT NULL,
      base_currency TEXT NOT NULL,
      public_status TEXT NOT NULL,
      visibility_mode TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_nonces (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      nonce TEXT NOT NULL,
      timestamp TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS pnl_snapshots (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id),
      observed_at TEXT NOT NULL,
      starting_value_usd REAL NOT NULL,
      current_value_usd REAL NOT NULL,
      net_topups_usd REAL NOT NULL,
      net_withdrawals_usd REAL NOT NULL,
      pnl_usd REAL NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

export function getBoard(db: Database, boardId: string) {
  return db.query<Board, [string]>("SELECT * FROM boards WHERE id = ?").get(boardId);
}

export function listEvents(db: Database, boardId: string) {
  return db
    .query<EventRow, [string]>("SELECT * FROM events WHERE board_id = ? ORDER BY created_at ASC, id ASC")
    .all(boardId);
}

export function listAttachments(db: Database, eventId: string) {
  return db
    .query<AttachmentRow, [string]>(
      "SELECT * FROM attachments WHERE event_id = ? ORDER BY created_at ASC, id ASC",
    )
    .all(eventId);
}

export function findEventByAssociations(
  db: Database,
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

  return db
    .query<EventRow, string[]>(
      `SELECT * FROM events WHERE board_id = ? AND (${clauses.join(" OR ")}) ORDER BY created_at ASC LIMIT 1`,
    )
    .get(...values);
}

export function latestObservation(db: Database, boardId: string) {
  return db
    .query<ObservationRow, [string]>(
      "SELECT * FROM observations WHERE board_id = ? ORDER BY observed_at DESC, created_at DESC, id DESC LIMIT 1",
    )
    .get(boardId);
}

export function latestHoldingSnapshot(db: Database, boardId: string) {
  return db
    .query<HoldingSnapshot, [string]>(
      "SELECT * FROM holding_snapshots WHERE board_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
    )
    .get(boardId);
}

export function latestPnlSnapshot(db: Database, boardId: string) {
  return db
    .query<PnlSnapshot, [string]>(
      "SELECT * FROM pnl_snapshots WHERE board_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
    )
    .get(boardId);
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
