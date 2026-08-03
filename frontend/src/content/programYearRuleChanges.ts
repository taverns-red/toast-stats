/**
 * Program-year rule-change log (#1400).
 *
 * Toastmasters changes the recognition rules between program years, and this
 * codebase already encodes several of those changes — but until now nothing
 * told a *reader*. A district leader comparing 2025-26 to 2026-27 education
 * numbers had no way to know the goals were not like-for-like.
 *
 * Rendered by `/methodology` §10; each entry is deep-linkable as
 * `/methodology#<id>` so a chart, card or tooltip can point at the exact rule
 * that makes two years incomparable.
 */

/** One TI rule change, in the program year it took effect. */
export interface ProgramYearRuleChange {
  /**
   * Stable anchor id — the deep-link target (`/methodology#<id>`). Prefixed
   * with its own program year so a shared link is self-describing. Treat as
   * a public URL: never rename one, only add.
   */
  id: string
  /** The program year the change took effect, "YYYY-YYYY". */
  programYear: string
  /** One-line headline of what changed. */
  title: string
  /** The metric(s) a reader watches move because of this. */
  affects: string
  /** What Toastmasters changed — the rule, not the column name. */
  whatChanged: string
  /** Why it matters when comparing this year against the one before. */
  comparability: string
  /** Tracking issues that landed the change here. */
  issues: number[]
  /**
   * Repo-relative paths of the code that implements the change.
   *
   * Not decoration: the drift guard
   * (`frontend/src/__tests__/guards/programYearRuleChangeLog.test.ts`) reads
   * these to decide which files are *claimed* by the log, and fails when a
   * rule-bearing file or a program year appears in the code with no entry
   * here. See that file's header for the full drift-protection decision.
   */
  sources: string[]
}

/** Newest program year first; within a year, most reader-visible first. */
export const PROGRAM_YEAR_RULE_CHANGES: readonly ProgramYearRuleChange[] = []

/** One program year with its changes, newest year first. */
export interface ProgramYearRuleChangeGroup {
  programYear: string
  changes: ProgramYearRuleChange[]
}

/**
 * Group the log by program year, preserving the declared order (which is
 * already newest-first — the data module is the single ordering authority so
 * the page cannot re-sort it into disagreement with the guard).
 */
export const ruleChangesByProgramYear = (): ProgramYearRuleChangeGroup[] => {
  const groups: ProgramYearRuleChangeGroup[] = []
  for (const change of PROGRAM_YEAR_RULE_CHANGES) {
    const last = groups[groups.length - 1]
    if (last && last.programYear === change.programYear) {
      last.changes.push(change)
    } else {
      groups.push({ programYear: change.programYear, changes: [change] })
    }
  }
  return groups
}

/**
 * Every entry anchor id — the Methodology page whitelists these so a
 * hand-edited `#bogus` fragment can never drive an expand/scroll
 * (same chokepoint rule as the section ids, Lesson 144).
 */
export const ruleChangeAnchorIds = (): ReadonlySet<string> =>
  new Set(PROGRAM_YEAR_RULE_CHANGES.map(c => c.id))
