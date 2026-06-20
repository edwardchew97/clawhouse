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
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw generated an over-broad strategy during onboarding.
  JY confirmed that V0 onboarding should normalize user strategy into NEAR
  Intents spot-only scope, list unsupported parts as excluded from V0, and stop
  only when the strategy has no supported spot-swap subset.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: JY tested the IronClaw onboarding path and found that
  delegated default generation still invented cross-chain yield farming and
  plain `confirm` repeated pending requirements. The accepted Agent Trading
  boundary now requires NEAR Intents spot-only defaults and explicit draft
  confirmation semantics before activation.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw testing showed same-name `skill_install` did not
  update the already installed onboarding skill. Agent Trading onboarding now
  requires installed-version readback before continuing, with remove/reinstall
  required when IronClaw still shows an old onboarding skill version.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw testing of onboarding v0.1.3 showed that bare
  `confirm` still activated the test draft profile. Agent Trading onboarding now
  requires a hard activation phrase: plain confirmation only confirms the draft,
  while `ACTIVATE TRADING` is the only activation request phrase and is valid
  only after every blocker is cleared.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw testing of onboarding v0.1.4 showed plain
  confirmation still returned a long activation blocker checklist. Agent
  Trading onboarding now requires post-confirm responses to show blocker count
  plus one next setup action, not a full blocker checklist.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw testing of onboarding v0.1.5 still named every
  activation blocker after plain confirmation. Agent Trading onboarding now
  requires the compact post-confirm template and must not list multiple blocker
  keys after plain confirmation.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw testing of onboarding v0.1.6 still expanded plain
  confirmation into headings, state recap, and every activation blocker. Agent
  Trading onboarding now requires that once draft/runtime setup exists, plain
  confirmation must output only the fixed compact status template and one next
  setup action.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw testing of onboarding v0.1.7 showed plain
  confirmation still attempted memory/tool calls and requested optional tool
  installation approval. Agent Trading onboarding now requires plain
  confirmation to be text-only while blockers remain: no memory reads/writes,
  no tool calls, no optional tool discovery/install, and no runtime setup
  continuation.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw retest preparation found the compact confirmation
  template was described as five lines while the required status block has six
  lines. Agent Trading keeps the same behavior but now describes the response
  shape as a fixed six-line status block.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw testing of onboarding v0.1.9 showed plain
  `confirm` still performed memory reads/writes. Agent Trading onboarding now
  requires a highest-priority confirm interrupt: answer from existing chat
  context only, do not call tools, do not persist confirmation state, and output
  only the compact draft status block.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw testing of onboarding v0.1.10 showed that plain
  `confirm` still called the `echo` tool and delegated default strategy named
  `stNEAR`. Agent Trading onboarding now treats `echo` as a forbidden tool call
  for plain confirmation, and delegated/default strategy must not name stNEAR,
  LST/LSD, liquid staking derivatives, yield-bearing tokens, staking tokens,
  vault tokens, or vague asset buckets without an explicit non-yield allowlist.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw testing of onboarding v0.1.11 removed stNEAR/yield
  language but still invented USDT/BTC/ETH and generic asset buckets when the
  user delegated strategy. Agent Trading onboarding now requires delegated
  defaults to use exactly NEAR and USDC when no explicit asset allowlist is
  already shown in chat.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: IronClaw testing of onboarding v0.1.12 showed that an
  initial `/clawhouse-creator-onboarding ...` intake prompt could incorrectly
  trigger the compact draft-confirmed response before any draft strategy was
  generated. Agent Trading onboarding now requires exact-match confirmation
  semantics: slash onboarding commands and intake/strategy text must run normal
  draft generation first.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: JY reset the Agent Trading onboarding target after IronClaw
  testing showed too much verbose setup UX and over-narrow NEAR/USDC defaults.
  Agent Trading onboarding now targets one-command production setup: terse
  intake, immediate rejection of unsupported strategies/assets, automatic
  wallet/signer/runtime setup, ClawHouse board registration, heartbeat/routine
  startup, and final `Agent started` status without Proceed steps or blocker
  tables.
- Amendment session: `019ede0e-a276-7bc2-a6da-ded485719308`
- Amendment date: 2026-06-20
- Amendment basis: JY added the production funding gate. After setup, the
  IronClaw onboarding flow must immediately provide live funding QR/link/options
  and a quote/setup-derived minimum deposit, wait for funding confirmation, and
  only then start the trading routine.

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

Funding the agent is a setup gate, not a strategy permission. The setup flow
may show a funding QR/link/options generated from ClawHouse setup config and
live NEAR Intents / 1Click quote data. Trading strategy itself still cannot
manage deposits, withdrawals, custody, or transfer policy.

Do not treat NEAR Intents as:

- a perps venue;
- an order book;
- a funding-rate venue;
- a leverage venue;
- a liquidation engine;
- a high-frequency execution venue.

