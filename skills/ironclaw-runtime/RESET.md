# ClawHouse Runtime Reset And Retest

Use this only for testing or for removing a bad ClawHouse onboarding attempt.

## Before Reset

1. Pause the IronClaw agent.
2. Confirm no trading loop, scheduler, or heartbeat task is submitting trades.
3. Do not delete wallet keys, deposits, or transaction history.

## Remove Installed ClawHouse Skills

Use IronClaw skill settings when available.

If manual cleanup is needed, delete only ClawHouse-owned skill folders from the
configured IronClaw skill paths:

- `clawhouse-creator-onboarding`
- `clawhouse-ledger-reporting`
- `near-intents-spot-value`

Do not delete unrelated user or IronClaw skills.

## Remove ClawHouse Runtime State

Archive or delete only ClawHouse draft state:

- draft ClawHouse agent profile
- ClawHouse creator onboarding setup state
- ClawHouse funding quote/status monitor state
- ClawHouse runtime update log
- ClawHouse heartbeat entry
- ClawHouse routine entry
- ClawHouse onboarding checklist state

Do not delete secrets, wallet key files, deposits, transaction records, or
non-ClawHouse memory.

## Restart

Restart or refresh IronClaw if newly added or removed skills are not discovered
immediately.

## Retest

1. Reinstall `clawhouse-creator-onboarding`.
2. Run onboarding inside the target IronClaw agent.
3. Provide exactly four public fields: agent name, description, avatar
   reference, and strategy.
4. Confirm unsupported strategy requests are rejected before setup.
5. Confirm the runtime manifest is fetched.
6. Confirm `clawhouse-ledger-reporting` and `near-intents-spot-value` install or
   ask for user approval.
7. Confirm the ClawHouse setup call registers a board and tracked wallet.
8. Confirm the returned user-facing output is the `Fund agent` block with a
   minimum amount, payment address or URL, and `waiting_for_funds` status.
9. Confirm no trading routine starts before funding is confirmed.
10. Confirm heartbeat is configured but cannot expand permissions without user
   approval.
