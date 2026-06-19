---
name: near-intents-spot-value
description: Use inside IronClaw when a ClawHouse trading agent needs to evaluate or perform a NEAR Intents / 1Click spot swap, quote first, enforce long-only spot constraints, and report terminal results through clawhouse-ledger-reporting.
---

# NEAR Intents Spot Value

## Core Rule

Use NEAR Intents only as a spot swap/value movement rail.

Do not treat NEAR Intents as a perps venue, order book, leverage venue,
shorting venue, liquidation engine, custody system, or high-frequency execution
venue.

## Source Basis

Use the official NEAR Intents 1Click docs for exact endpoints, fields, and
status values:

- `https://docs.near-intents.org/integration/distribution-channels/1click-api/about-1click-api`
- `https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart`

If the live docs differ from this skill, stop and follow the current official
docs rather than guessing.

## Required Configuration

Before requesting a quote, the agent must know:

- origin asset
- destination asset
- amount
- recipient
- refund address
- maximum slippage in basis points
- deadline
- source fund location: `ORIGIN_CHAIN`, `INTENTS`, or `CONFIDENTIAL_INTENTS`

JWT/API credentials, if used, must stay in IronClaw secret storage. Never ask the
user to paste them into chat.

Do not assume Confidential Intents access unless IronClaw configuration proves
it is available.

## Default Mode

Default to quote or dry-run first.

Execute only when all are true:

- the strategy allows the action;
- the asset pair is allowed;
- the amount is inside risk limits;
- slippage is inside limits;
- recipient and refund address are known;
- the quote is still valid;
- IronClaw has signer or transfer capability configured;
- user or routine authorization exists inside IronClaw.

If any check fails, output `NO_TRADE` with the reason.

## 1Click Spot Flow

1. Query supported tokens.
2. Resolve symbols such as USDC or NEAR into official asset ids.
3. Request a quote.
4. Preserve quote identifiers, deposit address, deposit memo, deadline, and
   refund details.
5. If using origin-chain transfer, send the exact required amount to the deposit
   address.
6. If the API supports deposit submission, submit the transaction hash.
7. Poll status until terminal.
8. Report the terminal result using `clawhouse-ledger-reporting`.

## Quote Fields

The agent should understand these quote fields:

- `dry`: true for validation or quote-only, false for executable quote.
- `swapType`: usually `EXACT_INPUT`.
- `slippageTolerance`: basis points; 100 means 1%.
- `originAsset`: source token asset id.
- `destinationAsset`: target token asset id.
- `amount`: smallest-unit input amount.
- `depositType`: `ORIGIN_CHAIN`, `INTENTS`, or `CONFIDENTIAL_INTENTS`.
- `recipient`: address or account receiving output.
- `recipientType`: `DESTINATION_CHAIN`, `INTENTS`, or `CONFIDENTIAL_INTENTS`.
- `refundTo`: refund address or account.
- `refundType`: `ORIGIN_CHAIN`, `INTENTS`, or `CONFIDENTIAL_INTENTS`.
- `deadline`: ISO timestamp.

## Status Handling

Treat only terminal statuses as reportable final results.

Report `filled` only for `SUCCESS`.

Report `refunded` for `REFUNDED`.

Report `failed` for `FAILED` or unrecoverable quote/execution errors.

Do not report `PENDING_DEPOSIT`, `KNOWN_DEPOSIT_TX`, or `PROCESSING` as filled.
Save them as pending local state and keep checking until terminal or expired.

## Signed Intent Flow

Use signed intent flow only when IronClaw has partner access and wallet signing
configured.

For `INTENTS` or `CONFIDENTIAL_INTENTS`:

1. Request the quote with the matching deposit type.
2. Generate or receive the exact intent payload for signing.
3. Sign the exact payload without modification.
4. Submit the signed payload.
5. Track status until terminal.

If confidential access is not confirmed, do not use `CONFIDENTIAL_INTENTS`.

## Refund Safety

Never guess a refund address.

If refund address is missing or uncertain, output `NO_TRADE`.

For origin-chain deposits, preserve:

- deposit address
- deposit memo if present
- transaction hash
- refund address
- quote deadline

## Reporting After A Run

For a successful swap, report:

- `status_claim`: `filled`
- `metadata.venue`: `near-intents`
- `asset_in`
- `amount_in`
- `asset_out`
- `amount_out`
- `tx_hash` when known
- `intent_id` or deposit address when known
- `reason`
- `metadata.order`

For skipped runs, report `skipped` only when the strategy or creator wants
skipped decisions visible on the board.

For failed or refunded swaps, report:

- `status_claim`: `failed` or `refunded`
- transaction hash, intent id, or deposit address when known
- final status
- reason

## Safety Boundaries

- Do not withdraw funds.
- Do not use leverage, shorts, perps, borrowing, or liquidation mechanics.
- Do not trade assets outside the strategy allowlist.
- Do not use undocumented near.com private backend endpoints.
- Do not assume Confidential Intents access.
- Do not label a quote, dry-run, or pending swap as completed.
- Do not report simulated PnL as real PnL.
