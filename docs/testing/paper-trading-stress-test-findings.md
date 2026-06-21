# Paper Trading — Stress Test Findings

**Scope:** `apps/agent-board-ledger/src/paper-trading.ts` (Hyperliquid-style paper perps + spot), plus the routing in `src/server.ts` and supporting `db.ts` / `auth.ts`.
**Date:** 2026-06-21
**Method:** Code audit + 53 new `bun:test` edge cases (`test/paper-trading-edge.test.ts`) run against the in-memory SQLite app, plus targeted probe scripts. Baseline: the existing 65-test suite was green before changes.

## Summary

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | Audit hash-chain forks — `previous_hash` resolved by random UUID tiebreak, not insertion order | **High** | Confirmed (failing test) |
| 2 | Margin rejection throws a bare 400 instead of the standard `rejected` order — no order row, no audit event | **Medium** | Confirmed (failing test + probe) |
| 3 | `latestMarketSnapshot` / `latestRiskSnapshot` use random UUID as final tiebreak → non-deterministic price/risk on timestamp ties | **Medium** | Confirmed (probe) |
| 4 | Cross liquidation can drive `cash_balance_usd` deeply negative — no bankruptcy floor / loss cap | **Medium** | Confirmed (probe: equity → -3503) |
| 5 | Cross-margin available-margin check is borderline-strict and inconsistent with cross's "no cash lock" model | **Low/Info** | Observed (probe) |

The good news: **51 of 53 edge cases pass.** Input validation, signature/nonce/replay/timestamp auth, staleness, allow-listing, order-book walking, slippage caps, VWAP fills, position averaging / partial close / flip / full close, isolated margin lock/release, reduce-only guards, spot accounting, liquidation idempotency, float-dust rounding, and idempotent `client_order_id` all behave correctly. The two failing tests encode the two highest-priority bugs below.

---

## Finding 1 — Audit hash-chain forks (HIGH)

**Where:** `paper-trading.ts:1185-1187`, `appendPaperAuditEvent()`.

```ts
const previous = await db.get<{ event_hash: string }>(
  "SELECT event_hash FROM paper_audit_events ORDER BY created_at DESC, id DESC LIMIT 1",
);
```

**Problem.** The append-only audit log is supposed to be a tamper-evident hash chain: each event stores `previous_hash = event_hash` of the prior event. But the "prior event" is selected by `ORDER BY created_at DESC, id DESC`. `created_at` is an ISO-second/ms timestamp that **ties constantly** — every audit row written inside one order request shares the same `createdAt`, and with any fast/mocked clock, rows across requests tie too. When `created_at` ties, the tiebreak is `id DESC`, and `id` is a **random UUID** (`newId()` → `crypto.randomUUID()`), not a monotonic value. So "previous" is whichever UUID happens to sort highest — **not** the actually-latest event.

**Evidence.** With 6 orders on one account (8 audit events total), 3 distinct `previous_hash` values were each reused by 2–3 events:

```
total audit events: 8
previous_hash values reused by >1 event (forks): 3   (…:x2, …:x2, …:x3)
```

A direct trace shows event #3 (`paper_order_submitted`) pointing its `previous_hash` at event #1's hash instead of event #2's. The structure is a forking tree, not a chain.

**Impact.** The audit log's integrity guarantee is void — you cannot detect insertion/reordering/deletion by walking the chain, and the `/paper/orders/:id/replay` "proof" rests on this log. For a competitive paper-trading leaderboard this is the integrity primitive, so I rated it High. Note it is **provider-independent** (the bug is in the `ORDER BY`), so the production Neon/Postgres path is affected identically.

**Repro test:** `test/paper-trading-edge.test.ts` → *"audit hash chain is linked (previous_hash of N = event_hash of N-1)"* (currently failing by design).

**Suggested fix.** Give audit events a monotonic order key and chain on it:
- add an auto-increment / sequence column (Postgres `BIGSERIAL`, SQLite `INTEGER PRIMARY KEY` rowid alias), select previous via `ORDER BY seq DESC LIMIT 1`; or
- chain *per account* and pass the prior `event_hash` down through the request rather than re-querying; or
- at minimum, add a high-resolution monotonic counter to `created_at` ordering. UUIDs must never be an ordering tiebreaker.

---

## Finding 2 — Margin rejection is unauditable and shape-inconsistent (MEDIUM)

**Where:** `paper-trading.ts:526-551` (`assertMarginAvailable`) called at `:251` *before* `db.transaction(...)`.

**Problem.** Every documented rejection path (`market_not_allowed`, `stale_market_data`, `insufficient_depth`, `reduce_only_*`, `spot_insufficient_*`, `post_only_would_cross`, `leverage_exceeds_hyperliquid_max`) calls `insertRejectedOrder()` and returns **HTTP 201** with `{ ok: true, order: { status: "rejected", reject_reason: "…" } }`. The margin check is the exception: it `throw new RequestError("Insufficient … paper margin", 400)`, which `handleError` turns into **HTTP 400** `{ ok: false, error: "…" }`. No order row is inserted and **no audit event is written** — the agent's attempt disappears.

**Evidence (probe).**
```
margin-fail status: 400 body: {"ok":false,"error":"Insufficient isolated paper margin"}
```
and a separate test confirms `paper_orders` count is `0` after a margin-failed order.

**Impact.**
- An agent SDK that parses the normal `{ order }` envelope will mis-handle or crash on the margin path.
- A margin rejection leaves no trace — it cannot be replayed or audited, unlike every other rejection.
- Because no order row (and so no `client_order_id` row) is written, idempotency/retry semantics differ for this path only.

