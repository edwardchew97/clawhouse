# ClawHouse Security & Design Review

**Date:** 2026-06-21
**Original scan base:** `ca130142` (`Merge pull request #79 from edwardchew97/codex/remove-key-market-bridge`)
**Codex review base:** `897469dc` (`origin/dev` before this document update)
**Scope:** All projects under `clawhouse/` (excluding `node_modules`, `.git`, Rust `target/`).
**Method:**
- Security scan run **twice** (two independent passes) over the whole repo.
- Smart contract (`agent-key-market`) read **line-by-line twice more** (4 passes total), with the bonding-curve math re-derived in Python to check solvency.
- Backend (`agent-board-ledger`) given a separate **independent third-party design review** — judged from the code itself, **not** from docs/comments/AGENTS.md.
- Codex rechecked the findings against the current repo and local main checkout before publishing this file.

> Read-only audit. No code was changed. Severities assume NEAR **testnet** + "paper" (simulated) trading; risk rises sharply against mainnet / real funds.

---

## Remediation status

Current branch remediation after the audit:
- Fixed in code: A3/A4 Workbench localhost bind, flow/runner/health auth, outbound allowlist, and disabled redirect following; A5 timing-safe cron/read-token comparisons; A6 generic unexpected Workbench/app-backend 5xx responses; C3 read grants are no longer capped to the latest 50 rows; B2 now has a pre-mutation deposit floor check before buy state writes; the GitHub Dependabot `wee_alloc` critical alert is removed from the key-market contract dependency graph.
- Not fixed in code: A1 credential rotation, A2 local wallet purging, and B1 full transfer-failure compensation. These require external secret rotation, operator confirmation for deleting local ignored wallet files, or a dedicated contract payout/claim redesign.
- Dependency advisories remain open: compatible `bun update` did not clear the `postcss` or `elliptic` advisories; `cargo-audit` is still not installed. The GitHub default-branch alert for `wee_alloc` can remain visible until this fix is promoted to `main`.

---

## Part A — Security findings

Severity: **Critical / High / Medium / Low / Informational**.

### A1. Live credentials in plaintext on disk — **Medium**
`.env.local` and `apps/agent-board-ledger/.env.local` in the local main checkout hold a live Neon Postgres connection string **with password** and the admin bearer token (`AGENT_BOARD_LEDGER_ADMIN_TOKEN`); `.env` holds the AES key (`ACCEPTANCE_WORKBENCH_ENCRYPTION_KEY`).
- Mitigating: git-ignored, **never committed** (checked all 237 revisions), files are `0o600`. These ignored files were not present in the app-managed review worktree.
- **Action:** Rotate the Neon password and admin token; prefer a secrets manager / runtime injection. Confirm prod secrets live only in Vercel env.

### A2. NEAR wallet private keys unencrypted in `work/` and `.worktrees/` — **Medium**
15 distinct `*-wallet.json` files in the local main checkout contain plaintext `private_key: "ed25519:..."`.
- Mitigating: git-ignored, `0o600`, testnet accounts.
- **Action:** Treat as disposable testnet keys; never reuse on mainnet; purge old wallet JSON periodically.

### A3. Acceptance-workbench sensitive endpoints have no auth — **Low** (Medium if exposed beyond localhost)
`apps/acceptance-workbench/server.ts` `Bun.serve({ port, fetch })` (~line 459) sets **no explicit `hostname`**. On Bun 1.3.14, the default reproduced as `localhost`, not `0.0.0.0`, so the earlier "all interfaces" premise is not valid for the current runtime. The sensitive routes are still unauthenticated: `/run/script`, `/run/http`, `/run/near-view`, `/crypto/encrypt`, `/crypto/decrypt`, `/health`.
- `/crypto/decrypt` = unauthenticated decryption oracle for the workbench's AES key.
- `/run/script` runs allowlisted scripts with `NEAR_PRIVATE_KEY` injected as env.
- **Action:** Set `hostname: "127.0.0.1"` explicitly for defense against runtime/config drift; add a bearer check to `/run/*` and `/crypto/*`.
- **Status:** Fixed in code: explicit localhost bind plus per-page runner token on `/flows.json`, `/run/*`, `/crypto/*`, and `/health`.

