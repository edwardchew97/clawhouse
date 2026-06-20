import { requiredNumber, RequestError } from "./db.js";
import type { Board, JsonObject } from "./types.js";

export const CREATOR_ONBOARDING_SKILL_VERSION = "0.2.2";
export const DEFAULT_MINIMUM_FUNDING_USD = 100;
export const IRONCLAW_INSTALL_PROMPT =
  "Read https://edwardchew97.github.io/clawhouse-onboarding-kit/skill.md and follow it to start ClawHouse creator onboarding inside this IronClaw agent.";

type CreatorSetupData = JsonObject;

export type CreatorOnboardingSetup = {
  board: Board;
  agent: {
    id: string;
    name: string;
    description: string;
    avatar_reference: string;
  };
  strategy: {
    status: "accepted";
    original: string;
    normalized: string;
    allowed_venue: "near-intents-spot";
    checked_at: string;
  };
  funding: {
    status: "waiting_for_funds";
    minimum_usd: number;
    options: Array<{
      type: "direct_wallet_deposit";
      chain: "near";
      asset: "NEAR";
      address: string;
      qr_payload: string;
      note: string;
    }>;
    near_intents_1click: {
      quote_required_per_origin_chain: true;
      quote_endpoint: "https://1click.chaindefuser.com/v0/quote";
      status_endpoint_template: "https://1click.chaindefuser.com/v0/status?depositAddress={depositAddress}";
      note: string;
    };
  };
  user_status: {
    title: "Fund agent.";
    min: string;
    pay: string;
    status: "waiting_for_funds";
  };
  install_prompt: string;
};

const bannedStrategyPatterns: Array<[RegExp, string]> = [
  [/\b(perp|perps|perpetual|futures?|hyperliquid)\b/i, "perps are not supported"],
  [/\b(leverage|leveraged|margin)\b/i, "leverage is not supported"],
  [/\b(short|shorts|shorting)\b/i, "shorts are not supported"],
  [/\b(borrow|borrowing|lend|lending|loan)\b/i, "borrowing and lending are not supported"],
  [/\b(stake|staking|stnear|liquid staking|lst|lsd)\b/i, "staking and liquid staking are not supported"],
  [/\b(yield|farm|farming|lp|liquidity pool|vault)\b/i, "yield, LP, and vault strategies are not supported"],
  [/\b(liquidation|funding rate|funding-rate)\b/i, "liquidation and funding-rate mechanics are not supported"],
  [/\b(top\s*50|blue[-\s]?chip|altcoins?|memecoins?|any token)\b/i, "broad token buckets are not supported"],
  [/\b(btc|bitcoin|eth|ethereum|sol|solana)\b/i, "only NEAR/USDC spot assets are enabled in this setup flow"],
];

export function buildCreatorOnboardingSetup(data: CreatorSetupData, createdAt: string): CreatorOnboardingSetup {
  const agent = {
    id: requiredText(data.agentId ?? data.agent_id, "agent_id"),
    name: requiredText(data.agentName ?? data.agent_name, "agent_name"),
    description: requiredText(data.agentDescription ?? data.agent_description, "agent_description"),
    avatar_reference: requiredText(data.avatarReference ?? data.avatar_reference, "avatar_reference"),
  };
  const boardId = requiredText(data.boardId ?? data.board_id, "board_id");
  const walletAddress = requiredText(data.walletAddress ?? data.wallet_address, "wallet_address");
  const publicKey = requiredText(data.publicKey ?? data.public_key, "public_key");
  const fundingMinimumUsd = positiveNumberWithDefault(
    data.fundingMinimumUsd ?? data.funding_minimum_usd,
    DEFAULT_MINIMUM_FUNDING_USD,
    "funding_minimum_usd",
  );
  const strategy = validateCreatorStrategy(
    requiredText(data.tradingStrategy ?? data.trading_strategy, "trading_strategy"),
    createdAt,
  );
  const funding = buildFunding(walletAddress, fundingMinimumUsd);
  const metadata = {
    source: "clawhouse-creator-onboarding",
    onboarding_skill_version: CREATOR_ONBOARDING_SKILL_VERSION,
    agent_profile: {
      name: agent.name,
      description: agent.description,
      avatar_reference: agent.avatar_reference,
    },
    strategy,
    funding,
    runtime: {
      status: "waiting_for_funds",
      routine_starts_after: "funding_confirmed",
      required_skills: ["clawhouse-ledger-reporting", "near-intents-spot-value"],
    },
  };
  const board: Board = {
    id: boardId,
    agent_id: agent.id,
    wallet_address: walletAddress,
    public_key: publicKey,
    chain: "near",
    venue_namespace: "near-intents",
    tracking_started_at: createdAt,
    starting_value_usd: fundingMinimumUsd,
    base_currency: "USD",
    public_status: "waiting_for_funds",
    visibility_mode: cleanText(data.visibilityMode ?? data.visibility_mode) ?? "public",
    owner_wallet_address: cleanText(data.ownerWalletAddress ?? data.owner_wallet_address),
    funding_source: "near-direct-wallet",
    funding_tx_hash: null,
    metadata_json: JSON.stringify(metadata),
    created_at: createdAt,
  };

  return {
    board,
    agent,
    strategy,
    funding,
    user_status: {
      title: "Fund agent.",
      min: `${fundingMinimumUsd} USD equivalent`,
      pay: `near:${walletAddress}`,
      status: "waiting_for_funds",
    },
    install_prompt: IRONCLAW_INSTALL_PROMPT,
  };
}

