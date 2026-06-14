/**
 * CI Config Guard — Pure Functions (#1109)
 *
 * Drift guards for the "enforce the gates" sprint (epic #1194 Sprint 3). Each
 * predicate is paired in the test suite with a known-bad sentinel snippet
 * (Lesson 082: assert the guard FIRES on bad input, not merely that the repo
 * is currently clean; Lesson 161: pair a workflow fix with a repo-sweep drift
 * guard). Sourced from the artifacts themselves (R20/R21 — the partition is
 * exhaustive because it sweeps every workflow on disk).
 *
 * The invariants:
 *   - No workflow triggers off the non-existent `develop` branch (AC3).
 *   - Node is pinned ONCE: every `setup-node` reads `node-version-file:`,
 *     never a literal `node-version:` ('22' or an env expression) (AC4).
 *   - Every workspace lint script carries a `--max-warnings` cap (AC5).
 */

/** A location in a workflow file (1-based line + trimmed text). */
export interface WorkflowMatch {
  line: number
  text: string
}

/** Every line matching `pattern`, as 1-based {line, trimmed text} matches. */
function findMatchingLines(source: string, pattern: RegExp): WorkflowMatch[] {
  const out: WorkflowMatch[] = []
  source.split('\n').forEach((text, i) => {
    if (pattern.test(text)) out.push({ line: i + 1, text: text.trim() })
  })
  return out
}

/**
 * Find references to a `develop` branch (dead trigger). Matches `develop` as a
 * standalone word — `\bdevelop\b` does NOT match `development`/`developer`
 * because the trailing letter keeps the word boundary from landing after `p`.
 */
export function findDevelopBranchRefs(yamlSource: string): WorkflowMatch[] {
  return findMatchingLines(yamlSource, /\bdevelop\b/)
}

/**
 * Find `setup-node` literal version pins. The compliant form is
 * `node-version-file: '.nvmrc'` (the single pin); any `node-version:` key —
 * whether a literal `'22'` or an `${{ env.NODE_VERSION }}` expression — is a
 * second source of truth and a violation. `node-version-file:` does not match
 * because `-file` sits between `node-version` and the colon.
 */
export function findLiteralNodeVersions(yamlSource: string): WorkflowMatch[] {
  return findMatchingLines(yamlSource, /^\s*node-version:\s*\S/)
}

/**
 * Extract the integer `--max-warnings` cap from a lint script, or `null` if
 * the flag is absent (an uncapped lint — the AC5 gap).
 */
export function parseLintMaxWarnings(lintScript: string): number | null {
  const m = lintScript.match(/--max-warnings[=\s]+(\d+)/)
  return m ? Number(m[1]) : null
}

/**
 * The major version from `.nvmrc` content (trims whitespace + a leading `v`).
 */
export function nvmrcMajor(nvmrcContent: string): string {
  return nvmrcContent.trim().replace(/^v/, '').split('.')[0]
}
