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
 *   - The path filters `ci.yml` and `docs.yml` are declared to mirror actually
 *     do, and the `CI Gate` aggregator carries no path filter of its own so it
 *     can never be the thing that goes missing (#1216).
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

/**
 * Every `paths:` / `paths-ignore:` block in a workflow, as one glob array per
 * occurrence (a workflow declares them once per trigger, so `ci.yml` yields
 * two identical arrays — for `push` and `pull_request`).
 *
 * Line-scanned rather than YAML-parsed, matching the rest of this module and
 * avoiding a new runtime dependency. A block is the key line followed by
 * `- <glob>` items at deeper indentation; comments and blank lines inside the
 * block are skipped, and the first non-item, non-comment line ends it.
 */
export function findPathFilterGlobs(
  yamlSource: string,
  key: 'paths' | 'paths-ignore'
): string[][] {
  const lines = yamlSource.split('\n')
  const blocks: string[][] = []
  const keyRe = new RegExp(`^(\\s*)${key}:\\s*(#.*)?$`)

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(keyRe)
    if (!m) continue
    const keyIndent = m[1].length
    const globs: string[] = []
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j]
      if (line.trim() === '' || line.trim().startsWith('#')) continue
      const item = line.match(/^(\s*)-\s+(.*)$/)
      if (!item || item[1].length <= keyIndent) break
      globs.push(item[2].trim().replace(/^['"]|['"]$/g, ''))
    }
    blocks.push(globs)
  }
  return blocks
}

/**
 * The `name:` of every job in a workflow — the strings GitHub reports as check
 * run names, and therefore the only strings a ruleset's required-check
 * contexts or the `CI Gate` aggregator may reference.
 *
 * Job-level `name:` sits at exactly four spaces in this repo's workflows; a
 * step name is `      - name:` (six spaces and a dash), so it cannot match.
 */
export function findJobNames(yamlSource: string): string[] {
  const out: string[] = []
  for (const line of yamlSource.split('\n')) {
    const m = line.match(/^ {4}name:\s*(.+?)\s*$/)
    if (m) out.push(m[1].replace(/^['"]|['"]$/g, ''))
  }
  return out
}
