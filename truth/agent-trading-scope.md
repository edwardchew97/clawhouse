# ClawHouse Agent Trading Scope

Status: Accepted scope boundary for the Agent Trading lane. This file does not
replace Scope V0 key trading.

## Source

- Producing session: `019ede4f-865f-7fc2-8e9e-7a2e2f82b5d9`
- Date: 2026-06-19
- Basis: JY asked to scope Agent Trading separately from user key trading,
  using the prior conversation's NEAR Intents spot-first decision, real-trading
  requirement, $100 minimum board funding direction, and current Season 0 truth
  files.
- Amendment session: `019ede10-c43f-76f1-ab2d-68b0fabf9802`
- Amendment date: 2026-06-19
- Amendment basis: JY clarified that current V0 removes OutLayer and does not
  need a Trade Engine that validates, quotes, executes, or gates agent trades.
  Current V0 should use Agent Board Ledger as the observation/accounting layer.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-19
- Amendment basis: JY confirmed that V0 creator onboarding should use manual
  IronClaw strategy upload. ClawHouse/Codex/Claude generate a non-secret
  strategy package, while IronClaw owns API keys, wallet/private keys,
  activation, execution, and runtime.

## One Sentence

Agent Trading is the real-money story around curated ClawHouse agent boards:
agents can trade with real spot wallets, while ClawHouse records what happened,
tracks portfolio/PnL, and gives users a credible board/feed to follow.

## Plain-Language Boundary

Agent Trading is not users buying and selling agent keys.

- Key trading answers: "Can I buy access to this agent, sell my key later, and
  maybe profit from key price movement?"
- Agent Trading answers: "What did this agent actually trade with its board
  bankroll, why did it trade, and did the real PnL improve?"

These are separate surfaces. Key trading can exist before Agent Trading. Agent
Trading must not require changes to the bonding-curve key-market contract.

## Current V0 Decision

Current V0 does not use an OutLayer gate and does not use a Trade Engine that
pre-validates, quotes, executes, or settles trades on behalf of agents.

In V0:

- agents send trades themselves through their own runtime, wallet, or venue
  integration;
- ClawHouse does not intercept the trade before it is sent;
- ClawHouse does not decide whether the trade is smart;
- ClawHouse does not block an agent trade before execution;
- if a trade succeeds, ClawHouse records the success;
- if a trade fails, ClawHouse records the failure;
- if an agent provides a reason, ClawHouse records the reason;
- if an agent provides no reason, ClawHouse still records the discovered event
  and marks the reason as missing.

The backend service for this V0 lane is **Agent Board Ledger**. Its detailed
scope lives in `truth/agent-board-ledger-scope.md`.

## Product Goal

Create a short-term consumer finance game where agent performance is real enough
to produce credible receipts, leaderboards, holder discussion, and shareable
moments without starting with perps, leverage, liquidations, or a full trading
venue build.

The first version should optimize for:

- real execution, not public paper trading;
- simple spot positions that normal users can understand;
- low operational risk;
- visible agent decisions, reasons, and follow-up notes;
- real wallet-based portfolio and PnL snapshots;
- clear separation from key price PnL.

## Initial Venue Direction

The current V0 agent-board lane should treat NEAR Intents spot activity as the
first intended trading shape.

Use documented/public NEAR Intents or 1Click integration surfaces when agents or
supporting services need NEAR-side asset information. Do not depend on near.com's
frontend or any undocumented near.com private backend for the first version.

Use NEAR Intents for:

- spot swaps;
- cross-chain spot movement where supported;
- stablecoin to spot asset swaps;
- spot asset to stablecoin swaps;
- spot asset rotation when a route is available.

Do not treat NEAR Intents as:

- a perps venue;
- an order book;
- a funding-rate venue;
- a leverage venue;
- a liquidation engine;
- a high-frequency execution venue.

Hyperliquid perps remain a future, separate Agent Trading expansion. They should
not be mixed into current V0 unless JY explicitly reopens that direction.

## Manual Strategy Package Boundary

V0 strategy onboarding is manual upload, not API-key delegation.

ClawHouse, Codex, and Claude may generate a non-secret strategy package for the
creator to review and manually upload/import into IronClaw. This package is a
strategy/config artifact. It is not a trade order, not a ClawHouse execution
request, and not proof that the strategy is already active in IronClaw.

The package must not contain:

- IronClaw API keys;
- wallet private keys, seed phrases, or raw signing material;
- ClawHouse backend execution credentials;
- deposit, withdrawal, or custody instructions;
- permission to withdraw funds;
- unsupported venues, leverage, perps, borrowing, liquidation, shorts, or
  funding-rate mechanics.

IronClaw owns:

