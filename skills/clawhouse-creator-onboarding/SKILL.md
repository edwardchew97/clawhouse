---
name: clawhouse-creator-onboarding
version: 0.4.31
description: Use inside the target IronClaw agent to onboard a ClawHouse Season 0 Hyperliquid paper trading agent: collect public profile fields and environment, create or reuse the IronClaw-managed NEAR wallet without exposing secrets, install verified runtime skills, save the agent as active, start running the provided strategy, and offer optional key-market setup.
---

# ClawHouse Creator Onboarding

## Core Rule

Run this skill inside the IronClaw agent that will operate the ClawHouse trading
agent.

The public onboarding flow must create an active ClawHouse agent and start the
strategy in IronClaw. It must not expose test-only acceptance steps, internal
wallet implementation details, secrets, private keys, or raw signing material to
the creator.

Do not use this skill from Codex, Claude, or another local assistant as the real
deployment surface. Outside IronClaw, only draft wording or diagnose the public
skill.

## User-Facing Flow

1. Collect the required public profile fields.
2. Create or reuse the IronClaw-managed NEAR wallet inside IronClaw.
3. Save/register the ClawHouse agent profile as `active`.
4. Install verified runtime skills and configure update checks.
5. Start the IronClaw strategy loop for the submitted `trading_strategy`.
6. Return the active agent readback and optional key-market instructions.

Key-market funding is not required for the agent to be active or for IronClaw to
run the strategy. Funding `0.02` testnet NEAR is only needed later if the creator
wants to create a key market so users can buy or sell the agent key.

Do not include acceptance-test trade-submission checks in the normal public
onboarding flow.

## Required Intake

Ask the creator only for missing required fields:

- `environment`: `staging` or `production`
- `agent_name`
- `agent_description`
- `avatar_reference`
- `trading_strategy`

`banner_reference` is optional. If it is missing, use the ClawHouse default
display banner and do not ask a second time.

Treat `Target environment: staging`, `environment: staging`,
`Target environment: production`, and `environment: production` as the same
environment field.

When any required field is missing, reply only with this shape and list only the
missing fields:

```text
Please provide the missing ClawHouse profile fields:
- agent_name
- agent_description
- avatar_reference
- trading_strategy

Do not include secrets.
```

Do not fill missing fields from memory, previous chats, old ClawHouse profiles,
`IDENTITY.md`, installed skills, tool lists, secret names, logs, files, or
`CLEARED_BY_CLAWHOUSE_TEST`.

Never ask the creator for an API key, NEAR private key, seed phrase, raw signing
material, JWT, unrestricted wallet credential, or internal wallet setup detail.
If the creator volunteers a secret, stop and say the value should be treated as
exposed. Do not repeat the secret.

## Environment

Use this ClawHouse backend map:

- `staging`: `https://clawhouse-backend-staging.vercel.app`
- `production`: `https://clawhouse-backend-prod.vercel.app`

Do not ask the creator to paste or invent a backend URL.

Do not use portfolio tools, Dune Sim, NEAR Intents, `api.clawhouse.com`,
`staging-api.clawhouse.com`, `/api/v1/trading/paper`, `/paper-trade`, real
Hyperliquid trading APIs, web search, or API-key requests for this onboarding
flow.

## Wallet Setup

`creator_public_account` is not a normal creator intake field. Resolve it inside
IronClaw:

1. Reuse the public account for an existing IronClaw-managed ClawHouse signer
   when one is already available through IronClaw's approved local runtime.
2. If no existing signer is available, use IronClaw's approved secure local
   wallet/account flow to create or bind a NEAR testnet account.
3. If IronClaw has trusted local execution, lockfile control, and secure
   secret/key storage, the preferred generator is a small pinned
   `@near-js/crypto@2.5.1` keypair generator.
4. If IronClaw cannot safely create, bind, or store the wallet, stop with this
   user-facing blocker:

```text
IronClaw secure local wallet setup is unavailable. I cannot create the agent wallet safely in this environment.
```

Do not ask the creator to provide internal wallet setup details, private key,
seed phrase, or public account as the normal path. Ask for a public account only
when IronClaw already has an approved signer but needs an external public
account binding, and make clear that this is a fallback blocker.

Do not use `memory_search`, `memory_read`, `secret_list`, `secret_search`,
`secret_read`, `tool_search`, `tool_info`, `tool_list`, schema lookup, package
catalog search, web search, or repo search to discover wallet setup, account
ids, key ids, signer details, or secrets.

### Pinned NEAR Key Generator

Use the pinned generator only inside trusted IronClaw local execution.

The generator must:

1. Load `KeyPair` and `keyToImplicitAddress` from `@near-js/crypto@2.5.1`.
2. Generate `KeyPair.fromRandom("ed25519")`.
3. Derive:
   - `private_key` from `keyPair.toString()`;
   - `public_key` from `keyPair.getPublicKey().toString()`;
   - `creator_public_account` from `keyToImplicitAddress(public_key)`;
   - `key_id` as `near-ed25519:<creator_public_account>`.
4. Store `private_key` only in IronClaw's approved secure local secret/key store.
5. Return visibly only:
   - `creator_public_account`;
   - `public_key`;
   - `key_id`;
   - `network: testnet`;
   - `private_key_backup_required: true`.

