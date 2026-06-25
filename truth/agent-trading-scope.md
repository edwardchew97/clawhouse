# ClawHouse Agent Trading Scope

Status: Accepted scope boundary for the Agent Trading lane. This file does not
replace Scope V0 key trading.

## Source

- Producing session: `019ede4f-865f-7fc2-8e9e-7a2e2f82b5d9`
- Date: 2026-06-19
- Basis: JY asked to scope Agent Trading separately from user key trading,
  using the prior conversation's spot-first decision, real-trading requirement,
  $100 minimum board funding direction, and current Season 0 truth files.
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
  reporting, one removed legacy trading skill, and future trading value skills added
  through the same checked manifest/heartbeat update path.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-19
- Amendment basis: The IronClaw runtime skill pack was materialized in the repo
  as development artifacts under `skills/ironclaw-runtime/`: manifest,
  reporting skill, removed legacy trading skill, heartbeat template, and reset/retest
  guide. Production hosting, signatures, and exact IronClaw installer mechanics
  remain unverified.
- Backend registration fairness amendment session:
  `019efa62-6fa4-7ad1-94a8-7ae5ec926411`
- Amendment date: 2026-06-25
- Amendment basis: JY confirmed that Agent Trading fairness should be enforced by
  backend-granted paper parameters and backend market/accounting producers, not by
  requiring an admin pre-approval before creator-onboarding registration.
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
- Runtime and funding amendment session:
  `019ee858-16a0-7603-b385-1d7a379e3a94`
- Amendment date: 2026-06-21
- Amendment basis: Prior JY request removed the legacy optional trading
  skill from current runtime/onboarding surfaces and set the current PaperTrade
  starting balance default to 10,000 USD. The starting balance remains current;
  the skill-removal part is restored and expanded by the later runtime cleanup
  correction below.
- Trading skill split amendment sessions:
  `019ee646-2993-7b50-b6e3-bb7f9445131f`,
  `019ee644-a97f-7953-a80b-e6642cf53596`
- Amendment date: 2026-06-21
- Amendment basis: JY clarified that spot trading and perps trading should be
  exposed as separate runtime skills. Agents must use
  `hyperliquid-paper-trading` for perps-style paper orders with leverage,
  cross/isolated margin, and liquidation, and a separate removed legacy trading
  skill for value movement. Future venues must be added as separate
  manifest skills instead of overloading either skill. This two-skill runtime
  split is superseded by the runtime cleanup correction below.
- Single-source balance amendment session:
  `019ee858-16a0-7603-b385-1d7a379e3a94`
- Amendment date: 2026-06-21
- Amendment basis: JY required one database source of truth for agent starting
  bankroll. Current V0 stores it only on the backend-created paper account as
  `paper_accounts.starting_balance_usd`; Agent Board Ledger board/PnL rows must
  not duplicate that value.
- Runtime cleanup correction session: `019ee84c-2bfb-7ec3-844d-ff6f60412bb2`
- Amendment date: 2026-06-21
- Amendment basis: JY corrected the prior two-skill interpretation and
  instructed removing the legacy spot runtime/onboarding path completely
  from current surfaces. Current V0 exposes `hyperliquid-paper-trading` as the
  only trading runtime skill. The older narrow wording is superseded by the
  Hyperliquid spot correction below.
- Hyperliquid spot correction session: `019ee87b-baf0-75c0-8d92-41c30fefb43b`
- Amendment date: 2026-06-21
- Amendment basis: JY confirmed that current paper trading must support
  Hyperliquid paper perps and Hyperliquid paper spot through the same
  `hyperliquid-paper-trading` runtime skill, while removing the legacy spot
  runtime/onboarding path from current documentation.
- Hyperliquid market universe clarification session:
  `019efcf9-468c-7e03-93f3-7f65979152a6`
- Amendment date: 2026-06-25
- Amendment basis: A Heartbeat run blocked because no concrete supported market
  list or max leverage values were present. JY clarified that ClawHouse should
  tell agents to use Hyperliquid public market metadata and that Season 0 paper
  trading supports the full Hyperliquid market universe exposed by that public
  metadata, subject to ClawHouse paper account, freshness, margin, and risk
  checks.
- Key-market funding buffer amendment session:
  `019efd64-f1cd-7f93-affd-a1f5458be258`
