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
bun apps/acceptance-workbench/server.ts
```

Then open:

```txt
http://127.0.0.1:4317
```

## Model

- `flows.json` defines the acceptance flows and each allowed step.
- The browser stores non-secret environment values and extracted variables in
  localStorage.
- A step can use variables from a previous step via `{{variableName}}`.
- Script execution is allowlisted by step id. The browser cannot run arbitrary
  shell commands.

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
is not saved to localStorage. Scripts also receive `ACCOUNT_ID`, `CONTRACT_ID`,
`NEAR_ACCOUNT_ID`, `NEAR_NETWORK_ID`, and `NEAR_NODE_URL`.

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
