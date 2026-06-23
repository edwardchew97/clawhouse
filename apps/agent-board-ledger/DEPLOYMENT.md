# ClawHouse Backend Deployment

Vercel deploys this app from GitHub through two Vercel projects:

- `clawhouse-backend-staging`
- `clawhouse-backend-prod`

The service module is still Agent Board Ledger. The Vercel project name is
broader because this backend may later host other ClawHouse backend surfaces.

## Branches

- `clawhouse-backend-staging`
  - Git repository: `edwardchew97/clawhouse`
  - Root directory: `apps/agent-board-ledger`
  - Production branch: `staging`
  - Cron runs here against staging data.
- `clawhouse-backend-prod`
  - Git repository: `edwardchew97/clawhouse`
  - Root directory: `apps/agent-board-ledger`
  - Production branch: `main`
  - Cron runs here against production data.

Keep the repo promotion order as `dev -> staging -> main`.

## Runtime Environment Variables

Local development values live in `apps/agent-board-ledger/.env.local`. That file
is ignored by git and must not be committed.

Hosted values live in Vercel project settings:

- `clawhouse-backend-staging` -> Production environment for the `staging` branch
- `clawhouse-backend-prod` -> Production environment for the `main` branch

Set these in each Vercel project:

- `AGENT_BOARD_LEDGER_DATABASE_URL` or `DATABASE_URL`
- `AGENT_BOARD_LEDGER_ADMIN_TOKEN`
- `CRON_SECRET`
- `AGENT_BOARD_LEDGER_NEAR_RPC_URL` for the automatic cron NEAR account watcher
- `HYPERLIQUID_INFO_URL` if the Hyperliquid info endpoint must be overridden
- `HYPERLIQUID_DEX` if paper trading must target a specific Hyperliquid dex
  namespace

Use separate staging and production values. Do not point staging cron at the
production database.

Prefer `AGENT_BOARD_LEDGER_DATABASE_URL` for hosted deployments. `DATABASE_URL`
is supported as a compatibility alias. `AGENT_BOARD_LEDGER_PORT` is local-only
and should not be set in Vercel.

The staging backend project's Production Branch must be `staging`; the
production backend project's Production Branch must be `main`.

## GitHub Actions

GitHub Actions only runs tests:

- `.github/workflows/backend-ci.yml`
  - Runs typecheck and tests for PRs and pushes to `dev`, `staging`, and `main`.

GitHub Actions does not deploy to Vercel. Do not add `VERCEL_TOKEN` unless we
intentionally switch back to a GitHub Actions deployment model.

## Schema Migrations

Hosted requests must not run schema migrations. The Vercel build command runs
`bun scripts/vercel-build.ts`, which runs the Neon migration only when
`VERCEL_ENV=production`. Preview and local builds skip the migration.

For manual operations, run:

```bash
bun run db:migrate:neon
```

Use `bun run db:check:neon` for read-only schema checks. Do not use public
runtime endpoints such as `/health`, `/boards`, `/paper/...`, or `/api/cron` as
a migration trigger.

## Routing

The hosted service keeps the existing Ledger API shape:

- `GET /health`
- `POST /agents`
- `POST /boards`
- `POST /boards/:boardId/events`
- `POST /cron/tick` for manual service-authorized runs

It also hosts the current Hyperliquid paper trading API under `/paper/...`.
The implemented paper-trading contract is documented in
`PAPER_TRADING_API.md`.

Vercel Cron invokes:

- `GET /api/cron`

The Vercel adapter verifies `Authorization: Bearer <CRON_SECRET>`, then calls the
existing service-authorized cron path internally with `AGENT_BOARD_LEDGER_ADMIN_TOKEN`.
Each cron tick first checks active tracked NEAR account balances when
`AGENT_BOARD_LEDGER_NEAR_RPC_URL` is configured, then reconciles observations,
events, holding snapshots, and PnL snapshots. Without the RPC URL, cron skips the
automatic account watcher and only reconciles data already in the database.

## CI/CD

- Pushes to `staging` are deployed by Vercel through `clawhouse-backend-staging`.
- Pushes to `main` are deployed by Vercel through `clawhouse-backend-prod`.
- GitHub Actions only gates code quality; Vercel owns build, deploy, and cron.

The cron schedule is configured in `vercel.json` as every minute. Once-per-minute
cron requires a Vercel Pro-or-higher project; Hobby projects only support daily
cron and need a different scheduler for this cadence.
