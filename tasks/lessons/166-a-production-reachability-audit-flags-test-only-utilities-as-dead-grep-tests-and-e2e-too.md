---
id: '166'
category: lesson
tags: [frontend, refactor, scope, tests, verification, dead-code]
auto_load: true
date: 2026-06-13
issues: [1114, 1194]
---

# Lesson 166 — A "production-reachability" dead-code audit flags test-only utilities as dead; grep tests AND e2e before deleting

**Date:** 2026-06-13
**Issue:** #1114 (epic #1194 Sprint 4 — docs/hygiene debt)
**PR:** _(record on merge)_

## What happened

The audit (§8) listed six frontend modules as unreachable, grouping three
("`useGradientValidation` + `gradientValidationUtils` + `contrastCalculator`
reference only each other") under the qualifier **"zero consumers in
pages/components/contexts/services/App/main."** That qualifier is a
_production_ import-graph scope — it silently excludes `__tests__/` and
`e2e/`. Re-confirming each file per [[137-an-audits-false-confidence-list-is-a-per-file-hypothesis-reconfirm-before-deleting]]
and grepping the _whole_ repo for each export's shape per
[[119-when-removing-a-bandaid-grep-for-its-shape-not-just-its-named-site]]:

- `contrastCalculator.ts` (600 lines) — imported by **10 active accessibility
  test suites** (`calculateContrastRatio`). Live test utility, NOT dead.
- `touchTargetUtils.ts` (74 lines) — imported by `e2e/touch-targets.smoke.ts`
  (the dual-engine Playwright 44px tripwire). Live e2e dependency, NOT dead.

Both were over-flagged. Deleting them would have (a) broken 10 suites, an R1
violation, or (b) destroyed real accessibility coverage. ~674 of the audit's
"~1,600 dead lines" were live. Only the genuinely-unreachable hooks/demos +
`extractVisitData` (~935 lines + tests) were removed; the two utilities were
kept, and the one mixed test file (`touchTargets.test.ts`, which tested both
the dead hook and the live `isInteractiveElement`) was repointed to import the
kept util directly, preserving its coverage.

## The transferable principle

**A dead-code audit scoped to the _production_ import graph
("no consumer in pages/components/services/…") will classify test-only and
e2e-only utilities as dead — but a function consumed solely by the test or
Playwright harness is live infrastructure, not dead code.** "Unreachable from
production" and "unreachable from anything" are different predicates; deleting
on the first breaks the second. Before deleting any module a
production-reachability audit names, grep `__tests__/`, `*.test.*`, AND `e2e/`
for its exports. A hit there means: keep the util, and if a dead _wrapper_
(here, an unreachable React hook) is the only thing standing between the util
and production, delete the wrapper + its hook-specific tests while repointing
the util's real tests to import it directly.

## How to apply

- For each file on a "dead/unreachable" list, run the importer grep across the
  ENTIRE repo (src + `__tests__` + `e2e` + `scripts` + `.github/workflows`),
  not just the layer the audit scoped to. Zero hits _anywhere_ = delete; hits
  only in tests/e2e = live test infra, keep.
- Distinguish the dead _wrapper_ from its live _helper_: an unreachable hook
  (`useTouchTarget`) can sit on top of a live pure util (`touchTargetUtils`).
  Delete the wrapper, keep the helper, and re-anchor the helper's tests to the
  helper's own module so coverage survives the wrapper's removal.
- Re-state the audit's headline number as a hypothesis: "~1,600 lines" was the
  union of dead + over-flagged; report the re-confirmed dead figure in the PR.

## Related

- [[137-an-audits-false-confidence-list-is-a-per-file-hypothesis-reconfirm-before-deleting]]
  — the parent principle (audit list = per-file hypothesis); this is its
  dead-code-deletion variant, where the over-flag is "test-only = dead."
- [[119-when-removing-a-bandaid-grep-for-its-shape-not-just-its-named-site]]
  — grep the shape repo-wide; here the shape sweep is what surfaced the e2e
  consumer the production-scoped audit missed.
- `tasks/rules.md` R8 (audit the entire read+write path when deleting) — the
  test/e2e harness IS part of the read path.
