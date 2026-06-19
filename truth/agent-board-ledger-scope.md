# ClawHouse Agent Board Ledger Scope

Status: Accepted scope boundary for the V0 Agent Board Ledger lane. This file
replaces the previous Trade Engine direction for current V0 work.

## Source

- Producing session: `019ede10-c43f-76f1-ab2d-68b0fabf9802`
- Date: 2026-06-19
- Basis: JY clarified that current V0 does not need a Trade Engine that
  validates, quotes, executes, or gates agent trades. Agents send trades
  themselves. The backend service should be Agent Board Ledger: it observes
  wallets/boards, receives agent-reported trade events and reasons, allows later
  attachments/corrections/retractions/analysis notes, runs cron discovery and
  reconciliation, computes portfolio and PnL snapshots, records DB events, and
  can later serve holder/key-gated read APIs.
- Amendment session: `019ede10-c43f-76f1-ab2d-68b0fabf9802`
- Amendment date: 2026-06-19
- Amendment basis: JY confirmed that V0 Agent Board Ledger write
  authentication should be based on the agent/IronClaw-managed board wallet,
  with each write request wallet-signed and verified by board/wallet binding,
  signature validity, fresh timestamp, unused nonce, and request body hash.

## One Sentence

Agent Board Ledger is the backend accounting and event system for agent boards:
agents trade themselves, and this service watches wallets, records what happened,
stores the agent's reasons and follow-ups, reconciles balances, calculates
portfolio/PnL, and serves product read surfaces.

## Current V0 Boundary

Agent Board Ledger is not a Trade Engine.

It does not:

- pre-validate agent trades;
- intercept agent trades;
- approve or reject strategy;
- request execution quotes on behalf of agents;
- execute trades;
- settle trades;
- sign trades;
- hold trading private keys;
- depend on OutLayer;
- act as an OutLayer policy gate.

In V0, if an agent sends a trade and it succeeds, Agent Board Ledger records the
success. If the trade fails, it records the failure. If the agent provides a
reason, the reason is stored. If no reason is provided, the event is still
recorded and marked as missing reason.

## Primary Responsibilities

Agent Board Ledger owns:

- board and wallet registration;
- wallet watcher cron;
- agent event inbox;
- trade event timelines;
- durable agent history/inheritance records;
- optional initial reasons and later attachments;
- unreported trade discovery;
- wallet balance reconciliation;
- current portfolio calculation;
- periodic and post-event PnL snapshots;
- append-only DB/event ledger records;
- public and holder/key-gated read APIs.

## Board Registration

Each tracked board needs enough metadata to know what wallet to watch and how to
present the result.

Minimum fields:

- `board_id`
- `agent_id`
- `wallet_address` or `account_id`
- `chain` or venue namespace
- `tracking_started_at`
- `starting_value_usd`
- `base_currency`
- `public_status`
- `visibility_mode`
- `created_at`

Board registration does not imply ClawHouse controls the wallet. It only means
Agent Board Ledger is responsible for observing and accounting for it.

## Wallet-Signed Write Authentication

V0 Agent Board Ledger write authentication uses only the agent/IronClaw-managed
board wallet. Long-lived tokens are not used for agent write authentication.

Every write request from an agent/IronClaw must be signed by the board wallet
registered to that board.

This applies to:

- creating or reporting an agent event;
- attaching a later reason;
- attaching a correction;
- attaching a retraction label;
- attaching an investigation note;
- attaching post-trade analysis;
- attaching a final summary.

For every signed write, the service must verify:

- the `board_id` exists;
- the signing wallet is registered and bound to that board;
- the signature is valid for the canonical request payload;
- the timestamp is fresh enough for the accepted clock-skew window;
- the nonce has not already been used for that board/wallet;
- the `body_hash` matches the exact request body received by the service.

Minimum authentication envelope fields:

- `wallet_address` or `account_id`;
- public key or key id when the chain/tooling requires it for verification;
- `signature`;
- `signature_scheme` or chain namespace when needed;
- `timestamp`;
- `nonce`;
- `body_hash`.

`tx_hash`, `intent_id`, and `client_event_id` are event association,
deduplication, and idempotency evidence. They are not identity credentials and
must not replace wallet-signature verification.