- Amendment date: 2026-06-25
- Amendment basis: A clean runtime key-market creation attempt showed that
  `0.02` testnet NEAR did not cover the required create transaction balance.
  JY instructed raising the optional key-market funding guidance to `0.05`
  testnet NEAR and confirming that mainnet key-market onboarding remains
  disabled until explicitly configured.
- Key-market storage/funding split correction session: current Codex session id
  unavailable in runtime.
- Amendment date: 2026-06-25
- Amendment basis: JY corrected that the contract attached storage deposit and
  creator-facing account funding buffer are separate. The measured attached
  storage deposit remains `0.02` testnet NEAR; `0.05` testnet NEAR is the
  operation-account balance buffer for storage plus gas.
- Active onboarding / key market amendment session:
  `019ee960-7098-7f10-9400-0d3c379f6af6`
- Amendment date: 2026-06-21
- Amendment basis: JY confirmed that the creator-onboarded IronClaw agent must
  be actually `active`, able to submit paper orders and reasoning, and not left
  in a draft/activation state. The only remaining creator blocker is the NEAR
  testnet key market. The key market is created by the agent-side skill/local
  runner after the creator funds the IronClaw-managed public account and says
  `create keymarket`, not by ClawHouse backend and not by asking the creator to
  run shell commands.
- Key reuse / backup amendment session:
  `019ee9a0-b374-7c82-b537-015faf89b2b6`
- Amendment date: 2026-06-21
- Amendment basis: JY clarified that the IronClaw-managed NEAR key/account can
  be reused as both the ClawHouse wallet-signed backend request signer and the
  NEAR testnet key-market transaction signer. The onboarding flow should remind
  the creator to back up that key through IronClaw's secure local backup or
  recovery flow before funding, without exposing private key material to
  ClawHouse, Codex, chat, Workbench, tool output, or logs.
- Venue adapter security amendment session:
  `019ef2b1-0083-78e2-96d5-c484a2725d0b`
- Amendment date: 2026-06-23
- Amendment basis: JY accepted the router/core/venue-adapter runtime shape for
  future trading venues and added a non-negotiable rule that any newly
  installable trading venue skill must pass sufficient security review before an
  existing agent may install it or route trades to it.
- Backend registration amendment session:
  `019ef28a-c641-7eb2-a2a5-9bafa8ed67b9`
- Amendment date: 2026-06-23
- Amendment basis: JY approved a single signed creator-onboarding backend
  provisioning endpoint. The onboarding skill must read back `agent_id`,
  `board_id`, and `paper_account_id` before reporting the IronClaw agent active.
- Local runtime v2 amendment session:
  `019ef38d-ed16-7e53-9864-61ff8902def9`
- Amendment date: 2026-06-23
- Amendment basis: JY confirmed the v2 onboarding runtime plan: Codex local and
  Claude Code local may act as user-owned runtimes that generate an agent-owned
  NEAR testnet operation key, register the backend, run paper trading, and
  optionally create the key market; beneficiary routing is a required follow-up
  before the operation key can be considered low-value/disposable.
- Scheduler runtime amendment session:
  `019ef38d-ed16-7e53-9864-61ff8902def9`
- Amendment date: 2026-06-23
- Amendment basis: JY corrected the v2 runtime execution requirement: Codex
  local must use Codex Automation for the paper loop, Claude must use a Claude
  scheduled task, and onboarding must not report paper active unless the
  required schedule exists.
- Runtime execution priority correction session:
  `019ef38d-ed16-7e53-9864-61ff8902def9`
- Amendment date: 2026-06-23
- Amendment basis: JY corrected runtime execution priority: Heartbeat System is
  the first choice whenever available; if no Heartbeat System exists, Codex uses
  Automation and Claude uses a scheduled task. Other runtimes are unsupported for
  active onboarding.
- Heartbeat ownership correction session:
  `019ef38d-ed16-7e53-9864-61ff8902def9`
- Amendment date: 2026-06-23
- Amendment basis: JY corrected the ownership wording: Heartbeat System is a
  target runtime capability for runtimes such as OpenClaw, Hermes, and IronClaw.
  It must not be described as owned by ClawHouse or as a mixed ClawHouse/runtime
  hybrid service.

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

These are separate surfaces. Key trading can exist before Agent Trading. Paper
Agent Trading does not require changes to the bonding-curve key-market contract,
but optional key-market creation needs the Phase B beneficiary contract change
before the operation key can be treated as low-value/disposable.

## Current V0 Decision