export function presentCreatorOnboardingSetup(setup: CreatorOnboardingSetup) {
  return {
    ok: true,
    status: "waiting_for_funds",
    agent: setup.agent,
    board: setup.board,
    strategy: setup.strategy,
    funding: setup.funding,
    user_status: setup.user_status,
    install_prompt: setup.install_prompt,
  };
}

export function validateCreatorStrategy(strategy: string, checkedAt = new Date().toISOString()) {
  const normalizedInput = strategy.trim();
  if (/\b(you decide|decide for me)\b/i.test(normalizedInput) || /你决定|你來決定|你来决定/.test(normalizedInput)) {
    return {
      status: "accepted" as const,
      original: normalizedInput,
      normalized: "NEAR/USDC long-only spot rotation through NEAR Intents. Do not trade when a route, quote, funding, or slippage check is unavailable.",
      allowed_venue: "near-intents-spot" as const,
      checked_at: checkedAt,
    };
  }

  for (const [pattern, reason] of bannedStrategyPatterns) {
    if (pattern.test(normalizedInput)) throw new RequestError(`Strategy rejected: ${reason}`, 400);
  }

  if (!/\bnear\b/i.test(normalizedInput) && !/\busdc\b/i.test(normalizedInput)) {
    throw new RequestError("Strategy rejected: strategy must name NEAR or USDC for this setup flow", 400);
  }

  return {
    status: "accepted" as const,
    original: normalizedInput,
    normalized: `${normalizedInput} Use NEAR Intents / 1Click spot routes only; no trade when quote, funding, or slippage checks fail.`,
    allowed_venue: "near-intents-spot" as const,
    checked_at: checkedAt,
  };
}

function buildFunding(walletAddress: string, minimumUsd: number): CreatorOnboardingSetup["funding"] {
  return {
    status: "waiting_for_funds",
    minimum_usd: minimumUsd,
    options: [
      {
        type: "direct_wallet_deposit",
        chain: "near",
        asset: "NEAR",
        address: walletAddress,
        qr_payload: `near:${walletAddress}`,
        note: "Direct NEAR funding for the agent wallet. Cross-chain 1Click deposit addresses are quote-specific and must not be reused.",
      },
    ],
    near_intents_1click: {
      quote_required_per_origin_chain: true,
      quote_endpoint: "https://1click.chaindefuser.com/v0/quote",
      status_endpoint_template: "https://1click.chaindefuser.com/v0/status?depositAddress={depositAddress}",
      note: "For non-NEAR origin chains, request a fresh 1Click quote and show its depositAddress, deposit memo when present, deadline, exact amount, and refund requirement.",
    },
  };
}

function requiredText(value: unknown, name: string) {
  const cleaned = cleanText(value);
  if (!cleaned) throw new RequestError(`Missing ${name}`, 400);
  return cleaned;
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function positiveNumberWithDefault(value: unknown, fallback: number, name: string) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = requiredNumber(value, name);
  if (parsed <= 0) throw new RequestError(`${name} must be greater than 0`, 400);
  return parsed;
}
