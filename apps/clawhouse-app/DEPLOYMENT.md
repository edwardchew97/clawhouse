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
  - Backend: `http://clawhouse.v2202606372783474511.luckysrv.de`
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
- `CLAWHOUSE_KEY_MARKET_GAS`
- `CLAWHOUSE_KEY_STORAGE_DEPOSIT_NEAR`
- `CLAWHOUSE_AGENT_API_BASE_URL`
- `CLAWHOUSE_LEDGER_ADMIN_TOKEN` or `AGENT_BOARD_LEDGER_ADMIN_TOKEN` as a
  server-only secret for wallet-proof read-token exchange
- `CLAWHOUSE_READ_ACCESS_SIGNING_RECIPIENT` if the NEP-413 recipient should be
  fixed instead of derived from the request host

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

`CLAWHOUSE_DEFAULT_AGENT_ID` and `CLAWHOUSE_DEFAULT_LEDGER_BOARD_ID` are
optional. Fresh environments should leave them unset; the app will show an empty
agent state until onboarding registers a public board and paper account. If they
are set, `CLAWHOUSE_DEFAULT_LEDGER_BOARD_ID` must point at a board that exists
in the selected backend database.

Rotating `CLAWHOUSE_LEDGER_ADMIN_TOKEN` / `AGENT_BOARD_LEDGER_ADMIN_TOKEN`
invalidates active wallet session and holder read cookies because the App uses
that server-only secret to sign the cookies.

Do not configure a global holder read token in the app. Holder-detail reads must
start from the browser flow: the wallet signs a NEP-413 read-access challenge,
the App verifies that proof, and then the App creates an HttpOnly wallet session
cookie plus a short-lived HttpOnly holder read cookie. The browser must not
receive the raw holder read token. While the wallet session cookie is valid, the
App may refresh the holder read cookie server-side without asking the user to
sign another message; Ledger still rechecks live key-holder balance before
serving holder-detail reads.

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
- After buying a key, sign the room-access message and confirm holder-gated
  Agent reasoning unlocks through the HttpOnly holder read cookie.
- Refresh the browser and confirm the restored wallet session does not prompt a
  second room-access signature while the wallet session is still valid.
