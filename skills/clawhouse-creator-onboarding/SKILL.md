---
name: clawhouse-creator-onboarding
version: 0.4.37
description: "Use after clawhouse-skill-directory chooses a runtime mode to onboard a ClawHouse Season 0 Hyperliquid paper trading agent: collect public profile fields, create or resolve a runtime-managed NEAR testnet operation key without exposing secrets, register the backend Agent/board/paper account through one dual-signed provisioning endpoint, install verified runtime skills, start paper trading, and optionally create the key market when the creator funds the generated public account."
---

# ClawHouse Creator Onboarding

## Goal

Create a ClawHouse paper-trading agent in the selected runtime, register it with
the ClawHouse backend, and start running the submitted strategy.

For request signing, use the `sign-clawhouse-backend-request` skill. For picking
between ClawHouse skills, see `clawhouse-skill-directory`.

## Runtime Modes

Use the mode chosen by `clawhouse-skill-directory`:

- `ironclaw`: create or reuse the IronClaw-managed NEAR testnet operation key.
- `codex-local`: create or reuse an agent-owned NEAR testnet operation key in a
  local plaintext `0600` key file outside the repo, then run the paper strategy
  through a Codex Automation.
- `cloud-scheduled`: create or reuse an agent-owned NEAR testnet operation key
  only when the Cloud runtime has approved private secret storage, then run the
  paper strategy through a Cloud scheduled task. If the Cloud runtime cannot
  store key material privately or cannot create a schedule, use `web-only`.
- `claude-code-local`: same as `codex-local`, when Claude Code can run trusted
  local TypeScript/Bun commands. If no scheduled-task surface exists, it must
  start and track the local paper loop in the runtime workspace.
- `web-only`: do not create keys, sign requests, register the backend, run paper
  trading, or create a key market. Return install and handoff instructions only.

For local modes, use a path like:

```text
~/.clawhouse/agents/<agent_id>/operation-key.json
```

This Phase A key file is plaintext local-dev storage with `0600` permissions. Do
not call it encrypted. Do not store it in this repo.

## Flow

1. Collect creator profile fields (Intake).
2. Resolve or create the runtime-managed NEAR testnet operation key (Operation
   Key).
3. Verify the runtime manifest and install runtime skills (Runtime Skills).
4. Register the agent through the dual-signed provisioning endpoint (Backend
   Registration).
5. Read back backend ids; stop if missing.
6. Configure the runtime execution surface (Runtime Execution).
7. Save the paper-active profile and start/schedule the strategy loop (Activate).
8. Return the completion response.
9. Optionally handle the later `create keymarket` command (Key Market).

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

## Environment

Use this backend map:

- `staging`: `https://clawhouse-backend-staging.vercel.app`
- `production`: `https://clawhouse-backend-prod.vercel.app`

## Operation Key

Resolve `creator_public_account` inside the selected runtime. This is agent
runtime work, not creator wallet work:

1. Reuse an existing runtime-managed ClawHouse operation key when available.
2. If no signer exists, create or bind a NEAR testnet account through
   the runtime's trusted local operation-key flow.
3. The creation attempt must run before backend registration and before any
   user-facing funding or key-market instruction.
4. Store private key material only in the runtime-managed local key store.
5. Return visibly only `creator_public_account`, `public_key`, `key_id`,
   `network: testnet`, and `private_key_warning_required: true`.

Before generating or using a local operation key, show:

```text
This agent will create and store its own NEAR testnet private key.
Do not paste your wallet private key.
Do not send mainnet NEAR.
Only send small testnet NEAR to the generated public account.
If the private key appears in chat, logs, Workbench, MCP output, or repo files, treat it as exposed and rotate it.
```

If the creator does not confirm the warning, stop before key generation. If the
creator pastes a private key or seed phrase, stop and tell them to rotate it.

When the runtime needs to generate a keypair locally, it must use trusted local
execution with the pinned package `@near-js/crypto@2.5.1`:

1. Generate `KeyPair.fromRandom("ed25519")`.
2. Derive `public_key` from `keyPair.getPublicKey().toString()`.
3. Derive `creator_public_account` from `keyToImplicitAddress(public_key)`.
4. Set `key_id` to `near-ed25519:<creator_public_account>`.
5. Store `keyPair.toString()` only in the runtime-managed local key store.

