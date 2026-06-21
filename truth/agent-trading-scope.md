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
  activation, execution, and runtime. This amendment is historical and was
  superseded by the later IronClaw-side onboarding decision below.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-19
- Amendment basis: JY clarified that ClawHouse does not need a pre-trade Order
  Intent as the backend contract. V0 needs IronClaw-side onboarding with a
  manifest-verified runtime skill pack: one skill for Agent Board Ledger
  reporting, one skill for NEAR Intents spot value, and future trading value
  skills added through the same checked manifest/heartbeat update path.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-19
- Amendment basis: The IronClaw runtime skill pack was materialized in the repo
  as development artifacts under `skills/ironclaw-runtime/`: manifest,
  reporting skill, NEAR Intents spot value skill, heartbeat template, and
  reset/retest guide. Production hosting, signatures, and exact IronClaw
  installer mechanics remain unverified.
- Hyperliquid paper trading amendment session:
  `019ee644-a97f-7953-a80b-e6642cf53596`
- Amendment date: 2026-06-21
- Amendment basis: JY confirmed a new Agent Trading direction: ClawHouse should
  build a Hyperliquid-style paper trading service in the existing backend first,
  defer OutLayer, let agents submit orders to ClawHouse, validate against
  Hyperliquid market depth, support cross and isolated margin, liquidate
  positions in a timely way, feed labeled Paper PnL into leaderboard surfaces,
  retire NEAR Intents as the first agent-trading/PnL lane, and ship an
  installable runtime skill that lets agents trade through this service.
- Prior PaperTrade amendment session: `019ee646-2993-7b50-b6e3-bb7f9445131f`
- Amendment date: 2026-06-21
- Amendment basis: That parallel accepted direction defined PaperTrade as
  public paper plus board paper and limited Hyperliquid board paper to long-only
  spot with no leverage or liquidation. It is retained as provenance, but the
  later Hyperliquid paper trading amendment in session
  `019ee644-a97f-7953-a80b-e6642cf53596` supersedes the long-only spot limits
  for the current implementation.

## One Sentence

Agent Trading is the public performance story around curated ClawHouse agents:
agents send Hyperliquid-style paper orders to ClawHouse, ClawHouse validates and
simulates them against Hyperliquid market data, tracks margin/PnL/liquidation,
and gives users a labeled Paper leaderboard/feed to follow.

## Plain-Language Boundary

Agent Trading is not users buying and selling agent keys.

- Key trading answers: "Can I buy access to this agent, sell my key later, and
  maybe profit from key price movement?"
- Agent Trading answers: "What paper orders did this agent submit, would they
  have filled against Hyperliquid market depth, why did it trade, and did the
  labeled Paper PnL improve?"

These are separate surfaces. Key trading can exist before Agent Trading. Agent
Trading must not require changes to the bonding-curve key-market contract.

## Current V0 Decision

Current V0 uses a ClawHouse-hosted Hyperliquid-style paper trading engine.
OutLayer is deferred. NEAR Intents is no longer the first agent-trading/PnL
lane.

In V0:

- agents submit paper orders to ClawHouse over HTTPS;
- ClawHouse validates market, size, time-in-force, depth, slippage, leverage,
  margin mode, reduce-only behavior, and staleness before accepting an order;
- ClawHouse simulates fills against Hyperliquid market data instead of sending
  real orders to Hyperliquid;
- ClawHouse tracks paper accounts, open orders, fills, positions, margin,
  funding, PnL, drawdown, and liquidation events;
- cross margin and isolated margin are both first-version requirements;
- liquidation must be driven by fresh mark/risk data and written promptly;
- every accepted/rejected order, fill, risk check, liquidation, and leaderboard
  snapshot must have enough recorded inputs to replay or audit the result;
- Paper PnL can feed leaderboard surfaces only when labeled as paper;
- Agent Board Ledger may consume or display Paper events later, but it is not
  the paper matching, margin, or liquidation engine.

## Product Goal

Create a short-term consumer finance game where agent performance is visible
and verifiable enough to produce credible Paper receipts, leaderboards, holder
discussion, and shareable moments without putting real user funds into agent
perps execution.

The first version should optimize for:

- labeled paper execution that is backed by real Hyperliquid market data;
- Hyperliquid-like perps behavior that agents can use through a simple skill;
- low operational risk;
- visible agent decisions, reasons, and follow-up notes;
- deterministic replay of fills, margin, liquidation, and leaderboard PnL;
- clear separation from key price PnL.

## Initial Venue Direction

The current V0 agent-trading lane should treat Hyperliquid perps market data as
the first intended trading shape, while execution remains paper-only inside
ClawHouse.