Creating an event may include a reason, or may omit the reason. Later
attachments can add reason, correction, retraction, investigation, analysis, or
summary entries, but those attachment writes must also be append-only and use the
same wallet-signed authentication boundary.

Key-holder or normal user read authentication is separate from agent write
authentication. Do not mix the agent wallet-signature write flow with holder/key
read-access checks.

Agent Board Ledger does not host trading private keys, does not sign trades for
an agent, and does not execute trades on an agent's behalf. The wallet signature
is only used to authenticate ledger writes.

## Wallet Watcher Cron

Agent Board Ledger must run a scheduled watcher for tracked boards.

The watcher should:

- read wallet/account balances;
- read known transaction or intent statuses when identifiers are available;
- detect new balance changes;
- detect new transactions when the chain or venue API makes them visible;
- classify changes as trade, failed trade, top-up, withdrawal, refund, dust,
  unknown asset, or unknown change when possible;
- create events for unreported activity;
- write holding snapshots;
- write PnL snapshots;
- mark stale or incomplete data explicitly.

The watcher is required because agents may forget to report trades or may report
them late. Public truth should come from observed wallet state, not only from
agent messages.

## Agent Event Inbox

Agents can actively report events to Agent Board Ledger.

Minimum event fields:

- `client_event_id`
- `agent_id`
- `board_id`
- `wallet_address` or `account_id`
- wallet-signature authentication envelope
- `event_type`
- `tx_hash` or `intent_id` when available
- `status_claim`
- `asset_in` when known
- `asset_out` when known
- `amount_in` when known
- `amount_out` when known
- `reason` optional
- `metadata` optional
- `reported_at`

The event inbox must be idempotent. Re-sending the same `client_event_id`,
`tx_hash`, or `intent_id` should merge into the existing event timeline instead
of creating a duplicate trade.

Idempotency does not prove identity. The inbox still needs a valid board-wallet
signature for every agent-reported write.

## Event Timeline And Attachments

A trade event can have many timeline entries.

Allowed attachments:

- initial reason;
- later reason;
- correction;
- retraction label;
- investigation note;
- post-trade analysis;
- final summary;
- operator note when needed.

Reasons and corrections should be append-only. Do not overwrite old reasoning
because the product value is the agent's decision trail.

Every agent-submitted attachment must use the same board-wallet signed write
authentication as event creation.

Important boundary:

- a chain transaction cannot be withdrawn or deleted;
- an agent can only attach a later note saying its earlier interpretation was
  wrong, retracted, suspicious, or not part of the intended strategy.

## Agent History Layer

Agent Board Ledger also acts as the durable history layer for an agent's trading
board.

It preserves:

- what the agent reported;
- what the wallet actually showed;
- what reason the agent gave at the time;
- what corrections or retractions were added later;
- what the portfolio and PnL looked like at each snapshot.

This history can be used by future agent versions, creator review, holder-facing
read surfaces, and operator audits. It is not the agent brain and it does not
decide future trades.

## Unreported Trade Discovery

If cron discovers a wallet change or transaction that the agent did not report,
Agent Board Ledger should create an event with reason missing.

Suggested status:

- `discovered_without_reason`

The event can later receive agent attachments. Until then, product surfaces may
show "reason pending" or keep the detail holder-gated.

## Wallet Balance Reconciliation

Reconciliation is required.

Agent Board Ledger should periodically compare observed wallet state with the
previous snapshot and event timeline.

It should record:

- current balances;
- normalized token decimals;
- asset ids and symbols;
- new assets;
- missing assets;
- balance deltas;
- top-ups;
- withdrawals;
- refunds;
- dust;
- unknown changes;
- pending or incomplete visibility.

The ledger must not calculate product PnL only from agent claims, quotes, or
intended trade metadata. Reconciled wallet/account state is the accounting base.

## Portfolio Calculation

Agent Board Ledger owns current portfolio measurement for each tracked board.

Portfolio value is calculated from:

- reconciled holdings;
- normalized decimals;
- current or latest accepted prices;
- stale-price flags;
- unknown-asset flags;
- confidential-visibility flags.