- importing and validating the strategy package;
- user approval and activation inside IronClaw;
- API key, secret, wallet, and private-key storage;
- the execution loop;
- quote/trade submission through IronClaw-controlled tooling;
- deciding whether a proposed action is executable;
- reporting events back to ClawHouse or Agent Board Ledger when configured.

ClawHouse owns only:

- producing the strategy package draft;
- recording package hash/version and public metadata when provided;
- displaying public identity and observed performance through Agent Board
  Ledger.

### What IronClaw Needs To Execute

IronClaw cannot safely execute a vague instruction like "trade well" or "buy low,
sell high." The package needs enough structure for IronClaw to turn strategy into
an order intent inside its own runtime.

The minimum execution-ready strategy document should define:

- agent identity: name, description, avatar reference, and trading style;
- venue/asset boundary: current V0 target is NEAR Intents spot activity;
- allowed actions: hold, spot swap, rebalance, and report reason;
- forbidden actions: withdrawals, leverage, shorts, borrowing, perps,
  liquidations, and unmanaged venues;
- decision loop: what context IronClaw should inspect before proposing a trade;
- cadence/triggers: manual, daily, event-based, or another explicit schedule;
- risk rails: max position size, max trade notional, daily loss limit, max
  drawdown, slippage cap, and stop conditions;
- order-intent output shape: the fields IronClaw should produce before it calls
  its own execution tooling;
- reporting contract: reason required, event report required, and optional Agent
  Board Ledger hints;
- secret policy: package contains no secrets.

### ClawHouse Strategy Package v0

Canonical artifact: `clawhouse_strategy_package.v0.json`.

Authoring previews can be Markdown or YAML for readability, but the machine
artifact should be JSON so it can be hashed, validated, versioned, and imported
without ambiguous parsing.

Minimum fields:

- `schema`: must be `clawhouse.strategy_package.v0`;
- `package_id`;
- `created_at`;
- `created_by`;
- `agent`: `name`, `description`, `avatar_reference`, `trading_style`;
- `ironclaw`: `import_mode`, `activation`, `wallet_source`,
  `api_key_required_by_clawhouse`;
- `strategy`: `objective`, `thesis`, `allowed_actions`, `allowed_assets`,
  `base_asset`, `decision_loop`, `cadence`, `exit_conditions`;
- `risk`: `max_position_pct`, `max_trade_notional_usd`, `daily_loss_limit_pct`,
  `max_drawdown_pct`, `max_slippage_bps`, `allow_leverage`, `allow_shorts`,
  `allow_withdrawals`;
- `order_intent_template`: the expected proposed-action shape IronClaw should
  produce internally before execution;
- `reporting`: `reason_required`, `report_after_trade`, `ledger_hint`;
- `secrets`: must be `none_included`;
- `metadata`: package notes and optional hash/version fields.

Example:

```json
{
  "schema": "clawhouse.strategy_package.v0",
  "package_id": "chsp_example_001",
  "created_at": "2026-06-19T00:00:00Z",
  "created_by": "clawhouse_creator_skill",
  "agent": {
    "name": "Near Spot Scout",
    "description": "A cautious NEAR ecosystem spot trader that explains every move.",
    "avatar_reference": "manual-upload-or-public-url",
    "trading_style": "long-only NEAR ecosystem momentum"
  },
  "ironclaw": {
    "import_mode": "manual_upload",
    "activation": "inside_ironclaw",
    "wallet_source": "ironclaw_managed",
    "api_key_required_by_clawhouse": false
  },
  "strategy": {
    "objective": "Grow a small spot portfolio while avoiding leverage and withdrawals.",
    "thesis": "Prefer NEAR and approved ecosystem assets when momentum and liquidity are healthy; otherwise hold USDC.",
    "allowed_actions": ["hold", "spot_swap", "rebalance", "report_reason"],
    "allowed_assets": [
      { "symbol": "USDC", "chain": "near" },
      { "symbol": "NEAR", "chain": "near" }
    ],
    "base_asset": { "symbol": "USDC", "chain": "near" },
    "decision_loop": "Before each proposed trade, inspect current holdings, recent price movement, liquidity, risk limits, and the last trade reason.",
    "cadence": "daily_or_manual",
    "exit_conditions": ["daily_loss_limit_hit", "max_drawdown_hit", "asset_removed_from_allowed_list"]
  },
  "risk": {
    "max_position_pct": 35,
    "max_trade_notional_usd": 25,
    "daily_loss_limit_pct": 5,
    "max_drawdown_pct": 15,
    "max_slippage_bps": 100,
    "allow_leverage": false,
    "allow_shorts": false,
    "allow_withdrawals": false
  },
  "order_intent_template": {
    "action": "hold | spot_swap | rebalance",
    "from_asset": "asset symbol when swapping",
    "to_asset": "asset symbol when swapping",
    "amount_policy": "fixed_usd | percent_of_portfolio | no_trade",
    "max_slippage_bps": "number",
    "reason": "plain-language reason required before execution",
    "risk_check": "must pass package risk rails before execution"
  },
  "reporting": {
    "reason_required": true,
    "report_after_trade": true,
    "ledger_hint": "agent_board_ledger"
  },
  "secrets": "none_included",
  "metadata": {
    "notes": "Manual upload package. User must activate inside IronClaw."
  }
}
```

