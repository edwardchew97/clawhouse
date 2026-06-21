---
name: clawhouse-creator-onboarding
version: 0.4.3
description: Use inside the target IronClaw agent when a ClawHouse creator wants to onboard an active Season 0 Hyperliquid paper trading agent, collect public profile fields and strategy, verify and install the ClawHouse runtime skill pack from a manifest, configure heartbeat update checks, create the NEAR testnet key market through the agent-side skill action, or reset/retest onboarding without exposing secrets.
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
Report the blocker and do not mark the agent active.

## What This Skill Owns

- Collect public agent profile fields.
- Turn the creator's plain-language trading idea into an active strategy profile.
- Read the ClawHouse runtime manifest.
- Verify required runtime skill name, version, URL allowlist, sha256, and
  permission declaration before installation.
- Install or guide installation of required runtime skills.
- Configure heartbeat checks for ClawHouse runtime updates.
- Run a dry check, save the ClawHouse agent profile as `active`, and keep the
  only remaining launch blocker scoped to the key market when it does not exist.
- When the creator says `create keymarket`, create the NEAR testnet key market
  through the agent-side skill action if the creator public account is funded
  and IronClaw has an approved signing tool.

## What This Skill Does Not Own

- Wallet or private-key generation.
- Secret storage.
- Deposits, withdrawals, custody, or funds policy.
- Trade execution.
- Agent Board Ledger writes; use `clawhouse-ledger-reporting`.
- Hyperliquid paper perps and spot orders; use `hyperliquid-paper-trading`.
- Backend-run key-market creation.
- Any unsupported venue or trading pattern without a verified manifest skill.
- Product-scope changes; use the repo truth process instead.

## Minimal Intake

Ask for only these fields:

- `agent_name`
- `agent_description`
- `avatar_reference`
- `banner_reference`
- `trading_strategy`
- `creator_public_account`

`banner_reference` is the creator-uploaded Twitter-style profile banner for the
public ClawHouse agent page. If the creator does not provide one, ClawHouse uses
its default display banner; do not treat the fallback as a creator-uploaded
asset.

If the user volunteers secrets, stop and tell them the value should be treated as
exposed. Do not repeat the secret.

`creator_public_account` must be a public NEAR testnet account controlled by
IronClaw. Do not ask for the account private key, seed phrase, or raw signing
material.

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

1. Collect `agent_name`, `agent_description`, `avatar_reference`,
   `banner_reference`, `trading_strategy`, and the IronClaw-managed
   `creator_public_account`.
2. Save an active profile using the shape below.
3. Verify the ClawHouse runtime manifest, then install current runtime skills:
   - `skill_install(name="clawhouse-ledger-reporting", url="<manifest.skills[].url>")`
   - `skill_install(name="hyperliquid-paper-trading", url="<manifest.skills[].url>")`
4. Configure heartbeat against the same manifest.
5. Dry check selected skills, required configs, secret hygiene, `active` status,
   the creator public account, and whether the key market already exists.
6. If no key market exists, give the creator the short key-market step below.
7. When the creator says `create keymarket`, verify the public account has at
   least `0.02` testnet NEAR available for storage deposit and fees, then run the
   local key-market create action yourself. Do not ask the creator to run a shell
   command.

## Key Market Handoff

The ClawHouse agent is active after onboarding and can use the installed runtime
skills to submit paper orders and reasoning. The remaining blocker is the NEAR
testnet key market, which lets users trade the agent key.

Tell the creator:

1. Send `0.02` testnet NEAR to `<creator_public_account>`.
2. Say `create keymarket`.

When the creator says `create keymarket`, the skill should invoke the local
`agent-key-market` create runner from the agent/IronClaw environment with:

- cwd: `agent-key-market`;
- script: `scripts/create-agent-key.ts`;
- storage deposit: `0.02` testnet NEAR;
- env: `STORAGE_DEPOSIT=0.02`, `ACCOUNT_ID=<creator_public_account>`,
  `CONTRACT_ID=<key_market_contract_id>`, `NEAR_NETWORK_ID=testnet`;
- signer/account: `<creator_public_account>`;
- agent id: `<agent_id>`;
- agent name: `<agent_name>`;
- metadata URI: `<metadata_uri>`.

Do not show the creator a `bun run` command as the normal path. If IronClaw
cannot sign the create transaction internally, or the public account is not
funded, stop with the exact missing item.

Never ask the creator to paste a NEAR private key, seed phrase, or raw signing
material into chat. If IronClaw cannot sign the create transaction internally,
stop and report that the key market is not created.

## Completion Response

After the profile is saved as active, required runtime skills are installed or
confirmed, heartbeat is configured, and dry check passes, do not generate a
setup report.

Reply with exactly this template:

```text
Agent is active.

Next: create the ClawHouse key market so users can trade your key.

1. Send 0.02 testnet NEAR to <creator_public_account>.
2. Tell this agent: create keymarket.

The agent can already submit paper orders and reasoning. It will create the key market through the local ClawHouse skill once the account is funded.

Status: active.
```

This template must match the `/creator-onboarding/setup` response.

Do not add strategy validation tables, files-created lists, dependency lists,
or another confirmation question.

## Draft Profile Shape

Use this shape as the saved profile, not as an execution command:

```yaml
clawhouse_agent_profile:
  status: "active"
  agent_name: ""
  agent_description: ""
  avatar_reference: ""
  banner_reference: ""
  creator_public_account: ""
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
  key_market:
    status: "missing_until_created"
    storage_deposit_near: "0.02"
    create_trigger: "create keymarket"
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
4. Archive or delete the active ClawHouse strategy/profile state.
5. Restart or refresh IronClaw if newly added or removed skills are not
   rediscovered immediately.
6. Reinstall this onboarding skill and run onboarding again.
