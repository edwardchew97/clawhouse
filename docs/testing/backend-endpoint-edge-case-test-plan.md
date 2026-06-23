# Backend Endpoint Edge-Case Test Plan

Status: test-case inventory, not an automation implementation.

Last source read: `dev` at `a4190c09`.

## Goal

This document lists the implemented ClawHouse backend HTTP endpoints and the
edge-case test cases needed before turning the list into an hourly service
monitor. The intended shape is one endpoint mapped to explicit input partitions:
happy path, auth failures, missing or invalid input, out-of-range values,
nonexistent ids, duplicate/idempotent calls, dependency failures, and current
known behavior that should be locked down or deliberately changed later.

## Source Inventory

Endpoint sources:

- `apps/agent-board-ledger/src/server.ts`
- `apps/agent-board-ledger/src/paper-trading.ts`
- `apps/agent-board-ledger/src/hyperliquid.ts`
- `apps/agent-board-ledger/src/vercel.ts`
- `apps/agent-board-ledger/api/ledger.ts`
- `apps/agent-board-ledger/api/cron.ts`
- `apps/clawhouse-app/app/api/key-market/*`
- `apps/clawhouse-app/app/api/backend/*`
- `apps/acceptance-workbench/server.ts`
- `apps/acceptance-workbench/flows.json`
- `apps/agent-board-ledger/test/server.test.ts`
- `apps/agent-board-ledger/PAPER_TRADING_API.md`
- `apps/agent-board-ledger/DEPLOYMENT.md`
- `apps/clawhouse-app/DEPLOYMENT.md`

Scope notes:

- `truth/` is the accepted product boundary. Agent Board Ledger is the board
  history/read surface. Hyperliquid-style paper trading owns paper order
  intake, matching, margin, liquidation, leaderboard, and replay proof.
- Smart-contract methods under `agent-key-market/` are not HTTP backend
  endpoints. They are only represented here through the ClawHouse app
  key-market read APIs.

## Global Test Fixtures

Use these fixtures across endpoint tests:

- Fresh SQLite test DB for local handler tests, plus a Neon/Postgres runtime
  check where deployment behavior matters.
- Admin token fixture: `AGENT_BOARD_LEDGER_ADMIN_TOKEN`.
- Cron token fixture: `CRON_SECRET`.
- NEAR test wallet fixture capable of signing Agent Board Ledger requests.
- Paper account signing fixture using an agent public/private test key.
- Mock NEAR RPC fixture for `view_account`, `ft_metadata`, `ft_balance_of`, and
  key-market `get_balance`.
- Mock Hyperliquid info endpoint fixture for `metaAndAssetCtxs` and `l2Book`.
- A public board, a holder-gated board, and a nonexistent board id.
- A paper account with no positions, an account with cross position, and an
  account with isolated position near liquidation.

## Global Negative Cases

Run these once for every route family where they apply:

- Wrong method returns `404` through the route switch unless an adapter handles
  the method.
- Unknown path returns `{ ok: false, error: "Not found" }` with `404`.
- Invalid JSON body returns `400`.
- Non-object JSON body, including arrays and primitives, returns `400`.
- Empty body is accepted only where all required fields are optional or
  defaulted.
- Service-auth routes reject missing `Authorization`.
- Service-auth routes reject non-Bearer schemes.
- Service-auth routes reject wrong bearer tokens.
- Service-auth routes return `500` when the admin token is not configured.
- Wallet-signed board routes reject missing signed headers.
- Wallet-signed board routes reject wallet/public key not bound to the board.
- Wallet-signed board routes reject body hash mismatch.
- Wallet-signed board routes reject stale timestamps and timestamps too far in
  the future.
- Wallet-signed freshness window is 5 minutes for stale rejection and 60
  seconds for future tolerance.
- Wallet-signed board routes reject invalid signatures.
- Wallet-signed board routes reject nonce replay.
- Paper signed routes reject missing paper signed headers.
- Paper signed routes reject paper account or agent header mismatch.
- Paper signed routes reject paper body hash mismatch, stale timestamp, invalid
  signature, and nonce replay.
- Auth failures from board-wallet signatures, service bearer checks, and paper
  signatures return `401`, except an unconfigured admin token returns `500`.
- Read-gated routes reject missing, invalid, expired, or insufficient
  `x-clawhouse-read-token`.
- Public boards bypass read-token checks only for public-summary reads; holder
  detail reads still require service bearer or a valid read token.
- Service bearer bypasses read-token checks.
- Nonexistent ids return the explicit route error, usually `404`.
- Duplicate primary-key inserts return `409` via `Duplicate record` unless the
  endpoint implements idempotency.
- Dependency failures from NEAR RPC or Hyperliquid mocks return `502` where the
  implementation wraps them as upstream failures.

## Endpoint Index

### Agent Board Ledger Service

| ID | Method and path | Auth | Handler |
| --- | --- | --- | --- |
| L01 | `GET /health` | none | `readHealth` |
| L01A | `POST /agents` | service bearer plus Agent signature | `registerAgent` |
| L02 | `POST /boards` | service bearer plus board-wallet signature and registered-Agent signature | `createBoard` |
| L03 | `GET /boards/:boardId` | public, service bearer, or read token | `requireBoard` plus `assertBoardRead` |
| L04 | `POST /boards/:boardId/events` | board-wallet signature | `createEvent` |
| L05 | `GET /boards/:boardId/events` | public, service bearer, or read token | `listEventTimeline` |
| L06 | `POST /boards/:boardId/events/:eventId/attachments` | board-wallet signature | `createAttachment` |
| L07 | `POST /boards/:boardId/observations` | service bearer | `createObservation` |
| L08 | `POST /boards/:boardId/balance-changes` | service bearer | `createBalanceChanges` |
| L09 | `GET /boards/:boardId/balance-changes` | public, service bearer, or read token | `listBalanceChanges` |
| L10 | `POST /boards/:boardId/prices` | service bearer | `createPriceSnapshots` |
| L11 | `GET /boards/:boardId/prices` | public, service bearer, or read token | `listPriceSnapshots` |
| L12 | `POST /boards/:boardId/read-access/checks` | service bearer | `createReadAccessCheck` |
| L13 | `POST /boards/:boardId/read-access/near-key-market` | service bearer | `checkNearKeyMarketReadAccess` |
| L14 | `POST /boards/:boardId/watch/near-account` | service bearer | `runNearAccountWatch` |
| L15 | `POST /boards/:boardId/watch/near-ft` | service bearer | `runNearFtWatch` |
| L16 | `GET /boards/:boardId/portfolio` | public, service bearer, or read token | `readPortfolio` |
| L17 | `GET /boards/:boardId/pnl` | public, service bearer, or read token | `readPnl` |
| L18 | `POST /cron/tick` | service bearer | `runCronTick` |

