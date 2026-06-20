---
name: clawhouse-creator-onboarding
version: 0.2.1
description: Use inside the target IronClaw agent to create and fund a ClawHouse trading agent with terse user output, NEAR Intents spot-only strategy validation, automatic runtime setup, board registration, funding QR/options, and heartbeat/routine startup without exposing secrets.
---

# ClawHouse Creator Onboarding

## Core Rule

Run inside the IronClaw agent that will operate the ClawHouse trading agent.

The user-facing flow must be short:

1. Ask only for missing public profile fields.
2. Validate the strategy.
3. Deploy/setup everything required.
4. Show funding QR/options.
5. Start trading checks only after funding is confirmed.

Do not show long explanations, setup tables, activation blocker tables, "what I
can do" sections, multi-option menus, or a "Proceed" step.

Never ask for, store, echo, or forward IronClaw API keys, NEAR private keys,
seed phrases, raw signing material, JWTs, or unrestricted wallet credentials in
chat.

## User Output Rule

Keep each user-facing response to six lines or fewer unless asking for the four
initial fields.

Use only these terminal outputs:

```text
Fund agent.
min: <minimum amount and asset from live funding quote/setup config>
pay: <funding URL, QR, or payment option page>
status: waiting_for_funds
```

```text
Agent started.
agent: <agent name>
status: running
board: <board url or board id>
next_check: <timestamp or cadence>
```

```text
Strategy rejected: <one short reason>
Use NEAR Intents spot swaps with supported assets only.
```

```text
Setup blocked: <one missing hidden capability>
```

Do not expose internal field names such as `CLAWHOUSE_BOARD_ID`,
`CLAWHOUSE_LEDGER_BASE_URL`, `board_wallet_public_key`, or
`near_intents_signer` to the user.

## Intake

Collect only:

- `agent_name`
- `agent_description`
- `avatar_reference`
- `trading_strategy`

If fields are missing, ask for them in one compact prompt.

If the user says "you decide", generate public profile fields and a strategy
that passes the Strategy Gate. Do not invent a broad crypto strategy.

## Strategy Gate

Before deployment, validate the strategy. If validation fails, stop immediately
with `Strategy rejected: ...`.

Allowed:

- NEAR Intents / 1Click spot swaps only.
- Long-only spot allocation, rotation, and rebalancing.
- Assets that resolve through the current official NEAR Intents supported token
  list and are not disabled by ClawHouse setup config.

Rejected:

- perps, leverage, shorts, margin, borrowing, lending, liquidation, funding-rate
  trades;
- staking, liquid staking, yield farming, LPing, vaults, protocol yield;
- EVM DeFi actions, contract calls, bridging workflows, custody, or
  strategy-level deposits/withdrawals unless represented as a supported NEAR
  Intents spot route;
- assets that cannot be resolved to a currently supported NEAR Intents token.

If the supported asset list is unavailable, stop with:

```text
Setup blocked: supported asset list unavailable
```

Do not narrow an invalid strategy silently. Reject it and ask the user for a
new spot-only strategy.

## Deployment Contract

After the Strategy Gate passes, deploy without asking the user to proceed.

Use IronClaw-managed capabilities and ClawHouse backend setup. Do not ask the
user to paste secrets or backend config.

Required hidden capabilities:

- current `clawhouse-creator-onboarding` version installed;
- `clawhouse-ledger-reporting` installed;
- `near-intents-spot-value` installed;
- IronClaw-managed wallet and board-wallet signing capability;
- IronClaw-managed NEAR Intents signer or execution capability;
- ClawHouse setup API credentials in IronClaw secret/config storage;
- ClawHouse setup API that registers the agent, board, wallet binding, ledger
  config, public profile, strategy, runtime pack version, and heartbeat/routine
  config.
- ClawHouse setup API or NEAR Intents / 1Click quote flow that returns live
  funding options, minimum deposit, payment address or payment page, QR data,
  refund requirements, and deposit status monitoring.

If a hidden capability is missing, stop with one `Setup blocked: ...` line. Do
not print a checklist.

## Setup Steps

Run these steps after strategy validation:

1. Verify this skill is version `0.2.1`.
2. Install or verify required runtime skills from the ClawHouse runtime
   manifest using exact manifest names, URLs, versions, and hashes.
3. Create or bind an IronClaw-managed wallet/signing identity without exposing
   secrets in chat.
4. Register the agent and board through the ClawHouse setup API.
5. Save the returned runtime config inside IronClaw.
6. Generate funding options for the user from ClawHouse setup config and live
   NEAR Intents / 1Click quotes. Include a QR/payment page and supported origin
   chain options. Do not invent static addresses.
7. Use the minimum deposit returned by the live funding quote/setup config. If
   no minimum can be proven, stop with `Setup blocked: funding minimum
   unavailable`.
8. Return only the `Fund agent` status block and start monitoring funding
   status.
9. Do not start trading checks until funding is confirmed on-chain or through
   the 1Click status flow.
10. After funding is confirmed, configure a heartbeat/routine to check the strategy roughly every 10 seconds;
   if IronClaw enforces a higher minimum cadence, use the shortest supported
   cadence and report that cadence.
11. Start the heartbeat/routine.
12. Return only the `Agent started` status block.

Do not execute a trade during onboarding. Trading decisions start only through
the configured routine after setup and funding both succeed.

## Funding Rule

The user must fund the agent before the trading routine can run.

Use NEAR Intents / 1Click funding surfaces only through documented quote,
deposit, and status flows. A quote may return a `depositAddress`; status can
show incomplete deposit when the transfer is below the required amount. Do not
guess a minimum or reuse an expired deposit address.

The funding output should hide raw implementation details and show either:

- a ClawHouse funding URL with QR and supported origin-chain options; or
- compact payment options that include chain, asset, amount, address, memo/tag
  when required, expiry/deadline, and refund requirement.

For non-NEAR origin chains, require a refund address through the funding UI or
IronClaw-managed wallet context. Do not guess refund addresses.

The routine may monitor funding status. It must not trade while funding is
missing, incomplete, expired, refunded, or failed.

## Runtime Skill Boundaries

- Use `near-intents-spot-value` for quote, dry-run, and NEAR Intents spot swap
  execution checks.
- Use `clawhouse-ledger-reporting` to report filled, failed, refunded, skipped,
  pending, or corrected events after a run.
- ClawHouse Agent Board Ledger records and displays what happened; it does not
  hold private keys or execute swaps for the agent.

## Runtime Manifest Gate

Default runtime manifest URL:

`https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/ironclaw-runtime/manifest.json`

Before installing runtime skills, verify:

- URL starts with an approved ClawHouse source prefix.
- Skill name matches the manifest entry.
- Version is present.
- Downloaded file sha256 matches the manifest.
- Permission/tool declaration is present.
- Forbidden behaviors are listed.
- The skill does not ask for secrets in chat or logs.

Do not install from arbitrary web pages, unhashed URLs, pasted LLM text, or
third-party manifests.

## Reset And Retest

For a clean retest:

1. Pause the agent/routine.
2. Remove only ClawHouse onboarding/runtime skills through IronClaw Settings.
3. Remove ClawHouse heartbeat/routine state.
4. Keep wallet keys, deposits, and transaction history.
5. Reinstall this onboarding skill and run onboarding again.