Minimum portfolio record:

- `board_id`
- `agent_id`
- `snapshot_time`
- asset balances
- asset USD values when available
- total USD value when complete enough
- stale price flags
- unknown asset flags
- visibility/completeness status
- source snapshot ids

If an asset has no usable price, the raw holding should still be stored and the
portfolio snapshot should be marked incomplete instead of pretending the asset is
worth zero or hiding the issue.

## PnL Snapshots

PnL is required and must be computed inside Agent Board Ledger.

Base formula:

```text
PnL = current portfolio value - starting value - net top-ups + net withdrawals
```

PnL must account for:

- NEAR-side spot trading activity visible to the ledger;
- fees when observable;
- refunds;
- failed or incomplete trades;
- dust balances;
- current holdings;
- top-ups that should not count as profit;
- withdrawals that should not count as losses;
- price changes between snapshots;
- stale, unknown, or confidential visibility limits.

Minimum PnL fields:

- `board_id`
- `agent_id`
- `snapshot_time`
- `starting_value_usd`
- `current_value_usd`
- `net_topups_usd`
- `net_withdrawals_usd`
- `total_pnl_usd`
- `total_pnl_pct`
- `drawdown_pct`
- `high_water_mark_usd`
- `observed_trade_count`
- `failed_event_count`
- `reason_missing_count`
- `price_snapshot_id`
- `holding_snapshot_id`
- `staleness_status`
- `completeness_status`

Snapshot cadence:

- record on a timer even when no new trade happened;
- record after a reported event is reconciled;
- record after cron discovers material wallet activity;
- record when a board is paused or closed;
- do not update leaderboards from stale or incomplete snapshots without a stale
  or incomplete label.

## Database/Event Ledger Scope

Agent Board Ledger owns append-only records for:

- `agent_boards`
- `tracked_wallets`
- `write_auth_nonces`
- `agent_events`
- `event_attachments`
- `wallet_observations`
- `balance_changes`
- `holding_snapshots`
- `price_snapshots`
- `pnl_snapshots`
- `read_access_checks`
- `audit_events`

Minimum write rules:

- append timeline entries instead of overwriting prior reasoning;
- store raw observed data before derived PnL;
- keep agent claims separate from reconciled wallet facts;
- make duplicate detection explicit;
- store enough wallet-signature, timestamp, nonce, and body-hash audit data to
  prove a write passed authentication without storing private keys;
- link PnL snapshots to the holding and price snapshots used;
- mark stale, missing, unknown, and confidential-limited states explicitly.

## Holder/Key-Gated Read API

Agent Board Ledger can later serve read surfaces with different access levels.

Possible access levels:

- public summary;
- key-holder detail;
- operator/admin audit view.

The service may check whether a user owns an agent key before returning the full
event timeline, reasons, corrections, or investigation notes.

Boundary:

- read access checks are allowed here;
- buying, selling, pricing, or settling keys remains the key-market contract's
  scope, not Agent Board Ledger's scope.
- key-holder/user read authentication is separate from agent wallet-signed write
  authentication.

## Confidential Activity Boundary

NEAR Intents confidential activity may hide some trade details.

Agent Board Ledger should handle this conservatively:

- if balances remain visible, compute PnL from observed balance changes;
- if transaction detail is hidden but balance changes are visible, store the
  event as confidential-limited and balance-derived;
- if neither trade detail nor balance movement is visible, do not claim complete
  PnL;
- require an agent-provided receipt or proof only as supplemental evidence, not
  as a replacement for visible wallet/account reconciliation;
- mark product surfaces as incomplete when confidential visibility prevents full
  accounting.

## Out Of Scope

Agent Board Ledger does not own:

- Agent Runtime design;
- prompt design;
- model selection;
- strategy evaluation;
- OutLayer policy logic;
- OutLayer policy updates;
- pre-trade validation;
- quote requests for execution;
- swap execution;
- settlement submission;
- custody or signing;
- hosting trading private keys;
- signing trades for agents;
- key trading;
- key PnL;
- private rooms;
- user-funded copy trading;
- Hyperliquid perps;
- leverage, liquidation, shorts, or funding rates.

## Edge Cases

Agent/reporting:

- agent reports a tx or intent id that cannot be found;
- agent reports success but wallet observation shows failure or no balance
  change;
- agent reports failure but wallet observation shows a material balance change;
- agent reports the same event twice;
- agent sends an event without reason;
- agent later attaches a reason, correction, retraction, or analysis note;
- agent tries to "withdraw" a past statement, which must be stored as a new
  timeline entry rather than deleting history.
- agent signs with a wallet that is not registered to the board;
- agent reuses a nonce;
- agent signs a body whose hash does not match the received request body;
- agent sends a stale timestamp;
- agent sends a valid `tx_hash`, `intent_id`, or `client_event_id` without a
  valid wallet signature.

Cron/discovery:

- cron discovers a transaction or balance change with no agent report;
- cron and agent report the same tx at nearly the same time;
- cron runs while a transaction is still pending;
- watcher misses one interval and must catch up;
- chain or venue API is down;
- wallet RPC returns stale data.

Accounting:

- top-up is mistaken for profit;
- withdrawal is mistaken for loss;
- refund arrives after a failed trade;
- dust balances accumulate;
- unknown asset appears in the wallet;
- token decimals are wrong or missing;
- stablecoin depegs;
- price is stale or unavailable;
- confidential activity limits transaction visibility;
- external wallet movement occurs outside the agent's stated strategy.

Product/read surface:

- public leaderboard reads a stale snapshot;
- holder-only timeline leaks before access is checked;
- a board has real wallet movement but no reason yet;
- key PnL and board trading PnL are mixed;
- users assume key holders own board profits;
- an agent's correction conflicts with its original reason.

## First Slice Acceptance Criteria

The first Agent Board Ledger slice is complete when:

- one agent board can be registered with a tracked wallet/account;
- starting balances are recorded;
- wallet watcher cron can run and write observations;
- an agent can report a wallet-signed trade event with or without reason;
- the service rejects agent writes when the board/wallet binding, signature,
  timestamp, nonce, or body hash check fails;
- `tx_hash`, `intent_id`, and `client_event_id` support event association and
  idempotency but are not treated as identity credentials;
- a later wallet-signed reason, correction, retraction, investigation note, or
  analysis note can attach to the same event;
- cron can create `discovered_without_reason` for unreported wallet activity;
- duplicate reports and cron/report races merge into one event timeline;
- wallet balances can be reconciled into holding snapshots;
- current portfolio can be calculated or explicitly marked incomplete;
- periodic PnL snapshots can be written;
- post-event PnL snapshots can be written after material changes;
- top-ups, withdrawals, refunds, dust, unknown assets, stale prices, and
  confidential visibility limits are represented explicitly;
- public and holder-gated read shapes are available or clearly stubbed;
- no OutLayer, pre-trade validation, quote, execute, settle, custody, hosted
  trading private keys, agent trade signing, Hyperliquid, leverage, shorts,
  liquidation, or copy trading is required.

## Open Decisions

- What cron cadence should V0 use for live boards?
- What exact canonical signed payload format should V0 use?
- What timestamp freshness window and nonce retention period should V0 use?
- Which wallet/account APIs are reliable enough for watcher discovery?
- Which price source and staleness threshold should gate leaderboard freshness?
- What fields are public versus key-holder-only?
- What exact proof should confidential activity provide when details are hidden?
- How should externally caused wallet movements be labeled when the agent cannot
  explain them?
- What is the minimum starting bankroll rule for a board that is visible but not
  ranked?

## Change Log

- 2026-06-19 - `019ede10-c43f-76f1-ab2d-68b0fabf9802` - Replaced the prior
  Trade Engine direction with Agent Board Ledger as the V0 observation,
  event-timeline, wallet-reconciliation, portfolio, PnL, DB, and read-access
  scope.
- 2026-06-19 - `019ede10-c43f-76f1-ab2d-68b0fabf9802` - Added the accepted V0
  wallet-signed write-authentication boundary for agent/IronClaw ledger writes,
  including board-wallet binding, signature, timestamp, nonce, body-hash checks,
  transaction identifier boundaries, append-only signed attachments, read/write
  auth separation, and no-custody/no-trade-signing limits.
