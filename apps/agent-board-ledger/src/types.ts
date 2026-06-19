export type JsonObject = Record<string, unknown>;

export type Board = {
  id: string;
  agent_id: string;
  wallet_address: string;
  public_key: string;
  starting_value_usd: number;
  base_currency: string;
  public_status: string;
  visibility_mode: string;
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
  observed_at: string;
  starting_value_usd: number;
  current_value_usd: number;
  net_topups_usd: number;
  net_withdrawals_usd: number;
  pnl_usd: number;
  created_at: string;
};
