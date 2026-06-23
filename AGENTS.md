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

## Direct Product Flow Reports

When reporting a product or onboarding flow, write the exact action chain first.

- Say what the user must do next: click, paste a public value, fund which public
  account, run which command, open which URL, or read which endpoint.
- Say the amount, network, account type, command, and endpoint in the same
  section when they decide whether the flow works.
- Do not lead with abstract labels like role, boundary, handoff, tightened,
  orchestration, or surface unless the next sentence names the concrete action.
- If a flow is not complete, say the missing action directly. Example:
  "Missing: create key market, create public board, create paper account."
- For IronClaw onboarding, never treat `Agent is active` as App discovery.
  Discovery requires a readable key market plus an active public board from the
  backend. If paper activity is claimed, also verify the paper account or paper
  leaderboard readback.
- For funding steps, state the public address/account and amount. Never ask for
  private keys, seed phrases, or raw signing material in chat, Workbench output,
  or logs.

## Public Onboarding Kit Sync

- Any change to `skills/clawhouse-creator-onboarding/SKILL.md` must be synced to
  `edwardchew97/clawhouse-onboarding-kit` in the same task before reporting
  completion.
- If the synced public `skills/clawhouse-creator-onboarding/SKILL.md` content
  changes, bump its frontmatter `version:` in the same repo and public kit sync.
  Use at least a patch version bump for wording, flow, guardrail, or completion
  template changes; do not leave the version unchanged after a content change.
- Also sync related public onboarding files when changed: `agents/openai.yaml`
  and reset/runtime docs referenced by the public manifest or prompt.
- Prefer `bun run onboarding-kit:sync -- --publish --verify` for public kit
  syncs. Run it without `--publish` first for a dry-run diff. The script clones
  or updates `edwardchew97/clawhouse-onboarding-kit`, copies the allowlisted
  public files, validates manifest hashes and raw URL allowlists, commits only
  with `--publish`, and verifies raw GitHub URLs only with `--verify`.
- Verification must include reading the public raw URL:
  `https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/clawhouse-creator-onboarding/SKILL.md`.
- Final reports for onboarding skill changes must state the public kit commit or
  explain why the sync could not be completed.

## Main Checkout and Worktree Discipline

- Branch model: keep long-lived branches `dev`, `staging`, and `main`. `dev` is the current integration/progress branch, `staging` is the pre-production branch, and `main` is the production/default GitHub branch.
- Treat the local main checkout on `dev` as the clean integration view, not as a scratchpad. The repo root at `/Users/Edward/Documents/clawhouse` should normally stay checked out on `dev` so JY can inspect current progress locally.
- The repo root at `/Users/Edward/Documents/clawhouse` is the protected local integration checkout. It is a readback/sync surface for current progress, not a production surface. It must stay clean during active work; if `git status --short` shows changes there before a task starts, stop before adding more work and either report the dirt or resolve it with explicit approval.
- Do not perform active implementation, product writing, proof generation, experiments, branch work, or scratch work in the main checkout. All active work must happen in a dedicated task worktree. Manual git worktrees should live under `.worktrees/<branch-or-task-name>`; Codex app-managed worktrees under `/Users/Edward/.codex/worktrees/*/clawhouse` are also allowed when created by Codex handoff/fork tools.
- Promotion order is `dev -> staging -> main`. Feature branches/worktrees merge into `dev`; `staging` and `main` should update only through an explicit promotion/release step approved by JY.
- Default completion path: after Codex finishes a code-backed or docs-backed task, runs the relevant local verification, and has no known blocker, Codex should create a PR and merge it directly into `dev` without waiting for JY to verify first. JY verifies completed work from `dev`; do not stop at an unmerged PR unless JY explicitly asks for review-before-merge, the verification fails, credentials/tooling are unavailable, or the change targets `staging`/`main`.
- The local main checkout must not push to `dev`. When JY says to merge work into `dev`, do the merge from the dedicated worktree/workspace: update that workspace against `origin/dev`, resolve any merge conflicts there, run the relevant verification there, then push the resulting branch state directly to remote `dev`.
- After remote `dev` has been updated from a workspace, update the local main checkout only by fast-forward pulling `dev` from GitHub. Do not check out feature branches, merge/rebase feature branches, cherry-pick, commit, resolve conflicts, or push from the local main checkout unless JY explicitly orders that repo-hygiene exception.
- Before creating or modifying source files, docs, `truth/` files, tests, scripts, generated artifacts, proof files, or new product artifacts, first check whether the current checkout is the main repo checkout.
- If a task requires writing files and the current checkout is the main repo checkout, create or switch to a dedicated git worktree and task branch before editing, unless JY explicitly says to edit the main checkout directly.
- Create manual ClawHouse worktrees inside this repo at `.worktrees/<branch-or-task-name>`; do not create them beside this repo in its parent directory or in any other external directory. If using Codex thread handoff/fork tools, use the tool-created app-managed worktree and report that path.
- Ensure `.worktrees/` is ignored before creating a nested worktree. Move existing ClawHouse worktrees with `git worktree move` instead of copying directories by hand.
- If the main checkout is already dirty before a task starts, do not add more edits there. Either report the existing dirty files and ask/confirm the cleanup direction, or create a new worktree from clean `dev` / `origin/dev` and do the task there.
- Allowed main-checkout exceptions: read-only inspection; `git status`, `git diff`, verification, and cleanup audit; tiny repo hygiene changes explicitly requested by JY; fast-forwarding `dev` after an approved PR merge; and explicit branch-promotion work from `dev` to `staging` or `main`.
- Name task branches by Linear issue key when one exists, otherwise by a short purpose. Keep one worktree/branch per code-backed issue or task unless JY explicitly approves a shared branch or stacked PR plan.
- Do not leave untracked draft files in the main checkout. Temporary artifacts belong under ignored paths such as `work/` or `artifacts/`; source/product artifacts must belong to a branch and PR.
- Final reports for writing tasks must state the worktree path, branch name, PR link or reason no PR was made, and any remaining dirty/untracked files.