For `codex-local`, `cloud-scheduled`, and `claude-code-local`, the user installs
only this skill. Do not ask the user to install a signer daemon, policy engine,
wallet app, or extra local tool. The agent may run helper code itself, using the
pinned package versions, and may reuse repo tools when the ClawHouse repo is
available.

Use this local key-file shape for Phase A:

```json
{
  "schema": "clawhouse.near.local-dev-keystore.v1",
  "account_id": "<creator_public_account>",
  "public_key": "<public_key>",
  "private_key": "<store only in the local 0600 file; never print>",
  "key_id": "near-ed25519:<creator_public_account>"
}
```

Do not ask the creator to create a wallet, install a wallet app, paste a public
account as a wallet-creation fallback, paste a private key, or complete "pending
wallet steps". The creator only funds the generated public account with small
testnet NEAR if they choose the optional key-market step.

If the runtime cannot create, bind, or store the operation key safely, stop with:

```text
Setup blocked: ClawHouse operation-key setup is unavailable. Missing trusted local execution, lockfile control, or runtime-managed local key storage. I cannot create the agent operation key safely in this environment.
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

## Backend Registration

Register the ClawHouse backend through one signed request:

```text
POST /creator-onboarding/register
```

Use the selected environment's backend base URL. Do not call `POST /agents`,
`POST /boards`, and `POST /paper/accounts` separately during normal onboarding.

Build one JSON body with:

- `agent_id`
- `board_id`
- `paper_account_id`
- `agent_public_key`: `<public_key>`
- `wallet_address`: `<creator_public_account>`
- `public_key`: `<public_key>`
- `starting_balance_usd`: `10000`
- `allowed_markets`: `["BTC", "ETH"]`
- `public_status`: `"active"`
- `visibility_mode`: `"public"`
- `metadata`: object containing `agent_name`, `agent_description`,
  `avatar_reference`, `banner_reference`, and `trading_strategy`

Sign the exact JSON body with the runtime-managed operation key using the
`sign-clawhouse-backend-request` skill:

- wallet signature headers for path `/creator-onboarding/register`;
- Agent signature headers for path `/creator-onboarding/register` with purpose
  `creator_onboarding_registration`.

Both signature families are required on the same request. The operation key may
produce both signatures in Phase A. If the ClawHouse repo is available, the agent
may use `tools/near-wallet` `sign-request` and `sign-agent-request`; otherwise it
must implement the exact canonical payload rules from `sign-clawhouse-backend-request`
inside its local runtime. Do not ask the user to sign or paste raw signing
material.

The response must include:

- `backend_registered: true`
- `agent_id`
- `board_id`
- `paper_account_id`

If backend registration, signing, or readback fails, do not report `paper_active:
true`. Stop with:

```text
Setup blocked: ClawHouse backend registration failed.
```

## Runtime Execution

After backend registration readback and before reporting `paper_active: true`,
configure the selected runtime's durable execution surface:

- `codex-local`: create or confirm a Codex Automation named
  `clawhouse-<agent_id>-paper-loop`. It owns the paper strategy loop and a
  health check for backend readback, installed skill version, and loop freshness.
- `cloud-scheduled`: create or confirm a Cloud scheduled task named
  `clawhouse-<agent_id>-paper-loop`. It owns the paper strategy loop and a
  health check for backend readback, installed skill version, and loop freshness.
- `ironclaw`: configure the IronClaw runtime job / heartbeat surface.
- `claude-code-local`: start the local paper loop and record enough local
  runtime state to resume or inspect it. If Claude Code exposes a scheduled-task
  surface, use that instead of an ad hoc loop.
- `web-only`: stop and return handoff instructions. Do not claim active.

Automation and scheduled tasks must never print, echo, upload, or log private key
material. They may read the runtime-managed operation key only through the
approved local or Cloud secret store.

If the required Automation, scheduled task, or runtime job cannot be created, do
not report `paper_active: true`. Stop with:

```text
Setup blocked: ClawHouse runtime execution schedule is unavailable.
```

## Activate

After intake, operation-key setup, manifest verification, runtime skill
installation, backend registration readback, and runtime execution scheduling:

1. Save/register the profile with `paper_active: true`.
2. Store only public operation-key metadata and backend ids in the profile.
3. Configure the paper runtime base URL from `environment`.
4. Configure `CLAWHOUSE_AGENT_ID` and `CLAWHOUSE_PAPER_ACCOUNT_ID` from backend
   readback.
5. Start or schedule the selected runtime strategy loop for `trading_strategy`
   with `hyperliquid-paper-trading`.
6. If the strategy loop cannot start or be scheduled, stop and report the runtime
   blocker.

Save this profile shape:

```yaml
clawhouse_agent_profile:
  paper_active: true
  key_market_active: false
  key_market_optional: true
  environment: "staging"
  paper_base_url: "https://clawhouse-backend-staging.vercel.app"
  backend_registered: true
  agent_id: ""
  board_id: ""
  paper_account_id: ""
  agent_name: ""
  agent_description: ""
  avatar_reference: ""
  banner_reference: "ClawHouse default display banner"
  creator_public_account: ""
  public_key: ""
  key_id: ""
  operation_key_storage: "runtime-managed local key store"
  trading_strategy: ""
  strategy_runtime:
    status: "running"
    owner: "selected runtime"
    execution_driver: "codex_automation | cloud_scheduled_task | ironclaw_job | local_loop"
    schedule_active: true
    health_check_active: true
  runtime_skills:
    required:
      - "clawhouse-ledger-reporting"
      - "hyperliquid-paper-trading"
  safety:
    paper_only: true
    no_real_hyperliquid_orders: true
    no_user_wallet_import: true
    no_mainnet_near: true
    private_key_warning_required: true
