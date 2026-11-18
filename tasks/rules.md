# Engineering Rules

<!-- Always loaded: read this completely before every task. At most 20 active rules (alwaysLoadedContext.test.ts). -->
<!-- A rule earns its place by naming the test, hook or guard that enforces it, or by being dangerous enough to need no guard. -->
<!-- R-numbers are cited from CLAUDE.md and code comments: never renumber. A retired rule keeps a one-line stub. -->
<!-- Lessons are archived in tasks/lessons/archive/ (reference only, not loaded by default). Add a rule here only when a test, guard or hook can't cover the recurrence. -->

## Never do these

**R1 — Never bypass failing tests.**
`--no-verify`, `--skip-tests`, commenting out or skipping tests, and pinning an expectation to match a bug are all forbidden. Fix red tests before adding code. _Enforced by:_ `.husky/pre-commit`, `.husky/pre-push`, CI Quality Gates.

**R2 — Never assume data exists on the ephemeral runner.**
GitHub Actions runners start empty. Sync every input from GCS first (snapshots, time-series, club-trends). "It works locally" does not count.

**R3 — Never infer context a parent already has.**
Pass program year, date range and filter state down as props. Never re-derive them from API response data in a child: the first data point's date is not the current year.

**R4 — Never log to stdout in a CLI.**
`console.log()` contaminates the JSON that `| tee | jq` expects. Log with `console.error()`; stdout is for structured data only.

## Before you change things

**R5 — Retired, see `tasks/lessons/archive/`.** ("Read the last 5 lessons"; replaced by this short rule set, #2950.)

**R6 — Trace the real call graph before refactoring.**
An issue can overstate the problem. Check actual overlap, not similar names, before consolidating across modules.

**R7 — Inventory existing fields before designing new backend work.**
Grep the existing types first. Pre-computed fields are often already served and typed, just not wired into the UI.

**R8 — When deleting a service, audit its whole write AND read path.**
`grep -r "ServiceName" .` including `.github/workflows/`. Removing a reader doesn't remove the writer, and a removed gate can leave a hidden second gate reading the same config.

## Patterns proven here

**R9 — Multi-run aggregation needs a GCS-backed store, not history re-loading.**
Sync store from GCS, upsert today's data, save, push back. Reference: `ClubTrendsStore`, `TimeSeriesIndexWriter`.

**R10 — Override cross-cutting styling at CSS level, not per component.**
Dark mode and brand tokens go under `[data-theme='dark']`. Tailwind opacity variants (`-80`, `-70`) bake in `rgba()` and need their own override. _Enforced by:_ the dark-mode contrast tests and `legacyPaletteGuard.test.ts`.

**R11 — Insert into existing filter pipelines, don't replace them.**
`original → filtered → searchFiltered → sorted`: a new filter is a new step.

**R12 — Retired, see `tasks/lessons/archive/`.** (Batching same-breakpoint CSS fixes; it overlaps the red/green/refactor loop in CLAUDE.md.)

## Automation, shell and monorepo

**R13 — End every trap-wired cleanup function with `return 0` (or `:`).**
Bash uses an `EXIT` trap's last return value as the script's exit code, so a trailing false conditional turns a clean `exit 0` into 1.

**R14 — Don't trust a command's exit code inside a `pipefail` predicate.**
`screen -ls` exits 1 even when sessions exist, so `screen -ls | grep -q …` always reports "not found". Absorb with `|| true` or test the case you care about.

**R15 — When two pieces of state must agree before automation acts, require both and write the strongest last.**
Tick the epic checkbox (weak, revertible) first; close the issue (strong) last; have the consumer require both.

**R16 — After touching `packages/*/src/`, run `npm run build:<package>` before tests or pre-push.**
The frontend imports workspace packages from gitignored `dist/`. CI rebuilds clean; the local pre-push hook doesn't, so stale `dist/` passes locally and breaks fresh pulls.

**R17 — Every conditional in an automated prompt or script states the false case.**
"Do X if Y" must also say what happens when Y is false, even if that is "do nothing".

**R18 — Retired, see `tasks/lessons/archive/`.** (Scheduling cadence vs forward progress for periodic automation; no guard enforces it.)

**R19 — Branch a long-lived worktree from the fetched remote tip.**
`git fetch`, branch from `origin/main`, and diff `origin/main..HEAD` before opening the PR. A stale base silently reverts intervening work.

**R20 — A partitioned test suite needs an exhaustiveness guard sourced from the tool itself.**
Assert projects are disjoint and exhaustive with `vitest list --json`, not a hand-rolled glob walk. _Enforced by:_ `npm run test:projects:check` (`frontend/scripts/check-test-projects.mjs`).

**R21 — Retired, see `tasks/lessons/archive/`.** (Flake-detection layer, removed in #1263.)

**R22 — A unit test must not full-page-mount.**
Page mounts belong in `src/pages/__tests__/` or `src/__tests__/integration/` (or `*.integration.test.tsx`). _Enforced by:_ `npm run test:no-page-mounts:check`.

## Data contracts

**R23 — Key per-snapshot fetches on the snapshot date, never the as-of `sourceCsvDate`.**
They are equal mid-month and diverge for about three weeks each month-end close, so the bug passes every test and then blanks the UI. Use `effectiveDate`; the program year comes from the snapshot's logical date. _Enforced by:_ `no-snapshot-date-cast.test.ts`, `snapshotDate.brand.sentinel.test.ts`.

**R24 — A strict CDN contract makes an additive field a breaking change.**
A `.strict()` schema rejects the new key in readers already deployed. Release the accepting schema first, confirm it is live, then let the pipeline write the field. Breaking changes follow ADR 0019 (`db-breaking-approved` is Ron's alone). _Enforced by:_ `scripts/lib/cdnSchemaCanary.ts` and the CDN schema canary workflow.

## Tripwires not in CLAUDE.md

- `AwardsRaceSection` (landing `/`) is fed by `useCompetitiveAwards`, a separate query. Reserve its slot with a height-matched skeleton; rendering `null` until data lands shifts the page ~286px (CLS 0.198).
- Commit types recognised by release-please: `feat, fix, refactor, perf, docs, test, harden, cutover, deps, ci, build` (+ hidden `chore`). Any other type (`ops:`, `audit:`) ships but loses its changelog entry. Type dependency and tooling migrations as `build(...)`; keep `cutover` for platform moves.
