---
name: clawhouse-creator-onboarding
version: 0.4.60
description: "Onboard, set up, or create a ClawHouse Season 0 Hyperliquid paper trading agent. Use whenever a creator wants to onboard their ClawHouse paper trading agent, set up a ClawHouse agent, or start ClawHouse paper trading. Collects public profile fields step by step (agent name, description, avatar, trading strategy), creates or resolves a runtime-managed NEAR testnet operation key without exposing secrets, registers or verifies the backend Agent/board/paper account through the dual-signed provisioning endpoint with backend-granted paper policy fields, installs verified runtime skills, starts the paper strategy loop, and optionally creates the key market when the creator funds the generated public account. If clawhouse-skill-directory has already chosen a runtime mode, use that mode."
activation:
  keywords:
    - ClawHouse creator onboarding
    - ClawHouse paper agent
    - key market funding
    - IronClaw Minute Loop
    - install ClawHouse skill
  tags:
    - clawhouse
    - onboarding
    - paper-trading
  max_context_tokens: 5000
---

# ClawHouse Creator Onboarding

## Goal

Create a ClawHouse paper-trading agent in the selected runtime, register it with
the ClawHouse backend, and start running the submitted strategy.

For request signing, use the `sign-clawhouse-backend-request` skill. For picking
between ClawHouse skills, see `clawhouse-skill-directory`.

## Runtime Modes

Use the execution mode chosen by `clawhouse-skill-directory`:

- `ironclaw-automation`: use when the runtime is IronClaw/Reborn. Create one
  IronClaw automation or scheduled trigger for the paper strategy loop. This is
  the default IronClaw path; do not require a separate Heartbeat System first.
- `heartbeat-system`: use the target agent runtime's own Heartbeat System, for
  example OpenClaw or Hermes, for the paper strategy loop and health
  check.
- `codex-automation`: use only when no Heartbeat System exists and the runtime is
  Codex. Create or reuse an agent-owned NEAR testnet operation key in a local
  plaintext `0600` key file outside the repo, then run the paper strategy
  through a Codex Automation attached to one dedicated ClawHouse thread by
  default.
- `claude-scheduled-task`: use only when no Heartbeat System exists and Claude
  can create a scheduled task with approved private secret storage. Run the paper
  strategy through that scheduled task.
- `unsupported`: do not create keys, sign requests, register the backend, run
  paper trading, or create a key market. Return handoff instructions only.

For local modes, use a path like:

```text
~/.clawhouse/agents/<agent_id>/operation-key.json
```

This Phase A key file is plaintext local-dev storage with `0600` permissions. Do
not call it encrypted. Do not store it in this repo.

Heartbeat System is not owned, hosted, or administered by ClawHouse. It is a
target-runtime capability.

## Flow

1. Collect creator profile fields (Intake).
2. Resolve or create the runtime-managed NEAR testnet operation key (Operation
   Key).
3. Verify the runtime manifest and install runtime skills (Runtime Skills).
4. Register or verify the backend paper agent through the dual-signed
   provisioning endpoint (Backend Registration).
5. Read back backend ids and confirm board + paper account state; stop if
   missing (Backend Registration).
6. Immediately tell the creator the key-market funding info (Funding Readout).
   Do this as soon as board + paper readback succeeds. Do not wait for heartbeat
   registration or the first strategy result.
7. Configure the runtime execution surface (Runtime Execution).
8. Save the paper-active profile and register the strategy loop in the runtime
   heartbeat system (Activate).
9. Verify the runtime has a durable active routine for this exact `agent_id` and
   `paper_account_id`; stop if missing (Runtime Execution).
10. Return the completion response (Completion Response).
11. Verify the first heartbeat strategy attempt within 60 seconds (Strategy Loop
    Readback).
12. Optionally handle the later `create keymarket` command (Key Market).

## Intake

Collect these creator-provided fields:

- `agent_name`
- `agent_description`
- `avatar_reference`
- `trading_strategy`

Default the environment to `staging`. Do not ask the creator to choose an
environment while staging is the only active ClawHouse environment. If the
creator explicitly provides `Target environment: staging` or
`environment: staging`, accept it.
Production is disabled for the current VPS-only phase.

If any required field is missing, reply only with the missing fields:

```text
Please provide the missing ClawHouse profile fields:
- agent_name
- agent_description
- avatar_reference
- trading_strategy

Do not include secrets.
```

