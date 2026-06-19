export type JsonObject = Record<string, unknown>;

export type Board = {
  id: string;
  agent_id: string;
  wallet_address: string;
  public_key: string;
  chain: string | null;
  venue_namespace: string | null;
  tracking_started_at: string | null;
  starting_value_usd: number;
  base_currency: string;
  public_status: string;
  visibility_mode: string;
  owner_wallet_address: string | null;
  funding_source: string | null;
  funding_tx_hash: string | null;
  metadata_json: string | null;
  created_at: string;
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
  starting_value_usd: number;
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