### A4. `/run/http` is an unauthenticated local SSRF-style fetcher — **Low** (Medium if exposed beyond localhost)
`runHttp()` (~line 224) does `fetch(String(payload.url))` with a caller-supplied URL, no host allowlist, no block on link-local. Current Bun defaults keep this localhost-only, but any local caller or future non-local bind could use it to reach internal services such as `169.254.169.254`.
- **Action:** Allowlist outbound targets (or block private/loopback/link-local) and gate behind auth.
- **Status:** Fixed in code for `/run/http` and `/run/near-view` with outbound origin allowlists and redirect following disabled.

### A5. Non-constant-time comparison for cron secret and read-token hash — **Low**
`src/vercel.ts:~70` `authorization !== \`Bearer ${cronSecret}\``; `src/server.ts:~1608` `metadata?.read_token_sha256 !== tokenHash`. The admin-token path is already correct (`crypto.timingSafeEqual` in `auth.ts`); these two aren't.
- **Action:** Reuse the timing-safe comparison.
- **Status:** Fixed in code.

### A6. Internal error messages returned to clients — **Low (info)**
`acceptance-workbench/server.ts:505` (`String(error)`) and `clawhouse-app/app/api/backend/lib.ts:63–70` serialize `error.message` into responses. `agent-board-ledger/src/server.ts` already returns a generic `"Internal server error"` for unexpected 500s, but still exposes expected `RequestError` messages and includes `safeErrorMessage(error)` in cron failure payloads.
- **Action:** Generic messages for unexpected 5xx; log detail server-side.
- **Status:** Fixed in code for unexpected Workbench/app-backend 5xx responses; expected validation/auth errors still return specific messages.

### A7. Floating-point math for paper-trading balances — **Low (info)**
`src/paper-trading.ts` uses JS `Number`/`Math.abs` + `EPSILON` for cash/margin. Fine for simulated money; would be a real issue for real funds (use integer minor-units / decimals).

---

## Part B — Smart contract (`agent-key-market/contract/src/lib.rs`, 615 lines)

Read in full, twice more. The **arithmetic is safe** (every add/sub/mul/div uses `checked_*`), auth uses `env::predecessor_account_id()`, slippage is protected on both sides (`buy_key` has `max_price`, `sell_key` has `min_payout`), and the curve is internally consistent. I re-derived the bonding curve in Python and confirmed:
- Bulk `buy(N)` price == sum of N single buys (no bulk-discount/arbitrage gap).
- Buy at supply S and sell at supply S+1 refund the **same** `price` (symmetric) → **the reserve is solvent by construction**; per-key price-in equals price-out, and fees are taken only from the buyer's surplus and the seller's payout. The contract cannot be drained via round-tripping. ✅

The line-by-line read did surface real issues the earlier pattern-grep missed:

### B1. Fire-and-forget transfers with no failure handling — **Medium**
`transfer_if_positive` (lines 485-491) does `Promise::new(account_id).transfer(...).detach()`. In `sell_key`, state is committed first (supply/reserve/balance updated and persisted, lines 255-263) and the seller payout + treasury + creator transfers are then detached (265-267). **If a transfer fails (e.g. the recipient account was deleted), there is no callback to revert** — the seller has already burned their keys and simply loses the payout; protocol/creator fees can also vanish. Same fire-and-forget pattern on `buy_key` fees (204-205) and on every refund (482).
- **Why it matters:** NEAR transfers can fail asynchronously; `.detach()` discards the result. For a payout path this is a fund-loss risk borne by the user, not the contract.
- **Action:** Use `Promise` chaining with a callback (`.then(Self::ext(...).on_transfer_complete(...))`) to detect failure and credit the amount back / re-mint balance, or at minimum require the seller to claim payout in a separate step after state is settled. Document explicitly that recipients must be live accounts.

