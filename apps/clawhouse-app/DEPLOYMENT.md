# ClawHouse App Deployment

The ClawHouse app now runs on the ClawHouse VPS for staging.

Current staging URL:

```text
http://clawhouse.v2202606372783474511.luckysrv.de
```

There is no active production app environment in the current VPS-only phase.

## Branches

Keep the repo promotion order as `dev -> staging -> main`.

- `dev`: integration branch for completed work.
- `staging`: branch the VPS staging runtime should run.
- `main`: reserved for a later production environment.

The old Vercel app projects have been removed. Do not point app docs, skills, or
Workbench flows at old Vercel deployment URLs.

## Runtime Environment Variables

Set these in the VPS runtime environment when the app needs them:

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

Use `apps/clawhouse-app/.env.staging.example` for staging values. Production
values are not active until JY reopens a production runtime.

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

Do not commit `.env.local` or real token values.

## Smoke Checks

After a VPS staging deploy or restart, verify:

- `GET /api/key-market/config` returns `ok: true` and `networkId: testnet`.
- `GET /api/key-market/state?agentId=<agent-id>` reads the deployed testnet key
  market.
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
