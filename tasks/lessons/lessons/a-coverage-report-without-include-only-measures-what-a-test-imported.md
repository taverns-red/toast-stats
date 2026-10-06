---
date: 2026-10-06
tier: lesson
summary: Without coverage.include, vitest reports only files some test imported — an untested file leaves the denominator and counts as covered; set include and guard the denominator against the tracked file list
tags: [vitest, coverage, tests, ci, silent-failure]
---

# A coverage report without `include` only measures what a test imported

**Issue:** #1536 (coverage denominator exhaustiveness guard)

## What happened

vitest 4+ dropped `coverage.all`; with no `coverage.include`, the V8 provider
reports only the files that some test loaded. Every workspace here relied on
that default. A guard comparing `git ls-files src` (minus the excludes resolved
from each vitest config) against `coverage-final.json` found 54 runtime source
files outside the denominator: 44 in the frontend (whole components, hooks and
the design-token modules), the package barrels and `mcp-server/src/bin.ts`.
None of them failed a gate, because a file that is not in the report is not
counted at all. The frontend's measured line coverage was 85.9%. Counting every
file put it at 77.1%.

## How to apply

- A coverage percentage is only meaningful if its denominator matches the
  file set you think you are measuring. Set `coverage.include` explicitly
  (`src/**/*.ts`, not `src/**`: the bare glob pulls in JSON/CSV fixtures and
  the provider throws PARSE_ERRORs).
- Guard the denominator the R20 way: get the expected set from the tool's own
  resolution (`resolveConfig` from `vitest/node` returns the coverage excludes,
  test files included) and the actual set from the provider's report. Do not
  restate globs by hand.
- Type-only modules have no executable code and never appear in the report.
  Detect them with the transformer the runner itself uses (vite's
  `transformWithOxc` emits only `export {}`), not with a hand-kept list.
  The `typescript` package is not a safe choice for this: TS 7 has no JS API,
  and the root copy is a transitive typescript-eslint dependency.
