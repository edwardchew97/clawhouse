# ClawHouse Paper Trading Bruno Collection

This Bruno collection targets the local ClawHouse dev runtime only.

Default runtime URLs:

- Agent Board Ledger: `http://127.0.0.1:4321`
- Acceptance Workbench: `http://127.0.0.1:4318`
- ClawHouse App: `http://127.0.0.1:3000`

## Secrets

Do not commit real secrets. Create a local ignored env file:

```sh
cp .env.example .env
```

Then fill in `AGENT_BOARD_LEDGER_ADMIN_TOKEN` and `PAPER_SIGNER_PRIVATE_KEY`
inside `.env`.

The checked-in environment maps these values through `process.env` and marks
them as Bruno secret variables.

## Run

Start or check the local dev runtime first:

```sh
bun run local-runtime:status
```

Run the collection with Bruno CLI:

```sh
cd bruno/clawhouse-paper-trading
bunx @usebruno/cli run --env local-dev --sandbox developer --bail --reporter-skip-all-headers --reporter-skip-body
```

The `developer` sandbox is required because the signed order pre-request script
uses Node `crypto` to sign the canonical paper-trading payload.

## Flow

1. `GET /health`
2. `POST /paper/accounts`
3. `POST /paper/market-snapshots/hyperliquid`
4. `POST /paper/orders`
5. `GET /paper/accounts/:paper_account_id`
6. `GET /paper/leaderboard`
7. `GET /paper/orders/:order_id/replay`
8. `POST /paper/accounts/:paper_account_id/risk-check`
9. `POST /paper/liquidation-monitor/tick`

All paper orders are signed with the configured wallet signer. Service-only
operations use the local runtime admin token.