### Paper Trading Service

| ID | Method and path | Auth | Handler |
| --- | --- | --- | --- |
| P01 | `POST /paper/accounts` | service bearer plus Agent-signed `paper_account_registration` | `createPaperAccount` |
| P02 | `GET /paper/accounts/:paperAccountId` | none | `readPaperAccount` |
| P03 | `POST /paper/market-snapshots` | service bearer | `createPaperMarketSnapshot` |
| P04 | `POST /paper/market-snapshots/hyperliquid` | service bearer | `refreshHyperliquidPaperMarketSnapshots` |
| P05 | `POST /paper/orders` | paper signed request | `submitPaperOrder` |
| P06 | `POST /paper/liquidation-monitor/tick` | service bearer | `runPaperLiquidationMonitor` |
| P07 | `POST /paper/accounts/:paperAccountId/risk-check` | service bearer | `runPaperRiskCheck` |
| P08 | `GET /paper/leaderboard` | none | `readPaperLeaderboard` |
| P09 | `GET /paper/orders/:orderId/replay` | none | `replayPaperOrder` |

### Vercel Adapter

| ID | Method and path | Auth | Handler |
| --- | --- | --- | --- |
| V01 | `/api/ledger?ledgerPath=<path>` with `DELETE`, `GET`, `OPTIONS`, `PATCH`, `POST`, `PUT` | target-route auth | `api/ledger.ts` plus `handleVercelLedgerRequest` |
| V02 | `GET /api/cron` | `Authorization: Bearer <CRON_SECRET>` | `api/cron.ts` plus `prepareCronTickRequest` |
| V03 | `GET /health`, `/boards/:path*`, `/paper/:path*`, `/cron/:path*` on Vercel | target-route auth | `vercel.json` rewrites to `V01` |

### ClawHouse App BFF

| ID | Method and path | Auth | Handler |
| --- | --- | --- | --- |
| A01 | `GET /api/key-market/config` | none | key-market config route |
| A02 | `GET /api/key-market/state?agentId=&holderId=` | none | key-market state route |
| A03 | `GET /api/key-market/quote?side=&agentId=&amount=` | none | key-market quote route |
| A04 | `GET /api/backend/config` | none | backend config route |
| A05 | `GET /api/backend/health` | none | backend health proxy |
| A06 | `GET /api/backend/board?boardId=` | none | backend board aggregate proxy |
| A07 | `GET /api/backend/paper-leaderboard` | none | paper leaderboard proxy |

### Acceptance Workbench Local Runner

These are developer-tool endpoints, not production service endpoints.

| ID | Method and path | Auth | Handler |
| --- | --- | --- | --- |
| W01 | `GET /` | none | serves `index.html` |
| W02 | `GET /flows.json` | none | serves flow config |
| W03 | `GET /health` | none | workbench health |
| W04 | `POST /crypto/encrypt` | local encryption key | `encryptValue` |
| W05 | `POST /crypto/decrypt` | local encryption key | `decryptValue` |
| W06 | `POST /run/http` | none | HTTP runner |
| W07 | `POST /run/near-view` | none | NEAR view runner |
| W08 | `POST /run/script` | allowlisted flow step | script runner |

## Detailed Test Matrix

### L01: `GET /health`

Happy path:

- Returns `200`, `ok: true`, `service: "agent-board-ledger"`, and `db:
  "ready"` when the DB responds to `SELECT 1`.

Edge cases:

- DB readiness returns no row or throws: expect `503` or `500` depending on
  thrown error type.
- Response must not expose local filesystem paths, connection strings, or
  tokens.
- Wrong method such as `POST /health`: expect `404`.

### L02: `POST /boards`

Inputs:

- `boardId` or `board_id`: optional, generated when absent.
- `agentId` or `agent_id`: required non-empty string.
- `agentPublicKey` or `agent_public_key`: required registered Agent public key.
- `walletAddress` or `wallet_address`: required non-empty string.
- `publicKey` or `public_key`: required non-empty string.
- `chain`: optional string, defaults to `near`.
- `venueNamespace` or `venue_namespace`: optional string, defaults to
  `near-intents`.
- `trackingStartedAt` or `tracking_started_at`: optional timestamp, defaults to
  request time.
- `baseCurrency` or `base_currency`: optional string, defaults to `USD`.
- `publicStatus` or `public_status`: optional string, defaults to `draft`.
- `visibilityMode` or `visibility_mode`: optional string, defaults to `private`.
- `ownerWalletAddress`, `fundingSource`, `fundingTxHash`, `metadata`: optional.

Happy path:

- Service bearer plus valid board-wallet signature and valid registered-Agent
  signature creates board and tracked wallet, returns `201`, and stores nonces.
- Omit `board_id` to verify generated `board_*` id.
- Omit optional defaults and verify defaults are written.

Edge cases:

- Missing service bearer, wrong scheme, wrong token, or missing configured admin
  token.
- Missing or invalid wallet-signed headers.
- Missing or invalid Agent-signed headers.
- Unregistered Agent public key, Agent public key mismatch, or Agent signature
  made by a different key.