The exact IronClaw importer, parser, validation errors, and activation UX remain
implementation/partner-confirmation work. Until that is verified, this schema is
ClawHouse's target contract, not a claim that IronClaw already supports the file.

## Non-Negotiable Product Rules

- User-facing Agent Trading is not paper trading.
- A live public board should have at least $100 equivalent in real bankroll.
- Public PnL, receipts, leaderboards, and share cards must come from real wallet
  observations, real reported events, or reconciled balances.
- Development may use mocked events, dry checks, and tiny canary trades, but any
  non-real environment must be labeled as test-only and must not feed public
  performance.
- Agent Trading funds must be separate from key-market reserves.
- Agent Trading PnL must be separate from key PnL.
- The current V0 target is long-only spot observation. No shorts, leverage,
  borrowing, liquidation, or funding-rate mechanics are required.

## Board Ownership And Funding

An Agent Trading board is a tracked wallet/account assigned to one approved
agent.

For the first scope, the conservative default is:

- ClawHouse or the approved creator funds and owns the initial board bankroll;
- normal users do not deposit into autonomous agent-controlled wallets;
- users participate first as watchers, key holders, followers, and later
  constrained copiers;
- any later user-funded copy flow must be separately scoped as Copy With
  Constraints.

Each board should track:

- board id;
- agent id;
- owner or funding source;
- current wallet/account address;
- starting bankroll;
- current portfolio;
- current status;
- tracking start time;
- public or holder-gated visibility.

## Board Lifecycle

1. Draft
   - Agent profile exists.
   - Board/wallet tracking details are not public.
   - No public trading performance is shown.

2. Tracked
   - Agent wallet/account is registered.
   - Agent Board Ledger can observe balances and events.
   - Starting balances are recorded.

3. Live
   - Agent can trade by itself outside ClawHouse pre-trade control.
   - Agent Board Ledger records reported and discovered events.
   - Board publishes real portfolio and PnL snapshots when data is complete
     enough.

4. Paused
   - Public or holder-facing display can pause.
   - Ledger observation may continue.
   - Pause does not imply ClawHouse can stop an externally controlled agent
     wallet unless that control exists in a separate runtime/custody scope.

5. Closed
   - Board no longer appears as actively competing.
   - Final PnL, final holdings, and closing reason are recorded.

## Agent Reason And Event Timeline

Agents should be able to report their own events to Agent Board Ledger.

An agent-reported trade event may include a reason at creation time, but reason
is optional. Later entries can be attached to the same event:

- initial reason;
- follow-up explanation;
- correction;
- investigation note;
- retraction label;
- post-trade analysis;
- final summary.

Do not overwrite the history of a reason. Append the new entry to the event
timeline. A chain transaction cannot be withdrawn, but the agent can later mark
its own interpretation as wrong, retracted, suspicious, or not part of strategy.

## Agent Board Ledger Relationship

Agent Board Ledger is the V0 backend service for Agent Trading observation and
accounting.

It owns:

- wallet watcher cron;
- agent event inbox;
- trade event timeline and attachments;
- durable agent trading history for later agent versions and audits;
- discovery of unreported trades;
- wallet balance reconciliation;
- current portfolio calculation;
- periodic and post-event PnL snapshots;
- DB/event ledger records;
- public and holder/key-gated read surfaces.

It does not own:

- agent strategy;
- agent runtime internals;
- pre-trade validation;
- quote requests for execution;
- trade execution;
- settlement submission;
- OutLayer policy;
- key trading;
- copy trading;
- Hyperliquid perps.

## Product Surfaces

Minimum board page:

- agent identity;
- board status;
- current portfolio;
- starting bankroll;
- current board value;
- total PnL;
- drawdown when available;
- latest reported/discovered trade event;
- latest reason or "reason pending";
- data freshness state;
- public or holder-only visibility state.

Minimum leaderboard:

- board PnL;
- max drawdown when available;
- number of observed real trades;
- failed or unresolved event count;
- most recent event timestamp;
- stale-data flag when needed;
- key PnL shown separately if present.

Minimum receipt/share card:

- agent name;
- event type;
- asset pair when known;
- event time;
- before/after portfolio value when available;
- PnL impact when available;
- "real observed board event" label;
- venue label when known;
- reason or reason-pending state.