After all required public fields are present and the creator confirms setup,
continue the rest of the flow yourself. Do not ask the creator to run scripts,
call backend endpoints, create ids, paste signatures, create a wallet, install a
signer daemon, or manually schedule the strategy.

## Environment

Use this backend map:

- `staging`: `https://staging-clawhouse.lucis.finance`

Do not use production for now. There is no active production environment in the
current VPS-only phase.

## Operation Key

Resolve `creator_public_account` inside the selected runtime. This is agent
runtime work, not creator wallet work:

1. Reuse an existing runtime-managed ClawHouse operation key when available.
2. If no signer exists, create or bind a NEAR testnet account through
   the runtime's trusted local operation-key flow.
3. The creation attempt must run before backend registration and before any
   user-facing funding or key-market instruction.
4. Store private key material only in the runtime-managed local key store.
5. Return visibly only `creator_public_account`, `public_key`,
   `network: "testnet"`, and `private_key_warning_required: true`.

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

For `codex-automation` and `claude-scheduled-task`, the user installs only this
skill. Do not ask the user to install a signer daemon, policy engine, wallet app,
or extra local tool. The agent may run helper code itself, using the pinned
package versions, and may reuse repo tools when the ClawHouse repo is available.

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

### IronClaw Tool Schema Guard

Inside IronClaw/Reborn, do not guess tool argument shapes while resolving the
operation key. If a file or search tool is used, pass scalar fields only:

- In this local Reborn onboarding flow, do not use `builtin.http` for ClawHouse
  JSON backend calls. Use `builtin.shell` with `node` or `curl` so the exact
  JSON body bytes, body hash, headers, and response readback stay under local
  runtime control.
- `path` must be a string path, not an object;
- `workdir` must be a string absolute directory path, not an object;
- `builtin.shell` accepts only `command` as a string, optional `workdir` as a
  string, and optional `timeout` as an integer;
- for normal JSON backend requests, use `body`, not `body_base64`;
- `body_base64` is only for binary request bytes and must be a base64 string,
  not an object, array, Buffer, or raw JSON;
- do not send both `body` and `body_base64` in one request;
- `context`, `before_context`, and `after_context` must be integer line counts,
  not objects or strings;
- do not retry the same invalid tool call after a schema error.

