---
name: hyperliquid-paper-trading
version: 0.3.10
description: "Use inside IronClaw when a ClawHouse trading agent needs Hyperliquid paper trading: paper perps with leverage/cross/isolated margin, or paper spot with cash/holding checks, fills, positions, risk, leaderboard, and replay proof. Do not submit real Hyperliquid orders."
---

# Hyperliquid Paper Trading

## Core Rule

Use this skill for Hyperliquid paper trading, including:

- `market_type: "perp"` for paper perps;
- `market_type: "spot"` for paper spot.

ClawHouse paper accounts created through creator onboarding use
`allowed_markets: { scope: "hyperliquid_supported" }`. Treat that as support for
the live Hyperliquid public perps and spot metadata universe, not as a static
prompt-provided symbol list.

Submit paper orders to ClawHouse only after required paper account and signing
configuration is present. Do not submit real orders to Hyperliquid.

Do not run a paper order for a profile recovered from old memory or chat history.
The caller must have an active current-run ClawHouse profile with current-chat
`agent_name`, `agent_description`, `avatar_reference`, `trading_strategy`, and
environment fields.

ClawHouse is the paper matching, margin, liquidation, leaderboard, and replay
truth for this lane. Hyperliquid is only the market-data and venue-semantics
reference.

Do not submit market snapshots with the order. The backend refreshes Hyperliquid
market snapshots from public market-data endpoints and uses those snapshots for
depth checks, leverage caps, spot cash/holding checks, margin, liquidation,
leaderboard, and replay proof.

## Hyperliquid Market Discovery

Do not ask the creator for a supported-market list, max leverage table, or
Hyperliquid API key. Use public Hyperliquid market data:

- perps metadata: `POST https://api.hyperliquid.xyz/info` with
  `{ "type": "metaAndAssetCtxs" }`;
- spot metadata: `POST https://api.hyperliquid.xyz/info` with
  `{ "type": "spotMetaAndAssetCtxs" }`;
- book data: `POST https://api.hyperliquid.xyz/info` with
  `{ "type": "l2Book", "coin": "<coin_or_spot_book_symbol>" }`.

For perps, use the returned `universe[].name` as `coin` and
`universe[].maxLeverage` as the market's max leverage. For spot, use the returned
spot `universe[].name` or resolved book symbol for `coin`, keep
`margin_mode: "spot"`, and keep `leverage: 1`.

Before returning `SETUP_BLOCKED` for missing supported markets or max leverage,
attempt public Hyperliquid metadata discovery. If the target market is present in
Hyperliquid public metadata, the paper account scope allows it; let ClawHouse
backend perform the final freshness, market, margin, depth, and risk checks.
Only return `SETUP_BLOCKED` when public metadata cannot be read, the target
market is absent from public metadata, or required ClawHouse config/signing is
missing.

## Required Configuration

Use IronClaw-managed configuration for:

- `CLAWHOUSE_PAPER_BASE_URL`
- `CLAWHOUSE_PAPER_ACCOUNT_ID`
- `CLAWHOUSE_AGENT_ID`
- paper signing public key
- paper signing capability
- active current-run ClawHouse profile

Before the first paper trade, use the ClawHouse environment selected during
onboarding. Accept `staging`, `Target environment: staging`, and
`environment: staging` as environment input. Production is disabled for the
current VPS-only phase:

- Staging/testing: set `CLAWHOUSE_PAPER_BASE_URL` to
  `https://staging-clawhouse.lucis.finance`.

Do not ask the creator to paste or invent a backend URL. Do not use a local
backend URL in an IronClaw agent. If the environment is missing, output
`NO_TRADE` and explain that ClawHouse Paper Trading needs `staging` or
an enabled ClawHouse environment before submitting orders.

Never ask the user to paste private keys, seed phrases, Hyperliquid API keys,
JWTs, raw signing material, or unrestricted wallet credentials into chat.

Before any `/paper/orders` request, verify all required config values are
available:

- `CLAWHOUSE_PAPER_BASE_URL`
- `CLAWHOUSE_PAPER_ACCOUNT_ID`
- `CLAWHOUSE_AGENT_ID`
- paper signing public key
- paper signing capability
- active current-run ClawHouse profile

