# ClawHouse Acceptance Workbench

This is a local PM verification workbench. It is not a mock completion UI.

The browser only triggers real actions when you click a step:

- HTTP requests through the local runner, avoiding browser CORS limits.
- NEAR RPC view calls.
- Allowlisted local scripts defined in `flows.json`.

If a backend endpoint, contract, or script does not exist, the step fails. That is
intentional: failure is the proof that the claimed implementation is not
reproducible yet.

## Run

```sh
bun run workbench
```

This pins the Workbench to port `4318` and restarts it if the server process
exits. Stop it with `Ctrl-C`.

For a one-shot server without restart behavior:

```sh
bun run workbench:once
```

The local server reads the encryption key from the repo root `.env`:

```sh
ACCEPTANCE_WORKBENCH_ENCRYPTION_KEY=base64-encoded-32-byte-key
```

Then open:

```txt
http://127.0.0.1:4318
```

## Model

- `flows.json` defines the acceptance flows and each allowed step.
- The browser stores environment values and extracted variables in localStorage.
  `testUserPrivateKey` is stored only as an AES-GCM encrypted value. The
  encryption key stays in the local `.env` file and is not committed.
- A step can use variables from a previous step via `{{variableName}}`.
- Script execution is allowlisted by step id. The browser cannot run arbitrary
  shell commands.

## Environment Targets

Use the top-right environment selector to choose the target before sending a
step:

- `Local`: uses `http://127.0.0.1:4321` for the local ClawHouse backend.
- `Dev`: integration/dev profile. Paste the current dev or preview backend URL
  into `ledgerBaseUrl` before sending backend requests.
- `Staging`: uses the deployed staging backend
  `https://clawhouse-backend-staging.vercel.app`.
- `Production`: uses the deployed production backend
  `https://clawhouse-backend-prod.vercel.app`.

Each target has its own Environment JSON in browser localStorage. Public URLs
and empty secret fields are safe to keep in source, but real credentials are not.
Do not commit filled values for `ledgerAuthorizationHeader`, `ledgerAdminToken`,
`ledgerDatabaseUrl`, `testUserPrivateKey`, `CRON_SECRET`, `DATABASE_URL`, or
other tokens. Fill them only through the local Workbench Environment drawer or
through your local `.env`.

## Hyperliquid Paper Trading Flow

The `Hyperliquid Paper Trading` flow is the Workbench acceptance route for
current Agent Trading. It targets the implemented Agent Board Ledger backend
paper-trading API under `/paper/...`, not a separate `/paper-trade/...` service.

The flow checks the local `hyperliquid-paper-trading` runtime skill, refreshes a
Hyperliquid public market-data snapshot, runs the signed paper-order script, and
then reads account state, risk, the public paper leaderboard, and replay proof.
This lane is Hyperliquid-style paper perps/margin trading; it is not the older
long-only spot wording from the superseded PaperTrade draft.

Use `ledgerBaseUrl` to target local, dev, or staging. Do not commit filled
values for `ledgerAuthorizationHeader`, `ledgerAdminToken`, or signing wallet
artifacts.

## NEAR Test User

Open the workbench, click `Environment` in the top-right, then fill these fields
in `Environment JSON`:

```json
{
  "nearNetworkId": "testnet",
  "nearRpcUrl": "https://rpc.testnet.near.org",
  "contractId": "clawhouse-key-20260619125948.testnet",
  "testUserAccountId": "your-test-user.testnet",
  "testUserPrivateKey": "ed25519:..."
}
```

`testUserAccountId` is used by the NEAR Key Market create/buy/sell steps.
`testUserPrivateKey` is passed only to allowlisted local scripts as
`NEAR_PRIVATE_KEY`; it is visible while editing the local environment JSON but
is saved to localStorage only after server-side encryption. Scripts also receive
`ACCOUNT_ID`, `CONTRACT_ID`, `NEAR_ACCOUNT_ID`, `NEAR_NETWORK_ID`, and
`NEAR_NODE_URL`.

The default contract account is the deployed Scope V0 testnet contract:

```txt
clawhouse-key-20260619125948.testnet
```

## First Real Target

Scope V0 expects a NEAR agent key market with local scripts for:

- `bun run create <agentId> <agentName> <metadataUri>`
- `bun run quote buy <agentId> <amount>`
- `bun run buy <agentId> <amount> <maxPriceNear>`
- `near-view get_state`
- `bun run quote sell <agentId> <amount>`
- `bun run sell <agentId> <amount> <minPayoutNear>`

Expected output shape:

- create/buy/sell: `{ "txHash": "...", "result": { ... } }`
- quote buy: `{ "total_cost": "...", "total_cost_near": "..." }`
- quote sell: `{ "payout": "...", "payout_near": "..." }`
- state view: `{ "agent": { "supply": "...", "reserve": "..." }, "holder_balance": "..." }`

If the contract, account, private key, or script is missing, the Key Market flow
fails honestly through the local runner instead of returning simulated data.
