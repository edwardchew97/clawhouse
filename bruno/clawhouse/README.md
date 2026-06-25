# ClawHouse Bruno Collection

This Bruno collection targets the local ClawHouse dev runtime only.

Default runtime URLs:

- Agent Board Ledger: `http://127.0.0.1:4321`
- Acceptance Workbench: `http://127.0.0.1:4318`
- ClawHouse App: `http://127.0.0.1:4320`

## Layout

- `00-health`: shared local runtime health check
- `01-paper-trading`: signed paper trading setup, live Hyperliquid snapshot, IOC order, and readback
- `02-holder-gated-reasoning`: holder-gated Agent Board Ledger reasoning flow
- `03-creator-onboarding`: one-request creator onboarding registration and readback

## Gold Mode

This collection is designed to run from Bruno Desktop with `No Environment`
selected. Defaults live in `collection.bru`.

The paper signer and holder-gated board signer are generated inside Bruno with
`@near-js/crypto`. Bruno stores the generated secret keys, wallet ids, and public
keys as runtime variables for the current run. No `/paper/bruno/*` backend helper
endpoints are used.

## Optional Secrets

Gold mode does not require a pasted signer private key.

Service-authorized setup requests still use the normal backend bearer token.
Bruno reads `AGENT_BOARD_LEDGER_ADMIN_TOKEN` from process env or from the local
repo `.env.local` / `apps/agent-board-ledger/.env.local`. If neither file has the
token, create a local ignored env file:

```sh
cp .env.example .env
```

Then fill in `AGENT_BOARD_LEDGER_ADMIN_TOKEN` inside `.env`.

The checked-in `local-dev` environment maps this value through `process.env` and
marks it as a Bruno secret variable.

## Run

Start or check the local dev runtime first:

```sh
bun run local-runtime:status
```

Run the collection with Bruno CLI:

```sh
cd bruno/clawhouse
bun install
bunx @usebruno/cli run --sandbox developer --env local-dev --bail --reporter-skip-all-headers --reporter-skip-body
```

Developer sandbox is required because Bruno loads local signing dependencies and
reads local ignored env files.

## Paper Trading Flow

1. `GET /health`
2. `GET /health` with local Bruno script side effect: generate paper signer
3. `POST /agents` with service bearer auth plus Agent-signed registration
4. `POST /paper/accounts` with service bearer auth plus Agent-signed
   `paper_account_registration`
5. `POST /paper/market-snapshots/hyperliquid`
6. `POST /paper/orders`
7. `GET /paper/accounts/:paper_account_id`
8. `GET /paper/leaderboard`
9. `GET /paper/orders/:order_id/replay`
10. `POST /paper/accounts/:paper_account_id/risk-check`
11. `POST /paper/liquidation-monitor/tick`

Open the Body tab before sending these requests if you want to inspect or edit
the payload:

- `00 Prepare Local Paper Signer`: no API body; generates local Bruno runtime
  vars for `paper_signer_id`, `paper_signer_secret_key`, and
  `paper_agent_public_key`
- `01 Register Paper Agent`: `agent_id`, `agent_public_key`, `metadata`; signs
  the request with `paper_signer_secret_key`
- `02 Create Paper Account`: `paper_account_id`, `agent_id`,
  `agent_public_key`, `starting_balance_usd`, `allowed_markets`, `metadata`
- `01 Get Hyperliquid Current Price`: `market_type`, `coins`
- `01 Submit Signed IOC Paper Order`: `paper_account_id`, `client_order_id`,
  `market_type`, `coin`, `side`, `tif`, `size`, `margin_mode`, `leverage`,
  `max_slippage_bps`, `reason`
- `04 Run Paper Risk Check`: `{}`
- `05 Run Liquidation Monitor Tick`: `{}`

`Get Hyperliquid Current Price` stores `current_best_ask_px`,
`current_best_bid_px`, and `current_mark_px` as Bruno runtime variables. The
default order is an IOC market-like order: it omits `limit_px` and uses
`max_slippage_bps` against the live book.

## Holder-Gated Reasoning Flow

This folder covers the current backend truth for key-gated Agent reasoning:

1. `GET /health` with local Bruno script side effect: generate a board wallet
2. `POST /agents` with service bearer auth plus Agent-signed registration
3. `POST /boards` with service bearer auth plus wallet-signed and Agent-signed
   board registration
4. `POST /boards/:board_id/events` with the board wallet signature and a
   holder-only `reason`
5. `GET /boards/:board_id/events` without a read token, expected to return 403
6. `POST /boards/:board_id/read-access/checks` to create a local manual read token
7. `GET /boards/:board_id/events` with `x-clawhouse-read-token`, expected to
   return the holder-only reason

The `Create Holder Read Token` request defaults to `holder_read_access_mode:
manual` so the local collection can run without a live key market. Change
`holder_read_access_mode` to `live-key-market` to call
`POST /boards/:board_id/read-access/near-key-market` instead. Live mode requires
real `near_rpc_url`, `key_contract_id`, and `holder_account_id` values, and the
final read succeeds only when the backend sees a positive key balance. The live
holder-gate request does not choose `agent_id`; Ledger derives it from the
registered board.

## Creator Onboarding Flow

This folder covers the public creator onboarding backend write path:

1. `GET /health` with local Bruno script side effect: generate a board wallet
   signer and a separate Agent signer
2. `POST /creator-onboarding/register` with no service bearer token, signed by
   both the board wallet and the Agent using `creator_onboarding_registration`
3. `GET /boards` to confirm the new public active board is discoverable
4. `GET /paper/accounts/:paper_account_id` to confirm the paper account exists

Open the Body tab before sending `Register Creator Onboarding` if you want to
edit `agent_id` or metadata. Do not add `board_id`, `paper_account_id`,
`starting_balance_usd`, or `allowed_markets`; creator onboarding resolves or
assigns those fields through the backend. Keep the generated public keys and
wallet address matched to the local signer variables unless you intentionally
want to test signature rejection.