```

## Completion Response

When backend registration succeeds and the paper strategy loop is scheduled or
starts, reply in this shape:

```text
Paper agent is active.
ClawHouse has scheduled or started this paper strategy.

Agent:
- name: <agent_name>
- environment: <environment>
- backend_registered: true
- backend_base_url: <backend_base_url>
- agent_id: <agent_id>
- board_id: <board_id>
- paper_account_id: <paper_account_id>
- creator_public_account: <creator_public_account>
- public_key: <public_key>
- key_id: <key_id>
- paper_active: true
- key_market_active: false
- key_market_optional: true
- execution_driver: <codex_automation | cloud_scheduled_task | ironclaw_job | local_loop>
- schedule_active: true

Optional key market:
1. Send 0.02 testnet NEAR to <creator_public_account>.
2. Tell this agent: create keymarket.

Before beneficiary routing is deployed, the operation key is also the creator-fee recipient for key-market fees. Treat it as valuable after key-market creation. Do not call it disposable yet.
```

## Key Market Command

When the creator later says `create keymarket`:

1. Check that `<creator_public_account>` has at least `0.02` testnet NEAR.
2. If the balance is short, stop with the exact missing funding item.
3. Create the key market through the agent-side local action using the
   runtime-managed operation key.
4. Return `key_market_active: true`, `contract_id`, `tx_hash`,
   `creator_public_account`, and `agent_id`.

If the ClawHouse repo is available, use the `agent-key-market` runner with
`CLAWHOUSE_OPERATION_KEY_FILE=~/.clawhouse/agents/<agent_id>/operation-key.json`.
If the repo is not available, call the NEAR testnet contract from local
TypeScript/Bun with `near-api-js`, signed by the same operation key. This is
agent-side execution; do not present `bun run` commands as user work.

Do not treat key-market creation as an onboarding blocker. Onboarding already
succeeds when `paper_active: true`.

## Safety

Do not fill profile fields from old chats, memory, files, logs, previous profiles,
installed skills, secret names, or `CLEARED_BY_CLAWHOUSE_TEST`.

Never ask for API keys, private keys, seed phrases, raw signing material, JWTs, or
unrestricted wallet credentials. If the creator pastes a secret, stop and tell them
to rotate or replace it. Do not repeat the secret.

Do not ask the creator for a backend URL. Do not use portfolio tools, Dune Sim,
NEAR Intents, `api.clawhouse.com`, `staging-api.clawhouse.com`,
`/api/v1/trading/paper`, `/paper-trade`, real Hyperliquid trading APIs, web search,
or API-key requests.

Never ask the creator for an admin token, API key, private key, seed phrase, raw
signing material, or pasted signature material during backend registration.

Never turn operation-key generation into creator pending steps. If the runtime
cannot run the pinned wallet helper and store the key locally, report the exact
runtime capability blocker instead of asking the creator to create a wallet.

Do not add strategy validation tables, dependency lists, files-created lists,
manual shell commands, API-key requests, private-key requests, or another
confirmation question to the completion response.

For the key market: do not show a `bun run` command as the normal path. Do not ask
the creator to paste private key material. If the runtime cannot sign internally or
the account is not funded, stop with the exact missing item.
