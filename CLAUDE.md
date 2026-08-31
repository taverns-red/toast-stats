# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Toastmasters District Statistics Visualizer — a data visualization platform for Toastmasters district performance metrics. Live at https://ts.taverns.red.

**Monorepo with npm workspaces:**

- `frontend/` — React 19 + TypeScript SPA (Vite 7, TailwindCSS 4, Recharts, TanStack Query)
- `packages/shared-contracts/` — Zod schemas + TypeScript types (ESM + CJS dual export)
- `packages/analytics-core/` — Analytics computation engine (~58K lines)
- `packages/collector-cli/` — Data scraping CLI (Commander, csv-parse, GCS)
- `packages/mcp-server/` — Read-only MCP server over the public snapshot CDN (`@taverns-red/toast-stats-mcp`, ADR-008)

## Commands

```bash
# Development
npm run dev:frontend              # Vite dev server on port 3000 (proxies /api to :5001)

# Build
npm run build:frontend            # TypeScript check + Vite build
npm run build:shared-contracts    # Build shared types (must build before frontend)
npm run build:analytics-core      # Build analytics engine

# Testing
npm run test                      # Run all workspace tests (vitest --run)
npm run test:frontend             # Frontend tests only
npm run test:collector-cli        # Collector CLI tests only
npm run test:analytics-core       # Analytics core tests only
npm run test:coverage             # All tests with coverage (55% threshold)
cd frontend && npx vitest --run src/__tests__/SomeTest.test.tsx  # Single test file

# Linting & Formatting
npm run lint                      # ESLint all workspaces (max 500 warnings)
npm run lint:yaml                 # Lint GitHub workflows and docs YAML
npm run format                    # Prettier write
npm run format:check              # Prettier check only

# Quality gate (runs typecheck + lint + yaml lint + format check + tests)
npm run quality:check

# Pre-commit hook (typecheck + lint + yaml lint)
npm run pre-commit
```

## Architecture

**Data flow:** Collector CLI scrapes Toastmasters dashboards → transforms + computes analytics → uploads to GCS as CSV/JSON snapshots → Frontend reads pre-computed snapshots from CDN via TanStack Query (5-min stale, 10-min GC).

**Frontend structure (`frontend/src/`):**