Hyperliquid perps remain a future, separate Agent Trading expansion. They should
not be mixed into current V0 unless JY explicitly reopens that direction.

## IronClaw Runtime Skill Pack Boundary

V0 strategy onboarding happens inside IronClaw, not through ClawHouse holding an
IronClaw API key or ClawHouse executing a pre-trade order intent.

ClawHouse provides a runtime skill pack for IronClaw:

- `clawhouse-ledger-reporting`: tells the agent how to report completed,
  failed, refunded, skipped, or corrected trading events to Agent Board Ledger.
- `near-intents-spot-value`: tells the agent how to evaluate and execute NEAR
  Intents / 1Click spot swaps from inside IronClaw.
- future trading value skills: separate venue/value adapters added through the
  same manifest verification path.

The ClawHouse onboarding skill runs inside the target IronClaw agent. It should:

- collect agent name, description, avatar reference, and trading strategy;
- validate that the strategy is NEAR Intents / 1Click spot-only before setup;
- reject unsupported strategies/assets immediately instead of silently
  narrowing them;
- read the ClawHouse runtime manifest;
- verify required runtime skill URL allowlist, name, version, sha256 hash, and
  permission declaration;
- install or verify the required runtime skills;
- create or bind IronClaw-managed wallet/signing identity without exposing
  secrets in chat;
- call the ClawHouse setup API to register the agent, board, wallet binding,
  ledger config, public profile, strategy, runtime pack version, and
  funding plus heartbeat/routine config;
- save returned runtime config inside IronClaw;
- generate a funding QR/link/options from live ClawHouse/NEAR Intents quote
  data and show the quote/setup-derived minimum deposit;
- monitor funding status;
- start the heartbeat/routine only after funding is confirmed and return only a
  terse running status.

The package must not contain:

- IronClaw API keys;
- wallet private keys, seed phrases, or raw signing material;
- ClawHouse backend execution credentials;
- deposit, withdrawal, or custody instructions outside the approved onboarding
  funding flow;
- permission to withdraw funds;
- unsupported venues, leverage, perps, borrowing, liquidation, shorts, or
  funding-rate mechanics.

The package must not save unsupported strategy content as executable strategy.
Unsupported ideas should be rejected at onboarding time. The current
`trading_strategy` must be NEAR Intents spot-only and all named assets must
resolve through the current official NEAR Intents supported token list and must
not be disabled by ClawHouse setup config.

If the creator delegates strategy generation by saying "you decide" or similar,
the default strategy must already be NEAR Intents spot-only. The agent must not
invent cross-chain yield farming, staking, lending, Aave, Compound, Lido,
LPing, vaults, EVM protocol execution, leverage, perps, shorts, or custody as
default V0 strategy content. It must choose only from currently supported
NEAR Intents spot assets. If the supported asset list is unavailable, onboarding
must stop with one setup-blocked line instead of inventing assets.

The production user experience must not include Proceed prompts, activation
blocker tables, or requests for users to provide `board_wallet_public_key`,
`CLAWHOUSE_BOARD_ID`, `CLAWHOUSE_LEDGER_BASE_URL`, or `near_intents_signer`.
Those are hidden runtime/setup concerns owned by IronClaw and ClawHouse setup
APIs. If one is unavailable, onboarding should return one terse
`Setup blocked: <missing capability>` line.

After setup succeeds, the agent is not running yet. Onboarding should show a
`Fund agent` status with a live minimum and payment URL/QR/options, then wait
for funding confirmation. The minimum must come from the ClawHouse setup config
or a live NEAR Intents / 1Click quote; do not hardcode a fixed minimum or invent
static all-chain deposit addresses. If the live minimum or payment surface is
unavailable, onboarding must stop with `Setup blocked: funding minimum
unavailable` or the specific missing capability.

Onboarding itself should not execute a trade. Trading decisions begin only
through the configured heartbeat/routine after both setup and funding
confirmation succeed.

The onboarding skill must also prove it is the current required installed
version before continuing. Same-name `skill_install` is not sufficient proof of
update because IronClaw can keep an older installed skill active. If IronClaw
still shows an old onboarding version, onboarding must stop until the user
removes the old skill in Settings > Skills and reinstalls from the approved
ClawHouse URL.

IronClaw owns:

- onboarding skill execution;
- runtime skill installation;
- funding confirmation and routine lifecycle inside IronClaw;
- API key, secret, wallet, and private-key storage;
- funding QR/payment option display and funding status monitoring;
- the execution loop;
- quote/trade submission through IronClaw-controlled tooling;
- deciding whether a proposed action is executable.

ClawHouse owns only:

- publishing the onboarding skill, runtime skills, and manifest;
- receiving agent-reported events and notes through Agent Board Ledger;
- recording runtime pack version/hash and public metadata when provided;
- providing setup/funding config and board registration APIs;
- displaying public identity and observed performance through Agent Board
  Ledger.