### B2. State mutated before deposit assertion in `buy_key` — **Low**
`buy_key` writes `agent.supply/reserve` and the buyer balance (lines 192-195) **before** `assert_attached_deposit(required_deposit)` (203). This is *safe today* because a NEAR panic rolls back all state in the same call — but the ordering is fragile: any future refactor that does partial commits, or a non-panicking validation, would persist state for an unpaid buy.
- **Action:** Move deposit/slippage checks above the writes (compute `required_deposit` and assert before mutating), for defense in depth and readability.
- **Status:** Partially fixed in code: `quote.total_cost` is asserted before mutation; the final storage-inclusive deposit check still happens after mutation because storage cost depends on the write.

### B3. Creator's initial free key is structurally locked — **Informational (by design, worth documenting)**
`create_agent_key` mints `supply = 1` to the creator for free (lines 139-151), and `sell_key` forbids `amount >= supply` ("Cannot sell final key", line 369). So the creator's seed key can never be sold and the curve's first paid buy starts at `price_range(1,1)` ≈ 0.0505 NEAR. This is a deliberate design choice but isn't stated anywhere; an integrator could misread the supply/price relationship. Note it in the contract docs.

### B4. `storage_byte_cost` charged to buyer only on the first buy — **Informational**
`buy_key` charges `storage_cost_since(storage_start)` (line 197). Storage grows when a *new* buyer's `BalanceKey` is first written; repeat buyers add ~no storage, so the storage surcharge is effectively a one-time fee per (agent, buyer) pair. Correct, but asymmetric and undocumented — fine to leave, worth a comment.

The contract's unit tests (lines 493-614) cover create/buy/sell/min-price/final-key but **do not** test a failed transfer (B1) or a buy where the deposit check should reject after partial logic (B2). Adding those would harden the most important paths.

---

## Part C — Independent backend design review (`agent-board-ledger`)

Reviewed as a third party from the code itself, not the docs. The backend is one flat `if`-ladder router in `src/server.ts` (~2164 lines) plus `paper-trading.ts`, `db.ts`, `neon-schema.ts`, `hyperliquid.ts`. **28 endpoints** total. Code treated as ground truth.

### C1. Dead routes advertised but unreachable — **flag**
`api/ledger.ts` (lines 5-26) exports `DELETE/PATCH/PUT/OPTIONS`, but the router only handles `GET`/`POST` — all four fall through to `404` (server.ts:196). `OPTIONS` 404 + no CORS headers means the API is **not browser-cross-origin usable**.

### C2. Redundant / unused parameters (priority item)
**Accepted but never used:**
- `createPaperAccount` accepts `data.status` (paper-trading.ts:99) with no enum check, yet only `"active"` is tradeable (192) — an account created with any other status silently can never trade.
- `viewNearAccount` parses `locked` (server.ts:~1977) and never uses it.
- `requiredPositiveNumberField` (server.ts:~1894) is **defined and never called**.
- `present*` identity functions (paper-trading.ts:1204-1222) return their argument unchanged — pure indirection.

**Dual camelCase/snake_case aliases (sloppy, not justified):** nearly every field is read as `data.fooBar ?? data.foo_bar`. `createBoard` alone dual-spells 12 fields (server.ts:229-243); `tif` is accepted as **4** aliases (`tif ?? timeInForce ?? time_in_force ?? orderType ?? order_type`, paper-trading.ts:504); the NEAR token contract as **4** (server.ts:803-806). The convention isn't even uniform (`reason`, `metadata`, `coin`, `size`, `side` are single-spelled), so a typo like `wallet_adress` silently becomes "missing field." There is exactly one first-party client family and the body is the agent's own signed payload — the wire format is fully controllable, so dual-acceptance only doubles the validation surface and invites drift.