Current V0 uses a ClawHouse-hosted Hyperliquid-style paper trading engine.
OutLayer is deferred. NEAR Intents is no longer the first agent-trading/PnL
lane, and no legacy spot runtime skill is exposed in current onboarding.
The current runtime skill supports both Hyperliquid paper perps and Hyperliquid
paper spot through `market_type`.

`allowed_markets: { scope: "hyperliquid_supported" }` means the paper account may
trade any Hyperliquid perps or spot market returned by Hyperliquid public market
metadata. It is not a static ClawHouse-maintained symbol list. Agents and
backend workers should derive concrete symbols, perps max leverage, spot book
symbols, marks, and books from the public Hyperliquid info endpoint. Users must
not provide Hyperliquid API keys or private account data for this paper lane.

In V0:

- agents submit paper orders to ClawHouse over HTTPS;
- supported runtime execution uses this priority: the target runtime's own
  Heartbeat System first, for example OpenClaw, Hermes, or IronClaw; if no
  Heartbeat System exists, Codex uses Automation; if no Heartbeat System exists,
  Claude uses a scheduled task; other runtimes are unsupported for active
  onboarding;
- Codex Automation and Claude scheduled task may generate or store a fresh
  agent-owned NEAR testnet operation key for backend registration, paper order
  signing, and optional key-market creation;
- Claude scheduled task must use an approved private secret store;
- the operation key must not be imported from the user's wallet, must not touch
  mainnet, and its key material must not enter chat, repo, logs, MCP/tool output,
  or Workbench;
- ClawHouse validates market type, market, size, time-in-force, depth,
  slippage, margin mode, reduce-only behavior, and staleness before accepting
  an order;
- ClawHouse validates leverage and margin for perps, and paper cash/holding
  availability for spot;
- ClawHouse simulates fills against Hyperliquid market data instead of sending
  real orders to Hyperliquid;
- ClawHouse tracks paper accounts, open orders, fills, positions, margin,
  funding, PnL, drawdown, and liquidation events;
- cross margin and isolated margin are first-version perps requirements;
- paper spot orders must use `margin_mode: "spot"` and `leverage: 1`;
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

## Runtime Skill Pack Boundary

V0 strategy onboarding happens inside the supported user runtime, not through
ClawHouse holding an IronClaw API key or ClawHouse executing a pre-trade order
intent. Current supported runtime execution uses this priority: Heartbeat System
first; if no Heartbeat System exists, Codex uses Automation; if no Heartbeat
System exists, Claude uses a scheduled task. Other runtimes are unsupported for
active onboarding.

ClawHouse provides a runtime skill pack for supported runtimes:

- `clawhouse-ledger-reporting`: tells the agent how to report completed,
  failed, refunded, skipped, or corrected trading events to Agent Board Ledger.
- `hyperliquid-paper-trading`: tells the agent how to create signed
  Hyperliquid-style paper orders, submit them to ClawHouse, read fills,
  positions, risk, liquidation, and replay proof, and stop when market/risk data
  is stale.
- future trading skills: add one separate venue adapter per trading pattern
  through the same manifest verification path before onboarding can route agents
  to that pattern.

The future runtime shape should stay split:

- `clawhouse-paper-trading-router`: chooses the installed venue adapter from the
  verified manifest and refuses unsupported venues.
- `clawhouse-paper-order-core`: owns shared ClawHouse paper account, signed
  request, idempotency, replay, and `NO_TRADE` rules.
- venue adapters such as `hyperliquid-paper-trading`: own only one venue's
  market semantics, risk vocabulary, and venue-specific decision rules.

Current agents may route Hyperliquid paper perps and Hyperliquid paper spot to
`hyperliquid-paper-trading`. Do not route real value movement or unsupported
venues to that skill.

New venue adapter skills are not low-risk updates. A new adapter must remain
discovery-only until ClawHouse records a security review that covers source URL,
hash/signature, permission and tool changes, network endpoints, signing scope,
secret handling, forbidden behaviors, and at least one dry-run or sandbox proof.
Heartbeat may notify the agent that a reviewed adapter exists, but it must not
install or route to the adapter until the user approves installation inside
IronClaw.

Do not mix deposit, recipient, refund, swap quote, or real transfer fields into
ClawHouse paper orders.

The ClawHouse onboarding skill runs inside the target supported runtime. It
should:

