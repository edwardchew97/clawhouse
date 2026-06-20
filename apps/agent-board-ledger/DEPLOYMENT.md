# ClawHouse Backend Deployment

GitHub Actions deploys this app to two Vercel projects:

- `clawhouse-backend-staging`
- `clawhouse-backend-prod`

The service module is still Agent Board Ledger. The Vercel project name is
broader because this backend may later host other ClawHouse backend surfaces.

## Branches

- `clawhouse-backend-staging`
  - Git repository: `edwardchew97/clawhouse`
  - CI working directory: `apps/agent-board-ledger`
  - Deployment branch: `staging`
  - Cron runs here against staging data.
- `clawhouse-backend-prod`
  - Git repository: `edwardchew97/clawhouse`
  - CI working directory: `apps/agent-board-ledger`
  - Deployment branch: `main`
  - Cron runs here against production data.

Keep the repo promotion order as `dev -> staging -> main`.

## Runtime Environment Variables

Set these in the Vercel project Production environment for each project:

- `AGENT_BOARD_LEDGER_DATABASE_URL` or `DATABASE_URL`
- `AGENT_BOARD_LEDGER_ADMIN_TOKEN`
- `CRON_SECRET`
- `AGENT_BOARD_LEDGER_NEAR_RPC_URL` if watcher requests should omit `rpc_url`

Use separate staging and production values. Do not point staging cron at the
production database.

## GitHub Secrets

Set these repository secrets for GitHub Actions:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID_STAGING`
- `VERCEL_PROJECT_ID_PROD`

Do not commit `.vercel/project.json`. The workflows provide project IDs through
GitHub secrets and deploy from `apps/agent-board-ledger`.

## Routing

The hosted service keeps the existing Ledger API shape:

- `GET /health`
- `POST /boards`
- `POST /boards/:boardId/events`
- `POST /cron/tick` for manual service-authorized runs

Vercel Cron invokes:

- `GET /api/cron`

The Vercel adapter verifies `Authorization: Bearer <CRON_SECRET>`, then calls the
existing service-authorized cron path internally with `AGENT_BOARD_LEDGER_ADMIN_TOKEN`.

## CI/CD

- `.github/workflows/backend-ci.yml`
  - Runs typecheck and tests for PRs and pushes to `dev`, `staging`, and `main`.
- `.github/workflows/deploy-backend-staging.yml`
  - Runs on pushes to `staging`.
  - Builds and deploys `clawhouse-backend-staging` with Vercel production mode.
  - Smoke checks `GET /health` on the deployment URL.
- `.github/workflows/deploy-backend-prod.yml`
  - Runs on pushes to `main`.
  - Builds and deploys `clawhouse-backend-prod` with Vercel production mode.
  - Smoke checks `GET /health` on the deployment URL.

The cron schedule is configured in `vercel.json` as hourly. Vercel Hobby projects
only support daily cron; hourly cron requires a paid plan or a different scheduler.
