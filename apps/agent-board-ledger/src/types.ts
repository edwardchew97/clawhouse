export type JsonObject = Record<string, unknown>;

export type Board = {
  id: string;
  agent_id: string;
  agent_public_key: string | null;
  wallet_address: string;
  public_key: string;
  chain: string | null;
  venue_namespace: string | null;
  tracking_started_at: string | null;
  base_currency: string;
  public_status: string;
  visibility_mode: string;
  owner_wallet_address: string | null;
  funding_source: string | null;
  funding_tx_hash: string | null;
  metadata_json: string | null;
  created_at: string;
};

export type AgentRegistrationRow = {
  agent_id: string;
  agent_public_key: string;
  status: string;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
};

export type EventRow = {
  id: string;
  board_id: string;
  agent_id: string;
  wallet_address: string;
  event_type: string;
  client_event_id: string | null;
  tx_hash: string | null;
  intent_id: string | null;
  status_claim: string | null;
  asset_in: string | null;
  amount_in: number | null;
  asset_out: string | null;
  amount_out: number | null;
  reason: string | null;
  metadata_json: string | null;
  reported_at: string | null;
  created_at: string;
};

export type AttachmentRow = {
  id: string;
  event_id: string;
  board_id: string;
  attachment_type: string;
  reason: string | null;
  metadata_json: string | null;
  created_at: string;
};

export type ObservationRow = {
  id: string;
  board_id: string;
  wallet_address: string;
  observed_at: string;
  current_value_usd: number;
  topup_usd: number;
  withdrawal_usd: number;
  client_event_id: string | null;
  tx_hash: string | null;
  intent_id: string | null;
  status_claim: string | null;
  asset_in: string | null;
  amount_in: number | null;
  asset_out: string | null;
  amount_out: number | null;
  metadata_json: string | null;
  event_id: string | null;
  created_at: string;
};

export type HoldingSnapshot = {
  id: string;
  board_id: string;
  wallet_address: string;
  observed_at: string;
  current_value_usd: number;
  source_observation_id: string;
  created_at: string;
};

export type PnlSnapshot = {
  id: string;
  board_id: string;
  agent_id: string | null;
  observed_at: string;
  current_value_usd: number;
  net_topups_usd: number;
  net_withdrawals_usd: number;
  pnl_usd: number;
  holding_snapshot_id: string | null;
  price_snapshot_id: string | null;
  total_pnl_pct: number | null;
  drawdown_pct: number | null;
  high_water_mark_usd: number | null;
  observed_trade_count: number;
  failed_event_count: number;
  reason_missing_count: number;
  staleness_status: string;
  completeness_status: string;
  created_at: string;
};

export type TrackedWalletRow = {
  id: string;
  board_id: string;
  agent_id: string;
  wallet_address: string;
  public_key: string | null;
  chain: string;
  venue_namespace: string;
  tracking_started_at: string;
  tracking_status: string;
  source: string;
  metadata_json: string | null;
  created_at: string;
};

export type BalanceChangeRow = {
  id: string;
  board_id: string;
  tracked_wallet_id: string | null;
  wallet_address: string;
  observed_at: string;
  asset_id: string;
  asset_symbol: string | null;
  raw_amount: string | null;
  normalized_amount: number | null;
  decimals: number | null;
  delta_amount: number | null;
  delta_value_usd: number | null;
  change_type: string;
  source_observation_id: string | null;
  source_event_id: string | null;
  tx_hash: string | null;
  intent_id: string | null;
  visibility_status: string;
  metadata_json: string | null;
  created_at: string;
};

export type PriceSnapshotRow = {
  id: string;
  board_id: string | null;
  asset_id: string;
  asset_symbol: string | null;
  price_usd: number | null;
  price_source: string;
  observed_at: string;
  staleness_status: string;
  metadata_json: string | null;
  created_at: string;
};

export type ReadAccessCheckRow = {
  id: string;
  board_id: string;
  requester_wallet_address: string | null;
  access_level: string;
  access_result: string;
  reason: string | null;
  key_contract_id: string | null;
  checked_at: string;
  metadata_json: string | null;
  created_at: string;
};

export type KeyMarketTradeRow = {
  id: string;
  network_id: string;
  contract_id: string;
  agent_id: string;
  trader_id: string;
  side: string;
  amount: string;
  tx_hash: string;
  receipt_id: string | null;
  block_hash: string | null;
  block_height: string | null;
  supply_after: string | null;
  trader_balance_after: string | null;
  reserve_after: string | null;
  price: string | null;
  protocol_fee: string | null;
  creator_fee: string | null;
  total_cost: string | null;
  payout: string | null;
  source: string;
  metadata_json: string | null;
  created_at: string;
};

export type AuditEventRow = {
  id: string;
  board_id: string | null;
  actor_type: string;
  actor_id: string | null;
  action: string;
  result: string;
  subject_type: string | null;
  subject_id: string | null;
  metadata_json: string | null;
  created_at: string;
};