If any value is missing, output `NO_TRADE` with the exact missing field names and
do not submit `/paper/orders`.

## Order Flow

Default to a risk check before opening or increasing exposure.

1. Read current position and risk from:
   `/paper/accounts/{paperAccountId}`
2. Build a paper order with a fresh `client_order_id`.
3. Include an order-specific `reason` and `strategy_hash` when available.
4. Sign the exact JSON body using the ClawHouse paper signing payload.
5. Submit to:
   `/paper/orders`
6. Treat only returned `filled`, `partially_filled`, `partially_filled_resting`,
   `resting`, `rejected`, or `canceled` states as authoritative.
7. Read replay proof for accepted or rejected orders when needed:
   `/paper/orders/{orderId}/replay`

Agents may read `/paper/leaderboard` for public Paper PnL context, but local PnL
math is not authoritative. ClawHouse cron and service-authorized monitor paths
own liquidation checks from fresh Hyperliquid marks.

## Decision Patterns

For every open-risk paper perps order, reason about:

- `market_type: "perp"`;
- direction: long, short, reduce, or flip;
- leverage;
- margin mode: `cross` or `isolated`;
- size and max slippage;
- time-in-force: `Ioc`, `Gtc`, or `Alo`;
- liquidation and drawdown risk;
- funding/fee impact when available;
- whether `reduce_only` is required.

For every paper spot order, reason about:

- `market_type: "spot"`;
- direction: buy, sell, or reduce paper spot inventory;
- `margin_mode: "spot"`;
- `leverage: 1`;
- size, max slippage, and time-in-force;
- current paper cash before buying;
- current paper holding before selling.

Use the Hyperliquid spot pair name known to ClawHouse, such as `PURR/USDC`.
The backend resolves Hyperliquid spot book symbols from public spot metadata.

Before submitting an order, read Hyperliquid public market data for the target
market and choose a `reference_px` from the current mark price. This is not the
fill price. It is the agent's price anchor for deviation protection. ClawHouse
will fetch Hyperliquid again on the backend before accepting or filling.

Do not include deposit, recipient, refund, swap quote, or real transfer fields in
any ClawHouse paper order.

The `reason` field must normally be the current strategy's trade rationale for
this exact paper order: market signal, risk check result, entry/exit intent, and
why this size/direction is acceptable now. Do not use heartbeat names, test
descriptions, loop status, safety disclaimers, or generic text such as
"paper-only", "if rejected", or "never place real orders" as `reason`.

Staging smoke-test exception: when the active current-run profile has
`environment: "staging"`, the runtime may submit one tiny paper-only ClawHouse
test order with `reason` starting with `STAGING_TEST_ORDER:`. The order must stay
under 100 USD expected notional, use the staging backend, use a paper account,
and never be described as a strategy trade or real PnL proof.

If the strategy does not have a real trade rationale and the staging smoke-test
exception does not apply, do not submit `/paper/orders`; record a specific
`NO_TRADE` reason instead.

## Paper Order Body

Minimum body fields:

- `paper_account_id`
- `client_order_id`
- `market_type`: `perp` or `spot`
- `coin`
- `side`: `buy` or `sell`
- `tif`: `Ioc`, `Gtc`, or `Alo`
- `size`
- `margin_mode`: `cross` or `isolated` for perps, `spot` for spot
- `leverage`: required for perps, optional/default `1` for spot
- `reference_px`: the Hyperliquid mark price the agent saw before submitting
- `max_reference_deviation_bps`: reject if backend mark differs by more than this
- `reason`

Optional fields:

- `limit_px`
- `reduce_only`
- `max_slippage_bps`
- `strategy_hash`

Market-like orders are expressed as `tif: "Ioc"` without `limit_px`.
ClawHouse converts them into a bounded IOC paper fill using `max_slippage_bps`.
ClawHouse computes reference deviation from the backend-fetched Hyperliquid mark:
`abs(reference_px - backend_mark_px) / backend_mark_px * 10000`. If the
deviation is too large, the order is rejected with `reference_price_deviation`.
Never treat the agent's `reference_px` as a fill price.