- Header wallet address differs from body wallet address.
- Header public key differs from body public key.
- Body hash mismatch after signing.
- Stale timestamp, timestamp beyond accepted skew, invalid signature, or nonce
  replay.
- Missing `agent_id`, `agent_public_key`, `wallet_address`, or `public_key`.
- Invalid `tracking_started_at` timestamp.
- `tracking_started_at` more than 60 seconds in the future.
- Duplicate explicit `board_id`: expect `409`.
- `visibility_mode` currently accepts arbitrary strings, but only exact
  `public` bypasses read-token checks. Add cases for `public`, `private`,
  `holder_gated`, empty string, and unknown strings.
- `public_status` currently accepts arbitrary non-empty strings and is not used
  for auth. Add cases that prove it does not affect read/write permissions.
- `metadata` values that are arrays, nested objects, large objects, or
  non-JSON-serializable at the caller boundary.

### L03: `GET /boards/:boardId`

Happy path:

- Public board reads without auth.
- Private or holder-gated board reads with service bearer.
- Private or holder-gated board reads with valid header read token.
- Private or holder-gated board reads with valid `read_token` query param.
- A `public_summary` read token is sufficient for this endpoint because the
  handler requires only summary-level read access.

Edge cases:

- Nonexistent `boardId`: `404`.
- Private board without read token: `403`.
- Invalid, expired, or insufficient access-level read token: `403`.
- Live key-holder grant whose mock RPC later returns zero balance: `403`.
- `boardId` containing encoded reserved characters should be tested and either
  rejected at the caller layer or documented as unsupported.
- A `public_summary` read token must be accepted here but rejected by detail
  read endpoints L05, L09, L11, L16, and L17, which require
  `key_holder_detail`.

### L04: `POST /boards/:boardId/events`

Inputs:

- `eventType` or `event_type`: optional, defaults to `agent_reported`.
- `clientEventId`, `txHash`, `intentId`, `statusClaim`: optional identifiers.
- `assetIn`, `amountIn`, `assetOut`, `amountOut`: optional trade fields.
- `reason`: optional.
- `metadata`: optional.
- `reportedAt` or `reported_at`: optional timestamp, defaults to request time.

Happy path:

- Valid board-wallet signature creates an event with `201`.
- Empty object body creates a default `agent_reported` event when signature is
  valid.
- Reason can be present or absent.
- Re-sending a body with the same `client_event_id`, `tx_hash`, or `intent_id`
  returns a merged existing event instead of creating a duplicate.

Edge cases:

- Nonexistent board: `404`.
- Missing/invalid signed headers, unbound wallet, unbound public key, body hash
  mismatch, stale timestamp, invalid signature, or nonce replay.
- `amount_in` or `amount_out` is negative: `400`.
- `amount_in` or `amount_out` is non-numeric, object, array, `NaN`, or
  `Infinity`: `400`.
- `reported_at` invalid or more than 60 seconds in the future: `400`.
- Valid `client_event_id`, `tx_hash`, or `intent_id` without a valid signature:
  must still reject.
- Duplicate identifiers with different reason/status fields should preserve the
  original event and return `merged: true`.

### L05: `GET /boards/:boardId/events`

Happy path:

- Public board timeline reads without auth.
- Holder-gated timeline reads with valid detail read token.
- Timeline includes attachments.

Edge cases:

- Nonexistent board: `404`.
- Missing, expired, invalid, insufficient, or live-revoked read token: `403`.
- Empty event timeline returns an empty `events` array.
- Timeline with duplicate reports returns one merged event.
- Timeline with reasonless discovered event returns event with null reason plus
  any later attachments.

### L06: `POST /boards/:boardId/events/:eventId/attachments`

Inputs:

- `attachmentType`, `attachment_type`, or `type`: optional, defaults to
  `reason`.
- Allowed types: `reason`, `correction`, `retraction`, `investigation`,
  `analysis`, `summary`, `operator_note`.
- `reason` or `note`: optional.
- `metadata`: optional.

Happy path:

- Valid signed request appends attachment and does not mutate original event.
- `summary` and `operator_note` are accepted.

Edge cases:

- Nonexistent board: `404`.
- Existing board but nonexistent event id: `404`.
- Event id belonging to another board: `404`.
- Invalid `attachment_type`: `400`.
- Missing/invalid signature envelope, unbound wallet, body hash mismatch, stale
  timestamp, invalid signature, or nonce replay.
- Empty body creates default `reason` attachment with null reason. Lock this
  behavior down or decide later if it should be rejected.

### L07: `POST /boards/:boardId/observations`

Inputs:

- `walletAddress` or `wallet_address`: required.
- `observedAt` or `observed_at`: optional timestamp.
- `currentValueUsd` or `current_value_usd`: required number greater than or
  equal to `0`.
- `topupUsd` or `topup_usd`: optional nonnegative number, defaults to `0`.
- `withdrawalUsd` or `withdrawal_usd`: optional nonnegative number, defaults to
  `0`.
- `clientEventId`, `txHash`, `intentId`, `statusClaim`, `assetIn`,
  `amountIn`, `assetOut`, `amountOut`, `metadata`: optional.

Happy path:

- Service bearer creates observation with matching board wallet.
- Observation may include no activity id.
- Observation may include tx/client/intent ids for later cron linking.

Edge cases:

- Missing service bearer or missing admin token.
- Nonexistent board: `404`.
- Missing `wallet_address`: `400`.
- Wallet address not bound to board: `403`.
- Missing, negative, or non-numeric `current_value_usd`: `400`.
- Negative `topup_usd`, `withdrawal_usd`, `amount_in`, or `amount_out`: `400`.
- Invalid `observed_at` or more than 60 seconds in the future: `400`.
- Duplicate observations with the same tx/client/intent id should be tested
  because cron later links them to one event.

### L08: `POST /boards/:boardId/balance-changes`

Inputs:

