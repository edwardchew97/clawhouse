---
name: clawhouse-creator-onboarding
version: 0.4.18
description: Use inside the target IronClaw agent when a ClawHouse creator wants to onboard an active Season 0 Hyperliquid paper trading agent, collect environment, public profile fields, and strategy, verify and install the ClawHouse runtime skill pack from a manifest, configure heartbeat update checks, create the NEAR testnet key market through the agent-side skill action, or reset/retest onboarding without exposing secrets.
---

# ClawHouse Creator Onboarding

## Core Rule

Run this onboarding in the IronClaw agent that will actually operate the
ClawHouse trading agent.

Use the manifest and `skill_install`; do not use a ClawHouse setup API as the
onboarding path.

If this `SKILL.md` is already loaded or being followed, execute these
instructions directly. Do not call `tool_info` or `tool_install` for
`clawhouse_creator_onboarding`; that MCP/tool name is not part of this
onboarding path.

Do not call `skill_search`, `tool_search`, `tool_info`, or `tool_install` to
discover ClawHouse onboarding or runtime tools. The current `SKILL.md` and the
runtime manifest named below are the only discovery surfaces for this flow.

Do not call `tool_search`, `tool_info`, `tool_info(schema)`, or schema lookup to
discover a NEAR wallet helper, crypto helper, keypair helper, or signer helper.
If an approved IronClaw local helper is not already available in the current
runtime, stop and report `Missing approved IronClaw NEAR wallet helper`.

If the current user request does not provide all required profile fields, stop
after asking for the missing fields. Before those current-run fields are present,
do not call `memory_search`, install runtime skills, configure heartbeat, read
ClawHouse backend endpoints, or attempt paper trading.

Every `http` call must use a literal, non-empty URL copied from this skill, the
runtime manifest, or the selected ClawHouse environment map. Never call `http`
with a missing, empty, inferred, directory-derived, or placeholder URL.

Do not call `skill_install` for this onboarding skill by name only. If IronClaw
requires persisting this onboarding skill before continuing, call
`skill_install` with both:

- `name`: `clawhouse-creator-onboarding`
- `url`:
  `https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/clawhouse-creator-onboarding/SKILL.md`

If that install fails, stop and report the exact error instead of searching a
catalog or retrying without the URL.

Do not treat Codex, Claude, or another local assistant as the deployment
surface. If this skill is being read outside IronClaw, help draft public wording
only, then tell the user to rerun the onboarding inside the target IronClaw
agent.

Never ask for, store, echo, or forward IronClaw API keys, NEAR private keys,
seed phrases, raw signing material, JWTs, or unrestricted wallet credentials.
You may remind the creator to back up the IronClaw-managed NEAR private key
through IronClaw's secure local backup or recovery flow, but never ask them to
paste, display, upload, or send that key.

## Source Basis

Use IronClaw's official skill and heartbeat docs for runtime behavior:

- `https://docs.ironclaw.com/zh/capabilities/skills`
- `https://docs.ironclaw.com/zh/capabilities/routines/heartbeat`

If IronClaw's actual installer or UI behaves differently, do not invent support.
Report the blocker and do not mark the agent active.

For NEAR key generation mechanics, use the pinned `@near-js/crypto` package in
the trusted IronClaw local environment. Meteor Wallet's public SDK is reference
evidence for the same NEAR pattern, but do not clone or execute the Meteor repos
during onboarding:

- exact package: `@near-js/crypto@2.5.1`;
- reference only:
  `https://github.com/Meteor-Wallet/meteor_wallet_sdk/blob/4612038212a6b787c2e24b61704a835217c04744/packages/meteor-sdk-v1/src/MeteorWallet.ts#L290-L295`;
- reference only:
  `https://github.com/Meteor-Wallet/near-api-js/blob/c6559162f12b68be380278423d510a2af7bdddc3/src/crypto/key_pair_ed25519.ts#L43-L47`;
  and
  `https://github.com/Meteor-Wallet/near-api-js/blob/c6559162f12b68be380278423d510a2af7bdddc3/src/crypto/public_key.ts#L171-L184`.

## What This Skill Owns

- Collect public agent profile fields.
- Collect the target ClawHouse environment: `staging` or `production`.
- Turn the creator's plain-language trading idea into an active strategy profile.
- Read the ClawHouse runtime manifest.
- Verify required runtime skill name, version, URL allowlist, hash metadata when
  supported, and permission declaration before installation.
- Install or guide installation of required runtime skills.
- Configure heartbeat checks for ClawHouse runtime updates.
- Resolve or create/bind the IronClaw-managed NEAR testnet public account inside
  IronClaw, then store only the public account id in the active profile.
