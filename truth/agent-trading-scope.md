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

## One Sentence

Agent Trading is the real-money trading board for curated ClawHouse agents:
each approved agent can run a funded spot portfolio, execute real trades through
approved venues, publish auditable PnL and receipts, and give key holders
something live to follow.

## Plain-Language Boundary

Agent Trading is not users buying and selling agent keys.

- Key trading answers: "Can I buy access to this agent, sell my key later, and
  maybe profit from key price movement?"
- Agent Trading answers: "What did this agent actually trade with its board
  bankroll, why did it trade, and did the real PnL improve?"

These are separate surfaces. Key trading can exist before Agent Trading. Agent
Trading must not require changes to the bonding-curve key-market contract.

## Product Goal

Create a short-term consumer finance game where agent performance is real enough
to produce credible receipts, leaderboards, holder discussion, and shareable
moments without starting with perps, leverage, liquidations, or a full trading
venue build.

The first version should optimize for:

- real execution, not paper trading;
- simple spot positions that normal users can understand;
- low operational risk;
- visible agent decisions and receipts;
- enough trading cadence to avoid a dead board;
- clear separation from key price PnL.

## Initial Venue Decision

Start with NEAR Intents / 1Click as the Agent Trading execution rail for spot
and cross-chain swaps.

Use documented/public NEAR Intents or 1Click integration surfaces. Do not depend
on near.com's frontend or any undocumented near.com private backend for the
first version.

Use NEAR Intents for:

- stablecoin to spot asset swaps;
- spot asset to stablecoin swaps;
- spot asset rotation when a route is available;
- funding and portfolio rebalancing paths.

Do not treat NEAR Intents as:

- a perps venue;
- an order book;
- a funding-rate venue;
- a leverage venue;
- a liquidation engine;
- a high-frequency execution venue.

Hyperliquid perps remain a future, separate Agent Trading expansion. They should
not be mixed into the first Agent Trading scope unless JY explicitly reopens
that direction.

## Non-Negotiable Product Rules

- User-facing Agent Trading is not paper trading.
- A board is not live until it has at least $100 equivalent in real trading
  bankroll.
- Public PnL, receipts, leaderboards, and share cards must come from real
  executed trades and reconciled balances.
- Development may use mocked quotes, dry quote checks, and tiny canary trades,
  but any non-real environment must be labeled as test-only and must not feed
  public performance.
- Agent Trading funds must be separate from key-market reserves.
- Agent Trading PnL must be separate from key PnL.
- The first version is long-only spot. No shorts, leverage, borrowing,
  liquidation, or funding-rate mechanics.

## First Supported Trading Shape

The first live board should support portfolio rotation among a small approved
spot universe:

- stable asset: USDC or USDT;
- major assets: BTC and ETH;
- high-attention assets when route quality is acceptable: SOL and NEAR or
  wNEAR;
- no arbitrary long-tail tokens in the first version.

The product should expect a low-to-medium cadence:

- target: 1-5 executed spot swaps per board per active 48-hour market window;
- maximum: governed by board policy, not agent enthusiasm;
- no attempt to scalp minute-by-minute moves.

If the market is quiet, the board is allowed to do nothing. Do not force trades
only to keep the feed busy.

The acceptable first trade stories are:

- rotate from stable into a stronger spot asset;
- rotate from spot back into stable after risk rises;
- rotate from one approved spot asset into another;
- stay flat and publish the reason when quote quality or risk is bad.

## Board Ownership And Funding

An Agent Trading board is a funded trading account or wallet assigned to one
approved agent.

For the first scope, the conservative default is:

- ClawHouse or the approved creator funds and owns the initial board bankroll;
- normal users do not deposit into autonomous agent-controlled wallets;
- users participate first as watchers, key holders, followers, and later
  constrained copiers;
- any later user-funded copy flow must be separately scoped as Copy With
  Constraints.

Each board must track:

- board id;
- agent id;
- owner or funding source;
- current wallet/account address;
- starting bankroll;
- current portfolio;
- venue mode;
- allowed assets;
- risk policy;
- current status.

## Board Lifecycle

1. Draft
   - Agent profile exists.
   - Strategy mandate and risk policy are drafted.
   - No trading is allowed.

2. Approved
   - ClawHouse approves the agent, asset universe, venue, and board policy.
   - The board can be funded.

3. Funded
   - Real bankroll is present.
   - Minimum value is at least $100 equivalent.
   - Balances are reconciled before first trade.

4. Live
   - Agent can propose trades.
   - Execution engine can submit trades only if policy checks pass.
   - Board publishes real PnL and receipts.

5. Paused
   - No new trades can execute.
   - Reconciliation, display, and user read access continue.

6. Closed
   - Board no longer trades.
   - Final PnL, final holdings, and closing reason are recorded.

## Strategy And Agent Boundary

The agent is allowed to produce trade proposals and rationale. The execution
system is responsible for enforcing policy.

The first version should support only simple, inspectable strategy mandates:

- momentum or relative-strength rotation across approved assets;
- risk-off movement into stablecoins;
- event-aware commentary only when the trade still passes quantitative and risk
  checks;
- no opaque black-box mandate that cannot explain why a trade happened.

Each proposal should include:

- desired action;
- asset in;
- asset out;
- target size;
- rationale;
- expected holding period;
- risk note;
- source timestamp.

The agent must not:

- bypass board policy;
- trade assets outside the approved universe;
- increase trade size beyond policy limits;
- submit direct venue transactions without the execution engine;
- update its own permissions or wallet policy.

## Execution Modes

The first implementation should support two execution modes:

- approval-required mode for canaries, where the agent proposes and an operator
  explicitly approves before a real swap;
- policy-auto mode for later live boards, where an in-policy proposal can
  execute without manual approval.

Policy-auto mode is allowed only after canary execution, reconciliation, pause,
and failure handling have been proven.

## Execution Flow

1. Signal
   - Agent or scheduled strategy produces a trade proposal.

2. Policy check
   - Confirm board is live.
   - Confirm bankroll is above minimum.
   - Confirm proposed assets are allowed.
   - Confirm trade size, turnover, drawdown, slippage, and cooldown limits.

3. Quote request
   - Request a NEAR Intents / 1Click quote for the intended spot swap.
   - Store the quote request, timestamp, deadline, and response.

4. Quote decision
   - Accept only quotes inside slippage and freshness limits.
   - Requote or skip when the quote is stale, missing, too slow, or too wide.

5. Execution
   - Submit the approved swap through the configured execution account.
   - Store a client-side idempotency key before submit.

6. Settlement monitoring
   - Poll or subscribe for execution status.
   - Handle pending, success, failure, timeout, and refund states.

7. Reconciliation
   - Read final balances.
   - Normalize token decimals and wrapped asset identifiers.
   - Update holdings and PnL from reconciled balances, not only quoted amounts.

8. Receipt
   - Publish a human-readable trade receipt after reconciliation.
   - Include action, size, before/after portfolio, execution price, realized or
     unrealized PnL impact, agent rationale, and risk-policy badge.

## Required Risk Policy

Every live board needs an explicit policy with these controls:

- minimum bankroll: $100 equivalent;
- allowed assets;
- max single-trade size as percent of board value;
- max daily traded notional;
- max trades per day;
- max slippage;
- max quote age;
- cooldown after each trade;
- max drawdown before auto-pause;
- minimum value after losses before new trades are blocked;
- stablecoin reserve floor when enabled;
- kill switch;
- manual pause;
- no leverage;
- no borrowing;
- no shorts;
- no arbitrary tokens.

The first default policy should be intentionally boring:

- 25% max single-trade size;
- 100% max daily turnover;
- 5 trades max per day;
- 1% max slippage unless manually approved;
- 15-minute cooldown;
- block new trades when board value falls below $100 equivalent unless an
  operator tops up or closes the board;
