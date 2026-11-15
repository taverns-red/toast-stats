/**
 * CI Gate — check names (#1216, #2607).
 *
 * `main`'s ruleset requires ONE status check, `CI Gate`, because every real
 * CI workflow is path-filtered or conditional. Since #2607 the gate is the
 * last job of `ci.yml` and decides from the run's own `needs` results; the
 * decision logic is in `ciGateNeeds.ts`. This module keeps only the names
 * other guards pin:
 *
 *   - the job names `ci.yml` / `docs.yml` report as check runs;
 *   - the aggregator's own name, which is the required-check context in
 *     `.github/rulesets/main.json`.
 */

/** Job names in `ci.yml` that a code-touching PR must see green. */
export const CI_CHECKS = [
  'Quality Gates',
  'Test Suite',
  'Build Applications',
] as const

/** The docs job name (in `ci.yml` on PRs, `docs.yml` on push to main). */
export const DOCS_CHECK = 'Docs Gate'

/** The aggregator's own job name — the single required check on `main`. */
export const GATE_CHECK = 'CI Gate'