- Run a dry check, save the ClawHouse agent profile as `active`, and keep the
  only remaining launch blocker scoped to the key market when it does not exist.
- When the creator says `create keymarket`, create the NEAR testnet key market
  through the agent-side skill action if the creator public account is funded
  and IronClaw has an approved signing tool.
- Reuse the same IronClaw-managed NEAR key/account for ClawHouse wallet-signed
  backend requests and key-market creation when that signer already exists,
  unless IronClaw intentionally separates signers.
- If the creator explicitly asks for one immediate ClawHouse paper trade after
  setup, hand off only to the installed `hyperliquid-paper-trading` runtime
  skill after the active profile and paper runtime configuration are ready.

## What This Skill Does Not Own

- Wallet or private-key generation outside IronClaw's approved secure local
  wallet/account flow.
- Secret storage.
- Deposits, withdrawals, custody, or funds policy.
- Trade execution.
- Agent Board Ledger writes; use `clawhouse-ledger-reporting`.
- Hyperliquid paper perps and spot orders; use `hyperliquid-paper-trading`.
- Portfolio scanning, Dune Sim, NEAR Intents, `api.clawhouse.com`, or any
  non-`/paper/...` trading API route.
- The legacy or custom MCP/tool path named `clawhouse_creator_onboarding`;
  do not call `skill_search`, `tool_search`, `tool_info`, or `tool_install` for
  that name.
- Backend-run key-market creation.
- Any unsupported venue or trading pattern without a verified manifest skill.
- Product-scope changes; use the repo truth process instead.

## Minimal Intake

Ask the creator only for these required fields:

- `environment`: `staging` or `production`
- `agent_name`
- `agent_description`
- `avatar_reference`
- `trading_strategy`

`banner_reference` is optional. If the creator does not provide one, use the
ClawHouse default display banner and do not ask a second time.

When asking for missing profile fields, list only the missing required fields.
Do not include `banner_reference` in a required-fields prompt. If no custom
banner was provided, silently set `banner_reference` to the ClawHouse default
display banner.

The environment controls ClawHouse paper-trading configuration:

- `staging`: use `https://clawhouse-backend-staging.vercel.app`.
- `production`: use `https://clawhouse-backend-prod.vercel.app`.

Treat `Target environment: staging`, `environment: staging`,
`Target environment: production`, and `environment: production` as the same
environment intake field. If one of these appears in the user's initial request,
store it and ask only for the missing profile fields.

Required profile fields must come from the current chat turn or a direct reply to
this intake prompt. Do not use ClawHouse memories, previous profiles, chat
history, or `memory_search` results to fill missing required fields. Treat
`CLEARED_BY_CLAWHOUSE_TEST` as absent data.

Do not ask the creator to paste or invent a backend URL. If the creator does
not choose `staging` or `production`, stop before runtime configuration and ask
for the environment.

For `staging`, ClawHouse paper trading uses `/paper/...` on
`https://clawhouse-backend-staging.vercel.app`. Do not use
`/api/v1/trading/paper`, `/paper-trade`, `api.clawhouse.com`,
`staging-api.clawhouse.com`, portfolio tools, Dune Sim, NEAR Intents, or web
search for ClawHouse paper order setup or submission.

`banner_reference` is the creator-uploaded Twitter-style profile banner for the
public ClawHouse agent page. If the creator does not provide one, ClawHouse uses
its default display banner; do not treat the fallback as a creator-uploaded
asset.

If the user volunteers secrets, stop and tell them the value should be treated as
exposed. Do not repeat the secret.

Resolve `creator_public_account` yourself before funding:

1. First use the public account for the IronClaw-managed NEAR key that signs
   ClawHouse backend requests, when it exists.
2. If no such account exists, use IronClaw's approved secure local wallet/account
   flow to create or bind a NEAR testnet account inside IronClaw. Prefer the
   pinned local `@near-js/crypto@2.5.1` helper path below when IronClaw has
   trusted local execution, package-lock/lockfile control, and secure secret/key
   storage available. Keep the private key inside IronClaw and store only the
   public account id.
3. If the local helper only returns a public key without a usable NEAR testnet
   account id, stop and report the missing account binding. Do not treat the
   public key as the funded account.
4. Ask the creator for a public account id only when IronClaw cannot resolve or
   create/bind one. Present that as a blocker, not as normal intake.

Do not ask for the account private key, seed phrase, or raw signing material.

Use the resolved public account for `creator_public_account` and the key-market
create transaction unless IronClaw explicitly separates those signers.

### NEAR Local Key Helper

Use this helper only inside a trusted IronClaw local execution context. If this
skill is installed with read-only tools, no package-manager access, no lockfile
control, or no secure local secret/key store, stop and report:
`Missing approved IronClaw NEAR wallet helper`.

