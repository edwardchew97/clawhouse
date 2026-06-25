# Paper Trading - Stress Test Findings

**Scope:** `apps/agent-board-ledger/src/paper-trading.ts`, supporting paper-trading schema/types, and `test/paper-trading-edge.test.ts`.
**Date:** 2026-06-21
**Review result:** Claude's packet was partially correct, but the incoming test/finding document was stale against the current API contract.

## Current Status

| # | Finding | Review verdict | Final status |
|---|---------|----------------|--------------|
| 1 | Audit hash-chain forks because `previous_hash` was selected by timestamp + random UUID | Correct | Fixed |
| 2 | Margin rejection returns bare HTTP 400 and leaves no order/audit trail | Stale / incorrect for current source | No production-code change needed |
| 3 | Latest market/risk snapshots use random UUID as timestamp tie-break | Correct | Fixed |
| 4 | Cross liquidation can push paper cash/equity below zero | Correct | Fixed |
| 5 | Cross available-margin model is stricter than some exchange models | Modeling choice | Left unchanged |

## Review And Iterate Notes

### Cycle 1

The incoming Claude claim said the new edge suite had 51 passing tests and 2 intentional failures.

Local verification did not match that claim:

```bash
cd apps/agent-board-ledger
bun test test/paper-trading-edge.test.ts
```

Initial result on the incoming packet: **27 pass / 26 fail**. Most failures were not production bugs. The new test requests omitted the current API-required `reason` field and often omitted explicit `max_slippage_bps` for market-like IOC orders, so requests were rejected before reaching the paths Claude claimed to test.

### Cycle 2

After aligning the edge-test helper with the current paper-order contract, the remaining real issues were:

- audit events needed a stable monotonic order key;
- same-timestamp market/risk snapshots needed deterministic latest selection;
- cross liquidation needed a bankruptcy floor so paper cash/equity cannot go below zero.

The margin-rejection finding was already fixed in current source: margin failures route through `insertRejectedOrder()` and are replayable/auditable.

## Fixes Applied

- Added internal `ingest_sequence` columns for paper market snapshots, risk snapshots, and audit events in SQLite and Postgres schema definitions.
- Used `ingest_sequence` for latest market snapshot, latest risk snapshot, and audit-chain `previous_hash` selection.
- Included the audit event sequence in the audit event hash payload.
- Kept `ingest_sequence` out of API presentation objects.
- Clamped liquidation settlement:
  - isolated liquidation cannot debit more than the isolated margin already locked;
  - cross liquidation cannot reduce paper cash below zero.
- Updated `paper-trading-edge.test.ts` to match the current API contract and added regression checks for:
  - same-timestamp market snapshot ordering;
  - same-timestamp risk snapshot ordering;
  - audit hash-chain linking by ingestion order;
  - cross liquidation cash/equity floor.

## Verification

```bash
cd apps/agent-board-ledger
bun test test/paper-trading-edge.test.ts
# 56 pass / 0 fail

bun test test/server.test.ts
# 70 pass / 0 fail

bun test
# 126 pass / 0 fail
```

## Remaining Note

The cross-margin available-margin rule still checks initial margin plus fees against equity. That is a conservative paper model choice, not a clear defect. Its rejection path is now auditable through the same rejected-order envelope as other paper-order rejections.
