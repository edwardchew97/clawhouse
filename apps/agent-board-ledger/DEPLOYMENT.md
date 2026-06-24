# ClawHouse Backend Deployment

Agent Board Ledger now runs on the ClawHouse VPS for staging.

Current staging URL:

```text
http://clawhouse.v2202606372783474511.luckysrv.de
```

There is no active production backend environment in the current VPS-only
phase.

## Branches

Keep the repo promotion order as `dev -> staging -> main`.

- `dev`: integration branch for completed work.
- `staging`: branch the VPS staging runtime should run.
- `main`: reserved for a later production environment.

The old Vercel projects have been removed. Do not point staging or production
docs, skills, or Workbench flows at old Vercel deployment URLs.

## Runtime Environment Variables

Local development values live in `apps/agent-board-ledger/.env.local`. That file
is ignored by git and must not be committed.

The VPS runtime owns hosted values such as:

- `AGENT_BOARD_LEDGER_DATABASE_URL` or `DATABASE_URL`
- `AGENT_BOARD_LEDGER_ADMIN_TOKEN`
- `CRON_SECRET`
- `AGENT_BOARD_LEDGER_NEAR_RPC_URL` for the automatic NEAR account watcher
- `HYPERLIQUID_INFO_URL` if the Hyperliquid info endpoint must be overridden
- `HYPERLIQUID_DEX` if paper trading must target a specific Hyperliquid dex
  namespace

Prefer `AGENT_BOARD_LEDGER_DATABASE_URL` for hosted deployments. `DATABASE_URL`
is supported as a compatibility alias. `AGENT_BOARD_LEDGER_PORT` is local-only
unless the VPS process manager explicitly owns it.

## GitHub Actions

GitHub Actions only runs CI:

- `.github/workflows/backend-ci.yml`
  - Runs typecheck and tests for PRs and pushes to `dev`, `staging`, and `main`.

GitHub Actions does not deploy this service. Do not add `VERCEL_TOKEN` or Vercel
project ids for this repo unless JY explicitly reopens a Vercel deployment
track.

## Schema Migrations

Hosted requests must not run schema migrations.

For manual operations, run:

```bash
bun run db:migrate:neon
```

Use `bun run db:check:neon` for read-only schema checks. Do not use public
runtime endpoints such as `/health`, `/boards`, `/paper/...`, or `/cron/tick` as
a migration trigger.

## Routing

The hosted service keeps the existing Ledger API shape:

- `GET /health`
- `POST /agents`
- `POST /boards`
- `POST /boards/:boardId/events`
- `POST /cron/tick` for manual service-authorized runs
- `POST /creator-onboarding/register`

It also hosts the current Hyperliquid paper trading API under `/paper/...`.
The implemented paper-trading contract is documented in
`PAPER_TRADING_API.md`.

The VPS scheduler should call the real backend cron route with
`Authorization: Bearer <CRON_SECRET>`. Each cron tick first checks active tracked
NEAR account balances when `AGENT_BOARD_LEDGER_NEAR_RPC_URL` is configured, then
reconciles observations, events, holding snapshots, and PnL snapshots. Without
the RPC URL, cron skips the automatic account watcher and only reconciles data
already in the database.

## Smoke Checks

After a VPS staging deploy or restart, verify:

- `GET /health`
- `POST /creator-onboarding/register` with `{}` returns backend JSON, not HTML.
- `GET /boards`
- `GET /paper/leaderboard`
- `GET /api/backend/config` through the ClawHouse app surface.