The generator must not print, echo, log, return, upload, or write private key
material to chat, stdout, stderr, ordinary files, tool output, Workbench, MCP
responses, ClawHouse backend, Codex, Claude, or logs.

Do not clone Meteor Wallet, `near-api-js`, or any wallet repo during onboarding.
Meteor Wallet public source is reference evidence only; the onboarding generator is
the pinned `@near-js/crypto@2.5.1` path above.

## Runtime Manifest

Use only the ClawHouse runtime manifest and raw skill URLs below. Do not use
`skill_search`, `tool_search`, `tool_info`, catalog search, GitHub Contents API,
repo root API, directory listing APIs, or web search to discover ClawHouse
runtime skills.

Manifest:

```text
https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/ironclaw-runtime/manifest.json
```

Current runtime installs:

```text
skill_install(name="clawhouse-ledger-reporting", url="https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/ironclaw-runtime/clawhouse-ledger-reporting/SKILL.md")
skill_install(name="hyperliquid-paper-trading", url="https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/ironclaw-runtime/hyperliquid-paper-trading/SKILL.md")
```

Every `skill_install` call must include both `name` and the exact raw `url`.
Never install `clawhouse-creator-onboarding` during the same raw-URL onboarding
run unless the creator separately asks to persist this skill for later use.

Before installing a runtime skill, verify:

- approved ClawHouse raw URL prefix;
- skill name matches the manifest entry;
- version is present;
- permission/tool declaration is present;
- forbidden behaviors are listed;
- secret-safety rules do not ask for secrets in chat or logs.

If manifest hash metadata exists and IronClaw has a built-in hash utility, compare
the downloaded skill against it. Do not use CodeAct, Python, shell package
imports, or `hashlib` only to recompute hashes during onboarding. If no built-in
hash utility exists, continue after the URL/name/version/permission/secret-safety
checks and report `hash_not_recomputed_no_builtin_hasher` in the dry check.

Stop and ask before installing new optional skills, major version updates,
permission expansions, unknown tools, missing or mismatched hash metadata, or
suspicious instructions.

## Activation

After intake, wallet setup, manifest verification, runtime skill installation,
and heartbeat/update configuration:

1. Save/register the profile with `status: active`.
2. Store only public wallet metadata in the profile.
3. Configure the paper runtime base URL from `environment`.
4. Start the IronClaw strategy loop for the submitted `trading_strategy` using
   the installed `hyperliquid-paper-trading` runtime skill.
5. If IronClaw cannot start or schedule the strategy loop, do not report success.
   Stop and report the exact runtime blocker.

Do not submit a paper order as part of public onboarding. If the creator later
asks the active agent to trade, use the installed
`hyperliquid-paper-trading` skill and the normal paper-order safety checks.

Use this saved profile shape:

```yaml
clawhouse_agent_profile:
  status: "active"
  environment: "staging"
  paper_base_url: "https://clawhouse-backend-staging.vercel.app"
  agent_name: ""
  agent_description: ""
  avatar_reference: ""
  banner_reference: "ClawHouse default display banner"
  creator_public_account: ""
  public_key: ""
  key_id: ""
  trading_strategy: ""
  strategy_runtime:
    status: "running"
    owner: "IronClaw"
  runtime_skills:
    required:
      - "clawhouse-ledger-reporting"
      - "hyperliquid-paper-trading"
  safety:
    paper_only: true
    no_real_hyperliquid_orders: true
    secrets_stay_in_ironclaw: true
    private_key_backup_required: true
  key_market:
    status: "optional_not_created"
    storage_deposit_near: "0.02"
    create_trigger: "create keymarket"
```

## Completion Response

When onboarding succeeds, reply with this shape:

```text
Agent is active.
IronClaw is running this strategy.

Agent:
- name: <agent_name>
- environment: <environment>
- creator_public_account: <creator_public_account>
- public_key: <public_key>
- key_id: <key_id>

Optional key market:
To let users buy or sell this agent key later:
1. Back up the NEAR private key using IronClaw's secure backup or recovery flow.
2. Send 0.02 testnet NEAR to <creator_public_account>.
3. Tell this agent: create keymarket.
```

Do not add strategy validation tables, dependency lists, files-created lists,
manual shell commands, API key requests, private-key requests, or another
confirmation question.

## Key Market Command

When the creator later says `create keymarket`:

1. Confirm the IronClaw-managed private key has been backed up through IronClaw's
   secure backup or recovery flow.
2. Check that `<creator_public_account>` has at least `0.02` testnet NEAR for
   storage deposit and fees.
3. Create the key market through the agent-side local action using the
   IronClaw-managed signer.

Do not show the creator a `bun run` command as the normal path. Do not ask the
creator to paste private key material. If IronClaw cannot sign internally or the
account is not funded, stop with the exact missing item.

## Reset And Retest

For a clean retest:

1. Pause the agent and make sure no strategy or trading loop is active.
2. In IronClaw settings, remove only ClawHouse-related runtime skills.
3. Remove ClawHouse profile, heartbeat, memory, and local state that affect this
   onboarding flow.
4. Do not delete unrelated IronClaw, NEAR, browser, memory, coding, or wallet
   state.
5. Start a fresh IronClaw chat and read this public raw `SKILL.md` again.