export type PaperAccountRow = {
  id: string;
  board_id: string | null;
  agent_id: string;
  agent_public_key: string;
  base_currency: string;
  quote_decimals: number;
  starting_balance_raw: string | null;
  starting_balance_usd: number;
  cash_balance_raw: string | null;
  cash_balance_usd: number;
  status: string;
  allowed_markets_json: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
};

export type PaperMarketSnapshotRow = {
  id: string;
  ingest_sequence: number | null;
  market_type: string;
  coin: string;
  source: string;
  price_decimals: number;
  mark_px_raw: string | null;
  mark_px: number;
  oracle_px_raw: string | null;
  oracle_px: number | null;
  funding_rate: number | null;
  max_leverage: number | null;
  maintenance_margin_rate: number;
  book_json: string;
  observed_at: string;
  staleness_status: string;
  created_at: string;
};

export type PaperOrderRow = {
  id: string;
  paper_account_id: string;
  agent_id: string;
  client_order_id: string;
  market_type: string;
  coin: string;
  side: string;
  tif: string;
  price_decimals: number;
  size_decimals: number;
  quote_decimals: number;
  limit_px_raw: string | null;
  limit_px: number | null;
  size_raw: string | null;
  size: number;
  remaining_size_raw: string | null;
  remaining_size: number;
  reduce_only: number;
  margin_mode: string;
  leverage: number;
  max_slippage_bps: number;
  reference_px_raw: string | null;
  reference_px: number | null;
  max_reference_deviation_bps: number | null;
  reference_deviation_bps: number | null;
  status: string;
  reject_reason: string | null;
  reason: string | null;
  strategy_hash: string | null;
  market_snapshot_id: string | null;
  avg_fill_px_raw: string | null;
  avg_fill_px: number | null;
  notional_raw: string | null;
  notional_usd: number;
  fee_raw: string | null;
  fee_usd: number;
  body_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type PaperFillRow = {
  id: string;
  order_id: string;
  paper_account_id: string;
  market_type: string;
  coin: string;
  side: string;
  price_decimals: number;
  size_decimals: number;
  quote_decimals: number;
  px_raw: string | null;
  px: number;
  size_raw: string | null;
  size: number;
  notional_raw: string | null;
  notional_usd: number;
  fee_raw: string | null;
  fee_usd: number;
  liquidity: string;
  market_snapshot_id: string;
  created_at: string;
};

export type PaperPositionRow = {
  id: string;
  paper_account_id: string;
  market_type: string;
  coin: string;
  margin_mode: string;
  price_decimals: number;
  size_decimals: number;
  quote_decimals: number;
  signed_size_raw: string | null;
  signed_size: number;
  entry_px_raw: string | null;
  entry_px: number;
  leverage: number;
  isolated_margin_raw: string | null;
  isolated_margin_usd: number;
  realized_pnl_raw: string | null;
  realized_pnl_usd: number;
  funding_raw: string | null;
  funding_usd: number;
  fee_raw: string | null;
  fee_usd: number;
  status: string;
  updated_at: string;
  created_at: string;
};

export type PaperRiskSnapshotRow = {
  id: string;
  ingest_sequence: number | null;
  paper_account_id: string;
  quote_decimals: number;
  equity_raw: string | null;
  equity_usd: number;
  cash_balance_raw: string | null;
  cash_balance_usd: number;
  total_notional_raw: string | null;
  total_notional_usd: number;
  maintenance_margin_raw: string | null;
  maintenance_margin_usd: number;
  unrealized_pnl_raw: string | null;
  unrealized_pnl_usd: number;
  staleness_status: string;
  source_market_snapshot_id: string | null;
  created_at: string;
};

export type PaperLiquidationEventRow = {
  id: string;
  paper_account_id: string;
  position_id: string | null;
  coin: string | null;
  price_decimals: number;
  quote_decimals: number;
  trigger_px_raw: string | null;
  trigger_px: number | null;
  liquidation_px_raw: string | null;
  liquidation_px: number | null;
  equity_raw: string | null;
  equity_usd: number;
  maintenance_margin_raw: string | null;
  maintenance_margin_usd: number;
  reason: string;
  market_snapshot_id: string | null;
  created_at: string;
};

export type PaperLeaderboardSnapshotRow = {
  id: string;
  paper_account_id: string;
  agent_id: string;
  quote_decimals: number;
  equity_raw: string | null;
  equity_usd: number;
  paper_pnl_raw: string | null;
  paper_pnl_usd: number;
  paper_pnl_pct: number;
  max_drawdown_pct: number;
  liquidation_count: number;
  stale_data_status: string;
  source_risk_snapshot_id: string | null;
  created_at: string;
};

export type PaperAuditEventRow = {
  id: string;
  ingest_sequence: number | null;
  paper_account_id: string | null;
  subject_type: string;
  subject_id: string;
  action: string;
  input_hash: string;
  previous_hash: string | null;
  event_hash: string;
  metadata_json: string | null;
  created_at: string;
};