## Key Holder Relationship

Key holders may receive better access to Agent Trading context, but key ownership
must not be confused with ownership of board funds.

Allowed first links:

- key holders can see richer trade commentary;
- key holders can see the full event timeline when the public view is limited;
- key holders can join holder-facing discussion;
- key holders can receive faster event notifications;
- key holder count can influence social ranking.

Not allowed in this scope:

- key holders receiving board profits;
- key holders owning a claim on board assets;
- key price being counted as agent trading PnL;
- automatic user copy trading.

## Testing And Verification

Testing must separate engineering safety from product truth.

Allowed for development:

- deterministic event fixtures;
- mocked wallet observations;
- mocked price snapshots;
- NEAR-side read-only checks;
- small real wallet canaries;
- local reconciliation tests;
- failure simulation for missing reason, unknown asset, stale price, duplicate
  event, refund, and report/discovery race conditions.

Not allowed for public product:

- fake trade receipts;
- simulated PnL on leaderboards;
- paper trades displayed as real trades;
- test wallets mixed with production boards.

Minimum verification before public board launch:

- register one board/wallet for one curated agent;
- record starting balances;
- run wallet watcher cron;
- ingest one agent-reported event with a reason;
- discover or reconcile at least one wallet change;
- support an event with no reason and a later attached reason;
- write holding snapshots;
- write PnL snapshots on a timer and after a material event;
- expose a public summary and holder-gated detail shape;
- keep key PnL separate from board trading PnL.

## Future Scope

These are not current V0 requirements:

- ClawHouse-controlled trade execution engine;
- pre-trade validation or risk gating;
- OutLayer policy integration;
- ClawHouse-hosted IronClaw API-key collection;
- local wallet/private-key generation by Codex, Claude, or the creator skill;
- copy-with-constraints;
- user-funded autonomous copy trading;
- Hyperliquid perps;
- leverage, liquidation, shorts, borrowing, or funding-rate mechanics;
- agent custody/key-management infrastructure.

## Acceptance Criteria For Current V0 Agent Trading Slice

The first Agent Trading slice is done only when:

- an agent board exists separately from the key-market contract;
- the board tracks one real wallet/account;
- Agent Board Ledger runs a wallet watcher cron;
- agents can report trade events with optional reason;
- agents can append later reason, correction, retraction, or analysis entries;
- cron can create a discovered event when a wallet change is not reported by
  the agent;
- duplicate reports and cron/report races merge into one event timeline;
- balances are reconciled from wallet/account observations;
- current portfolio is computed from holdings and prices;
- PnL snapshots are written periodically and after material events;
- stale, incomplete, unknown-asset, and confidential-visibility limits are
  labeled instead of hidden;
- holder/key-gated read API is scoped as a read surface, not key trading;
- no OutLayer, pre-trade validation, ClawHouse quote, ClawHouse execution,
  Hyperliquid, leverage, shorts, liquidation, or copy trading is required.
- a non-secret `clawhouse_strategy_package.v0.json` can be generated for manual
  IronClaw upload without requiring ClawHouse to execute or activate it.

## Open Decisions

- Who funds the first public boards: ClawHouse, creators, sponsors, or a mix?
- Which chain/account should hold the first board bankroll?
- Which exact stablecoin should be the base asset?
- Which asset universe is safe to display publicly when agents can technically
  trade unknown assets?
- What wallet watcher cadence is acceptable for a live board?
- What price freshness threshold blocks leaderboard updates?
- What should be public versus key-holder-only in the event timeline?
- What proof is enough to compute PnL for confidential activity?
- Whether IronClaw will accept `clawhouse_strategy_package.v0.json` directly or
  require a wrapper, script, or different import API.
- What exact validation errors IronClaw should return for invalid strategy
  packages.
- What minimum package hash/version should ClawHouse display publicly after
  manual upload.

## Change Log

- 2026-06-19 - `019ede4f-865f-7fc2-8e9e-7a2e2f82b5d9` - Initial Agent
  Trading scope/spec created as a separate lane from user key trading, then
  refined through review-and-iterate for execution mode, custody, route, and
  discoverability boundaries.
- 2026-06-19 - `019ede10-c43f-76f1-ab2d-68b0fabf9802` - Replaced the V0
  execution-engine/policy-gate direction with Agent Board Ledger as the
  observation, event, reconciliation, portfolio, PnL, and read-access layer.
- 2026-06-19 - `019ede0e-a276-7bc2-a6da-ded485719308` - Added the V0 manual
  IronClaw strategy package boundary and target
  `clawhouse_strategy_package.v0.json` format, making ClawHouse/Codex/Claude
  responsible only for a non-secret package draft while IronClaw owns keys,
  wallet custody, activation, and execution.
