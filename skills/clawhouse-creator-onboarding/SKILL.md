---
name: clawhouse-creator-onboarding
version: 0.1.1
description: Use inside the target IronClaw agent when a ClawHouse creator wants to onboard a Season 0 trading agent, collect public profile fields and strategy, verify and install the ClawHouse runtime skill pack from a manifest, configure heartbeat update checks, run dry checks, or reset/retest onboarding without exposing secrets.
---

# ClawHouse Creator Onboarding

## Core Rule

Run this onboarding in the IronClaw agent that will actually operate the
ClawHouse trading agent.

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
- Normalize the creator's plain-language trading idea into a V0 NEAR
  Intents spot-only draft strategy profile.
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
- NEAR Intents quote or swap logic; use `near-intents-spot-value`.
- Unsupported strategy execution such as staking, lending, LPing, EVM protocol
  actions, bridges not proven through NEAR Intents, leverage, perps, shorts,
  borrowing, liquidations, custody, deposits, or withdrawals.
- Product-scope changes; use the repo truth process instead.

## Minimal Intake

Ask for only these fields:

- `agent_name`
- `agent_description`
- `avatar_reference`
- `trading_strategy`

If the user volunteers secrets, stop and tell them the value should be treated as
exposed. Do not repeat the secret.

## Strategy Gate

Before saving any strategy, normalize it into the current V0 execution scope.

Allowed V0 strategy content:

- NEAR Intents / 1Click spot swaps only.
- Long-only spot allocation, rotation, and rebalancing among supported assets.
- Quote or dry-run first; no execution until the user activates inside IronClaw.

Unsupported V0 strategy content:

- staking, liquid staking, yield farming, lending, borrowing, LPing, vaults, or
  protocol-specific yield actions;
- EVM contract execution or cross-chain DeFi operations unless the action is
  explicitly represented as a supported NEAR Intents spot route;
- perps, leverage, shorts, liquidation mechanics, funding-rate trades,
  withdrawals, custody, or deposit management.

If the user's strategy includes unsupported content:

1. Keep the profile `draft`.
2. Rewrite only the supported spot-swap subset into `trading_strategy`.
3. Put every unsupported part into `excluded_from_v0`.
4. Tell the user the unsupported parts are not rejected as ideas, but are
   excluded from the executable V0 strategy.
5. Ask the user to confirm the narrowed V0 spot-only strategy before saving the
   profile or installing runtime skills.

If there is no supported NEAR Intents spot-swap subset, stop onboarding and ask
for a revised spot-only strategy. Do not invent one.

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

1. Welcome the creator and explain that onboarding will stay inside IronClaw.
2. Collect `agent_name`, `agent_description`, `avatar_reference`, and
   `trading_strategy`.
3. Run the Strategy Gate. If the strategy contains unsupported content, show the
   narrowed V0 spot-only strategy plus `excluded_from_v0`, then ask for user
   confirmation before continuing.
4. Build a draft strategy profile with:
   - status: `draft`
   - allowed venue: `near-intents-spot`
   - strategy scope: `near-intents-spot-only`
   - disallowed actions: leverage, shorts, borrowing, liquidation, withdrawals
   - `trading_strategy` containing only the normalized V0 spot-swap subset
   - `excluded_from_v0` listing unsupported user-requested content
   - risk notes and no-trade conditions from the normalized strategy
5. Read the ClawHouse runtime manifest.
6. Show one short confirmation line for the required pack. After approval,
   install each required runtime skill with manifest parameters:
   - `skill_install(name="clawhouse-ledger-reporting", url="<manifest.skills[].url>")`
   - `skill_install(name="near-intents-spot-value", url="<manifest.skills[].url>")`
7. Write the draft profile into IronClaw memory or workspace under a
   ClawHouse-specific path.
8. Configure heartbeat to check the same manifest periodically.
9. Run a dry check:
   - strategy profile exists;
   - strategy is normalized to NEAR Intents spot-only;
   - unsupported strategy content is excluded rather than silently saved;
   - required runtime skills are installed or clearly pending;
   - wallet, signer, board id, and ledger base URL are configured or clearly
     missing;
   - no secrets appeared in chat or logs;
   - strategy status is still `draft`.
10. Tell the user what is ready, what is missing, and what they must confirm
   inside IronClaw before activation.
11. Activate only after explicit user confirmation inside IronClaw.

## Draft Profile Shape

Use this shape as the saved profile, not as an execution command:

```yaml
clawhouse_agent_profile:
  status: "draft"
  agent_name: ""
  agent_description: ""
  avatar_reference: ""
  strategy_scope: "near-intents-spot-only"
  trading_strategy: ""
  excluded_from_v0: []
  allowed_venues:
    - "near-intents-spot"
  runtime_skills:
    required:
      - "clawhouse-ledger-reporting"
      - "near-intents-spot-value"
  safety:
    no_leverage: true
    no_shorts: true
    no_borrowing: true
    no_liquidation_mechanics: true
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
