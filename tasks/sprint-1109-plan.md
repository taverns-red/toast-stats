# Sprint 3 (#1109) — Enforce the CI gates

Epic #1194. AC1 (required status checks on main) **deferred to #1216** per operator
decision (docs-PR deadlock risk to the autonomous runner). This sprint ships ACs 2–5.

## Scope (ACs 2–5)

- **AC2 — collector-cli in the PR gate.** `ci.yml` builds shared-contracts/analytics-core/
  mcp-server and typechecks only the frontend; collector-cli is never built or typechecked
  in PR CI (its type errors first surface in the scheduled pipeline). Add `build:collector-cli`
  - a collector-cli zero-error typecheck step to the `quality-gates` job.
- **AC3 — dead `develop` trigger.** `ci.yml` `on.push.branches: [develop]` (no such branch)
  → `[main]` (post-merge CI on main); `on.pull_request.branches: [main, develop]` → `[main]`.
- **AC4 — pin Node once.** `.nvmrc` = `22` as the single source of truth; `engines.node`
  on root + frontend; every workflow `setup-node` reads `node-version-file: .nvmrc`
  (drop the per-workflow `NODE_VERSION: '22'` env + inline literals).
- **AC5 — lint ratchet.** frontend `--max-warnings 500` → `60` (48 actual); add caps to
  package workspaces: collector-cli `5` (3 actual), analytics-core/shared-contracts/
  mcp-server `0` (clean).

## TDD — drift guard (mirrors workflowBooleanInputGuard, L161/L082)

`scripts/lib/ciConfigGuard.ts` (pure fns) + `__tests__/ciConfigGuard.test.ts`, run in CI via
`test:scripts`. Each predicate paired with a known-bad sentinel snippet (L082 — assert the
guard FIRES, not just that the repo is currently clean):

1. `findDevelopBranchRefs` — no workflow references a `develop` branch (AC3).
2. `findLiteralNodeVersions` — no `setup-node` uses a literal `node-version:`; all use
   `node-version-file` (AC4, single-pin drift guard).
3. `.nvmrc` exists and its major matches root `engines.node` (AC4).
4. Every workspace lint script carries `--max-warnings`; frontend cap ≤ 60 (AC5).
5. `ci.yml` builds AND typechecks collector-cli (AC2).

Red: test fails against current state. Green: apply the config changes. Refactor → /simplify →
review → push → PR → CI → preview note (no `frontend/**` diff ⇒ no preview; code-proof via the
guard suite per the runner prompt).

## Lessons in play

- L150 — CI enumerates workspaces one-by-one; a package missing from a gate is silently untested.
- L161 — pair a workflow fix with a repo-sweep drift guard + known-bad sentinel.
- L082 — assert behaviour (guard fires on bad input), not mere config presence.
- R20/R21 — exhaustiveness guard sourced from the artifacts themselves.