- Accepts either one change object or `{ "changes": [ ... ] }`.
- Per change: `walletAddress`, `observedAt`, `assetId`, `assetSymbol`,
  `rawAmount`, `normalizedAmount`, `decimals`, `deltaAmount`,
  `deltaValueUsd`, `changeType`, `sourceObservationId`, `sourceEventId`,
  `txHash`, `intentId`, `visibilityStatus`, `metadata`.

Happy path:

- Service bearer creates one balance change.
- Service bearer creates multiple balance changes from `changes`.
- Omitted wallet defaults to board wallet.
- Source observation/event ids may be null.

Edge cases:

- Nonexistent board: `404`.
- Missing `asset_id`: `400`.
- Wallet address not bound to board: `403`.
- Invalid `observed_at` or more than 60 seconds in the future.
- `decimals` non-integer: `400`.
- `normalized_amount`, `delta_amount`, and `delta_value_usd` currently accept
  negative values. Add tests that lock this behavior down as intentional or flag
  it for a future validation change.
- `changes` contains one invalid item: expect whole request to fail without
  partial inserts.
- `source_observation_id` or `source_event_id` points to another board or a
  nonexistent row. Current DB behavior may allow null or enforce FK depending on
  provider path; test both SQLite and Neon where possible.

### L09: `GET /boards/:boardId/balance-changes`

Happy path:

- Returns latest 100 balance changes for authorized reader.
- Public board reads without token.

Edge cases:

- Nonexistent board: `404`.
- Missing/invalid/expired/insufficient read token for non-public boards.
- Empty list returns `balance_changes: []`.
- More than 100 rows returns only latest 100 in descending observed/created/id
  order.

### L10: `POST /boards/:boardId/prices`

Inputs:

- Accepts one price object, `{ "prices": [ ... ] }`, or
  `{ "snapshots": [ ... ] }`.
- Per price: `assetId`, `assetSymbol`, `priceUsd`, `priceSource`,
  `observedAt`, `stalenessStatus`, `metadata`.

Happy path:

- Service bearer creates one price.
- Service bearer creates multiple prices from `prices` or `snapshots`.
- `price_usd` may be omitted or null to record missing price evidence.

Edge cases:

- Nonexistent board: `404`.
- Missing `asset_id` or `price_source`: `400`.
- Negative `price_usd`: `400`.
- Invalid `observed_at` or more than 60 seconds in the future.
- Invalid array item fails whole request.
- Duplicate asset/time snapshots are accepted; automation should verify latest
  read order rather than uniqueness.

### L11: `GET /boards/:boardId/prices`

Happy path:

- Returns latest 100 price snapshots for authorized reader.

Edge cases:

- Nonexistent board: `404`.
- Missing/invalid/expired/insufficient read token for non-public boards.
- Empty list returns `prices: []`.
- More than 100 rows returns only latest 100 in descending observed/created/id
  order.

### L12: `POST /boards/:boardId/read-access/checks`

Inputs:

- `requesterWalletAddress`, `accessLevel`, `accessResult`, `reason`,
  `keyContractId`, `checkedAt`, `readToken`, `expiresAt`, `metadata`.
- Access levels: `public_summary`, `key_holder_detail`,
  `operator_admin_audit`.
- Default access level: `key_holder_detail`.
- Default access result: `granted`.

Happy path:

- Service bearer writes granted public summary without read token.
- Service bearer writes granted key-holder detail with read token.
- Granted non-public access without `expires_at` receives default short expiry.
- Denied access can be recorded without read token.

Edge cases:

- Nonexistent board: `404`.
- Invalid `access_level`: `400`.
- Granted non-public access missing `read_token`: `400`.
- Invalid `expires_at`: `400`.
- Granted non-public `expires_at` more than 24 hours after creation: `400`.
- Expired grant does not authorize later reads.
- `operator_admin_audit` grant should authorize `key_holder_detail` reads.
- `public_summary` grant should not authorize detail reads.
- `access_result` is currently a free string. Add a test to lock current
  behavior down or flag it for future validation to `granted` or `denied`.

### L13: `POST /boards/:boardId/read-access/near-key-market`

Inputs:

- `rpcUrl` or `rpc_url`: required unless `AGENT_BOARD_LEDGER_NEAR_RPC_URL`
  exists.
- `keyContractId` or `key_contract_id`: required.
- `holderAccountId`, `holder_account_id`, `requesterWalletAddress`, or
  `requester_wallet_address`: required.
- `agentId` or `agent_id`: optional compatibility field; when supplied it must
  match the registered board Agent. Prefer omitting it.
- `readToken` or `read_token`: required only when live key balance grants
  non-public access.
- `accessLevel`, `checkedAt`, `expiresAt`, `metadata`: optional.

Happy path:

- Mock RPC returns positive `get_balance`: writes granted check and read token
  authorizes later detail read.
- Mock RPC returns zero or null `get_balance`: writes denied check.

Edge cases:

- Missing service bearer.
- Nonexistent board.
- Missing RPC URL, key contract id, or holder account id.
- Invalid access level.
- Supplied body `agent_id` differs from the board Agent: `400`.
- Positive holder balance plus missing read token for non-public access:
  `400`.
- Invalid or too-long expiry.
- RPC non-200, RPC error object, missing result array, invalid byte array,
  invalid decoded JSON, or non-integer holder balance: `502`.
- Live key-holder grant must be rechecked during each read; changed mock RPC
  balance from positive to zero denies later reads.

### L14: `POST /boards/:boardId/watch/near-account`

Inputs:

- `rpcUrl` or `rpc_url`: required unless env provides it.
- `observedAt`, `priceUsd`, `priceSource`, `stalenessStatus`, `topupUsd`,
  `withdrawalUsd`, `clientEventId`, `txHash`, `intentId`, `statusClaim`,
  `changeType`: optional.

Happy path:

- Mock `view_account` records native NEAR balance change.
- With `price_usd`, route also writes price and observation.
- Without `price_usd`, route writes balance change with `missing_price`
  completeness.