### Reporting Contract

ClawHouse does not need a pre-trade Order Intent as the backend contract.

After a trade run, IronClaw reports facts and notes to Agent Board Ledger. The
agent report may include:

- `reason`: human-readable explanation;
- `metadata.order`: structured summary of the agent's own run/order, not an
  instruction for ClawHouse to execute;
- `metadata.region`: optional region tag when configured;
- `tx_hash`;
- `intent_id`;
- `asset_in` and `amount_in`;
- `asset_out` and `amount_out`;
- `status_claim`: filled, failed, refunded, skipped, pending, or unknown.

Agent Board Ledger records what happened. It does not approve, quote, sign, or
execute the trade.

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
- delegated onboarding defaults that generate unsupported DeFi strategy;
- inventing a ClawHouse registry submission step.
- continuing onboarding with an outdated installed onboarding skill.

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
- IronClaw-side onboarding can verify and install the required ClawHouse runtime
  skills from a hash-pinned manifest without requiring ClawHouse to execute or
  activate the agent.
- IronClaw-side onboarding normalizes creator strategy into NEAR Intents
  spot-only V0 scope, rejects unsupported strategies/assets immediately, and
  does not continue to runtime setup when the strategy is outside current
  NEAR Intents supported spot assets.
- IronClaw-side onboarding can complete wallet/signer/runtime setup, ClawHouse
  board registration, funding gate, and heartbeat/routine startup without
  exposing bottom fields or asking the user to press Proceed.

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
- What exact ClawHouse setup API endpoint and auth model will replace the
  current development-only manual wiring for production one-command onboarding.

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
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Added the V0 strategy
  normalization gate: onboarding must narrow creator strategies to NEAR Intents
  spot-only execution, record unsupported ideas as `excluded_from_v0`, ask for
  confirmation, and stop rather than inventing a strategy when no spot-swap
  subset exists.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Added delegated
  default and confirmation semantics for Agent Trading onboarding: generated
  defaults must be NEAR Intents spot-only, plain `confirm` cannot activate
  trading, and confirmed drafts should show activation blockers plus one next
  setup action instead of repeating pending tasks.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Added installed-version
  gate: onboarding must read back the installed skill version and stop for
  remove/reinstall when IronClaw still has an old onboarding skill.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Tightened activation
  semantics after IronClaw v0.1.3 testing: plain `confirm` / approval language
  must keep the draft inactive, and `ACTIVATE TRADING` is the only activation
  request phrase after all blockers are cleared.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Tightened post-confirm
  UX after IronClaw v0.1.4 testing: draft confirmation must show blocker count
  plus one next setup action, not a full blocker checklist.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Added the compact
  post-confirm template after IronClaw v0.1.5 testing: plain confirmation must
  not list multiple blocker keys.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Tightened the compact
  post-confirm template after IronClaw v0.1.6 testing: once draft/runtime setup
  exists, plain confirmation must output only the fixed compact status
  template and no blocker details, summaries, headings, or recaps.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Tightened plain
  confirmation after IronClaw v0.1.7 testing: `confirm` is text-only while
  blockers remain, with no tool calls, memory reads/writes, optional tool
  installs, or runtime setup continuation.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Corrected the compact
  confirmation wording for v0.1.9: the required response is a six-line status
  block, not a five-line block.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Added the v0.1.10
  confirm interrupt after IronClaw v0.1.9 still called memory tools: plain
  approval must be answered from chat context only, with no tool calls and no
  persisted confirmation write.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Tightened v0.1.11
  after IronClaw v0.1.10 testing: plain confirmation must not call `echo` or
  any other tool, and delegated/default strategies must not name stNEAR,
  LST/LSD, liquid staking derivatives, yield-bearing tokens, staking tokens,
  vault tokens, or vague asset buckets without an explicit non-yield allowlist.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Tightened v0.1.12
  after IronClaw v0.1.11 testing: if no explicit asset allowlist is already
  shown in chat, delegated default executable assets must be exactly NEAR and
  USDC, with no USDT/BTC/ETH or generic asset buckets.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Tightened v0.1.13
  after IronClaw v0.1.12 testing: slash onboarding commands and intake text
  must run draft generation first; compact confirmation applies only when the
  entire user message exactly matches a plain approval phrase.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Superseded the
  draft/confirm/blocker-table onboarding model with v0.2.0 production
  onboarding: terse output, immediate strategy rejection, supported-asset
  validation through NEAR Intents/ClawHouse config, automatic wallet/signer,
  board, ledger, runtime config, and heartbeat/routine setup, then only
  `Agent started` or one-line `Setup blocked`.
- 2026-06-20 - `019ede0e-a276-7bc2-a6da-ded485719308` - Added the v0.2.1
  funding gate for Agent Trading onboarding: setup returns live funding
  QR/link/options and a quote/setup-derived minimum first; the routine starts
  only after funding is confirmed.