- `pages/` — 18 lazy-loaded page components across ~19 routes (`React.lazy` in `App.tsx`): DistrictsPage, DistrictDetailPage + routed subpages (Clubs/Divisions/Rankings/Trends/Analytics/Changes), DivisionPage, AreaPage, ClubDetailPage, RegionsPage, RegionPage, History/Methodology/Awards/McpPage, plus a root `errorElement` branded 404 (#1010)
- `components/` — UI components (tables, charts, cards, modals)
- `hooks/` — Custom hooks (`useDistrictAnalytics`, `useTimeSeries`, `usePaymentsTrend`, `useColumnFilters`, etc.)
- `services/` — CDN/API service layer (`cdn.ts`, `cdnTimeSeries.ts`)
- `contexts/` — Global state (ProgramYearContext, DarkModeContext)
- `utils/` — Utility functions (CSV export, DCP calculations, styling)
- `styles/` — Tailwind CSS layers + component CSS

**Styling:** Tailwind 4 with CSS layers. Dark mode via `[data-theme='dark']` CSS scope. Opacity variants (`text-tm-*-80`) bake in hardcoded rgba and must be overridden explicitly — they don't inherit CSS variable overrides.

**Deployment:** Frontend → Firebase Hosting. No backend server — data is pre-computed by the collector-cli pipeline into GCS (staging `toast-stats-data-staging` → gated promotion → prod `toast-stats-data-ca`) and served via Cloud CDN. CI via GitHub Actions.

## Engineering Rules (from `tasks/rules.md`)

Read `tasks/rules.md` completely before every task. Key rules:

- **R1** — Never bypass failing tests. No `--no-verify`, `--skip-tests`, assertion pinning, or commenting out tests.
- **R2** — GitHub Actions runners start empty. All data must be explicitly synced from GCS.
- **R3** — Pass program year/date/filters as props from parent. Never re-derive from API response data.
- **R4** — CLI logging: `console.error()` only (stderr). Stdout is for structured JSON output.
- **R5** — Read the last 5 entries in `tasks/lessons.md` before starting any task.
- **R6–R8** — Trace call graphs before refactoring; inventory existing fields before adding new ones; audit full read+write paths when deleting services.

## Active Tripwires

- District success/failure tracking lives in **one place** — `TransformService.transform()` (`packages/collector-cli`) loops over per-district `transformDistrictToDate` results and derives `districtsSucceeded`/`districtsFailed`/`districtsSkipped` by filtering that single `results[]` array. There is no second validation-failure path: the old `SnapshotBuilder.build()` two-path hazard died with the now-deleted backend (the name survives only in `DataTransformer.ts` comments). Changing district discovery touches only that one loop — don't reintroduce a parallel path.
- DCP goals are **independent**, not sequential. Use `clubPerformance` raw fields, never infer count as Goals 1-N.
- Chart `|| 1` range fallback causes y-axis inversion. Pad symmetrically when `range === 0`.
- `Path.join()` with raw user input = path traversal. Always call `validateDistrictId()` first.
- **Program year is resolved by data, not the calendar, at the fetch path (#1284).** TM's rollover lags July 1 — June's close stays live under the prior PY into late July while the new PY's dashboard 302-redirects to an error page (a 200 HTML body, so a successful fetch ≠ valid data). `resolveActiveProgramYear` probes the calendar PY, validates the districtsummary content (header must contain `DISTRICT`), and falls back to `getPriorProgramYear(...)`; it's self-healing. Resolve **once per run** in `CollectorOrchestrator.scrape()` and thread it — don't recompute `calculateProgramYear(date)` per fetch site (they'd disagree at the boundary). Keep `calculateProgramYear` calendar-pure (cache paths/history depend on it). Discovery goes through `collector-cli discover-districts`, not inline node.

### Test-infra contracts (flakiness epic #917 — don't unknowingly break)

<!-- The flake-DETECTION layer (per-PR job, nightly sentinel, detector script, R21)
was removed in #1263 (epic #1262) once its root causes — local-machine contention
and over-strict timeouts — were solved. The PREVENTION (no-page-mounts/R22) and
DISCIPLINE (quarantine/R1) guards below contain those root causes, so they stay. -->

- **Unit tests must not full-page-mount (R22).** `npm run test:no-page-mounts:check` fails if a unit-project test imports a `pages/*Page` / `<App>`. Page mounts → `src/pages/__tests__/` or `src/__tests__/integration/`.
- **Quarantine ≠ skip (R1).** `frontend/test-quarantine.json` is empty; an entry needs a reason + tracking issue and is loudly reported by `npm run test:quarantine:check`. Don't bump `testTimeout` to mask contention — root-cause it.

## Learning Artifacts

- `tasks/lessons/` — Per-file lessons (one discovery each, tagged frontmatter). `tasks/lessons/INDEX.md` is the always-loadable tag index (regenerate with `npm run lessons:index`).
- `tasks/rules.md` — Curated high-signal rules distilled from lessons. Read completely before each task.
- `docs/product-spec.md` — Shipped features, business rules, product decisions.

### Per-sprint relevant-lessons manifest (#650)

A sprint issue body **SHOULD** include a `## Relevant lessons` section naming the lessons whoever picks the work up must read first. Operator curation beats tag inference, so an explicit list wins. Format (one bullet per lesson; the trailing reason is optional but recommended):

```markdown
## Relevant lessons

- [Lesson 087](tasks/lessons/087-spawned-sessions-need-their-own-worktree-not-shared-checkout.md) — branch a long-lived worktree from origin/main, not the stale base
- [Lesson 092](tasks/lessons/092-workspace-package-dist-is-gitignored-and-not-auto-rebuilt.md) — rebuild workspace dist before tests
```

Only the strict `- [text](path)` (or `* [text](path)`) bullet form is recognized — a colon separator or a space before `(` is silently skipped. Validate a manifest with `scripts/relevant-lessons.sh <issue#>` (or `--stdin`): it prints each resolved path and exits non-zero if a listed lesson file is missing.

## Key Conventions

- **Prettier:** 80 chars, single quotes, no semicolons, trailing commas
- **TypeScript:** Strict mode, no implicit any. Zero TS errors required for CI.
- **Filter pipeline pattern:** `original → filtered → searchFiltered → sorted`. Add new filters as steps, don't replace existing ones (R11).
- **CSS pattern for cross-cutting concerns:** Override at CSS level (`[data-theme]`), not component level (R10).
- **GCS-backed store pattern:** Sync from GCS → upsert → save → push back. See `ClubTrendsStore` and `TimeSeriesIndexWriter` as reference implementations (R9).

## Brand (Red Taverns v1.0)

- **Source of truth:** [`taverns-red/ops:docs/brand/`](https://github.com/taverns-red/ops/blob/main/docs/brand/) ([ADR 0004, 2026-04-22](https://github.com/taverns-red/ops/blob/main/docs/strategy/decisions/0004-brand-v1-2026-04-22.md)). Public guide will live at `taverns.red/brand` once the portal migration ships.
- **Tokens file:** `frontend/src/styles/tokens/rt-brand-v1.css` — local copy-on-release of upstream `tokens.css`. **Do not hand-edit** — change upstream and re-sync. Imported from `frontend/src/index.css`.
- **Namespace:** `--rt-*` (e.g. `--rt-red`, `--rt-ink`, `--rt-paper`, `--rt-font-display`). Product accent for this app is `--rt-stats` (#D4873F, amber). Coexists with legacy `--color-tm-*` / `--loyal-*` / redesign.css tokens until Phase 2 chrome migration lands.
- **Fonts:** Space Grotesk (display), Inter (body), JetBrains Mono. Space Grotesk + Inter are preloaded from `frontend/index.html` alongside the legacy Montserrat / Source Sans 3 pair. **JetBrains Mono preload is intentionally deferred to Phase 2** — `var(--mono)` (the redesign-tokens `--mono`, NOT `--rt-font-mono`) already has 8 live consumers in `app-shell.css`. Preloading swaps the text from ui-monospace mid-render and regresses CLS from ~0.012 to ~0.199 (Lighthouse threshold is 0.1; caught on PR #595). Re-enable in the Phase 2 PR with metric-matched `size-adjust` fallbacks or self-hosted woff2. See [Lesson 81](tasks/lessons/081-phase-gated-deferral-tests-move-with-the-spec.md).
- **Phase 2 (chrome migration) is BLOCKED on the rename decision** ([`ops#37`](https://github.com/taverns-red/ops/issues/37) — Toast Stats → Tally). When that decides, the re-skin lands with the rename in one combined PR; the legacy font pair is dropped then. Until then, the brand tokens are available for new components but the existing chrome stays on legacy tokens.

## Workflow Protocol

### Before Starting Any Task

1. Read the last 5 entries in `tasks/lessons.md` (R5).
2. Read `tasks/rules.md` completely.
3. Create or identify a GitHub issue (`gh issue create` or `gh issue list`). All commits and PRs must reference the issue number.
4. Use `EnterPlanMode` for any task requiring >3 steps.
5. If root cause is unknown, run an experiment using `tasks/experiment_template.md` in a canary file first.

### Implementation Loop (TDD)

1. **Red** — Write/run a test that fails for the right reason → commit
2. **Green** — Write the minimal code to pass the test → commit
3. **Refactor** — Clean the code while tests stay green → commit
4. **Verify** — Run the full test suite to confirm zero regressions
5. Repeat. Never skip or combine steps.

### Commit Discipline

- Commit every 15–30 minutes of active work. Each commit = one logical change.
- Every commit message must reference the tracking issue (e.g., `feat: add validation (#42)`).
- Follow conventional commits. Never batch unrelated changes.

### Definition of Done

**Lightweight DoD** (≤1 file, no business logic/tests/API changes):

- No assertion pinning. All pre-existing tests pass. Codebase is releasable.

**Full DoD** (everything else):

- Failing test existed before the fix. Targeted tests now pass. No assertion pinning.
- All tests pass. Zero regressions. CI green. Live verification passes on the **PR preview channel** — the per-PR Firebase URL posted as a sticky comment by `pr-preview.yml` — **pre-merge, not prod**. (Prod deploys are decoupled from per-sprint verification.)
- Change is single-responsibility. Dead code and experiment files deleted.
- **Learning captured — only if there was one.** Not every sprint yields a transferable insight, and a "no new lesson" sprint is a valid outcome. When the sprint did surface something durable, file it by kind in `tasks/lessons/` with frontmatter: **principle** (→ `category: principle`, candidate for an R-rule), **lesson** (→ `category: lesson` + `tags:` for relevance matching), or **incident** (→ `category: incident` + `auto_load: false`, reference-only). A restated commit message is not a lesson — if you cannot name the transferable takeaway in one sentence, do not file one. Regenerate `tasks/lessons/INDEX.md` (`npm run lessons:index`) when you add a lesson.

### Hard Stop

If "Green" state cannot be reached in 3 iterations: revert all changes, document why the hypothesis failed, ask the user for architectural clarification.

## Specialized Agent Personas

Activate the relevant persona when work matches its trigger. Read the SKILL.md file at the listed path, then apply its framework throughout the task.

| Persona                | Skill File                                     | Trigger                                                                                                                    |
| ---------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Product Manager**    | `~/.gemini/skills/product-manager/SKILL.md`    | Sprint planning, feature design, scope decisions, product questions. Consult `docs/product-spec.md`.                       |
| **Software Architect** | `~/.gemini/skills/software-architect/SKILL.md` | Structural changes (≥3 modules), adding dependencies, designing subsystems, refactoring. Run blast radius analysis first.  |
| **Quality Engineer**   | `~/.gemini/skills/quality-engineer/SKILL.md`   | Flaky tests, test strategy decisions, coverage analysis, release quality gates. Establish baseline by running tests first. |
| **Incident Responder** | `~/.gemini/skills/incident-responder/SKILL.md` | Deploy failures, production bugs, pipeline failures, rollback decisions. Restore service before investigating root cause.  |
| **UX Designer**        | `~/.gemini/skills/ux-designer/SKILL.md`        | UI changes, CSS/styling, new screens, accessibility, responsive design. Verify at 375px, 768px, 1280px + dark mode.        |