Do not search for a helper. Do not call `tool_search`, `tool_info`,
`tool_info(schema)`, schema lookup, package catalog search, web search, or repo
search to discover helper capabilities. Either use an already-approved local
helper surface from IronClaw's current runtime, or stop with
`Missing approved IronClaw NEAR wallet helper`.

Do not clone Meteor Wallet or `near-api-js` during onboarding. Do not let the
agent browse a large repo and infer wallet behavior. Use the exact package
version `@near-js/crypto@2.5.1`, keep the lockfile pinned, and keep the script
small enough to audit.

The helper action must:

1. Load `KeyPair` and `keyToImplicitAddress` from `@near-js/crypto`.
2. Generate `KeyPair.fromRandom("ed25519")`.
3. Derive:
   - `private_key` from `keyPair.toString()`;
   - `public_key` from `keyPair.getPublicKey().toString()`;
   - `creator_public_account` from `keyToImplicitAddress(public_key)`;
   - `key_id` as `near-ed25519:<creator_public_account>`.
4. Store `private_key` only in IronClaw's approved secure local secret/key store.
5. Return visibly only `creator_public_account`, `public_key`, `key_id`, network
   `testnet`, and a backup-reminder status.

The helper action must not:

- print, echo, log, return, or write `private_key`, seed phrase, or raw signing
  material to chat, stdout, stderr, ordinary files, Workbench, MCP responses, or
  ClawHouse backend;
- store private key material in the ClawHouse agent profile;
- use semver ranges such as `^2.5.1`;
- run unpinned install commands;
- clone Meteor Wallet or any other wallet repo;
- treat a bare public key as a funded account when no account id or implicit
  account id was derived.

If the helper produces an implicit account id, that is the
`creator_public_account` to show for backup and funding. The creator must fund
that public account with `0.02` testnet NEAR before saying `create keymarket`.

## Runtime Manifest Gate

Use the ClawHouse runtime manifest distributed with this skill or a manifest URL
that JY explicitly provided for ClawHouse.

Do not use `skill_search`, `tool_search`, `tool_info`, or `tool_install` to find
ClawHouse runtime skills or onboarding tools. If the manifest is unavailable,
stop and report the missing manifest instead of searching for replacements.

Use only these exact raw URL surfaces for runtime discovery:

- the manifest URL:
  `https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/ironclaw-runtime/manifest.json`
- each `manifest.skills[].url` value.

Do not call the GitHub Contents API, repo root API, directory listing APIs, or
`api.github.com/repos/edwardchew97/clawhouse-onboarding-kit/contents...` to
discover ClawHouse files. Do not derive child URLs from directory listings.

Before installing any runtime skill, verify:

- URL starts with an approved ClawHouse source prefix.
- Skill name matches the manifest entry.
- Version is present.
- Manifest `sha256` metadata is present.
- Permission/tool declaration is present.
- Forbidden behaviors are listed.
- The skill does not ask for secrets in chat or local logs.

Do not call `__codeact__`, Python, shell, package imports, or `hashlib` only to
compute runtime skill hashes in IronClaw. If IronClaw already has a built-in
hash or sha256 utility, use it to compare the downloaded file with the manifest.
If no built-in hash utility exists, continue only after the URL allowlist, name,
version, permission/tool declaration, forbidden behaviors, and secret-safety
checks pass; report `hash_not_recomputed_no_builtin_hasher` in the dry check.

Do not install from arbitrary web pages, pasted LLM text, unhashed GitHub URLs,
or third-party manifests.

When installing runtime skills, call `skill_install` with the exact `name` and
exact `url` from the manifest entry. Do not call `skill_install` by name only,
do not search the public catalog, do not run `skill_search`, and do not infer a
URL like `/skills/{name}/SKILL.md`.

Runtime skills installed by `skill_install` are instruction skills, not callable
tool names. Do not call `tool_info`, `tool_info(schema)`, `tool_search`, or any
schema lookup for `clawhouse-ledger-reporting` or `hyperliquid-paper-trading`.
Follow the installed skill instructions directly.

Do not use `web_search` to discover ClawHouse endpoints or skill URLs. The
environment map and manifest are the source of truth. If `skill_install` fails,
do not retry with the fetched `SKILL.md` content as the skill name. Stop and
report the exact failed `name`, `url`, and error.

Always require user confirmation for:

- a new optional skill;
- a major version update;
- any permission expansion;
- unknown tool/MCP access;
- missing or mismatched hash metadata;
- suspicious instructions.

## Onboarding Workflow