Use documented/public Hyperliquid API and WebSocket surfaces for market data,
metadata, book depth, mark prices, funding inputs, and venue semantics. Do not
depend on Hyperliquid's frontend or undocumented private backend for the first
version.

Use Hyperliquid market data for:

- order book depth checks;
- IOC fills and GTC/ALO resting order simulation;
- mark-price-backed risk checks;
- cross and isolated margin accounting;
- funding/fee accounting where source data is available;
- liquidation checks;
- replay evidence for orders, fills, risk, liquidation, and leaderboard PnL.

Do not use Hyperliquid for:

- real order submission;
- custody;
- collecting or storing Hyperliquid API keys;
- claiming paper PnL is real realized trading PnL.

## IronClaw Runtime Skill Pack Boundary

V0 strategy onboarding happens inside IronClaw, not through ClawHouse holding an
IronClaw API key or ClawHouse executing a pre-trade order intent.

ClawHouse provides a runtime skill pack for IronClaw:

- `clawhouse-ledger-reporting`: tells the agent how to report completed,
  failed, refunded, skipped, or corrected trading events to Agent Board Ledger.
- `hyperliquid-paper-trading`: tells the agent how to create signed
  Hyperliquid-style paper orders, submit them to ClawHouse, read fills,
  positions, risk, liquidation, and replay proof, and stop when market/risk data
  is stale.
- `near-intents-spot-value`: legacy spot-value skill retained for manual or
  historical testing; it is not the first agent-trading/PnL lane after the
  Hyperliquid paper trading amendment.
- future trading value skills: separate venue/value adapters added through the
  same manifest verification path.

The ClawHouse onboarding skill runs inside the target IronClaw agent. It should:

- collect agent name, description, avatar reference, and trading strategy;
- read the ClawHouse runtime manifest;
- verify required runtime skill URL allowlist, name, version, sha256 hash, and
  permission declaration;
- install or guide the user through installing the required runtime skills;
- write the draft strategy/profile inside IronClaw memory/workspace;
- configure heartbeat checks for future runtime manifest updates;
- run dry checks and keep the strategy inactive until user confirmation.

The package must not contain:

- IronClaw API keys;
- wallet private keys, seed phrases, or raw signing material;
- ClawHouse backend execution credentials;
- deposit, withdrawal, or custody instructions;
- permission to withdraw funds;
- real-money venue execution, borrowing, withdrawals, or custody actions.

IronClaw owns:

- onboarding skill execution;
- runtime skill installation;
- user approval and activation inside IronClaw;
- API key, secret, wallet, and private-key storage;
- the execution loop;
- quote/trade submission through IronClaw-controlled tooling;
- deciding whether a proposed action is executable.

ClawHouse owns:

- publishing the onboarding skill, runtime skills, and manifest;
- receiving signed paper orders;
- validating paper order shape, market depth, slippage, margin, and staleness;
- simulating paper fills and resting paper orders;
- tracking cross and isolated margin;
- writing timely liquidation events;
- publishing replay/audit proof and labeled Paper leaderboard snapshots;
- receiving agent-reported events and notes through Agent Board Ledger;
- recording runtime pack version/hash and public metadata when provided;
- displaying public identity and observed Paper performance.

### Reporting Contract

ClawHouse needs a paper order as the backend contract for Hyperliquid-style
paper trading.

For Paper Trading, IronClaw submits a signed paper order to ClawHouse. The
order may include:

- `reason`: human-readable explanation;
- `strategy_hash`: hash of the strategy state or prompt capsule when available;
- `client_order_id`: idempotency key;
- `paper_account_id`;
- `coin`;
- `side`;
- `size`;
- `limit_px`;
- `order_type` with Hyperliquid-style time-in-force: `Ioc`, `Gtc`, or `Alo`;
- `reduce_only`;
- `margin_mode`: `cross` or `isolated`;
- `leverage`;
- `max_slippage_bps`;
- canonical signed-request envelope.

ClawHouse returns accepted, filled, resting, canceled, or rejected paper order
state with deterministic reason codes. Agent Board Ledger can receive a summary
event later, but it does not approve, quote, match, margin, liquidate, or
execute Paper Trading orders.

### Runtime Manifest And Update Checks

Runtime skills must be installed from a ClawHouse-controlled manifest.

Current development manifest artifact:

- repo path: `skills/ironclaw-runtime/manifest.json`;
- status: development distribution only;
- branch URLs may be used for manual testing;
- production distribution must later move to a stable ClawHouse-controlled URL
  and verified signature/hash policy.

The manifest should declare:

- pack name and version;
- skill name;
- skill version;
- skill URL;
- sha256 hash;
- whether the skill is required;
- required permissions/tools;
- forbidden behaviors;
- whether the update may auto-install or requires user confirmation.

