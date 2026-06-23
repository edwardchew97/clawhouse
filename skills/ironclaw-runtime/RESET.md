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

- `clawhouse-skill-directory`
- `clawhouse-creator-onboarding`
- `clawhouse-ledger-reporting`
- `hyperliquid-paper-trading`

Do not delete unrelated user or IronClaw skills.

## Remove ClawHouse Runtime State

Archive or delete only ClawHouse runtime state:

- active ClawHouse agent profile
- ClawHouse runtime update log
- ClawHouse heartbeat entry
- ClawHouse onboarding checklist state

Do not delete secrets, wallet key files, deposits, transaction records, or
non-ClawHouse memory.

## Restart

Restart or refresh IronClaw if newly added or removed skills are not discovered
immediately.

## Retest

1. Reinstall `clawhouse-skill-directory`.
2. Use it to route to `clawhouse-creator-onboarding`.
3. Run onboarding inside the target IronClaw agent.
4. Confirm the runtime manifest is fetched.
5. Confirm `clawhouse-ledger-reporting` and `hyperliquid-paper-trading` install
   or ask for user approval.
6. Confirm the ClawHouse profile is active only after dry checks pass.
7. Confirm heartbeat is configured but cannot expand permissions without user
   approval.
