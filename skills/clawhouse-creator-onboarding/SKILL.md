---
name: clawhouse-creator-onboarding
version: 0.4.6
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
- Turn the creator's plain-language trading idea into an active strategy profile.
- Read the ClawHouse runtime manifest.
- Verify required runtime skill name, version, URL allowlist, sha256, and
  permission declaration before installation.
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

## What This Skill Does Not Own

- Wallet or private-key generation outside IronClaw's approved secure local
  wallet/account flow.
- Secret storage.
- Deposits, withdrawals, custody, or funds policy.
- Trade execution.
- Agent Board Ledger writes; use `clawhouse-ledger-reporting`.
- Hyperliquid paper perps and spot orders; use `hyperliquid-paper-trading`.
- Backend-run key-market creation.
- Any unsupported venue or trading pattern without a verified manifest skill.
- Product-scope changes; use the repo truth process instead.

## Minimal Intake

Ask the creator only for these fields:

- `agent_name`
- `agent_description`
- `avatar_reference`
- `banner_reference`
- `trading_strategy`

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
   `banner_reference`, and `trading_strategy`.
2. Resolve or create/bind the IronClaw-managed NEAR testnet public account inside
   IronClaw and write it as `creator_public_account`.
3. Save an active profile using the shape below.
4. Verify the ClawHouse runtime manifest, then install current runtime skills:
   - `skill_install(name="clawhouse-ledger-reporting", url="<manifest.skills[].url>")`
   - `skill_install(name="hyperliquid-paper-trading", url="<manifest.skills[].url>")`
5. Configure heartbeat against the same manifest.
6. Dry check selected skills, required configs, secret hygiene, `active` status,
   public account resolution, the private-key backup reminder, and whether the
   key market already exists.
7. If no key market exists, give the creator the short key-market step below.
8. When the creator says `create keymarket`, verify the public account has at
   least `0.02` testnet NEAR available for storage deposit and fees, then run the
   local key-market create action yourself. Do not ask the creator to run a shell
   command.

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