Edge cases:

- Missing service bearer.
- Nonexistent board.
- Missing RPC URL.
- RPC non-200, RPC error object, missing result, invalid amount, or unsafe large
  amount normalization: `502`.
- Negative `price_usd`, `topup_usd`, or `withdrawal_usd`: `400`.
- Invalid or future `observed_at`.
- First watch has null delta and `initial_balance`; second watch computes
  positive, negative, or zero delta.

### L15: `POST /boards/:boardId/watch/near-ft`

Inputs:

- `rpcUrl` or `rpc_url`: required unless env provides it.
- `tokenContractId`, `token_contract_id`, `contractId`, or `contract_id`:
  required.
- `decimals`: optional. If absent, route fetches `ft_metadata`.
- `assetSymbol`, `assetId`, `observedAt`, `priceUsd`, `currentValueUsd`,
  `priceSource`, `stalenessStatus`, `topupUsd`, `withdrawalUsd`,
  `clientEventId`, `txHash`, `intentId`, `statusClaim`, `changeType`: optional.

Happy path:

- Provided decimals plus mock `ft_balance_of` records FT balance change.
- Missing decimals fetches `ft_metadata` and uses symbol/decimals.
- With price, route writes price and observation.
- With caller-supplied `current_value_usd`, route uses caller board value.
- Without price/current value, route writes missing-price balance evidence.

Edge cases:

- Missing service bearer.
- Nonexistent board.
- Missing token contract id.
- Missing decimals and metadata RPC failure.
- Metadata missing decimals: `502`.
- Decimals not integer or outside `0..36`: `400`.
- Invalid raw balance or amount too large to normalize: `502`.
- Negative `price_usd`, `current_value_usd`, `topup_usd`, or `withdrawal_usd`.
- Invalid or future `observed_at`.
- First and second watch compute expected delta for the same asset id.

### L16: `GET /boards/:boardId/portfolio`

Happy path:

- Authorized read returns latest holding snapshot.
- Board with no snapshots returns `latest: null`.

Edge cases:

- Nonexistent board.
- Missing/invalid/expired/insufficient read token for non-public boards.
- Public board without token.
- Snapshot with incomplete price/balance evidence should expose the stored
  completeness state through linked PnL tests, not hide it.

### L17: `GET /boards/:boardId/pnl`

Happy path:

- Authorized read returns latest PnL snapshot.
- Board with no snapshots returns `latest: null`.

Edge cases:

- Nonexistent board.
- Missing/invalid/expired/insufficient read token for non-public boards.
- Topups do not count as profit.
- Withdrawals do not count as loss.
- High-water mark and drawdown carry across snapshots.
- Missing price or missing balance evidence is marked incomplete or stale.

### L18: `POST /cron/tick`

Happy path:

- Service bearer reconciles observations into events, holding snapshots, and PnL
  snapshots.
- Without `AGENT_BOARD_LEDGER_NEAR_RPC_URL`, near account watcher is skipped and
  existing DB reconciliation still runs.
- With active tracked wallets and RPC URL, watcher runs account checks before
  reconciliation.
- Duplicate cron tick does not duplicate latest holding/PnL snapshots.

Edge cases:

- Missing service bearer or missing configured admin token.
- Observation with no activity id remains unlinked and counted.
- Observation matching an existing event links without new discovery.
- Success claim with no balance evidence creates investigation attachment.
- Success claim with no material balance change creates investigation
  attachment.
- Failure claim with material balance change creates investigation attachment.
- Boards with no observations are reported explicitly.
- RPC watcher failures are collected without failing the whole tick.
- Paper liquidation monitor failures are returned in `paperMonitor` instead of
  crashing cron.

### P01: `POST /paper/accounts`

Inputs:

- `paperAccountId` or `paper_account_id`: optional, generated when absent.
- `boardId` or `board_id`: optional.
- `agentId` or `agent_id`: required only when `board_id` is omitted.
- `agentPublicKey` or `agent_public_key`: required only when `board_id` is
  omitted.
- `baseCurrency` or `base_currency`: optional, defaults to `USD`.
- `startingBalanceUsd` or `starting_balance_usd`: required number greater than
  `0`.
- `status`: optional, defaults to `active`.
- `allowedMarkets` or `allowed_markets`: optional JSON.
- `metadata`: optional JSON.

Happy path:

- Service bearer plus Agent-signed `paper_account_registration` creates account
  and audit event.
- With `board_id`, account identity is derived from the registered board and
  supplied Agent fields must match when present.
- Without `board_id`, supplied Agent fields must match an active Agent
  registration.
- Generated account id when omitted.
- `allowed_markets` restricts later order markets.

Edge cases:

- Missing service bearer.
- Missing Agent signature, Agent body hash mismatch, Agent nonce replay, stale
  Agent signature, unregistered Agent public key, or Agent public key mismatch.
- Missing agent id, agent public key, or starting balance.
- Starting balance is `0`, negative, non-numeric, object, array, empty string,
  `null`, `NaN`, or `Infinity`.
- Duplicate paper account id: `409`.
- `status` currently accepts arbitrary non-empty strings. Test inactive status
  because later order submission rejects non-`active` accounts.
- `allowed_markets` currently accepts any JSON. Add explicit cases for array,
  empty array, string, and object to lock current behavior down.
- When `allowed_markets` is not an array, later orders are rejected because
  `marketAllowed` only accepts arrays.

### P02: `GET /paper/accounts/:paperAccountId`

Happy path:

- Existing account returns account, open positions, and latest risk.
- Account with no positions returns empty positions and null latest risk.

Edge cases:

- Nonexistent account: `404`.
- Account with closed/liquidated positions omits them from open positions.
- Latest risk ordering returns newest risk snapshot.

### P03: `POST /paper/market-snapshots`

Inputs:

- `snapshotId` or `snapshot_id`: optional.
- `coin`: required, normalized uppercase.
- `source`: optional, defaults to `hyperliquid`.
- `markPx` or `mark_px`: required positive number.
- `oraclePx`, `fundingRate`, `maxLeverage`, `maintenanceMarginRate`: optional.
- `book` or top-level `bids` and `asks`: required.
- `observedAt` or `observed_at`: optional timestamp.
- `stalenessStatus` or `staleness_status`: optional, defaults to `fresh`.

Happy path:

- Service bearer creates snapshot from `book`.
- Service bearer creates snapshot from top-level `bids` and `asks`.
- Bids are sorted descending and asks ascending.

Edge cases:

- Missing service bearer.
- Missing coin, mark price, bids, or asks.
- `mark_px`, `oracle_px`, `max_leverage`, `maintenance_margin_rate`, book
  `px`, or book `sz` is `0`, negative, or non-numeric.
- `funding_rate` may be negative; test negative and positive funding.
- Invalid `observed_at`.
- Empty bid or ask array: snapshot is stored, but later market-like orders may
  fail with missing side. Lock this behavior down.
- Duplicate snapshot id: `409`.

### P04: `POST /paper/market-snapshots/hyperliquid`

Inputs:

- `coin`: single coin, or `coins`: array of coins.
- Env `HYPERLIQUID_INFO_URL`: optional upstream override.
- Env `HYPERLIQUID_DEX`: optional dex field.

Happy path:

- Service bearer refreshes one coin from mock Hyperliquid metadata and book.
- Multiple coins are normalized uppercase and deduplicated.
- `dex` env is included in both upstream calls when configured.

Edge cases:

- Missing service bearer.
- Missing coin or empty coins array: `400`.
- Hyperliquid info endpoint non-200: `502`.
- Hyperliquid info endpoint returns non-JSON: `502`.
- `metaAndAssetCtxs` response missing universe or contexts: `502`.
- Requested coin not found in universe: `400`.
- Market context missing mark/mid/oracle price: `400`.
- `l2Book` response missing levels or time: `502`.
- Levels have invalid `px` or `sz`: `400` through snapshot creation.

### P05: `POST /paper/orders`

Inputs:

- `paperAccountId` or `paper_account_id`: required.
- `clientOrderId` or `client_order_id`: required idempotency key.
- `coin`: required, normalized uppercase.
- `side`: `buy` or `sell`.
- `tif`, `timeInForce`, `time_in_force`, `orderType`, or `order_type`:
  defaults to `Ioc`; accepts `Ioc`, `market`, `Gtc`, `Alo`, `post_only`,
  `post-only`.
- `limitPx` or `limit_px`: optional positive number.
- `size`: required positive number.
- `reduceOnly` or `reduce_only`: optional boolean-ish value.
- `marginMode` or `margin_mode`: defaults to `cross`; accepts `cross` or
  `isolated`.
- `leverage`: required positive number.
- `maxSlippageBps` or `max_slippage_bps`: optional nonnegative number,
  defaults to `50`.
- `reason`, `strategyHash`: optional.

Happy path:

- Signed IOC buy fills against fresh ask depth and writes fill, position, risk,
  leaderboard, and audit.
- Signed IOC with partial book depth returns `partially_filled`, stores
  `remaining_size: 0`, and includes fills only for the available depth.
- Signed market-like IOC without limit uses best side plus slippage.
- GTC can rest when not fully filled.
- ALO can rest when it would not cross.
- Duplicate `client_order_id` for same paper account returns existing order with
  `idempotent: true`.

Expected rejected-order cases returning `ok: true` with `order.status:
"rejected"`:

- Account status is not `active`: `paper_account_not_active`.
- Market not in `allowed_markets`: `market_not_allowed`.
- Missing or stale market snapshot: `stale_market_data`.
- Leverage above Hyperliquid max: `leverage_exceeds_hyperliquid_max`.
- Resting order missing limit price: `limit_px_required_for_resting_order`.
- ALO would cross book: `post_only_would_cross`.
- IOC has insufficient depth: `insufficient_depth`.
- Reduce-only with no open position: `reduce_only_position_not_open`.
- Reduce-only would increase position: `reduce_only_would_increase`.
- Reduce-only exceeds position size: `reduce_only_exceeds_position`.

Hard error edge cases:

- Missing paper account, client order id, coin, side, size, or leverage.
- Side not `buy` or `sell`: `400`.
- TIF not accepted: `400`.
- Margin mode not `cross` or `isolated`: `400`.
- `limit_px`, `size`, or `leverage` is `0`, negative, or non-numeric.
- `max_slippage_bps` is negative.
- `reduce_only` string values are coerced with JavaScript `Boolean(...)`.
  Specifically, `"false"` currently behaves as true. Add a current-behavior
  test and decide later whether the parser should require a real boolean.
- Missing bids for market-like sell or missing asks for market-like buy.
- Insufficient isolated margin throws `400`.
- Insufficient cross margin throws `400`.
- Missing/invalid paper signed headers, header account mismatch, header agent
  mismatch, stale timestamp, body hash mismatch, invalid signature, or nonce
  replay.

### P06: `POST /paper/liquidation-monitor/tick`

Happy path:

- No open positions returns `skipped_no_open_positions`.
- Open positions trigger Hyperliquid refresh and per-account risk checks.
- Breached isolated or cross position writes liquidation events.

Edge cases:

- Missing service bearer.
- Hyperliquid refresh failure propagates as endpoint error here; cron wraps the
  same monitor safely.
- Stale or missing market data causes risk check to skip liquidation.
- Multiple accounts and coins dedupe coin refreshes but check each account once.

### P07: `POST /paper/accounts/:paperAccountId/risk-check`

Happy path:

- Existing account with no positions writes risk and leaderboard.
- Existing account with fresh mark data computes risk.
- Breached isolated position liquidates.
- Breached cross account liquidates affected positions.

Edge cases:

- Missing service bearer.
- Nonexistent account: `404`.
- Stale or missing snapshots mark risk stale and skip liquidation.
- Liquidation updates cash, position status, liquidation event, final risk, and
  leaderboard.