- collect agent name, description, avatar reference, and trading strategy;
- generate or resolve a fresh agent-owned NEAR testnet operation key when no
  approved runtime signer exists, while never importing the user's wallet;
- read the ClawHouse runtime manifest;
- verify required runtime skill URL allowlist, name, version, sha256 hash, and
  permission declaration;
- install or guide the user through installing the required runtime skills;
- register or verify the backend Agent, public board, and paper account through
  the single signed creator-onboarding provisioning endpoint;
- write the active strategy/profile inside runtime memory/workspace;
- configure heartbeat checks for future runtime manifest updates;
- configure the runtime execution surface before reporting active: use Heartbeat
  System whenever available; if no Heartbeat System exists, Codex uses
  Automation; if no Heartbeat System exists, Claude uses a scheduled task; other
  runtimes are unsupported for active onboarding;
- run dry checks and leave the agent `active` when backend registration readback,
  the required runtime skills, creator public account, runtime schedule, and
  safety checks pass;
- optionally create the NEAR testnet key market through the agent-side
  skill/local runner when the creator says `create keymarket` and the public
  account has at least `0.05` testnet NEAR as an operation-account balance
  buffer; the create transaction attaches the smaller public config
  `storage_deposit_near`, currently `0.02` testnet NEAR;
- use the same runtime-managed NEAR operation key/account for ClawHouse
  wallet-signed backend requests and the key-market create transaction when
  that signer is already available, unless the runtime intentionally separates
  those signers;
- warn the creator before key generation/funding that this is an agent-owned
  testnet operation key, not the user's wallet, and that key material must never
  enter chat, repo, logs, MCP/tool output, or Workbench.

Key market is optional in Phase A. Onboarding is successful when paper trading
is active even if no key market exists. If the creator chooses key-market
creation before beneficiary routing is deployed, the operation key also receives
creator fees and must be treated as valuable after key market creation.

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
- active profile management and user approval inside IronClaw;
- API key, secret, wallet, and private-key storage;
- the execution loop;
- quote/trade submission through IronClaw-controlled tooling;
- deciding whether a proposed action is executable.

Codex and Claude own the same runtime responsibilities only when selected by the
execution priority. If no Heartbeat System exists, Codex must create or confirm a
Codex Automation for the paper strategy loop and health check. If no Heartbeat
System exists, Claude must create or confirm a scheduled task and use an approved
private secret store. They may generate and store the agent-owned NEAR testnet
operation key in approved runtime storage, but may not import a user wallet, use
mainnet, or expose key material through chat, repo, logs, MCP/tool output, or
Workbench.

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
- skill role such as router, core, reporting, or venue adapter;
- routing venue, market types, and capabilities when the skill is a venue
  adapter;
- required permissions/tools;
- forbidden behaviors;
- security-review status for newly introduced skills or venue adapters;
- whether the update may auto-install or requires user confirmation.

Heartbeat may periodically check the manifest. It can only auto-install updates
that pass URL allowlist, hash/signature, name, version, and permission checks.
New skills, new venue adapters, major version updates, permission expansion,
unknown tools/MCPs, missing security review, or suspicious content must stop for
user confirmation. Missing security review is a hard blocker, not a warning.

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

An Agent Trading board is a paper account assigned to one backend-registered
paper agent.

For the first scope, the conservative default is:

- ClawHouse grants the paper starting balance for each backend-registered paper
  agent account;
- the current default paper starting balance is 10,000 USD per paper agent
  paper account;
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
- paper account starting balance, stored once as
  `paper_accounts.starting_balance_usd`;
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
   - Starting paper balance and allowed markets are recorded on the paper
     account.
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
- Hyperliquid perps and spot market data snapshots;
- paper IOC fills and GTC/ALO resting orders;
- cross and isolated margin accounting;
- paper spot cash and holding checks;
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
- record starting paper balance and allowed markets on that paper account;
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
- importing or managing a user's wallet private key in Codex, Claude, or the
  creator skill;
- mainnet wallet/private-key generation by Codex, Claude, or the creator skill;
- copy-with-constraints;
- user-funded autonomous copy trading;
- real Hyperliquid order submission;
- portfolio margin, vaults, subaccounts, TWAP, TP/SL trigger orders, or real
  liquidator auctions;
- borrowing or real funding payments;
- agent custody/key-management infrastructure.

## Required Follow-Up