## Worktree Closeout Gate

- Every task worktree must end with an explicit cleanup decision: removed, retained for a named reason, or handed off to another active thread/owner.
- After a PR is merged, closed, or otherwise absorbed into `origin/dev`, verify the branch before cleanup with `git fetch --prune origin`, `git status --short`, and `git cherry -v origin/dev <branch>`.
- If the worktree is clean and `git cherry` shows no `+` commits, remove the task worktree and delete the local branch. If the remote feature branch still exists and its PR is merged, delete that remote branch too.
- If the worktree is dirty or `git cherry` shows `+` commits, do not delete it silently. Report the dirty files or unique commits, the worktree path, and the proposed next action.
- For Codex app-managed worktrees under `/Users/Edward/.codex/worktrees/*/clawhouse`, do not remove the filesystem checkout directly unless the owning thread has been archived, handed off, or explicitly cleared for deletion.
- Prefer merge commits for multi-lane, audit-heavy, or provenance-sensitive PRs where the Git graph should show the branch converging back into `dev`. Use squash merge only for small PRs with noisy WIP commits, and only if the source worktree/branch is cleaned up immediately after merge.

## Acceptance Workbench Coverage

- For every code-backed feature, bug fix, or behavior change, update `apps/acceptance-workbench/flows.json`, the Workbench UI, or the Workbench runner whenever the changed behavior can be verified through a real request, script, or readback flow.
- Workbench coverage must be PM-verifiable: inputs stay editable, steps run only when JY clicks Send or Open Debug Thread, and outputs must come from the real local/API/contract path rather than simulated success data.
- When a code change is already covered by an existing Workbench flow, final reports must name the existing flow/step used for verification.
- When Workbench coverage is not added for a code change, final reports must explicitly state why, such as internal-only code, no PM-visible behavior, already-covered behavior, or unavailable external credentials/infrastructure.
- Do not add Workbench flows for documentation-only changes unless JY explicitly asks for a docs acceptance path.

## Imported Claude Cowork project instructions

## ClawHouse Project Source Of Truth

Before changing product scope, implementation scope, or docs, read:

- `truth/season-0-scope.md`
- `truth/season-0-creator-onboarding.md`
- `truth/agent-trading-scope.md`
- `truth/agent-board-ledger-scope.md`

## Truth Document Source And Change Log

Every new or modified document under `truth/` must record provenance in the file
itself.

- Add a `## Source` section near the top of each new `truth/` document.
- The source must include the Codex/Claude session ID that produced or promoted
  the accepted truth, plus the date and a short basis for the change.
- Add or maintain a `## Change Log` section near the bottom of each `truth/`
  document.
- Every later `truth/` edit must append a change-log entry with the date, the
  session ID, and a short summary of what changed.
- If multiple sessions change the same `truth/` file, keep every session's log
  entry. Do not collapse, overwrite, or remove prior session entries.
- If a legacy `truth/` file has no reliable source metadata, do not invent
  history. Add source/change-log entries only for the current edit and mark older
  provenance as unknown when needed.
- Final reports for tasks that touch `truth/` must name the touched truth files
  and the session ID(s) logged in them.

## Product Truth Routing

Do not duplicate accepted product direction, implementation scope, or stale-scope
warnings in `AGENTS.md`. Product truth belongs in `truth/`.

Use the truth files listed above as the source of accepted product decisions:

- Season 0 direction, key-market Scope V0, NEAR Intents boundaries, stale-scope
  warnings, and Original Vision status live in `truth/season-0-scope.md`.
- Creator onboarding and deployment authorization live in
  `truth/season-0-creator-onboarding.md`.
- Agent Trading scope lives in `truth/agent-trading-scope.md`.
- Agent Board Ledger observation, event timeline, wallet reconciliation,
  portfolio, PnL, DB, and read-access scope lives in
  `truth/agent-board-ledger-scope.md`.

If product direction changes, update the relevant `truth/` file with the required
`## Source` and `## Change Log` provenance instead of adding product summaries to
`AGENTS.md`.

Use TypeScript, Bun, Next.js, Vercel, and Rust/near-sdk where they fit this repo.
Do not use Python unless JY asks for it.
