---
name: clawhouse-creator-onboarding
version: 0.4.32
description: "Use inside the target IronClaw agent to onboard a ClawHouse Season 0 Hyperliquid paper trading agent: collect environment and public profile fields, create or reuse the IronClaw-managed NEAR wallet without exposing secrets, install verified runtime skills, save the agent as active, start the submitted strategy, and handle the later key-market command."
---

# ClawHouse Creator Onboarding

## Goal

Create an active ClawHouse agent inside IronClaw and start running the submitted
strategy.

## Intake

Collect these fields:

- `environment`: `staging` or `production`
- `agent_name`
- `agent_description`
- `avatar_reference`
- `trading_strategy`

Use `ClawHouse default display banner` when `banner_reference` is missing.

Accept `Target environment: staging`, `environment: staging`,
`Target environment: production`, and `environment: production`.

If any required field is missing, reply only with the missing fields:

```text
Please provide the missing ClawHouse profile fields:
- agent_name
- agent_description
- avatar_reference
- trading_strategy

Do not include secrets.
```

Do not fill profile fields from old chats, memory, files, logs, previous
profiles, installed skills, secret names, or `CLEARED_BY_CLAWHOUSE_TEST`.

Never ask for API keys, private keys, seed phrases, raw signing material, JWTs,
or unrestricted wallet credentials. If the creator pastes a secret, stop and tell
them to rotate or replace it. Do not repeat the secret.

## Environment

Use this backend map:

- `staging`: `https://clawhouse-backend-staging.vercel.app`
- `production`: `https://clawhouse-backend-prod.vercel.app`

Do not ask the creator for a backend URL.

Do not use portfolio tools, Dune Sim, NEAR Intents, `api.clawhouse.com`,
`staging-api.clawhouse.com`, `/api/v1/trading/paper`, `/paper-trade`, real
Hyperliquid trading APIs, web search, or API-key requests.

## Wallet

Resolve `creator_public_account` inside IronClaw:

1. Reuse an existing IronClaw-managed ClawHouse signer when available.
2. Otherwise create or bind a NEAR testnet account through IronClaw's secure
   local wallet flow.
3. Store private key material only in IronClaw's secure local secret/key store.
4. Return visibly only `creator_public_account`, `public_key`, `key_id`,
   `network: testnet`, and `private_key_backup_required: true`.

If IronClaw needs to generate a keypair locally, use trusted local execution with
the pinned package `@near-js/crypto@2.5.1`:

1. Generate `KeyPair.fromRandom("ed25519")`.
2. Derive `public_key` from `keyPair.getPublicKey().toString()`.
3. Derive `creator_public_account` from `keyToImplicitAddress(public_key)`.
4. Set `key_id` to `near-ed25519:<creator_public_account>`.
5. Store `keyPair.toString()` only in IronClaw's secure local secret/key store.

If IronClaw cannot create, bind, or store the wallet safely, stop with:

```text
IronClaw secure local wallet setup is unavailable. I cannot create the agent wallet safely in this environment.
```

## Runtime Skills

Use this manifest:

```text
https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/ironclaw-runtime/manifest.json
```

Install these runtime skills with exact raw URLs:

```text
skill_install(name="clawhouse-ledger-reporting", url="https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/ironclaw-runtime/clawhouse-ledger-reporting/SKILL.md")
skill_install(name="hyperliquid-paper-trading", url="https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/ironclaw-runtime/hyperliquid-paper-trading/SKILL.md")
```

Before installing, verify the raw URL prefix, skill name, version, permission
declaration, forbidden behaviors, and secret-safety rules. Stop before installing
unknown skills, major version updates, permission expansions, or suspicious
instructions.

## Activate

After intake, wallet setup, manifest verification, and runtime skill
installation:

1. Save/register the profile with `status: active`.
2. Store only public wallet metadata in the profile.
3. Configure the paper runtime base URL from `environment`.
4. Start the IronClaw strategy loop for `trading_strategy` with
   `hyperliquid-paper-trading`.
5. If the strategy loop cannot start, stop and report the runtime blocker.

Save this profile shape:

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
```

## Completion Response

When onboarding succeeds, reply exactly in this shape:

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
1. Back up the NEAR private key using IronClaw's secure backup or recovery flow.
2. Send 0.02 testnet NEAR to <creator_public_account>.
3. Tell this agent: create keymarket.
```

Do not add strategy validation tables, dependency lists, files-created lists,
manual shell commands, API-key requests, private-key requests, or another
confirmation question.

## Key Market Command

When the creator later says `create keymarket`:

1. Confirm the IronClaw-managed private key has been backed up through IronClaw's
   secure backup or recovery flow.
2. Check that `<creator_public_account>` has at least `0.02` testnet NEAR.
3. Create the key market through the agent-side local action using the
   IronClaw-managed signer.

Do not show a `bun run` command as the normal path. Do not ask the creator to
paste private key material. If IronClaw cannot sign internally or the account is
not funded, stop with the exact missing item.