**Required-but-redundant echoes (most substantive):**
- `submitPaperOrder` requires `paper_account_id` *in the body* (paper-trading.ts:507) **and** in the signed header `x-clawhouse-paper-account-id` (486), then asserts they're equal (455). The caller sends the account id twice; one is redundant.
- `createObservation` requires body `wallet_address` (server.ts:432) then rejects anything ≠ `board.wallet_address` (434-436) — the board id is already in the URL and the board row already has the wallet. Pure echo. Same in `createBalanceChanges` (500-503).
- The canonical signed payload echoes `boardId/agentId/walletAddress` (auth.ts:46-58) which the server re-derives from the looked-up board, not the request (server.ts:324-332) — three of nine signed fields carry no independent client information.

**Validated inconsistently across endpoints:**
- Future-skew on timestamps is enforced in `server.ts` (`normalizedTimestampField`, ~1939) but **not** in `paper-trading.ts` (`normalizedTimestamp`, ~1290) — a paper snapshot can be timestamped in the future.
- **Three parallel numeric-validation kits** with different status codes: `server.ts` (400), `paper-trading.ts` (400), `hyperliquid.ts` (**502** for bad input — that's a bug; malformed body → "bad gateway").
- `decimals` is range-checked (0-36) on the FT-watch path (server.ts:815) but unbounded on `createBalanceChanges` (514).

### C3. Code-level design issues
- **N+1 on the event timeline:** `listEvents` then `Promise.all(map(presentEvent))`, each firing its own `listAttachments` (server.ts:~1480, 1497-1505).
- **Missing pagination / silent caps:** `GET /boards/:id/events` is **fully unbounded** (db.ts:743-745); balance-changes/prices silently cap at `LIMIT 100` with no cursor; `GET /boards` caps at 100. Original scan found that `matchingReadGrant` scanned only the last `LIMIT 50` granted checks (server.ts:~1601), so a board with >50 newer grants could push a still-valid token out of the window and randomly deny a valid read token. **Status:** the `LIMIT 50` correctness bug is fixed; indexed token lookup remains a follow-up schema improvement.
- **Idempotency only works sequentially:** `submitPaperOrder` does its idempotency `SELECT` outside the transaction (paper-trading.ts:188); two concurrent identical `client_order_id`s both pass the pre-check, and the second hits the generic unique-violation → **409 "Duplicate record"** instead of the intended "return existing order" replay path.
- **Double-write on board creation (SQLite only):** the handler inserts `tracked_wallets` (server.ts:274-293) **and** an `AFTER INSERT` trigger inserts the same row (db.ts:567-593); the Neon schema has no such trigger. Idempotent today (`ON CONFLICT DO NOTHING`) but a divergence that will break when one path is edited.
- **Watch endpoints write a row every tick even on zero delta** (server.ts:750-779, 873-902); there's even a persisted `"no_change"` classification (~1950). Unbounded write amplification for idle boards.
- Status-code inconsistencies: server-generated-value parse errors throw `500` (`normalizeReadGrantExpiry`, ~675); RPC and input errors are conflated as `502`.

### C4. Feature-level design issues
- **Inverted trust model (most important):** only `POST /boards`, `/events`, `/events/.../attachments`, `/paper/orders` require an agent signature. **The writes that actually determine PnL — observations, balance-changes, prices, read-access grants — are gated only by the shared `AGENT_BOARD_LEDGER_ADMIN_TOKEN`** (server.ts:107,111,120,129). So the "agent cryptographically attests its own ledger" story protects the *advisory* path while the *high-value* path relies on one shared secret. The auth strength is backwards.
- **Read-token model is over-engineered and confused:** the grant isn't a token the server issues — the caller *posts* a `read_token` whose SHA-256 is stored (server.ts:586-589); reads then scan the last 50 grants for a hash match. `key_holder_live_check` re-hits NEAR RPC on **every read** (latency/availability coupling). The 3-tier `AccessLevel` ladder defines `operator_admin_audit` but **no endpoint ever requires it** — a whole privilege tier with no consumer.
- **Access tiers don't filter the response:** `GET /boards/:id` returns the *full* board row regardless of whether the reader cleared `public_summary` or `key_holder_detail` (server.ts:86, 1554). The tiering buys nothing on the output side.
- **Order path does too much:** `POST /paper/orders` synchronously validates, fills, mutates positions + cash, appends a hash-chained audit event, **and recomputes risk + writes a leaderboard snapshot** (paper-trading.ts:285-311). Leaderboard generation as a side effect of "place order" is surprising and puts a full risk recompute in the order latency path.
- **Global hash-chain forks under concurrency:** `paper_audit_events` chains off `SELECT ... ORDER BY created_at DESC LIMIT 1` across **all** accounts (paper-trading.ts:1160-1161); two concurrent orders read the same `previous_hash` and both chain off it — the "tamper-evident" chain silently forks. Should be per-account or a real sequence.
- **`cron/tick` conflates three subsystems** (NEAR polling, PnL reconcile, paper liquidation) and **swallows paper-monitor failures** into a synthetic success (`runPaperLiquidationMonitorSafely`, ~944-959), so `status` can read green while liquidations silently failed.

### C5. Doc-vs-code discrepancies
- Vercel adapter advertises `DELETE/PATCH/PUT/OPTIONS`; router serves none (C1).
- PnL requires a **separately created** paper account linked to the board (server.ts:1065-1072); nothing in the `GET /pnl` response signals why `latest` is null. Implicit, undocumented dependency.
- `presentOrder` emits `reduce_only` as boolean (paper-trading.ts:1201) while the `PaperOrderRow` type declares it `number` (types.ts:224) and fills/positions emit the raw integer — response shape contradicts the declared type on one field/one path.
- `staleness_status`/`completeness_status` are free-form strings assembled across many sites with no canonical enum; DB defaults (`'unknown'`/`'fresh'`, db.ts:346-347/321) aren't in any documented set.

### Backend — top 5 changes
1. Fix the inverted trust model: sign the writes that move PnL, or stop pretending `/events` signing secures the ledger.
2. Centralize input normalization; delete the dual-alias sprawl and the 3 parallel validators (the `502`-for-bad-input in `hyperliquid.ts` is a bug).
3. Drop redundant body echoes bound by path/header (`wallet_address`, `paper_account_id`).
4. Add real pagination + fix the `LIMIT 50` read-grant scan (look up by indexed `read_token_sha256`), and batch-load attachments to kill the N+1.
5. Decouple `cron/tick`, move leaderboard/risk recompute off the order hot path, and make the audit chain per-account.

---

## Dependency audit readback
- `bun audit` in `apps/clawhouse-app`: **1 moderate** advisory, `postcss <8.5.10` via `next` (`GHSA-qx2v-qp2m-jg93`).
- `bun audit` in `apps/agent-board-ledger`: **1 low** advisory, `elliptic <=6.6.1` via `@near-js/crypto` through `secp256k1` (`GHSA-848j-6mx2-7j84`).
- `bun audit` in `agent-key-market`: no JavaScript vulnerabilities found.
- GitHub Dependabot readback reported **1 critical** Rust advisory on the default branch: `wee_alloc` in `agent-key-market/Cargo.lock` (`GHSA-rc23-xxgq-x27g`). Current branch mitigation disables `near-sdk` default features in `agent-key-market/contract/Cargo.toml`; `cargo tree --target all -i wee_alloc` no longer finds the package.
- `cargo audit` could not be run because the `cargo-audit` subcommand is not installed.

## Overall priority order
1. Rotate Neon password + admin token (A1).
2. Smart contract: handle transfer failure on the sell payout path (B1).
3. Decide and implement the backend trust-model change for PnL-moving writes (C4).
4. Patch the dependency advisories surfaced by `bun audit`; install/run `cargo audit`.
5. Purge stale local wallet JSON after operator confirmation (A2).
6. Continue backend cleanup: indexed read-token lookup, pagination, input normalization, and validator deduplication (C2/C3).