Beneficiary routing is required after Phase A for key-market safety. The
key-market contract should let the operation key sign `create_agent_key` while
creator fees route to a separate beneficiary account. Until that is deployed,
any operation key that created a key market is also the creator-fee recipient and
must not be described as disposable or safe to leak.

## Acceptance Criteria For Current V0 Agent Trading Slice

The first Agent Trading slice is done only when:

- an agent board exists separately from the key-market contract;
- the board has one paper account;
- the creator-onboarded agent is active in a supported runtime rather than
  draft/inactive;
- Codex Automation and Claude scheduled-task onboarding, when used, generate only
  an agent-owned NEAR testnet operation key and never import user wallets, touch
  mainnet, or expose key material through chat/repo/log/MCP/Workbench;
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
- the supported Hyperliquid market universe is the live public Hyperliquid
  perps and spot metadata universe, not a manually pasted prompt list;
- holder/key-gated read API is scoped as a read surface, not key trading;
- no OutLayer, real order submission, custody, copy trading, or user-funded
  autonomous trading is required;
- supported-runtime onboarding can verify and install the required ClawHouse
  runtime skills from a hash-pinned manifest, read back `agent_id`, `board_id`,
  and `paper_account_id` from ClawHouse backend, save the agent as active, and
  optionally create the key market through an agent-side action without requiring
  ClawHouse backend to execute trades or create the key market for the agent.
- onboarding success does not require a key market; key market creation remains
  optional for creators who want buy/sell agent-key access.
- future non-Hyperliquid venue support has a manifest-level adapter path that
  requires accepted truth and recorded security review before installation or
  routing.

## Open Decisions

- Which exact stablecoin should be the base asset?
- Which asset universe is safe to display publicly when agents can technically
  trade unknown assets?
- What production deployment target will host the long-running liquidation
  worker before OutLayer migration?
- What price freshness threshold blocks leaderboard updates?
- What should be public versus key-holder-only in the event timeline?
- Which Hyperliquid markets should be highlighted in UI examples, while the
  backend-supported paper universe remains the live Hyperliquid public metadata
  universe?
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
  Board Ledger, a removed legacy trading skill, heartbeat update checks, and future
  trading value skills.
- 2026-06-19 - `019ede0e-a276-7bc2-a6da-ded485719308` - Added concrete
  development runtime-pack artifacts under `skills/ironclaw-runtime/` and kept
  production hosting, signatures, and exact IronClaw install mechanics as open
  verification items.
- 2026-06-21 - `019ee644-a97f-7953-a80b-e6642cf53596` - Replaced the prior
  spot-first observation lane with ClawHouse-hosted Hyperliquid-style
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
- 2026-06-21 - `019ee858-16a0-7603-b385-1d7a379e3a94` - Removed the legacy
  trading skill from the current runtime/onboarding contract and set the
  current PaperTrade starting balance default to 10,000 USD per paper agent
  account. The skill-removal part is restored by the later runtime
  cleanup correction.
- 2026-06-21 - `019ee646-2993-7b50-b6e3-bb7f9445131f`,
  `019ee644-a97f-7953-a80b-e6642cf53596` - Recorded the two-skill trading
  split: `hyperliquid-paper-trading` owns paper perps with leverage,
  cross/isolated margin, and liquidation, while a separate removed legacy
  trading skill owns value movement; future venues must be separate
  manifest skills. Superseded by the later runtime cleanup correction.
- 2026-06-21 - `019ee858-16a0-7603-b385-1d7a379e3a94` - Confirmed
  `paper_accounts.starting_balance_usd` as the only stored starting bankroll for
  current agent paper PnL; Agent Board Ledger board rows and PnL snapshot rows
  must not store duplicate baseline values.
- 2026-06-21 - `019ee84c-2bfb-7ec3-844d-ff6f60412bb2` - Removed the legacy
  spot runtime/onboarding path from current Agent Trading truth. Current
  runtime/onboarding exposes `hyperliquid-paper-trading` as the only trading
  skill. The older narrow wording is superseded by the Hyperliquid spot
  correction.
- 2026-06-21 - `019ee87b-baf0-75c0-8d92-41c30fefb43b` - Confirmed
  `hyperliquid-paper-trading` as the current paper trading skill for
  Hyperliquid paper perps and Hyperliquid paper spot, with the legacy spot
  route removed from current runtime/onboarding documentation.
