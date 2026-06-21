---
name: near-intents-spot-value
version: 0.2.0
description: Use inside IronClaw when a ClawHouse trading agent needs NEAR Intents / 1Click spot-only value movement: quote first, execute a spot swap only when authorized, track terminal status, and report the result through clawhouse-ledger-reporting. Do not use for perps, leverage, margin, shorts, liquidation, or Hyperliquid paper orders.
---

# NEAR Intents Spot Value

## Core Rule

Use this skill for spot swaps and value movement only.

Use `hyperliquid-paper-trading` instead when the strategy needs perps-style
paper orders, leverage, cross/isolated margin, funding, liquidation, or
Hyperliquid market-depth simulation.

Do not treat NEAR Intents as a perps venue, order book, leverage venue,
shorting venue, liquidation engine, custody system, or high-frequency execution
venue.

## Required Configuration

Before quoting, the agent must know:

- origin asset
- destination asset
- amount
- recipient
- refund address
- maximum slippage in basis points
- deadline
- source fund location: `ORIGIN_CHAIN`, `INTENTS`, or `CONFIDENTIAL_INTENTS`

JWT/API credentials, if used, must stay in IronClaw secret storage. Never ask the
user to paste credentials, private keys, seed phrases, or raw signing material
into chat.

## Spot Flow

Default to quote or dry-run first.

1. Query supported tokens.
2. Resolve symbols into official asset ids.
3. Request a quote.
4. Preserve quote id, deposit address, memo, deadline, and refund details.
5. Execute only when the strategy, risk limits, recipient, refund address,
   slippage, quote validity, signer capability, and IronClaw authorization all
   pass.
6. Track status until terminal.
7. Report terminal result through `clawhouse-ledger-reporting`.

If any check fails, output `NO_TRADE` with the reason.

## Decision Pattern

For spot swaps, reason about:

- asset pair and route;
- exact input amount;
- expected output amount;
- slippage tolerance;
- recipient and refund path;
- quote deadline;
- terminal status.

Do not include leverage, margin mode, funding rate, liquidation, reduce-only, or
perps time-in-force fields in a spot decision.

## Status Handling

Report `filled` only for terminal `SUCCESS`.

Report `refunded` for `REFUNDED`.

Report `failed` for `FAILED` or unrecoverable quote/execution errors.

Do not report `PENDING_DEPOSIT`, `KNOWN_DEPOSIT_TX`, or `PROCESSING` as filled.
Save them as pending local state and keep checking until terminal or expired.

## Safety Boundaries

- Do not withdraw funds.
- Do not use leverage, shorts, perps, borrowing, margin, or liquidation logic.
- Do not trade assets outside the strategy allowlist.
- Do not use undocumented near.com private backend endpoints.
- Do not assume Confidential Intents access.
- Do not label a quote, dry-run, or pending swap as completed.
- Do not report simulated PnL as real PnL.