Heartbeat may periodically check the manifest. It can only auto-install updates
that pass URL allowlist, hash/signature, name, version, and permission checks.
New skills, major version updates, permission expansion, unknown tools/MCPs, or
suspicious content must stop for user confirmation.

## Non-Negotiable Product Rules

- User-facing Agent Trading is Hyperliquid-style paper trading until a later
  truth amendment reintroduces real execution.
- Public Paper PnL, receipts, leaderboards, and share cards must come from
  ClawHouse paper engine events that reference real Hyperliquid market data and
  can be replayed.
- Development may use mocked events, dry checks, and tiny canary trades, but any
  non-real environment must be labeled as test-only and must not feed public
  performance.
- Agent Trading funds must be separate from key-market reserves.
- Agent Trading PnL must be separate from key PnL.
- Paper PnL must be labeled as paper anywhere it appears.
- The current V0 target includes long and short perps, leverage, cross margin,
  isolated margin, funding accounting, and liquidation in paper mode only.

## Board Ownership And Funding

An Agent Trading board is a paper account assigned to one approved agent.

For the first scope, the conservative default is:

- ClawHouse grants the paper starting balance for each approved agent account;
- normal users do not deposit funds into autonomous agent-controlled wallets;
- users participate first as watchers, key holders, followers, and later
  constrained copiers;
- any later user-funded copy flow must be separately scoped as Copy With
  Constraints.

Each board should track:

- board id;
- agent id;
- owner or funding source;
- paper account id;
- starting paper balance;
- current paper equity;
- current status;
- tracking start time;
- public or holder-gated visibility.

## Board Lifecycle

1. Draft
   - Agent profile exists.
   - Board/wallet tracking details are not public.
   - No public trading performance is shown.

2. Tracked
   - Paper account is registered.
   - Starting paper balance and allowed markets are recorded.
   - Runtime skill can authenticate against ClawHouse Paper Trading.

3. Live
   - Agent submits paper orders to ClawHouse.
   - ClawHouse validates, fills, rests, cancels, or rejects paper orders.
   - Board publishes labeled Paper positions, equity, PnL, drawdown, and
     liquidation state when data is fresh enough.

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

Agent Board Ledger is no longer the V0 paper matching, margin, or liquidation
engine. It remains useful for historical event timelines and read surfaces.

The Hyperliquid Paper Trading service owns:

- paper account registration;
- agent paper order inbox;
- order validation and idempotency;
- Hyperliquid market data snapshots;
- paper IOC fills and GTC/ALO resting orders;
- cross and isolated margin accounting;
- open position accounting;
- funding and fee accounting;
- liquidation worker and liquidation events;
- paper leaderboard snapshots;
- audit and replay proof;
- runtime skill API contract.

Agent Board Ledger may own or consume:

- trade event timeline and attachments;
- durable agent trading history for later agent versions and audits;
- DB/event ledger records;
- public and holder/key-gated read surfaces.

Agent Board Ledger does not own:

- agent strategy;
- agent runtime internals;
- Hyperliquid paper order validation;
- paper fill simulation;
- cross or isolated margin;
- liquidation;
- paper leaderboard calculation;
- key trading;
- copy trading.

## Product Surfaces

Minimum board page:

- agent identity;
- board status;
- current paper positions;
- starting paper balance;
- current paper equity;
- total Paper PnL;
- drawdown when available;
- latest paper order/fill/liquidation event;
- latest reason or "reason pending";
- data freshness state;
- public or holder-only visibility state.

Minimum leaderboard:

- Paper PnL;
- max drawdown when available;
- number of paper fills;
- failed or unresolved event count;
- liquidation count;
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
- "paper trade" label;
- venue label: Hyperliquid paper;
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
- mocked order books and market snapshots;
- mocked price snapshots;
- Hyperliquid read-only checks;
- local fill, margin, funding, PnL, and liquidation tests;
- failure simulation for missing reason, unknown asset, stale price, duplicate
  order, stale data, insufficient margin, insufficient depth, and liquidation
  replay mismatches.

Not allowed for public product:

- unlabeled fake trade receipts;
- non-replayable PnL on leaderboards;
- paper trades displayed as real trades;
- test wallets mixed with production boards.

Minimum verification before public board launch:

- register one paper account for one curated agent;
- record starting paper balance and allowed markets;
- submit one signed IOC paper order with a reason through the runtime skill;
- fill or reject that order from a recorded Hyperliquid book snapshot;
- submit or rest one GTC/ALO paper order and cancel or fill it deterministically;
- create cross margin and isolated margin positions in tests;
- run a risk/liquidation check that writes a liquidation event within the
  configured SLA for a forced adverse mark-price move;
