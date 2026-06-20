---
name: clawhouse-local-runtime
description: Start, inspect, refresh, or stop the local ClawHouse dev runtime from Codex. Use when JY asks to launch or keep ready the latest dev branch with Agent Board Ledger backend, ClawHouse App, Acceptance Workbench, Neon database migration/checks, health checks, logs, and automatic refresh when origin/dev changes.
---

# ClawHouse Local Runtime

## Core Rule

Use the repo-owned runtime script. Do not hand-type a custom launch sequence.

This skill owns the local developer runtime only:

- Agent Board Ledger backend.
- ClawHouse App.
- Acceptance Workbench.
- Neon/Postgres migration and schema check through existing repo scripts.
- Runtime health, logs, and auto-refresh from `origin/dev`.

This skill does not own:

- Product scope or truth changes.
- Linear issue status, roadmap, or progress-map updates.
- PR creation, commit, merge, or deployment.
- Creator onboarding inside IronClaw.
- Secret creation except the local Workbench encryption key handled by the repo script.

## Fixed Repo

Default repo root:

```bash
/Users/Edward/Documents/clawhouse
```

Read `AGENTS.md` first. The repo root is a protected `dev` readback checkout; do not edit it as part of launch work.

## Commands

Run from the repo root:

```bash
bun run local-runtime:start
```

This starts a detached local supervisor and returns a JSON status. The supervisor keeps running after the Codex turn ends.

Inspect status:

```bash
bun run local-runtime:status
```

Stop the managed runtime:

```bash
bun run local-runtime:stop
```

## Expected Local URLs

- Agent Board Ledger: `http://127.0.0.1:4321/health`
- ClawHouse App: `http://127.0.0.1:3000`
- Acceptance Workbench: `http://127.0.0.1:4318`

## Launch Workflow

1. `cd /Users/Edward/Documents/clawhouse`.
2. Read `AGENTS.md`.
3. Run `git status --short --branch` and stop if the protected root is dirty.
4. Run `bun run local-runtime:start`.
5. Read the returned JSON status.
6. If `mode` is `running`, report the three local URLs and the log path.
7. If `mode` is `degraded`, report the exact missing env/check/service from the JSON. Do not claim the environment is ready.

## Runtime Behavior

The repo script manages a separate runtime worktree:

```bash
/Users/Edward/Documents/clawhouse/.worktrees/clawhouse-local-runtime-dev
```

It fetches `origin/dev`, restores known generated runtime files, checks out the runtime worktree detached at latest `origin/dev`, installs Bun dependencies for the app/backend/Workbench script dependencies, runs the existing Neon migration and schema check, starts services, writes status under `work/clawhouse-local-runtime/`, and polls `origin/dev` for updates.

Never print secrets, database URLs, tokens, private keys, or raw `.env` values. It is acceptable to report whether required env keys are present.

## Readiness Criteria

Treat the runtime as ready only when status JSON shows:

- `mode: "running"`;
- `runtimeHead` equals `originDev`;
- database migration and schema check passed;
- all services have healthy checks.

If any check fails, say the local runtime is degraded and name the next concrete fix.