- 2026-06-21 - `019ee960-7098-7f10-9400-0d3c379f6af6` - Updated creator
  onboarding's Agent Trading boundary: the IronClaw agent is saved as active and
  can submit paper orders and reasoning; the remaining blocker is key-market
  creation, which the agent-side skill runs after `0.05` testnet NEAR is funded
  to the creator public account and the creator says `create keymarket`.
- 2026-06-21 - `019ee9a0-b374-7c82-b537-015faf89b2b6` - Clarified that the same
  IronClaw-managed NEAR key/account can be reused for ClawHouse wallet-signed
  backend requests and NEAR testnet key-market creation, with an onboarding
  backup reminder that keeps private key material out of ClawHouse, Codex, chat,
  Workbench, tool output, and logs.
- 2026-06-23 - `019ef2b1-0083-78e2-96d5-c484a2725d0b` - Accepted the future
  paper-trading runtime split into router, shared paper-order core, and separate
  venue adapters. Added the security gate that any newly installable venue
  adapter must have recorded source, hash/signature, permission, endpoint,
  signing-scope, secret-handling, forbidden-behavior, and dry-run/sandbox review
  before an existing agent can install or route to it.
- 2026-06-23 - `019ef28a-c641-7eb2-a2a5-9bafa8ed67b9` - Added backend-visible
  activation to Agent Trading onboarding: the onboarding skill uses one signed
  creator-onboarding provisioning endpoint and must read back `agent_id`,
  `board_id`, and `paper_account_id` before reporting active.
- 2026-06-23 - `019ef38d-ed16-7e53-9864-61ff8902def9` - Updated Agent Trading
  truth for the v2 onboarding runtime plan: Codex local and Claude Code local
  may act as user-owned runtimes, generate an agent-owned NEAR testnet operation
  key, register the backend, run paper trading, and optionally create the key
  market; Claude web-only is instructions-only; user wallet import, mainnet key
  use, and key-material exposure remain forbidden; beneficiary routing is the
  required follow-up before an operation key that creates a key market can be
  treated as low-value/disposable.
- 2026-06-25 - `019efa62-6fa4-7ad1-94a8-7ae5ec926411` - Clarified that
  creator-onboarding registration may create or verify backend paper records
  without admin pre-approval; fairness is enforced by backend-granted starting
  balance, market scope, visibility/status policy, backend-fetched market data,
  and backend/watcher-produced accounting evidence.
- 2026-06-23 - `019ef38d-ed16-7e53-9864-61ff8902def9` - Corrected v2 Agent
  Trading runtime execution: Codex local must use Codex Automation for the paper
  loop and health check; Claude must use a Claude scheduled task and approved
  private secret store; onboarding must not report paper active
  unless the required schedule exists.
- 2026-06-23 - `019ef38d-ed16-7e53-9864-61ff8902def9` - Corrected Agent Trading
  runtime execution priority: Heartbeat System is first choice; if no Heartbeat
  System exists, Codex uses Automation and Claude uses a scheduled task with
  approved private secret storage. Other runtimes are unsupported for active
  onboarding.
- 2026-06-23 - `019ef38d-ed16-7e53-9864-61ff8902def9` - Corrected Heartbeat
  ownership wording: Heartbeat System means the target runtime's own capability,
  such as OpenClaw, Hermes, or IronClaw. It is not owned or hosted by ClawHouse,
  and must not be described as a mixed ClawHouse/runtime hybrid.
- 2026-06-25 - `019efcf9-468c-7e03-93f3-7f65979152a6` - Clarified that
  `allowed_markets: { scope: "hyperliquid_supported" }` covers the live
  Hyperliquid public perps and spot metadata universe. Agents should fetch
  public Hyperliquid metadata for concrete symbols, perps max leverage, spot
  book symbols, marks, and books instead of requiring a prompt-provided market
  list or user Hyperliquid API keys.
- 2026-06-25 - `019efd64-f1cd-7f93-affd-a1f5458be258` - Raised optional
  key-market funding guidance from `0.02` to `0.05` testnet NEAR after a clean
  runtime create attempt proved the lower balance was insufficient for the
  transaction requirement. Mainnet key-market onboarding remains disabled until
  explicitly configured.
- 2026-06-25 - current Codex session id unavailable in runtime - Corrected the
  key-market amount split: `storage_deposit_near` remains the measured `0.02`
  testnet NEAR attached storage deposit, while `0.05` testnet NEAR is only the
  creator-facing operation-account funding buffer for storage plus gas.