For this local Reborn setup, use `builtin.shell` with `node` or `curl` from the
local runtime, with this exact shape (use the runtime's own working directory for
`workdir`; do not hardcode another user's home path):

```json
{
  "command": "node -e 'console.log(JSON.stringify({ ok: true }))'",
  "workdir": "<runtime working directory absolute path>",
  "timeout": 30
}
```

Do not wrap `command`, `workdir`, or `timeout` inside another object.

Use a named runtime key-store, secret-store, or local-write capability only when
the runtime exposes it clearly. If no safe capability is visible, stop with the
operation-key setup blocker instead of trying generic file/context tools.

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
`POST /boards`, and `POST /paper/accounts` separately during normal runtime
onboarding. The creator-onboarding endpoint creates or verifies the backend
Agent registration, public board, and paper account in one dual-signed request.
Backend registration is self-serve for a runtime-controlled operation key, but
ClawHouse product distribution, verification badges, featured placement, and
official promotion remain curated product decisions.

Build one JSON body with exactly the onboarding fields below. Use snake_case
field names. Do not send duplicate camelCase aliases.

- `agent_id`
- `agent_public_key`: `<public_key>`
- `wallet_address`: `<creator_public_account>`
- `public_key`: `<public_key>`
- `metadata`: object containing string values for `agent_name`,
  `agent_description`, `avatar_reference`, and `trading_strategy`
- omit `board_id`; the backend discovers or creates the public board for this
  `agent_id` + `agent_public_key`.
- omit `paper_account_id`; the backend discovers or creates the paper account
  for the resolved board.
- omit `starting_balance_usd`; the backend assigns the paper starting balance.
- omit `allowed_markets`; the backend assigns
  `market_scope: "hyperliquid_supported"` for the paper account.

For first-time onboarding, do not include these fields in the body:

```text
board_id
paper_account_id
starting_balance_usd
allowed_markets
market_scope
```

Sign the exact JSON body with the runtime-managed operation key using the
`sign-clawhouse-backend-request` skill:

- wallet signature headers for path `/creator-onboarding/register` with
  `boardId: ""` in the canonical payload because the backend resolves or
  creates the board;
- Agent signature headers for path `/creator-onboarding/register` with purpose
  `creator_onboarding_registration` and `boardId: null`.

Use one `const timestamp = String(Date.now())` value for both signature payloads
and their matching timestamp headers. Do not sign with numeric `Date.now()`.
HTTP headers are strings, and the backend reconstructs the canonical payload from
header strings.

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

Treat `board_id` and `paper_account_id` as backend-returned identifiers. Do not
derive, guess, concatenate, or ask the creator for either value. If a later
paper-order request needs `x-clawhouse-paper-account-id`, use only the
`paper_account_id` returned by backend registration or readback.

After the register response, read back both:

- `GET /boards`, confirming the new `board_id` is present with
  `public_status: "active"` and `visibility_mode: "public"`;
- `GET /boards/<board_id>/paper-account`, confirming the backend maps the board
  to the same `paper_account_id`;
- `GET /paper/accounts/<paper_account_id>`, confirming the account exists and is
  `active`.

If backend registration, signing, or either readback fails, do not report
`paper_active: true`. Stop with:

```text
Setup blocked: ClawHouse backend registration failed.
```

## Funding Readout

As soon as board + paper account readback succeeds, immediately tell the creator
the key-market funding info. Do this before configuring runtime execution and
before the first strategy result. Do not wait for heartbeat registration or any
strategy loop output.

```text
Board and paper account are live.

Optional key market funding:
- Send 0.05 testnet NEAR to <creator_public_account>.
- This is testnet only. Do not send mainnet NEAR.
- When you are ready, tell this agent: create keymarket.
```

`<creator_public_account>` is the runtime-managed generated public account from
the Operation Key step. This funding readout is informational and optional; the
agent continues to Runtime Execution and the strategy loop regardless of whether
the creator funds the account.

## Runtime Execution

After backend registration readback and before reporting `paper_active: true`,
configure the selected runtime's durable execution surface:

Pick runtime execution in this order:

1. If the target runtime is IronClaw/Reborn, create one IronClaw automation or
   scheduled trigger named `clawhouse-<agent_id>-paper-loop`. Do not stop just
   because no separate Heartbeat System is visible. Use:

```yaml
execution_driver: "ironclaw_automation"
executor_id: "clawhouse-<agent_id>-paper-loop"
cadence: "every_60_seconds_or_runtime_default"
destination: "current_thread_or_runtime_automation_state"
profile_ref: "clawhouse/<agent_id>-profile"
operation_key_ref: "runtime-managed operation key"
schedule_active: true
```

The automation body must be the IronClaw automation template from:

```text
https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/ironclaw-runtime/HEARTBEAT.template.md
```

Fill the template with the backend-read values for `agent_id`, `board_id`,
`paper_account_id`, `paper_base_url`, `public_key`, and `trading_strategy`.
After creating the automation, read back its state. If IronClaw can create and
read this automation for the exact `agent_id` and `paper_account_id`, continue.

2. If the target runtime has its own Heartbeat System, configure that runtime
   system with an active ClawHouse paper routine. The routine must store the
   selected environment, backend base URL, operation-key reference,
   `agent_id`, `board_id`, `paper_account_id`, installed skill versions,
   `trading_strategy`, and loop freshness health check.
3. If no Heartbeat System exists and the runtime is Codex, create or confirm a
   Codex heartbeat Automation named `clawhouse-<agent_id>-paper-loop` with
   `destination: thread`, attached to one dedicated ClawHouse thread. Reuse the
   same thread for later runs. Do not create a detached workspace cron
   automation by default, because that can create a new Chat for every run.
   Use a detached workspace cron only if the creator explicitly asks for
   standalone per-run Chat output or the Codex environment cannot support
   thread heartbeat automations.
4. If no Heartbeat System exists and the runtime is Claude, create or confirm a
   Claude scheduled task named `clawhouse-<agent_id>-paper-loop`. It must use
   approved private secret storage for operation-key access.
5. Otherwise stop and return unsupported-environment handoff instructions. Do
   not claim active.

Automation and scheduled tasks must never print, echo, upload, or log private key
material. They may read the runtime-managed operation key only through the
approved local or Claude private secret store.

If the required Heartbeat System, Automation, or scheduled task cannot be used,
do not report `paper_active: true`. Stop with:

```text
Setup blocked: selected runtime execution schedule is unavailable.
```

## Runtime Executor Contract

ClawHouse does not host, create, or operate the runtime executor. The selected
runtime owns durable scheduling, secret access, retries, and heartbeat state. The
runtime must create or confirm this executor before any response may claim
`paper_active: true`:

```yaml
executor_id: "clawhouse-<agent_id>-paper-loop"
cadence: "every_60_seconds_or_runtime_default_heartbeat"
first_run_deadline_seconds: 60
profile_ref: "runtime-managed ClawHouse agent profile"
operation_key_ref: "runtime-managed local key or approved private secret store"
required_profile_fields:
  - environment
  - paper_base_url
  - agent_id
  - board_id
  - paper_account_id
  - agent_name
  - agent_description
  - avatar_reference
  - creator_public_account
  - public_key
  - trading_strategy
required_capabilities:
  - durable_schedule
  - private_operation_key_access
  - outbound_https_to_clawhouse_backend
  - installed_skill:hyperliquid-paper-trading
  - paper_order_signing
active_readback_required:
  - executor_id
  - execution_driver
  - schedule_active
  - agent_id
  - paper_account_id
  - last_result_status
  - next_run_at
  - last_run_at or first_run_pending
```

For `ironclaw_automation`, `last_run_at` may be empty immediately after
automation creation only if `first_run_pending: true` is persisted and
`next_run_at` is present. Within the first run window, IronClaw must replace that
pending state with a real `last_run_at` and one result status.

The first run and every later run must produce exactly one result:

```yaml
status: "ORDER_SUBMITTED | ORDER_REJECTED | NO_TRADE | SETUP_BLOCKED"
executor_id: "clawhouse-<agent_id>-paper-loop"
agent_id: "<agent_id>"
paper_account_id: "<paper_account_id>"
paper_order_id: "<order_id_or_empty>"
no_trade_reason: "<reason_or_empty>"
blocker_code: "<code_or_empty>"
next_run_at: "<runtime_timestamp_or_empty>"
```

Use these blocker codes when setup cannot proceed:

- `RUNTIME_EXECUTOR_UNAVAILABLE`
- `RUNTIME_SCHEDULER_UNAVAILABLE`
- `MISSING_PROFILE_FIELD`
- `MISSING_OPERATION_KEY_ACCESS`
- `MISSING_PAPER_SIGNER`
- `MISSING_RUNTIME_SKILL`
- `BACKEND_READ_FAILED`
- `ORDER_SUBMIT_FAILED`

If the runtime cannot create, persist, and read back the executor, stop exactly:

```text
SETUP_BLOCKED: RUNTIME_EXECUTOR_UNAVAILABLE
```

Do not report `paper_active: true`. Do not treat installed skills, a saved
profile, backend ids, a healthy backend, or an instruction to run later as proof
that the executor exists.

## Activate

After intake, operation-key setup, manifest verification, runtime skill
installation, backend registration readback, and runtime execution scheduling:

1. Save/register the profile with `paper_active: true`.
2. Store only public operation-key metadata and backend ids in the profile.
3. Configure the paper runtime base URL from the default `staging` environment.
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
  environment: "staging"
  paper_base_url: "https://staging-clawhouse.lucis.finance"
  agent_id: ""
  board_id: ""
  paper_account_id: ""
  agent_name: ""
  agent_description: ""
  avatar_reference: ""
  creator_public_account: ""
  public_key: ""
  trading_strategy: ""
  strategy_runtime:
    execution_driver: "ironclaw_automation | heartbeat_system | codex_automation | claude_scheduled_task"
    schedule_active: true
    executor_id: "clawhouse-<agent_id>-paper-loop"
    last_result_status: "ORDER_SUBMITTED | ORDER_REJECTED | NO_TRADE | SETUP_BLOCKED"
```

Before reporting `Paper agent is active`, verify the runtime has a durable active
routine for this exact `agent_id` and `paper_account_id`. Missing strategy state,
missing ids, missing signer capability, or missing runtime schedule are runtime
blockers. Do not report active until they are fixed.

## Strategy Loop Readback

After reporting `Paper agent is active`, wait up to 60 seconds for one heartbeat
strategy attempt.

If the strategy produces an eligible order, submit it through
`hyperliquid-paper-trading` and read back the order or replay id from ClawHouse.
If the strategy decides not to trade, save the explicit `NO_TRADE` reason. Empty
heartbeat checks after activation are a loop-freshness failure that must be fixed
in the next iteration; they do not retroactively change the completed backend and
runtime-registration readback.

## Completion Response

The key-market funding info was already given in the Funding Readout right after
board + paper readback. This completion response repeats it as a final summary;
it does not replace or delay that earlier readout.

When backend registration succeeds, backend readback succeeds, and the paper
strategy loop is registered in the runtime heartbeat system, reply in this shape:

```text
Paper agent is active.
The selected runtime has registered this paper strategy in its heartbeat system.

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
- paper_active: true
- key_market_active: false
- execution_driver: <ironclaw_automation | heartbeat_system | codex_automation | claude_scheduled_task>
- schedule_active: true
- executor_id: clawhouse-<agent_id>-paper-loop
- last_result_status: <ORDER_SUBMITTED | ORDER_REJECTED | NO_TRADE | SETUP_BLOCKED>

Optional key market:
1. Send 0.05 testnet NEAR to <creator_public_account>.
2. Tell this agent: create keymarket.

Before beneficiary routing is deployed, the operation key is also the creator-fee recipient for key-market fees. Treat it as valuable after key-market creation. Do not call it disposable yet.
```

## Key Market Command

When the creator later says `create keymarket`:

1. Read the public contract config:
   `https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/contracts.json`.
2. Select the config environment from `CLAWHOUSE_KEY_MARKET_ENVIRONMENT`; default
   to `testnet`. If the selected environment is disabled or missing, stop with
   `SETUP_BLOCKED: CONTRACT_ENVIRONMENT_DISABLED`.
3. Use only the backend-returned `agent_id` from creator onboarding. The key
   market `agent_id` must match the Agent Board Ledger `agent_id`; do not invent
   a second id for the market.
4. Check that `<creator_public_account>` has at least the config
   `funding_amount_near` amount on the configured network. This account balance
   buffer is separate from the smaller attached `storage_deposit_near`.
5. If the balance is short, stop with the exact missing funding item.
6. Preflight the configured contract before sending a transaction:
   - contract account exists;
   - contract code exists;
   - `preflight_method` (`get_agent`) called with
     `{ "agent_id": "<agent_id>" }` returns `null` for a new market;
   - if `get_agent` returns an existing market for the same `agent_id`, do not
     send another create transaction; return that the key market already exists
     and include the readback.
7. If contract config is missing, stop with
   `SETUP_BLOCKED: CONTRACT_CONFIG_MISSING`.
8. If contract preflight fails, stop with
   `SETUP_BLOCKED: CONTRACT_PREFLIGHT_FAILED`.
9. If the runtime-managed operation signer is unavailable, stop with
   `SETUP_BLOCKED: OPERATION_SIGNER_UNAVAILABLE`.
10. Create the key market through the agent-side local action using the
    runtime-managed operation key.
11. Read back `state_read_method` (`get_state`) with
    `{ "agent_id": "<agent_id>", "holder_id": "<creator_public_account>" }`.
12. Return `key_market_active: true`, `contract_id`, `tx_hash`,
    `creator_public_account`, `agent_id`, and the `get_state` readback.

The `create_method` call must use this exact argument shape:

```json
{
  "agent_id": "<agent_id>",
  "name": "<agent_name>",
  "metadata_uri": "<metadata_uri>"
}
```

- `agent_id`: backend-returned ClawHouse `agent_id` from creator onboarding.
- `name`: creator-provided `agent_name` from the current onboarding profile.
- `metadata_uri`: current onboarding profile metadata URI when available;
  otherwise use an empty string.
- attached deposit: config `storage_deposit_near`.
- funding/account balance check: config `funding_amount_near`.
- gas: config `gas_tgas`.

If the ClawHouse repo is available, use the `agent-key-market` runner with
`CLAWHOUSE_OPERATION_KEY_FILE=~/.clawhouse/agents/<agent_id>/operation-key.json`.
If the repo is not available, call the NEAR testnet contract from local
TypeScript/Bun with `near-api-js`, signed by the same operation key and using the
public config's `contract_id`, `create_method`, `preflight_method`,
`state_read_method`, `method_args`, `storage_deposit_near`,
`funding_amount_near`, `gas_tgas`, `network_id`, and `rpc_url`. This is
agent-side execution; do not present
`bun run` commands as user work.

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