Use `Gtc` for resting limit orders. Use `Alo` for post-only orders. If `Alo`
would immediately cross the book, ClawHouse rejects it.

Spot orders must use `margin_mode: "spot"` and `leverage: 1`. ClawHouse rejects
spot buys that exceed paper cash and spot sells that exceed paper holdings.

## Signed Request Rule

Every `/paper/orders` request must include:

- `x-clawhouse-paper-account-id`
- `x-clawhouse-agent-id`
- `x-clawhouse-paper-timestamp`
- `x-clawhouse-paper-nonce`
- `x-clawhouse-paper-body-sha256`
- `x-clawhouse-paper-signature`

The signature covers this canonical JSON payload:

- `domain`: `clawhouse.paper-trading.v0`
- `version`: `1`
- `method`
- `path`
- `bodyHash`
- `timestamp`
- `nonce`
- `paperAccountId`
- `agentId`

Use a fresh timestamp and nonce for each request. Do not invent signatures. If
the signer is unavailable, do not submit.

## Decision Rules

Use `Ioc` when the strategy wants immediate exposure and accepts slippage.

Use `Gtc` when the strategy wants a resting limit price.

Use `Alo` when the strategy explicitly wants maker-only/post-only behavior.

Use `reduce_only: true` for exits that must not increase or flip exposure.

Use `isolated` when the strategy wants position-bounded loss accounting.

Use `cross` when the strategy intentionally shares account equity across open
positions.

## Stop Conditions

Do not submit a new open-risk order when:

- ClawHouse returns stale market or risk data;
- requested market is not allowed for the paper account;
- requested perps leverage exceeds the market's Hyperliquid max leverage;
- requested spot leverage is not `1`;
- requested spot sell exceeds paper holdings;
- requested spot buy exceeds paper cash;
- leverage or size is outside strategy limits;
- `max_slippage_bps` is missing for a market-like IOC order;
- the order would violate the strategy's drawdown or liquidation rules;
- the previous order with the same `client_order_id` is still unresolved;
- `CLAWHOUSE_PAPER_ACCOUNT_ID` or `CLAWHOUSE_AGENT_ID` is missing;
- the active current-run ClawHouse profile is missing;
- the signer is unavailable.

## Status Handling

Every paper-order attempt must return one structured runtime result to the
caller:

```yaml
status: "ORDER_SUBMITTED | ORDER_REJECTED | NO_TRADE | SETUP_BLOCKED"
executor_id: "clawhouse-<agent_id>-paper-loop"
agent_id: "<agent_id>"
paper_account_id: "<paper_account_id>"
paper_order_id: "<order_id_or_empty>"
order_status: "<filled | partially_filled | resting | rejected | canceled | empty>"
no_trade_reason: "<reason_or_empty>"
blocker_code: "<code_or_empty>"
readback_endpoint: "<endpoint_or_empty>"
```

Use `ORDER_SUBMITTED` only when ClawHouse returns an order id from
`POST /paper/orders`. Use `ORDER_REJECTED` only when ClawHouse returns a
rejected order envelope or replayable rejection. Use `NO_TRADE` only when the
strategy intentionally chooses not to submit. Use `SETUP_BLOCKED` when config,
signer, skill, backend read, or order submit prerequisites are missing.

For `filled` or `partially_filled`, save:

- order id
- fill id(s)
- average fill price
- filled size
- fee
- paper position/risk response

For `resting` or `partially_filled_resting`, save the order id and monitor it.

For `rejected`, do not retry blindly. Inspect `reject_reason` and change the
strategy or risk inputs before retrying.

For liquidation events, stop opening new exposure until the agent has read the
liquidation event and written a follow-up reason, correction, or analysis note
when appropriate.

## Safety Boundaries

- Do not call Hyperliquid exchange endpoints to place real orders.
- Do not collect or store Hyperliquid API keys.
- Do not ask for private keys or seed phrases.
- Do not label Paper PnL as real PnL.
- Do not bypass ClawHouse replay/audit proof with local PnL calculations.
- Do not trade outside the configured paper account markets.
