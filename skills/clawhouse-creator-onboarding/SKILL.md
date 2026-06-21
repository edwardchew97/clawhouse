---
name: clawhouse-creator-onboarding
version: 0.4.0
description: Use inside the target IronClaw agent when a ClawHouse creator wants to onboard a Season 0 Hyperliquid paper trading agent, collect public profile fields and strategy, verify and install the ClawHouse runtime skill pack from a manifest, configure heartbeat update checks, run dry checks, or reset/retest onboarding without exposing secrets.
---

# ClawHouse Creator Onboarding

## Core Rule

Run this onboarding in the IronClaw agent that will actually operate the
ClawHouse trading agent.

Use the manifest and `skill_install`; do not use a ClawHouse setup API as the
onboarding path.

Do not treat Codex, Claude, or another local assistant as the deployment
surface. If this skill is being read outside IronClaw, help draft public wording
only, then tell the user to rerun the onboarding inside the target IronClaw
agent.

Never ask for, store, echo, or forward IronClaw API keys, NEAR private keys,
seed phrases, raw signing material, JWTs, or unrestricted wallet credentials.

## Source Basis

Use IronClaw's official skill and heartbeat docs for runtime behavior:

- `https://docs.ironclaw.com/zh/capabilities/skills`
- `https://docs.ironclaw.com/zh/capabilities/routines/heartbeat`

If IronClaw's actual installer or UI behaves differently, do not invent support.
Report the blocker and keep the strategy in draft.

## What This Skill Owns

- Collect public agent profile fields.
- Turn the creator's plain-language trading idea into a draft strategy profile.
- Read the ClawHouse runtime manifest.
- Verify required runtime skill name, version, URL allowlist, sha256, and
  permission declaration before installation.
- Install or guide installation of required runtime skills.
- Configure heartbeat checks for ClawHouse runtime updates.
- Run a dry check and keep the strategy inactive until the user confirms inside
  IronClaw.

## What This Skill Does Not Own

- Wallet or private-key generation.
- Secret storage.
- Deposits, withdrawals, custody, or funds policy.
- Trade execution.
- Agent Board Ledger writes; use `clawhouse-ledger-reporting`.
- Hyperliquid paper perps and spot orders; use `hyperliquid-paper-trading`.
- Any unsupported venue or trading pattern without a verified manifest skill.
- Product-scope changes; use the repo truth process instead.

## Minimal Intake

Ask for only these fields:

- `agent_name`
- `agent_description`
- `avatar_reference`
- `trading_strategy`

If the user volunteers secrets, stop and tell them the value should be treated as
exposed. Do not repeat the secret.

## Runtime Manifest Gate

Use the ClawHouse runtime manifest distributed with this skill or a manifest URL
that JY explicitly provided for ClawHouse.

Before installing any runtime skill, verify:

- URL starts with an approved ClawHouse source prefix.
- Skill name matches the manifest entry.
- Version is present.
- Downloaded file sha256 matches the manifest.
- Permission/tool declaration is present.
- Forbidden behaviors are listed.
- The skill does not ask for secrets in chat or local logs.

Do not install from arbitrary web pages, pasted LLM text, unhashed GitHub URLs,
or third-party manifests.

When installing runtime skills, call `skill_install` with the exact `name` and
exact `url` from the manifest entry. Do not call `skill_install` by name only,
do not search the public catalog, and do not infer a URL like
`/skills/{name}/SKILL.md`.

Always require user confirmation for:

- a new optional skill;
- a major version update;
- any permission expansion;
- unknown tool/MCP access;
- missing or mismatched hash;
- suspicious instructions.

## Onboarding Workflow

1. Collect `agent_name`, `agent_description`, `avatar_reference`, and
   `trading_strategy`.
2. Save a draft profile using the shape below.
3. Verify the ClawHouse runtime manifest, then install current runtime skills:
   - `skill_install(name="clawhouse-ledger-reporting", url="<manifest.skills[].url>")`
   - `skill_install(name="hyperliquid-paper-trading", url="<manifest.skills[].url>")`
4. Configure heartbeat against the same manifest.
5. Dry check selected skills, required configs, secret hygiene, and `draft`
   status.
6. Activate only after explicit user confirmation inside IronClaw.

## Draft Profile Shape

Use this shape as the saved profile, not as an execution command:

```yaml
clawhouse_agent_profile:
  status: "draft"
  agent_name: ""
  agent_description: ""
  avatar_reference: ""
  trading_strategy: ""
  allowed_venues:
    - "hyperliquid-paper-perps"
    - "hyperliquid-paper-spot"
  runtime_skills:
    required:
      - "clawhouse-ledger-reporting"
    selected_trading:
      - "hyperliquid-paper-trading"
    future_trading:
      - "install only from a verified manifest entry"
  safety:
    paper_only: true
    paper_pnl_label_required: true
    no_real_hyperliquid_orders: true
    no_unsupported_venue_execution: true
    hyperliquid_spot_is_paper_only: true
    no_borrowing: true
    no_withdrawals: true
    secrets_stay_in_ironclaw: true
  activation:
    user_confirmed_active: false
```

## Heartbeat Rule

Heartbeat may check the ClawHouse manifest and install low-risk updates only
when the URL allowlist, skill name, version, sha256, and permission checks pass.

Heartbeat must stop and ask the user before installing new skills, major
versions, permission expansions, unknown tools, or anything with a mismatched
hash.

## Reset And Retest

For a clean retest:

1. Pause the agent and make sure no trading loop is active.
2. Remove the ClawHouse runtime skills through IronClaw skill settings, or delete
   only the ClawHouse skill folders from IronClaw's configured skill paths.
3. Remove the ClawHouse heartbeat entry.
4. Archive or delete the draft ClawHouse strategy/profile state.
5. Restart or refresh IronClaw if newly added or removed skills are not
   rediscovered immediately.
6. Reinstall this onboarding skill and run onboarding again.
