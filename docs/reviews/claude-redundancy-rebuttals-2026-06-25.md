# Claude Redundancy Audit Rebuttals

Date: 2026-06-25
Scope: Follow-up notes for cross-checking the ClawHouse redundancy audit fixes.

## Rebutted Or Downgraded Findings

### Creator onboarding status self-reporting was already fixed

Claude's audit said creator onboarding still accepted client-provided `public_status`, `visibility_mode`, and `status` for the public board and paper account.

Current repo state differs:

- `registerCreatorOnboarding` sets `public_status: "active"` and `visibility_mode: "public"` from backend constants.
- The onboarding paper account body uses backend-owned defaults for paper balance and market scope.
- Existing tests intentionally submit `status: "paused"`, `public_status: "draft"`, and `visibility_mode: "private"` and assert the stored state remains active/public.

Verdict: the original pattern is real, but this specific creator-onboarding claim was stale for current `dev`.

### key-market object parsing should stay lenient

Claude flagged the local `asObject` in `key-market.ts` as duplicated drift from the strict `db.ts` helper.

The strict helper is correct for request bodies. `key-market.ts` also parses nested NEAR RPC responses and event logs, where bad nested shapes should often coerce to `{}` so the verifier can return the intended `RequestError` rather than crash on property access.

Fix applied: the helper is now named `objectRecord`, with a comment explaining the lenient RPC/event parsing intent.

Verdict: the old name was misleading; the semantic difference is intentional and should not be force-merged with `db.ts`'s strict `asObject`.

### camelCase/snake_case support is compatibility, not automatically a bug

Claude was right that repeated `data.camelCase ?? data.snake_case` expressions were noisy and easy to drift.

The compatibility contract itself should not be deleted silently. Existing callers may still send snake_case.

Fix applied: request bodies now pass through `normalizeBodyFields`, which copies top-level snake_case keys into camelCase aliases before route logic reads them. Business logic now reads one spelling while preserving wire compatibility.

Verdict: duplication was a real maintainability problem; accepting both spellings was not itself proof of a bug.

### Contract struct overlap is maintenance risk, not a runtime bug

Claude flagged repeated fields across `PriceQuote`, `TradeResult`, and `KeyTradeEventData`.

The riskiest part was `KeyTradeEventData` hand-copying fields from `TradeResult` when emitting events.

Fix applied: `KeyTradeEventData` now flattens a `TradeResult` and adds only `side`, preserving the event JSON field shape while removing the manual field copy.

Verdict: this was a valid cleanup target, but not a security or correctness bug.

### Env alias chains should not be removed without deployment migration

Claude was right that scattered env alias chains are hard to audit.

Removing legacy aliases in the same cleanup would risk breaking local, staging, or Vercel deployments that still use them.

Fix applied: key-market env aliases are now grouped behind named constants/helpers instead of repeated inline fallback chains.

Verdict: scattered chains were a real maintainability issue; broad alias removal needs a separate deployment migration.
