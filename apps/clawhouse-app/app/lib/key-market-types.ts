/**
 * Shared key-market client types.
 *
 * Extracted from `key-market-wallet-bridge.tsx` so the wallet bridge, the routes,
 * and the React panels ported in later phases all consume one definition instead
 * of redeclaring overlapping shapes. Pure types only — no runtime code.
 *
 * Naming note: the `Demo*` prefixes are inherited from the prototype and are kept
 * here to avoid churn during the foundation phase; they are renamed once the
 * `window.ClawHouseDemo` bridge is removed.
 */

export type TradeSide = "buy" | "sell";
export type TradeTone = "idle" | "pending" | "success" | "error";

export type KeyMarketConfig = {
  networkId: "testnet";
  contractId: string;
  gas: string;
};

export type DemoAgent = {
  id: string;
  name: string;
  displayName?: string;
  boardId?: string;
  keyMarketStatus?: string;
  keyMarketAgentId?: string | null;
};

/**
 * The richer agent shape produced by the legacy `normalizeDiscoveryAgent`. The
 * known display fields are typed; the index signature covers raw API sub-objects
 * (keyMarket, pnl, paperActivity, …) that panels reach into. Fields get promoted
 * out of the index signature as panels are ported and their reads are typed.
 */
export type LegacyAgent = DemoAgent & {
  initials?: string;
  color?: string;
  bannerUrl?: string;
  strategy?: string;
  desc?: string;
  holders?: number | null;
  gate?: string;
  last?: string;
  pnl?: number | null;
  discoveryIndex?: number;
  [key: string]: unknown;
};

export type ToastOptions = {
  linkUrl?: string | null;
  linkLabel?: string;
  durationMs?: number;
};

export type ReadAccessState = {
  boardId: string;
  holderAccountId: string;
  expiresAt: string;
};

export type WalletSessionState = {
  accountId: string;
  expiresAt: string;
};

export type DemoChainState = {
  accountId?: string | null;
  contractId?: string;
  networkId?: string;
  pending?: boolean;
  phase?: "idle" | "connecting" | "authenticating" | "quoting" | "signing" | "refreshing";
  lastTxHash?: string | null;
  explorerUrl?: string | null;
  state?: Record<string, unknown> | null;
  quote?: Record<string, unknown> | null;
  quoteSide?: TradeSide | null;
  protection?: Record<string, unknown> | null;
  maxBuy?: Record<string, unknown> | null;
  maxBuyError?: string | null;
  stateLoading?: boolean;
  quoteLoading?: boolean;
  maxBuyLoading?: boolean;
  activityLoading?: boolean;
  backendLoading?: boolean;
  readAccessLoading?: boolean;
  activity?: Record<string, unknown> | null;
  activityError?: string | null;
  backend?: Record<string, unknown> | null;
  readAccess?: ReadAccessState | null;
  readAccessError?: string | null;
  error?: string | null;
  statusTitle?: string;
  statusBody?: string;
  statusTone?: TradeTone;
  discovery?: Record<string, unknown> | null;
  discoveryError?: string | null;
};

export type DemoApi = {
  getSelectedAgent: () => DemoAgent | null;
  getTradeSide: () => TradeSide;
  getKeyAmount: () => string;
  setChainState: (state: DemoChainState) => void;
  showToast: (message: string, options?: ToastOptions) => void;
};

export type QuoteResponse = {
  quote: Record<string, unknown>;
  protection: {
    attached_deposit?: string;
    max_price?: string;
    min_payout?: string;
  };
};

export type WalletSessionChallengeResponse = {
  challenge: {
    challenge: string;
    message: string;
    recipient: string;
    nonce: string;
  };
};

export type WalletSessionResponse = {
  valid: boolean;
  accountId?: string;
  expiresAt?: string;
};

export type ReadSessionResponse = {
  valid: boolean;
  boardId?: string;
  holderAccountId?: string;
  expiresAt?: string;
};