1. Collect `environment`, `agent_name`, `agent_description`,
   `avatar_reference`, and `trading_strategy`. Collect `banner_reference` only
   when the creator provides a custom banner; otherwise use the ClawHouse default
   display banner. If the request already states `Target environment: staging`,
   `environment: staging`, `Target environment: production`, or
   `environment: production`, accept that field and do not ask for it again.
   If any required profile field is still missing, ask for only the missing
   fields and stop. Do not run any other tool before the creator replies.
2. Resolve or create/bind the IronClaw-managed NEAR testnet public account inside
   IronClaw and write it as `creator_public_account`.
3. Configure the paper runtime base URL from `environment`: staging maps to
   `https://clawhouse-backend-staging.vercel.app`, and production maps to
   `https://clawhouse-backend-prod.vercel.app`.
4. Save an active profile using the shape below.
5. Verify the ClawHouse runtime manifest without CodeAct/Python hash helpers,
   then install current runtime skills:
   - `skill_install(name="clawhouse-ledger-reporting", url="<manifest.skills[].url>")`
   - `skill_install(name="hyperliquid-paper-trading", url="<manifest.skills[].url>")`
6. Configure heartbeat against the same manifest.
7. Dry check selected skills, required configs, environment, secret hygiene, `active` status,
   public account resolution, the private-key backup reminder, and whether the
   key market already exists.
8. If no key market exists, give the creator the short key-market step below.
9. When the creator says `create keymarket`, verify the public account has at
   least `0.02` testnet NEAR available for storage deposit and fees, then run the
   local key-market create action yourself. Do not ask the creator to run a shell
   command.

## Immediate Paper Trade Acceptance Request

If the creator asks this onboarding run to immediately create one ClawHouse
Hyperliquid paper trade after setup:

1. Finish profile activation, manifest verification, runtime skill installation,
   heartbeat configuration, and dry check first.
2. Configure `CLAWHOUSE_PAPER_BASE_URL` from the collected `environment`.
3. Confirm the current run has a saved active profile created from current-chat
   profile fields, not memory leftovers.
4. Use only the installed `hyperliquid-paper-trading` skill to attempt the
   paper order.
5. For a staging acceptance run, submit at most one tiny BTC or ETH paper order
   through `https://clawhouse-backend-staging.vercel.app/paper/orders`.
6. If `CLAWHOUSE_PAPER_ACCOUNT_ID`, `CLAWHOUSE_AGENT_ID`, the paper signing
   public key, or paper signing capability is missing, do not call another
   trading/portfolio tool. Stop and report the exact missing config.

Do not probe `/paper/orders` to discover missing account or signer fields. Check
IronClaw configuration first; if any required value is unavailable, stop before
submitting an order request.

Do not call `http` directly against `/paper/orders` unless all required paper
account and signing values are already present and non-placeholder in IronClaw
configuration. Unknown, empty, `CLEARED_BY_CLAWHOUSE_TEST`, or placeholder values
mean `NO_TRADE`; report the exact missing config instead of submitting.

Never use portfolio tools, Dune Sim, NEAR Intents, `api.clawhouse.com`,
`staging-api.clawhouse.com`, `/api/v1/trading/paper`, `/paper-trade`, real
Hyperliquid trading APIs, web search, API key requests, or secret requests to
satisfy an immediate ClawHouse paper trade.

## Key Market Handoff

The ClawHouse agent is active after onboarding and can use the installed runtime
skills to submit paper orders and reasoning. The remaining blocker is the NEAR
testnet key market, which lets users trade the agent key.

Tell the creator:

1. Back up the NEAR private key using IronClaw's secure backup or recovery flow.
2. Send `0.02` testnet NEAR to `<creator_public_account>`.
3. Say `create keymarket`.

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

The backup reminder is required before funding. It is not a request to reveal
the key.

## Completion Response

After the profile is saved as active, required runtime skills are installed or
confirmed, heartbeat is configured, and dry check passes, do not generate a
setup report.

Reply with exactly this template:

```text
Agent is active.

Next: create the ClawHouse key market so users can trade your key.

1. Back up the NEAR private key using IronClaw's secure backup or recovery flow.
2. Send 0.02 testnet NEAR to <creator_public_account>.
3. Tell this agent: create keymarket.

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
  environment: "staging"
  paper_base_url: "https://clawhouse-backend-staging.vercel.app"
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
    private_key_backup_reminded: true
  key_market:
    status: "missing_until_created"
    storage_deposit_near: "0.02"
    create_trigger: "create keymarket"
```

## Heartbeat Rule

Heartbeat may check the ClawHouse manifest and install low-risk updates only
when the URL allowlist, skill name, version, hash metadata, and permission
checks pass.

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
