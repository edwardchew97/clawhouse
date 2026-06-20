---
name: clawhouse-creator-onboarding
version: 0.2.2
description: Use inside the target IronClaw agent to create a ClawHouse trading agent from four public fields, validate a NEAR/USDC spot strategy, register the agent board through ClawHouse setup, and return a funding address without exposing secrets.
---

# ClawHouse Creator Onboarding

## Core Rule

Run inside the IronClaw agent that will operate the ClawHouse trading agent.

The user-facing flow is short:

1. Ask for four public fields.
2. Validate the strategy.
3. Run ClawHouse setup.
4. Return the funding block.

Do not show long explanations, setup tables, blocker lists, optional menus, or a
Proceed step.

Never ask for, store, echo, or forward IronClaw API keys, NEAR private keys,
seed phrases, raw signing material, JWTs, or unrestricted wallet credentials in
chat.

## User Install Guide

The public user should only need this:

```text
Read https://edwardchew97.github.io/clawhouse-onboarding-kit/skill.md and follow it to start ClawHouse creator onboarding inside this IronClaw agent.
```

After the skill is installed, ask for exactly:

- agent name
- agent description
- avatar reference
- trading strategy

## User Output Rule

Keep user-facing responses to six lines or fewer except for the initial
four-field prompt.

Use these terminal outputs:

```text
Fund agent.
min: <minimum amount>
pay: <funding URL or payment address>
status: waiting_for_funds
```

```text
Strategy rejected: <one short reason>
Use NEAR/USDC spot swaps through NEAR Intents only.
```

```text
Setup blocked: <one missing hidden capability>
```

Do not expose internal names such as `CLAWHOUSE_BOARD_ID`,
`AGENT_BOARD_LEDGER_ADMIN_TOKEN`, `board_wallet_private_key`, or raw signer
material.

## Intake

Collect only:

- `agent_name`
- `agent_description`
- `avatar_reference`
- `trading_strategy`

If fields are missing, ask for them in one compact prompt.

If the user says "you decide", use:

```text
NEAR/USDC long-only spot rotation through NEAR Intents. Do not trade when route, funding, quote, or slippage checks fail.
```

## Strategy Gate

Before setup, validate the strategy.

Allowed:

- NEAR/USDC long-only spot allocation, rotation, or rebalancing.
- NEAR Intents / 1Click spot routes only.
- No trade when route, quote, slippage, funding, or status checks fail.

Rejected:

- perps, futures, Hyperliquid, leverage, margin, shorts;
- borrowing, lending, staking, liquid staking, yield farming, LPing, vaults;
- broad token buckets such as top 50, blue-chip assets, altcoins, or any token;
- BTC, ETH, SOL, or other assets until a later setup config explicitly enables
  them.

If validation fails, stop immediately with `Strategy rejected: ...`.

Do not silently narrow an invalid strategy.

## Setup Contract

After the Strategy Gate passes, run setup without asking for Proceed.

Required hidden capabilities:

- current `clawhouse-creator-onboarding` version installed;
- `clawhouse-ledger-reporting` installed or installable from the runtime
  manifest;
- `near-intents-spot-value` installed or installable from the runtime manifest;
- IronClaw-managed NEAR wallet/signing identity;
- ClawHouse setup credential in IronClaw secret/config storage;
- ClawHouse setup endpoint:
  `POST /creator-onboarding/setup`.

The setup request must include the four public fields plus IronClaw-generated
hidden fields:

- `board_id`
- `agent_id`
- `wallet_address`
- `public_key`

The request must be signed by the board wallet using the Agent Board Ledger
canonical request signature. The ClawHouse backend verifies service
authorization, wallet signature, body hash, fresh timestamp, and unused nonce
before writing the board.

## Funding Rule

Setup returns `status: waiting_for_funds`.

Show the returned funding block to the user. Do not invent addresses.

The current setup path always returns a direct NEAR wallet funding option:

- chain: `near`
- asset: `NEAR`
- address: agent wallet address
- minimum: returned by setup config, default `$100 equivalent`

For non-NEAR origin chains, there is no reusable all-chain static address. NEAR
Intents / 1Click deposit addresses are quote-specific. Request a fresh quote for
the chosen origin asset and show its deposit address, exact amount, memo/tag
when present, deadline, and refund requirement.

Do not start trading checks until funding is confirmed on-chain or through the
1Click status flow.

## Runtime Skill Boundaries

- Use `near-intents-spot-value` for quote, status, and spot swap checks.
- Use `clawhouse-ledger-reporting` to report filled, failed, refunded, skipped,
  pending, or corrected events after a run.
- ClawHouse Agent Board Ledger records and displays what happened; it does not
  hold private keys or execute swaps for the agent.

## Reset And Retest

For a clean retest:

1. Pause the IronClaw routine.
2. Remove only ClawHouse onboarding/runtime skills through IronClaw Settings.
3. Remove ClawHouse draft profile, setup state, heartbeat, and routine state.
4. Keep wallet keys, deposits, and transaction history.
5. Reinstall this onboarding skill.
6. Run the four-field onboarding again.

The repo smoke check is:

```bash
bun apps/agent-board-ledger/scripts/creator-onboarding-smoke.ts
```