### P08: `GET /paper/leaderboard`

Happy path:

- Empty DB returns `leaderboard: []`.
- Multiple accounts return latest snapshot per account, sorted by paper PnL pct
  descending then equity descending.

Edge cases:

- Stale leaderboard snapshots expose stale data status.
- Closed/liquidated accounts remain represented if they have latest snapshots.

### P09: `GET /paper/orders/:orderId/replay`

Happy path:

- Existing order returns order, market snapshot, fills, and audit.
- Rejected order replay returns order and audit with null/empty fills.

Edge cases:

- Nonexistent order: `404`.
- Order whose market snapshot was deleted or missing returns null market
  snapshot without crashing.
- Multiple audit rows are ordered oldest to newest.

### V01: `/api/ledger?ledgerPath=<path>`

Happy path:

- `GET /api/ledger?ledgerPath=/health` normalizes to `GET /health`.
- `ledgerPath=health` adds leading slash.
- Trailing slash is removed for normalized paths.
- `POST /api/ledger?ledgerPath=/boards` preserves body and headers.
- `/api/paper/accounts/:id` normalizes to `/paper/accounts/:id`.

Edge cases:

- Missing runtime DB env in hosted path returns startup/storage error.
- Invalid `ledgerPath` pointing to unknown route returns `404`.
- Method allowed by `api/ledger.ts` but unsupported by target route returns
  `404`.
- Query parameters besides `ledgerPath` are preserved.
- Request bodies for `GET` and `HEAD` are not cloned.
- Request bodies for `POST`, `PUT`, `PATCH`, and `DELETE` are cloned with
  duplex handling.

### V02: `GET /api/cron`

Happy path:

- Correct `Authorization: Bearer <CRON_SECRET>` maps to service-authorized
  `POST /cron/tick` and returns cron result.

Edge cases:

- Missing `CRON_SECRET` or wrong authorization: `401`.
- Correct cron secret but missing `AGENT_BOARD_LEDGER_ADMIN_TOKEN`: `500`.
- Non-GET method against `api/cron.ts` is not exported and should be verified
  at framework level if hosted.
- Direct `GET /cron/tick` through the adapter follows the same cron-secret path.

### V03: Vercel rewrites

Happy path:

- `/health` rewrites to `/api/ledger?ledgerPath=/health`.
- `/boards/:path*` rewrites to `/api/ledger?ledgerPath=/boards/:path*`.
- `/paper/:path*` rewrites to `/api/ledger?ledgerPath=/paper/:path*`.
- `/cron/:path*` rewrites to `/api/ledger?ledgerPath=/cron/:path*`.

Edge cases:

- Rewritten board and paper paths preserve auth headers and request body.
- Rewritten unknown nested path returns target `404`.
- Paths with trailing slash are normalized consistently with direct adapter
  calls.

### A01: `GET /api/key-market/config`

Happy path:

- Returns non-secret key-market config and default agent id.
- Env overrides network, RPC URL, contract id, gas, storage deposit, and default
  agent id.

Edge cases:

- Invalid storage-deposit NEAR amount causes route failure because config
  parsing is not caught by `routeError`.
- Response must not include secrets or signing material.
- Missing env uses testnet defaults.

### A02: `GET /api/key-market/state`

Inputs:

- `agentId`: required, regex `^[a-z0-9_-]{3,64}$`.
- `holderId`: optional, regex `^[a-z0-9._-]{2,64}$`.

Happy path:

- Valid agent id reads `get_state` and formats NEAR values.
- Valid holder id passes through to the view call.
- Null `next_sell_price` remains null.

Edge cases:

- Missing, too short, too long, uppercase, or invalid-character `agentId`:
  `400`.
- Invalid `holderId`: `400`.
- Contract method throws Wasm trap or "does not exist": `404`.
- RPC/network failure: `502`.
- Contract returns malformed yocto fields: route should fail or return empty
  formatted fields; lock current behavior down.

### A03: `GET /api/key-market/quote`

Inputs:

- `side`: required `buy` or `sell`.
- `agentId`: required same validation as A02.
- `amount`: required regex `^[1-9]\d{0,5}$`, so valid range is integer string
  `1` through `999999`.

Happy path:

- Buy quote calls `get_buy_price` and returns quote plus max-price protection.
- Sell quote calls `get_sell_price` and returns quote plus min-payout
  protection.

Edge cases:

- Missing or invalid side: `400`.
- Missing or invalid agent id: `400`.
- Missing amount, `0`, negative, decimal, non-numeric, or more than six digits:
  `400`.
- Sell amount greater than holder/supply causing contract trap: `404`.
- RPC/network failure: `502`.
- Malformed quote numeric strings causing `BigInt` parse failure: `502`.

### A04: `GET /api/backend/config`

Happy path:

- Returns public backend base URL, default board id, and derived environment.
- Env override chooses staging, production, or custom environment label.

Edge cases:

- Trailing slashes are trimmed from base URL.
- Read token env is intentionally omitted from public response.
- Missing env uses staging default.

### A05: `GET /api/backend/health`

Happy path:

- Proxies `/health` to configured backend and returns config plus backend
  health.

Edge cases:

- Backend non-OK JSON error returns same status and message.
- Backend non-JSON error text is exposed as error text.
- Network failure returns `502`.
- The app proxy must not inject a global config read token. It only forwards a
  request-scoped `x-clawhouse-read-token` produced by wallet-proof read-token
  exchange.

### A06: `GET /api/backend/board`

Inputs:

- `boardId`: optional, defaults to backend config default.
- Regex `^[a-zA-Z0-9_.:-]{3,96}$`.

Happy path:

- Aggregates board, events, portfolio, pnl, balance changes, prices, and paper
  leaderboard.
- `ok` is true only when the board read succeeds.
- Partial failures populate `errors` without rejecting the whole response.

Edge cases:

- Missing board id uses default.
- Invalid board id: `400`.
- Nonexistent board downstream: response `ok: false` with board error.
- Downstream events/portfolio/pnl/prices/balance failures are isolated in
  `errors`.
- Backend network failure for all reads returns partial aggregate with errors,
  not a top-level thrown error unless board id validation fails.

### A07: `GET /api/backend/paper-leaderboard`

Happy path:

- Proxies `/paper/leaderboard` and returns config plus leaderboard.

Edge cases:

- Backend non-OK response maps status and message.
- Backend unavailable returns `502`.
- Empty leaderboard remains an empty array.

### W01: `GET /`

Happy path:

- Serves `apps/acceptance-workbench/index.html`.

Edge cases:

- Missing index file returns `500`.
- Wrong method returns workbench `404`.

### W02: `GET /flows.json`

Happy path:

- Serves `apps/acceptance-workbench/flows.json` as JSON text.

Edge cases:

- Missing flows file returns `500`.
- Invalid JSON is still served as text by this route; the browser/client parse
  should catch it separately.

### W03: `GET /health`

Happy path:

- Returns `ok`, `repoRoot`, `flowsPath`, and `encryptedEnvConfigured`.

Edge cases:

- `encryptedEnvConfigured` false when key missing.
- Health response includes local paths by design; do not use this endpoint as a
  public production monitor.

### W04: `POST /crypto/encrypt`

Inputs:

- `value`: stringified by runner, defaults to empty string.

Happy path:

- With valid 32-byte base64 encryption key, returns `enc:v1:` ciphertext.

Edge cases:

- Missing encryption key: `500`.
- Key not base64 for 32 bytes: `500`.
- Empty value encrypts successfully.
- Non-string value is stringified.

### W05: `POST /crypto/decrypt`

Inputs:

- `ciphertext`: stringified by runner.

Happy path:

- Decrypts valid `enc:v1:` ciphertext produced by W04.

Edge cases:

- Missing encryption key: `500`.
- Unsupported prefix: `500`.
- Malformed ciphertext parts: `500`.
- Wrong key, wrong tag, or corrupted ciphertext: `500`.
- Empty ciphertext: `500`.

### W06: `POST /run/http`

Inputs:

- `url`: required by behavior.
- `method`: optional, defaults to `GET`.
- `headers`: optional object.
- `body`: optional. Non-string bodies are JSON-stringified.

Happy path:

- Runs GET and returns status, headers, text, parsed JSON, duration, and `ok`.
- Runs POST with JSON body.
- Non-JSON response returns `json: null` and raw text.

Edge cases:

- Missing or invalid URL bubbles as `500`.
- Target timeout aborts and bubbles as `500`.
- Non-2xx target returns `ok: false` but workbench route itself returns `200`.
- Empty headers are filtered.

### W07: `POST /run/near-view`

Inputs:

- `rpcUrl`, `contractId`, `methodName`, `args`.

Happy path:

- Posts NEAR `call_function`, decodes byte result to text and JSON.
- Empty byte result returns empty text and null JSON.

Edge cases:

- Missing or invalid URL/contract/method input bubbles as `500` or RPC failure.
- RPC non-OK or RPC error returns runner `ok: false`.
- RPC non-JSON response bubbles as `500`.
- Result byte array decodes to non-JSON text with `json: null`.
- Timeout bubbles as `500`.

### W08: `POST /run/script`

Inputs:

- `stepId`: must match a `type: "script"` step in `flows.json`.
- `env`, `vars`, `inputs`: interpolated into command, args, cwd, and process
  env.

Happy path:

- Allowlisted script step executes inside repo root.
- Expected exit code and expected output match.
- JSON stdout is parsed into `json`.

Edge cases:

- Unknown or non-script step id returns `ok: false`.
- CWD outside repo root is refused.
- Absolute args outside repo root are refused unless they are request path args.
- Missing cwd returns `ok: false`.
- Process timeout kills command and returns `ok: false`.
- Exit code mismatch returns `ok: false`.
- Expected output missing returns `ok: false`.
- Forbidden output present returns `ok: false`.
- Private key redaction is applied when the flow step requests it.

## Existing Coverage To Preserve

The current `apps/agent-board-ledger/test/server.test.ts` already covers many
high-value cases:

- health readiness and runtime DB env requirements;
- service auth for board registration, observations, and cron;
- board wallet signature binding, body hash, nonce replay, stale timestamp, and
  unbound wallet rejection;
- read token gating, expiry, max TTL, default TTL, and live key-holder recheck;
- event creation, attachment append, invalid attachment type, negative event
  amounts, duplicate event merge;
- cron discovery, conflict investigations, duplicate snapshot prevention,
  high-water/drawdown, topup/withdrawal accounting, missing observation wallet,
  future observation rejection, invalid accounting numbers;
- Vercel route normalization and cron-secret adapter behavior;
- NEAR account/FT watch and NEAR key-market holder checks;
- paper IOC/GTC/ALO order behavior, leverage-cap rejection, liquidation,
  reduce-only, Hyperliquid snapshot refresh, paper leaderboard, and replay.

Hourly automation should reuse existing unit tests for deterministic behavior,
then add a smaller live monitor that checks deployed health, key-market reads,
backend aggregate reads, and a safe service-auth canary path only when
credentials are available.

## Automation Backlog Notes

Do not implement the hourly automation from this document yet.

When it is implemented:

- Keep deterministic edge-case tests local/CI, not hourly against production.
- Keep hourly monitors non-destructive by default: `GET /health`, BFF config,
  BFF key-market state/quote, backend board aggregate, paper leaderboard.
- Put destructive/write canaries behind explicit staging credentials and unique
  canary ids.
- Never send private keys, seed phrases, Hyperliquid API keys, IronClaw secrets,
  or raw signing material through Workbench responses, logs, or public monitor
  output.
- Separate staging and production monitor expected states.
- Record current failure mode and response body, not just status code.
- Suppress duplicate alerts for the same endpoint/error until state changes.
