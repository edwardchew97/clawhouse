export const neonSchemaStatements = [
  `
    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
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
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS auth_nonces (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      nonce TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      body_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(board_id, wallet_address, nonce)
    )
  `,
  `
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
      amount_in DOUBLE PRECISION,
      asset_out TEXT,
      amount_out DOUBLE PRECISION,
      reason TEXT,
      metadata_json TEXT,
      reported_at TEXT,
      created_at TEXT NOT NULL
    )
  `,
  "CREATE INDEX IF NOT EXISTS events_board_created_idx ON events(board_id, created_at)",
  "CREATE INDEX IF NOT EXISTS events_client_event_idx ON events(board_id, client_event_id)",
  "CREATE INDEX IF NOT EXISTS events_tx_hash_idx ON events(board_id, tx_hash)",
  "CREATE INDEX IF NOT EXISTS events_intent_idx ON events(board_id, intent_id)",
  `
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id),
      board_id TEXT NOT NULL REFERENCES boards(id),
      attachment_type TEXT NOT NULL,
      reason TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS observations (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id),
      wallet_address TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      current_value_usd DOUBLE PRECISION NOT NULL,
      topup_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
      withdrawal_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
      client_event_id TEXT,
      tx_hash TEXT,
      intent_id TEXT,
      status_claim TEXT,
      asset_in TEXT,
      amount_in DOUBLE PRECISION,
      asset_out TEXT,
      amount_out DOUBLE PRECISION,
      metadata_json TEXT,
      event_id TEXT REFERENCES events(id),
      created_at TEXT NOT NULL
    )
  `,
  "CREATE INDEX IF NOT EXISTS observations_board_observed_idx ON observations(board_id, observed_at)",
  `
    CREATE TABLE IF NOT EXISTS holding_snapshots (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id),
      wallet_address TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      current_value_usd DOUBLE PRECISION NOT NULL,
      source_observation_id TEXT NOT NULL REFERENCES observations(id),
      created_at TEXT NOT NULL
    )
  `,
  `
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
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS balance_changes (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id),
      tracked_wallet_id TEXT REFERENCES tracked_wallets(id),
      wallet_address TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      asset_symbol TEXT,
      raw_amount TEXT,
      normalized_amount DOUBLE PRECISION,
      decimals INTEGER,
      delta_amount DOUBLE PRECISION,
      delta_value_usd DOUBLE PRECISION,
      change_type TEXT NOT NULL,
      source_observation_id TEXT REFERENCES observations(id),
      source_event_id TEXT REFERENCES events(id),
      tx_hash TEXT,
      intent_id TEXT,
      visibility_status TEXT NOT NULL DEFAULT 'complete',
      metadata_json TEXT,
      created_at TEXT NOT NULL
    )
  `,
  "CREATE INDEX IF NOT EXISTS balance_changes_board_observed_idx ON balance_changes(board_id, observed_at)",
  "CREATE INDEX IF NOT EXISTS balance_changes_wallet_asset_idx ON balance_changes(wallet_address, asset_id, observed_at)",
  `
    CREATE TABLE IF NOT EXISTS price_snapshots (
      id TEXT PRIMARY KEY,
      board_id TEXT REFERENCES boards(id),
      asset_id TEXT NOT NULL,
      asset_symbol TEXT,
      price_usd DOUBLE PRECISION,
      price_source TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      staleness_status TEXT NOT NULL DEFAULT 'fresh',
      metadata_json TEXT,
      created_at TEXT NOT NULL
    )
  `,
  "CREATE INDEX IF NOT EXISTS price_snapshots_asset_observed_idx ON price_snapshots(asset_id, observed_at)",
  `
    CREATE TABLE IF NOT EXISTS pnl_snapshots (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id),
      agent_id TEXT,
      observed_at TEXT NOT NULL,
      current_value_usd DOUBLE PRECISION NOT NULL,
      net_topups_usd DOUBLE PRECISION NOT NULL,
      net_withdrawals_usd DOUBLE PRECISION NOT NULL,
      pnl_usd DOUBLE PRECISION NOT NULL,
      holding_snapshot_id TEXT REFERENCES holding_snapshots(id),
      price_snapshot_id TEXT REFERENCES price_snapshots(id),
      total_pnl_pct DOUBLE PRECISION,
      drawdown_pct DOUBLE PRECISION,
      high_water_mark_usd DOUBLE PRECISION,
      observed_trade_count INTEGER NOT NULL DEFAULT 0,
      failed_event_count INTEGER NOT NULL DEFAULT 0,
      reason_missing_count INTEGER NOT NULL DEFAULT 0,
      staleness_status TEXT NOT NULL DEFAULT 'unknown',
      completeness_status TEXT NOT NULL DEFAULT 'unknown',
      created_at TEXT NOT NULL
    )
  `,
  `
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
    )
  `,
  "CREATE INDEX IF NOT EXISTS read_access_checks_board_checked_idx ON read_access_checks(board_id, checked_at)",
  `
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
    )
  `,
  "CREATE INDEX IF NOT EXISTS audit_events_board_created_idx ON audit_events(board_id, created_at)",
  `
    CREATE TABLE IF NOT EXISTS paper_accounts (
      id TEXT PRIMARY KEY,
      board_id TEXT REFERENCES boards(id),
      agent_id TEXT NOT NULL,
      agent_public_key TEXT NOT NULL,
      base_currency TEXT NOT NULL DEFAULT 'USD',
      starting_balance_usd DOUBLE PRECISION NOT NULL,
      cash_balance_usd DOUBLE PRECISION NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      allowed_markets_json TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `,
  "CREATE UNIQUE INDEX IF NOT EXISTS paper_accounts_board_unique_idx ON paper_accounts(board_id) WHERE board_id IS NOT NULL",
  `
    CREATE TABLE IF NOT EXISTS paper_auth_nonces (
      id TEXT PRIMARY KEY,
      paper_account_id TEXT NOT NULL REFERENCES paper_accounts(id),
      nonce TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      body_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(paper_account_id, nonce)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS paper_market_snapshots (
      id TEXT PRIMARY KEY,
      coin TEXT NOT NULL,
      source TEXT NOT NULL,
      mark_px DOUBLE PRECISION NOT NULL,
      oracle_px DOUBLE PRECISION,
      funding_rate DOUBLE PRECISION,
      max_leverage DOUBLE PRECISION,
      maintenance_margin_rate DOUBLE PRECISION NOT NULL,
      book_json TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      staleness_status TEXT NOT NULL DEFAULT 'fresh',
      created_at TEXT NOT NULL
    )
  `,
  "CREATE INDEX IF NOT EXISTS paper_market_snapshots_coin_observed_idx ON paper_market_snapshots(coin, observed_at)",
  `
    CREATE TABLE IF NOT EXISTS paper_orders (
      id TEXT PRIMARY KEY,
      paper_account_id TEXT NOT NULL REFERENCES paper_accounts(id),
      agent_id TEXT NOT NULL,
      client_order_id TEXT NOT NULL,
      coin TEXT NOT NULL,
      side TEXT NOT NULL,
      tif TEXT NOT NULL,
      limit_px DOUBLE PRECISION,
      size DOUBLE PRECISION NOT NULL,
      remaining_size DOUBLE PRECISION NOT NULL,
      reduce_only INTEGER NOT NULL DEFAULT 0,
      margin_mode TEXT NOT NULL,
      leverage DOUBLE PRECISION NOT NULL,
      max_slippage_bps DOUBLE PRECISION NOT NULL,
      status TEXT NOT NULL,
      reject_reason TEXT,
      reason TEXT,
      strategy_hash TEXT,
      market_snapshot_id TEXT REFERENCES paper_market_snapshots(id),
      avg_fill_px DOUBLE PRECISION,
      notional_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
      fee_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
      body_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(paper_account_id, client_order_id)
    )
  `,
  "CREATE INDEX IF NOT EXISTS paper_orders_account_created_idx ON paper_orders(paper_account_id, created_at)",
  "CREATE INDEX IF NOT EXISTS paper_orders_status_idx ON paper_orders(status, coin)",
  `
    CREATE TABLE IF NOT EXISTS paper_fills (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES paper_orders(id),
      paper_account_id TEXT NOT NULL REFERENCES paper_accounts(id),
      coin TEXT NOT NULL,
      side TEXT NOT NULL,
      px DOUBLE PRECISION NOT NULL,
      size DOUBLE PRECISION NOT NULL,
      notional_usd DOUBLE PRECISION NOT NULL,
      fee_usd DOUBLE PRECISION NOT NULL,
      liquidity TEXT NOT NULL,
      market_snapshot_id TEXT NOT NULL REFERENCES paper_market_snapshots(id),
      created_at TEXT NOT NULL
    )
  `,
  "CREATE INDEX IF NOT EXISTS paper_fills_account_created_idx ON paper_fills(paper_account_id, created_at)",
  `
    CREATE TABLE IF NOT EXISTS paper_positions (
      id TEXT PRIMARY KEY,
      paper_account_id TEXT NOT NULL REFERENCES paper_accounts(id),
      coin TEXT NOT NULL,
      margin_mode TEXT NOT NULL,
      signed_size DOUBLE PRECISION NOT NULL,
      entry_px DOUBLE PRECISION NOT NULL,
      leverage DOUBLE PRECISION NOT NULL,
      isolated_margin_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
      realized_pnl_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
      funding_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
      fee_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(paper_account_id, coin, margin_mode)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS paper_risk_snapshots (
      id TEXT PRIMARY KEY,
      paper_account_id TEXT NOT NULL REFERENCES paper_accounts(id),
      equity_usd DOUBLE PRECISION NOT NULL,
      cash_balance_usd DOUBLE PRECISION NOT NULL,
      total_notional_usd DOUBLE PRECISION NOT NULL,
      maintenance_margin_usd DOUBLE PRECISION NOT NULL,
      unrealized_pnl_usd DOUBLE PRECISION NOT NULL,
      staleness_status TEXT NOT NULL,
      source_market_snapshot_id TEXT REFERENCES paper_market_snapshots(id),
      created_at TEXT NOT NULL
    )
  `,
  "CREATE INDEX IF NOT EXISTS paper_risk_snapshots_account_created_idx ON paper_risk_snapshots(paper_account_id, created_at)",
  `
    CREATE TABLE IF NOT EXISTS paper_liquidation_events (
      id TEXT PRIMARY KEY,
      paper_account_id TEXT NOT NULL REFERENCES paper_accounts(id),
      position_id TEXT REFERENCES paper_positions(id),
      coin TEXT,
      trigger_px DOUBLE PRECISION,
      liquidation_px DOUBLE PRECISION,
      equity_usd DOUBLE PRECISION NOT NULL,
      maintenance_margin_usd DOUBLE PRECISION NOT NULL,
      reason TEXT NOT NULL,
      market_snapshot_id TEXT REFERENCES paper_market_snapshots(id),
      created_at TEXT NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS paper_leaderboard_snapshots (
      id TEXT PRIMARY KEY,
      paper_account_id TEXT NOT NULL REFERENCES paper_accounts(id),
      agent_id TEXT NOT NULL,
      equity_usd DOUBLE PRECISION NOT NULL,
      paper_pnl_usd DOUBLE PRECISION NOT NULL,
      paper_pnl_pct DOUBLE PRECISION NOT NULL,
      max_drawdown_pct DOUBLE PRECISION NOT NULL,
      liquidation_count INTEGER NOT NULL,
      stale_data_status TEXT NOT NULL,
      source_risk_snapshot_id TEXT REFERENCES paper_risk_snapshots(id),
      created_at TEXT NOT NULL
    )
  `,
  "CREATE INDEX IF NOT EXISTS paper_leaderboard_snapshots_rank_idx ON paper_leaderboard_snapshots(created_at, paper_pnl_pct)",
  `
    CREATE TABLE IF NOT EXISTS paper_audit_events (
      id TEXT PRIMARY KEY,
      paper_account_id TEXT REFERENCES paper_accounts(id),
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      action TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      previous_hash TEXT,
      event_hash TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    )
  `,
  "CREATE INDEX IF NOT EXISTS paper_audit_events_subject_idx ON paper_audit_events(subject_type, subject_id)",
  "ALTER TABLE boards ADD COLUMN IF NOT EXISTS chain TEXT DEFAULT 'near'",
  "ALTER TABLE boards ADD COLUMN IF NOT EXISTS venue_namespace TEXT DEFAULT 'near-intents'",
  "ALTER TABLE boards ADD COLUMN IF NOT EXISTS tracking_started_at TEXT",
  "ALTER TABLE boards ADD COLUMN IF NOT EXISTS owner_wallet_address TEXT",
  "ALTER TABLE boards ADD COLUMN IF NOT EXISTS funding_source TEXT",
  "ALTER TABLE boards ADD COLUMN IF NOT EXISTS funding_tx_hash TEXT",
  "ALTER TABLE boards ADD COLUMN IF NOT EXISTS metadata_json TEXT",
  "ALTER TABLE auth_nonces ADD COLUMN IF NOT EXISTS body_hash TEXT",
  "ALTER TABLE events ADD COLUMN IF NOT EXISTS reported_at TEXT",
  "ALTER TABLE pnl_snapshots ADD COLUMN IF NOT EXISTS agent_id TEXT",
  "ALTER TABLE pnl_snapshots ADD COLUMN IF NOT EXISTS holding_snapshot_id TEXT REFERENCES holding_snapshots(id)",
  "ALTER TABLE pnl_snapshots ADD COLUMN IF NOT EXISTS price_snapshot_id TEXT REFERENCES price_snapshots(id)",
  "ALTER TABLE pnl_snapshots ADD COLUMN IF NOT EXISTS total_pnl_pct DOUBLE PRECISION",
  "ALTER TABLE pnl_snapshots ADD COLUMN IF NOT EXISTS drawdown_pct DOUBLE PRECISION",
  "ALTER TABLE pnl_snapshots ADD COLUMN IF NOT EXISTS high_water_mark_usd DOUBLE PRECISION",
  "ALTER TABLE pnl_snapshots ADD COLUMN IF NOT EXISTS observed_trade_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE pnl_snapshots ADD COLUMN IF NOT EXISTS failed_event_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE pnl_snapshots ADD COLUMN IF NOT EXISTS reason_missing_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE pnl_snapshots ADD COLUMN IF NOT EXISTS staleness_status TEXT NOT NULL DEFAULT 'unknown'",
  "ALTER TABLE pnl_snapshots ADD COLUMN IF NOT EXISTS completeness_status TEXT NOT NULL DEFAULT 'unknown'",
  "ALTER TABLE paper_market_snapshots ADD COLUMN IF NOT EXISTS max_leverage DOUBLE PRECISION",
  `
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'pnl_snapshots'
          AND column_name = 'starting_value_usd'
      ) THEN
        EXECUTE 'UPDATE pnl_snapshots
          SET total_pnl_pct = CASE
            WHEN starting_value_usd = 0 THEN NULL
            ELSE pnl_usd / starting_value_usd
          END
          WHERE total_pnl_pct IS NULL';
      END IF;
    END $$;
  `,
  "ALTER TABLE pnl_snapshots DROP COLUMN IF EXISTS starting_value_usd",
  "ALTER TABLE boards DROP COLUMN IF EXISTS starting_value_usd",
  "UPDATE boards SET chain = 'near' WHERE chain IS NULL OR chain = ''",
  "UPDATE boards SET venue_namespace = 'near-intents' WHERE venue_namespace IS NULL OR venue_namespace = ''",
  "UPDATE boards SET tracking_started_at = created_at WHERE tracking_started_at IS NULL OR tracking_started_at = ''",
  "UPDATE events SET reported_at = created_at WHERE (reported_at IS NULL OR reported_at = '') AND event_type != 'discovered_without_reason'",
  `
    INSERT INTO tracked_wallets
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
      FROM boards
      WHERE true
      ON CONFLICT (board_id, wallet_address) DO NOTHING
  `,
  `
    UPDATE pnl_snapshots
      SET agent_id = boards.agent_id
      FROM boards
      WHERE boards.id = pnl_snapshots.board_id
        AND pnl_snapshots.agent_id IS NULL
  `,
  `
    UPDATE pnl_snapshots
      SET high_water_mark_usd = prior.high_water_mark_usd
      FROM (
        SELECT current_row.id, MAX(prior_row.current_value_usd) AS high_water_mark_usd
        FROM pnl_snapshots AS current_row
        JOIN pnl_snapshots AS prior_row
          ON prior_row.board_id = current_row.board_id
         AND prior_row.observed_at <= current_row.observed_at
        GROUP BY current_row.id
      ) AS prior
      WHERE prior.id = pnl_snapshots.id
        AND pnl_snapshots.high_water_mark_usd IS NULL
  `,
  `
    UPDATE pnl_snapshots
      SET drawdown_pct = CASE
        WHEN high_water_mark_usd > 0 THEN (high_water_mark_usd - current_value_usd) / high_water_mark_usd
        ELSE 0
      END
      WHERE drawdown_pct IS NULL
  `,
  "UPDATE pnl_snapshots SET staleness_status = 'unknown' WHERE staleness_status IS NULL OR staleness_status = ''",
  "UPDATE pnl_snapshots SET completeness_status = 'unknown' WHERE completeness_status IS NULL OR completeness_status = ''",
] as const;

export const neonRequiredTables = [
  "boards",
  "auth_nonces",
  "events",
  "attachments",
  "observations",
  "holding_snapshots",
  "tracked_wallets",
  "balance_changes",
  "price_snapshots",
  "pnl_snapshots",
  "read_access_checks",
  "audit_events",
  "paper_accounts",
  "paper_auth_nonces",
  "paper_market_snapshots",
  "paper_orders",
  "paper_fills",
  "paper_positions",
  "paper_risk_snapshots",
  "paper_liquidation_events",
  "paper_leaderboard_snapshots",
  "paper_audit_events",
] as const;