**Repro tests:** *"an order row is persisted for a margin-failed order (audit trail)"* (failing by design) and the passing *"margin failure leaves no orphan order, fill, or cash change"* (confirms cash is at least not corrupted).

**Suggested fix.** Convert the two `throw new RequestError(...)` in `assertMarginAvailable` into a returned reject reason (e.g. `insufficient_isolated_margin` / `insufficient_cross_margin`) and route through `insertRejectedOrder()` like the other checks, so the response shape and audit trail are uniform.

---

## Finding 3 — Non-deterministic "latest" snapshot on timestamp ties (MEDIUM)

**Where:** `paper-trading.ts:1014` (`latestMarketSnapshot`) and `:1069` (`latestRiskSnapshot`).

```ts
ORDER BY observed_at DESC, created_at DESC, id DESC LIMIT 1   // snapshot
ORDER BY created_at DESC, id DESC LIMIT 1                     // risk
```

**Problem.** Same root cause as Finding 1: when `observed_at` and `created_at` tie, the final tiebreak is a random UUID. If two market snapshots for the same coin are ingested with the same `observed_at` (e.g. two cron refreshes within the same second, or a backfill), the fill price chosen for an order is effectively random between them.

**Evidence (probe).** Two BTC snapshots at the same `observed_at` (mark 100 and mark 200); the order filled at one of them — selection is not guaranteed and could pick the stale/wrong price on a different run.

**Impact.** Order fills and risk/PnL can depend on UUID luck rather than the true latest data. Lower frequency than Finding 1 (requires same-timestamp snapshots) but it directly affects fill prices and the leaderboard.

**Suggested fix.** Order by a monotonic ingestion key (sequence/rowid) after `observed_at`, never UUID.

---

## Finding 4 — Cross liquidation has no bankruptcy floor (MEDIUM / fidelity)

**Where:** `liquidatePosition()` `:848-882` and `computeAccountRisk()` `:797-833`.

**Problem.** Cross liquidation settles the **full** unrealized loss into cash (`cashDelta = positionRisk.unrealizedPnl`). Liquidation only fires when the *aggregate* account maintenance margin is breached, so by the time it triggers the loss can far exceed the account balance, leaving `cash_balance_usd` deeply negative. Real Hyperliquid caps a liquidated trader's loss at their margin (the insurance fund / ADL absorbs the rest).

**Evidence (probe).** Open cross 90 BTC @100 (notional 9000) on a $1000 account; mark drops to 50 → risk-check liquidates and `cash_balance_usd = -3503.15`, `equity_usd = -3503.15`.

**Impact.** Leaderboard PnL% can go below −100%; a negative-cash account can still pass some checks and keep acting. It's a simulation-fidelity gap rather than a crash, hence Medium.

**Suggested fix.** Floor the post-liquidation cash impact so equity can't go below 0 for the liquidated position (clamp `cashDelta` so isolated/cross equity bottoms at 0), matching exchange behavior; or document the deviation explicitly in the scope docs.

---

## Finding 5 — Cross available-margin check (LOW / informational)

The cross check compares `currentInitial + newInitialMargin + fee` against `equity_usd`, but cross margin does **not** lock cash on open (only fees are deducted). The result is that a second cross order can be rejected (`400 "Insufficient cross paper margin"`) at a boundary where an exchange using maintenance-based cross checks might allow it. This is a modeling choice rather than a clear bug, but combined with Finding 2 it also throws a bare 400 rather than recording a rejected order. Recommend revisiting the cross-margin model and, regardless, routing its rejection through `insertRejectedOrder`.

---

## What was verified as correct (no action needed)

- **Auth:** missing headers, unsigned request, wrong-key signature, body tampering (`Body hash mismatch`), stale timestamp, **nonce replay with a fresh `client_order_id` but reused nonce** (`Nonce replay rejected`), account-id header mismatch.
- **Validation:** non-object/invalid JSON, missing/zero/negative/non-numeric size, bad side/tif/market_type/margin_mode, missing leverage, unknown account → 404, `starting_balance_usd <= 0`, snapshot missing bids/asks.
- **Market data:** no snapshot / stale (>10s) / `staleness_status != fresh` → `stale_market_data`; coin not in allowlist → `market_not_allowed`.
- **Fills:** IOC partial vs thin book (no resting remainder), IOC zero-depth → `insufficient_depth`, GTC no-limit → `limit_px_required_for_resting_order`, VWAP avg price across levels, `max_slippage_bps` cap, sell walks bids best-first, GTC partial-fill → `partially_filled_resting` with correct `remaining_size`.
- **Position accounting:** add-to-long averaging, proportional partial-close PnL, long→short flip (new entry = fill px, realized PnL correct), full close → `closed`/0, cash conservation (round-trip costs only fees), isolated margin locked on open / released on close.
- **Reduce-only:** no-position, would-increase (same side), exceeds-position.
- **Spot:** requires `margin_mode=spot`, insufficient cash, reduce-only unsupported, oversell guard, buy→sell cash conservation.
- **Liquidation:** no liquidation above maintenance, idempotent (no double liquidation), isolated catastrophic drop flattens & marks `liquidated`.
- **Idempotency/precision:** duplicate `client_order_id` returns `idempotent:true` with no double fill, float-dust residuals round to zero (position closes cleanly), replay endpoint returns order+fills+audit.
- **Large numbers:** notional/avg-price computed correctly at 1e9 price / 1e15 balance.

## How to run

```bash
cd apps/agent-board-ledger
bun test                                   # full suite (existing + new)
bun test test/paper-trading-edge.test.ts   # just the new edge cases
```

The two intentionally-failing assertions (Findings 1 and 2) should flip to green once those bugs are fixed; they are the regression guards.