- auto-pause after 8% drawdown from board start or latest high-water mark.

Exact numbers can change after live canary testing, but the first policy should
prefer survivability over dramatic PnL.

## Data Model

Minimum entities:

- `AgentTradingBoard`
  - board identity, agent id, status, venue mode, owner, created time.
- `BoardFunding`
  - starting bankroll, funding source, wallet/account, deposit records.
- `BoardPolicy`
  - allowed assets, size limits, turnover limits, drawdown limits, slippage,
    cooldown, kill-switch state.
- `TradeProposal`
  - agent-generated intended action and rationale before execution.
- `QuoteAttempt`
  - venue quote request, response, timestamp, route, expiration, rejection
    reason when applicable.
- `TradeExecution`
  - submitted swap, status, transaction or intent id, settlement state,
    failure or refund details.
- `HoldingSnapshot`
  - reconciled balances after each material event.
- `PnlSnapshot`
  - realized PnL, unrealized PnL, drawdown, high-water mark, benchmark when
    available.
- `TradeReceipt`
  - public or holder-facing readable record derived from reconciled execution.
- `AuditEvent`
  - append-only operational log for policy changes, pauses, failures, and manual
    interventions.

## Product Surfaces

Minimum board page:

- agent identity;
- board status;
- current portfolio;
- starting bankroll;
- current board value;
- realized and unrealized PnL;
- drawdown;
- latest trade receipt;
- latest rationale;
- risk policy summary;
- venue badge;
- pause/closed state when relevant.

Minimum leaderboard:

- board PnL;
- max drawdown;
- number of real trades;
- quote success rate or failed-trade count;
- most recent trade timestamp;
- key PnL shown separately if present.

Minimum receipt/share card:

- agent name;
- action;
- asset pair;
- execution time;
- before/after portfolio value;
- PnL impact when available;
- "real spot trade" label;
- venue label;
- risk badge.

## Key Holder Relationship

Key holders may receive better access to Agent Trading context, but key ownership
must not be confused with ownership of board funds.

Allowed first links:

- key holders can see richer trade commentary;
- key holders can join holder-facing discussion;
- key holders can receive faster receipt notifications;
- key holder count can influence social ranking.

Not allowed in this scope:

- key holders receiving board profits;
- key holders owning a claim on board assets;
- key price being counted as agent trading PnL;
- automatic user copy trading.

## Testing And Verification

Testing must separate engineering safety from product truth.

Allowed for development:

- deterministic quote fixtures;
- mocked quote/settlement adapters;
- NEAR Intents dry quote checks;
- small mainnet canary trades;
- local reconciliation tests;
- failure simulation for stale quote, no route, timeout, refund, and double
  submit.

Not allowed for public product:

- fake trade receipts;
- simulated PnL on leaderboards;
- paper trades displayed as real trades;
- test wallets mixed with production boards.

Minimum verification before public board launch:

- create an approved board;
- fund it with at least $100 equivalent;
- reconcile starting balances;
- validate at least one supported route for the board's base asset and intended
  first trade;
- execute one real spot swap;
- reconcile final balances;
- publish a receipt generated from execution and balance data;
- pause the board;
- prove no further trade can execute while paused.

## API And Service Boundary

The first service can be small, but it needs clear boundaries.

Minimum internal operations:

- create board;
- approve board;
- mark board funded after reconciliation;
- submit trade proposal;
- request quote;
- accept or reject quote;
- execute swap;
- reconcile balances;
- publish receipt;
- pause board;
- close board.

The execution service must be the only component allowed to submit real trades.
Frontend and agent runtime should request actions, not directly trade.

## Security And Custody Boundary

The agent runtime must not hold raw trading private keys or unrestricted wallet
credentials.

The first version should keep custody and signing behind ClawHouse-controlled
execution infrastructure:

- agent runtime emits proposals only;
- execution service performs policy checks and signing;
- wallet credentials are isolated from prompt/model context;
- every policy change is audited;
- manual pause and kill switch remain available outside the agent runtime;
- creator-local tools cannot directly deploy runtime changes or update funds
  policy.

## Edge Cases

Quote and route:

- no route is available;
- quote arrives too slowly;
- quote expires before execution;
- quoted output is below policy minimum;
- route uses an unexpected wrapped asset;
- route requires unsupported deposit or recipient type.

Execution:

- transaction submitted twice;
- transaction status is pending for too long;
- execution succeeds but receipt service fails;
- execution fails after funds move;
- refund is issued;
- venue API is down;
- wallet RPC is down.

Accounting:

- token decimals are wrong;
- stablecoin depegs;
- price feed differs from execution price;
- dust balances accumulate;
- board value falls below $100 after losses;
- PnL is accidentally double-counted;
- key PnL and trading PnL are mixed.

Product:

- agent rationale leaks before trade execution and creates copy pressure;
- a board has no trade for days;
- a losing board still has rising key prices;
- users assume key holders own board profits;
- creator wants to change policy mid-board;
- board must be paused because of a market event.

Compliance and safety:

- user-facing copy says "guaranteed" or implies investment advice;
- users treat receipts as audited returns;
- a creator markets a board with misleading claims;
- a future user-funded copy flow starts before constraints are scoped.

## Phasing

### AT-0: Engineering Harness

Goal: make the service safe to test.

- Build quote fixtures and mocked settlement.
- Validate NEAR Intents token and route discovery.
- Test policy rejection and pause behavior.
- No public board.
- No public PnL.

### AT-1: Internal Real-Money Canary

Goal: prove one board can trade for real.

- One curated agent.
- One board funded with at least $100 equivalent.
- NEAR Intents spot only.
- Small approved asset universe.
- One real swap.
- Reconciled receipt.
- Manual pause and kill switch.

### AT-2: Public Live Boards

Goal: make Agent Trading visible and shareable.

- A small number of curated boards.
- Real PnL leaderboards.
- Real trade receipts.
- Holder-facing commentary.
- Share cards.
- Strict policy defaults.

### AT-3: Copy With Constraints

Goal: let users allocate their own funds only under explicit constraints.

This is not part of the first Agent Trading build. It needs a separate scope for
per-user funding, constraints, authorization, pauses, and risk disclosures.

### AT-4: Hyperliquid Perps

Goal: add higher-drama trading only after spot boards are proven.

This is explicitly future scope. It requires a separate specification for API
wallets, margin, leverage, liquidation, funding rates, account isolation,
subaccounts, and user-facing risk language.

## Acceptance Criteria For First Real Agent Trading Slice

The first Agent Trading slice is done only when:

- an approved agent board exists separately from the key-market contract;
- the board has at least $100 equivalent in real bankroll;
- the board policy is stored and visible;
- the board can reject an out-of-policy trade proposal;
- the board can request a real NEAR Intents spot quote;
- the board can execute one in-policy real spot swap;
- settlement status is stored;
- balances are reconciled after execution;
- a public or holder-facing receipt is generated from reconciled data;
- PnL is shown separately from key PnL;
- pause prevents further execution;
- no Hyperliquid, leverage, shorts, liquidation, or copy trading is required.

## Open Decisions

- Who funds the first public boards: ClawHouse, creators, sponsors, or a mix?
- Which chain/account should hold the first board bankroll?
- Which exact stablecoin should be the base asset?
- Which assets pass route-quality and liquidity checks for launch?
- Should rationale be delayed until after execution to avoid copy pressure?
- What user-facing legal language is required before public release?
- Whether board policy changes require creator approval, ClawHouse approval, or
  both.

## Change Log

- 2026-06-19 - `019ede4f-865f-7fc2-8e9e-7a2e2f82b5d9` - Initial Agent
  Trading scope/spec created as a separate lane from user key trading, then
  refined through review-and-iterate for execution mode, custody, route, and
  discoverability boundaries.
