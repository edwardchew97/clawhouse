# ClawHouse App Deployment

Vercel should deploy this app from GitHub through two frontend projects:

- `clawhouse-app-staging`
- `clawhouse-app-prod`

Keep the repo promotion order as `dev -> staging -> main`.

## Branches

- `clawhouse-app-staging`
  - Git repository: `edwardchew97/clawhouse`
  - Root directory: `apps/clawhouse-app`
  - Framework preset: Next.js
  - Install command: `bun install`
  - Build command: `bun run build`
  - Production branch: `staging`
  - Backend: `https://clawhouse-backend-staging.vercel.app`
- `clawhouse-app-prod`
  - Git repository: `edwardchew97/clawhouse`
  - Root directory: `apps/clawhouse-app`
  - Framework preset: Next.js
  - Install command: `bun install`
  - Build command: `bun run build`
  - Production branch: `main`
  - Backend: `https://clawhouse-backend-prod.vercel.app`

Use Vercel native Git deployments. GitHub Actions should only test this app
unless we intentionally switch back to a token-based deployment model.

## Runtime Environment Variables

Set these in the Vercel project Production environment for each project:

- `CLAWHOUSE_KEY_NEAR_NETWORK_ID`
- `CLAWHOUSE_KEY_NEAR_RPC_URL`
- `CLAWHOUSE_KEY_MARKET_CONTRACT_ID`
- `CLAWHOUSE_DEFAULT_AGENT_ID`
- `CLAWHOUSE_KEY_MARKET_GAS`
- `CLAWHOUSE_KEY_STORAGE_DEPOSIT_NEAR`
- `CLAWHOUSE_AGENT_API_BASE_URL`
- `CLAWHOUSE_DEFAULT_LEDGER_BOARD_ID`
- `CLAWHOUSE_LEDGER_READ_TOKEN` if holder-detail ledger reads require a token

Optional app runtime variables:

- `CLAWHOUSE_CURATED_AGENT_IDS` to bypass backend discovery. Format:
  `agentId[:boardId],agentId2[:boardId2]`.
- `CLAWHOUSE_DISCOVERY_READBACK_TIMEOUT_MS` for backend discovery and readback
  requests. It defaults to `5000`.

Use `apps/clawhouse-app/.env.staging.example` for staging values and
`apps/clawhouse-app/.env.production.example` for production values.

Hosted Vercel projects should use the server-only
`CLAWHOUSE_AGENT_API_BASE_URL`. Do not set
`NEXT_PUBLIC_CLAWHOUSE_AGENT_API_BASE_URL` in hosted environments unless a
legacy deployment is being migrated.

The staging app project's Production Branch must be `staging`; the production
app project's Production Branch must be `main`.

`CLAWHOUSE_DEFAULT_LEDGER_BOARD_ID` must point at a board that exists in the
selected backend database. If the board does not exist, the app should still
build and boot, but `/api/backend/board` will return the backend 404 and the UI
will show backend data as unavailable.

Do not commit `.vercel/project.json`, `.env.local`, or real token values.

## Smoke Checks

After each Vercel deployment, verify:

- `GET /api/key-market/config` returns `ok: true` and `networkId: testnet`.
- `GET /api/key-market/state?agentId=<agent-id>` reads the deployed testnet key market.
- `GET /api/backend/config` returns the intended backend URL and board id.
- `GET /api/backend/health` returns the selected backend health response.
- `GET /api/backend/board?boardId=<board-id>` returns the selected backend board
  data or an explicit backend error.
- In the browser, connect a NEAR testnet wallet, buy or sell a key, and confirm
  the transaction toast includes a clickable NearBlocks link.