- write Paper PnL snapshots on a timer and after a material event;
- expose public Paper summary and holder-gated detail shape;
- replay at least one order/fill/liquidation from stored inputs;
- keep key PnL separate from board trading PnL.

## Future Scope

These are not current V0 requirements:

- OutLayer policy integration;
- ClawHouse-hosted IronClaw API-key collection;
- local wallet/private-key generation by Codex, Claude, or the creator skill;
- copy-with-constraints;
- user-funded autonomous copy trading;
- real Hyperliquid order submission;
- portfolio margin, vaults, subaccounts, TWAP, TP/SL trigger orders, or real
  liquidator auctions;
- borrowing or real funding payments;
- agent custody/key-management infrastructure.

## Acceptance Criteria For Current V0 Agent Trading Slice

The first Agent Trading slice is done only when:

- an agent board exists separately from the key-market contract;
- the board has one paper account;
- agents can submit signed Hyperliquid-style paper orders with optional reason;
- IOC, GTC, and ALO paper order behavior is deterministic and tested;
- cross margin and isolated margin positions are deterministic and tested;
- paper liquidation writes events within the configured SLA under fresh market
  data;
- agents can append later reason, correction, retraction, or analysis entries;
- duplicate client order ids are idempotent;
- open positions, margin, equity, drawdown, funding, fees, and PnL are computed
  from paper engine state and Hyperliquid market data;
- Paper PnL snapshots are written periodically and after material events;
- stale market data blocks new open-risk orders and is visible in leaderboard
  state;
- holder/key-gated read API is scoped as a read surface, not key trading;
- no OutLayer, real order submission, custody, copy trading, or user-funded
  autonomous trading is required;
- IronClaw-side onboarding can verify and install the required ClawHouse runtime
  skills from a hash-pinned manifest without requiring ClawHouse to execute or
  activate the agent.

## Open Decisions

- What exact paper starting balance should each first public agent receive?
- Which exact stablecoin should be the base asset?
- Which asset universe is safe to display publicly when agents can technically
  trade unknown assets?
- What production deployment target will host the long-running liquidation
  worker before OutLayer migration?
- What price freshness threshold blocks leaderboard updates?
- What should be public versus key-holder-only in the event timeline?
- Which Hyperliquid markets are allowed for the first public season?
- What exact liquidation SLA should be product-facing after local proof:
  target is 2 seconds after fresh mark/book update for risk check and 5 seconds
  for liquidation event write.
- Whether IronClaw `skill_install` can install every runtime skill directly from
  the onboarding skill, or whether the UI must ask the user to approve some
  installations.
- What exact trust level and permissions externally hosted ClawHouse skills
  receive after URL installation.
- Whether IronClaw requires a restart/refresh before newly installed runtime
  skills become active.
- What exact runtime pack version/hash should ClawHouse display publicly after
  onboarding.
- What production URL and signing mechanism ClawHouse should use for runtime
  manifests after the development branch is replaced.

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
  `clawhouse_strategy_package.v0.json` format as an interim direction. This was
  later superseded by IronClaw-side onboarding.
- 2026-06-19 - `019ede0e-a276-7bc2-a6da-ded485719308` - Superseded the manual
  strategy-package / pre-trade Order Intent boundary with IronClaw-side
  onboarding and a manifest-verified runtime skill pack: reporting to Agent
  Board Ledger, NEAR Intents spot value, heartbeat update checks, and future
  trading value skills.
- 2026-06-19 - `019ede0e-a276-7bc2-a6da-ded485719308` - Added concrete
  development runtime-pack artifacts under `skills/ironclaw-runtime/` and kept
  production hosting, signatures, and exact IronClaw install mechanics as open
  verification items.
- 2026-06-21 - `019ee644-a97f-7953-a80b-e6642cf53596` - Replaced the NEAR
  Intents spot-first observation lane with ClawHouse-hosted Hyperliquid-style
  paper trading: agents submit signed paper orders to ClawHouse; ClawHouse
  validates depth, margin, risk, and staleness; supports IOC/GTC/ALO, cross and
  isolated margin, timely liquidation, Paper PnL leaderboard snapshots, audit
  replay proof, and an installable `hyperliquid-paper-trading` runtime skill;
  OutLayer and real Hyperliquid order submission remain future work.
- 2026-06-21 - `019ee646-2993-7b50-b6e3-bb7f9445131f` - Preserved the parallel
  PaperTrade provenance while resolving the merge conflict in favor of the
  later Hyperliquid-style paper trading scope from
  `019ee644-a97f-7953-a80b-e6642cf53596`, which requires cross/isolated margin
  and liquidation in paper mode.
