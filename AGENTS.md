Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them. Don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it. Don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## Main Checkout and Worktree Discipline

- Treat the main checkout on `dev` as the clean integration view, not as a scratchpad. Until `dev` exists for this repo, treat the repo root checkout as the protected integration view.
- The repo root at `/Users/Edward/Documents/clawhouse` is the main checkout. It must stay clean during active work; if `git status --short` shows changes there before a task starts, stop before adding more work and either report the dirt or resolve it with explicit approval.
- Do not perform active implementation, product writing, proof generation, experiments, branch work, or scratch work in the main checkout. All active work must happen in a dedicated task worktree. Manual git worktrees should live under `.worktrees/<branch-or-task-name>`; Codex app-managed worktrees under `/Users/Edward/.codex/worktrees/*/clawhouse` are also allowed when created by Codex handoff/fork tools.
- The main checkout may only update by syncing the integration branch from GitHub, preferably by fast-forward pull. Do not check out feature branches, merge/rebase feature branches, cherry-pick, commit, or push feature work from the main checkout unless JY explicitly orders that repo-hygiene exception.
- Before creating or modifying source files, docs, `truth/` files, tests, scripts, generated artifacts, proof files, or new product artifacts, first check whether the current checkout is the main repo checkout.
- If a task requires writing files and the current checkout is the main repo checkout, create or switch to a dedicated git worktree and task branch before editing, unless JY explicitly says to edit the main checkout directly.
- Create manual ClawHouse worktrees inside this repo at `.worktrees/<branch-or-task-name>`; do not create them beside this repo in its parent directory or in any other external directory. If using Codex thread handoff/fork tools, use the tool-created app-managed worktree and report that path.
- Ensure `.worktrees/` is ignored before creating a nested worktree. Move existing ClawHouse worktrees with `git worktree move` instead of copying directories by hand.
- If the main checkout is already dirty before a task starts, do not add more edits there. Either report the existing dirty files and ask/confirm the cleanup direction, or create a new worktree from clean `dev` / `origin/dev` and do the task there.
- Allowed main-checkout exceptions: read-only inspection; `git status`, `git diff`, verification, and cleanup audit; tiny repo hygiene changes explicitly requested by JY; and fast-forwarding `dev` after an approved PR merge.
- Name task branches by Linear issue key when one exists, otherwise by a short purpose. Keep one worktree/branch per code-backed issue or task unless JY explicitly approves a shared branch or stacked PR plan.
- Do not leave untracked draft files in the main checkout. Temporary artifacts belong under ignored paths such as `work/` or `artifacts/`; source/product artifacts must belong to a branch and PR.
- Final reports for writing tasks must state the worktree path, branch name, PR link or reason no PR was made, and any remaining dirty/untracked files.

## Imported Claude Cowork project instructions

## ClawHouse Project Source Of Truth

Before changing product scope, implementation scope, or docs, read:

- `truth/season-0-scope.md`
- `truth/season-0-creator-onboarding.md`
- `references/original-vision.md`
- `references/scope-v0.md`

Accepted truth lives in `truth/`. Files in `references/` are context only unless
JY explicitly promotes them to truth.

## Current Product Direction

ClawHouse Season 0 is a short-term, viral consumer finance game inspired by the
Original Vision: users discover curated trading agents, buy and sell agent keys,
join holder-facing surfaces, and share proof/receipt-style moments.

Season 0 is curated and permissioned. It is not permissionless agent creation.
Users start as players, holders, copiers, and followers. Agent creation and
deployment run through ClawHouse-controlled approval and backend flows.

## Current Scope V0

The first build slice is the NEAR agent key market:

- Agent key market creation.
- Friend.tech-style bonding curve pricing.
- Buy key by attaching NEAR.
- Sell key back to the contract reserve.
- Local scripts for create, quote, buy, sell, and read state.

There is no LP pool for key trading in Scope V0. The contract itself holds the
reserve and prices keys through the bonding curve.

Out of scope for the first contract slice:

- Key NFTs.
- Referral systems.
- Private rooms.
- Copy trading execution.
- Profit sharing.
- Perps, leverage, liquidation, or funding-rate mechanics.
- Full agent autonomy or permissionless agent deployment.

## Stale Scope To Avoid

Do not revive the older arena/PVE/three-venue/Hyperliquid proof-league docs or
UX unless JY explicitly reopens that direction.

NEAR Intents should be treated as spot/cross-chain swap, funding, and payment
rails. Do not assume NEAR Intents natively provide perps, order books, funding
rates, or liquidation.

Use TypeScript, Bun, Next.js, Vercel, and Rust/near-sdk where they fit this repo.
Do not use Python unless JY asks for it.
