/**
 * Coverage-denominator exhaustiveness guard — Pure Functions (#1536).
 *
 * R20 applied to coverage inclusion. A source file that is absent from the
 * coverage provider's report has 0% coverage that silently counts as 100%:
 * the vitest 5 migration (#1529/#1532) revealed vitest 4 had been omitting a
 * shared-contracts file from the denominator for months, gating nothing.
 *
 * The guard compares, per workspace:
 *   - EXPECTED: git-tracked JS/TS files under `src/` that the workspace's own
 *     resolved vitest coverage config keeps in the denominator (declared
 *     `coverage.include` / `coverage.exclude`, plus vitest's hard-coded
 *     exclusions such as test files and config files) — read through
 *     `resolveConfig` from `vitest/node`, never restated by hand; and
 *   - REPORTED: the files in `coverage/coverage-final.json`, the provider's
 *     own resolution of what it measured.
 * Every EXPECTED file missing from REPORTED is named and fails the gate.
 *
 * A file whose TypeScript emit is empty (a type-only module) has no executable
 * code and therefore nothing to contribute to the denominator; vitest never
 * loads it, so it is not flagged. vitest's own transformer decides that, not a
 * hand-maintained list.
 *
 * The IO entrypoint lives in scripts/check-coverage-denominator.ts.
 */

import { relative, sep } from 'node:path'
import picomatch from 'picomatch'
import { transformWithOxc } from 'vite'

/** Resolved coverage globs, as vitest's coverage provider applies them. */
export interface CoverageGlobs {
  /** `coverage.include` — undefined means "every file not excluded". */
  include?: string[]
  /** `coverage.exclude` after vitest's resolution (test + config files added). */
  exclude: string[]
}

/** Source directory convention shared by every workspace in this repo. */
const SOURCE_DIR = 'src/'
const CODE_EXTENSION = /\.(c|m)?[jt]sx?$/
const DECLARATION_FILE = /\.d\.(c|m)?ts$/

/** A JS/TS source file under `src/` (declaration files carry no code). */
export function isSourceCandidate(file: string): boolean {
  return (
    file.startsWith(SOURCE_DIR) &&
    CODE_EXTENSION.test(file) &&
    !DECLARATION_FILE.test(file)
  )
}

/**
 * Whether the declared coverage config keeps `file` (workspace-relative) in
 * the denominator. Mirrors vitest's `BaseCoverageProvider.isIncluded`:
 * picomatch with `dot: true`, exclude first, then include (default: all).
 */
export function isInDeclaredDenominator(
  file: string,
  globs: CoverageGlobs
): boolean {
  const { include, exclude } = globs
  if (exclude.length > 0 && picomatch(exclude, { dot: true })(file)) {
    return false
  }
  if (!include) return true
  return picomatch(include, { dot: true, ignore: exclude })(file)
}

/**
 * Whether a module has any executable code once its types are erased, using
 * the same transformer vitest applies before V8 measures it (vite's oxc). A
 * type-only module transforms to nothing (or a bare `export {}`).
 */
export async function hasRuntimeCode(
  source: string,
  fileName: string
): Promise<boolean> {
  const { code } = await transformWithOxc(source, fileName, {})
  return (
    code
      .replace(/export\s*\{\s*\};?/g, '')
      .replace(/\/\/.*$/gm, '')
      .trim().length > 0
  )
}

/** Workspace-relative, posix-separated paths of the files the provider reported. */
export function reportedFiles(
  coverageFinal: Record<string, unknown>,
  workspaceRoot: string
): Set<string> {
  return new Set(
    Object.keys(coverageFinal).map(abs =>
      relative(workspaceRoot, abs).split(sep).join('/')
    )
  )
}

export interface DenominatorInput {
  /** Workspace-relative git-tracked paths. */
  tracked: string[]
  /** Workspace-relative paths present in coverage-final.json. */
  reported: Set<string>
  globs: CoverageGlobs
  /** Whether a (workspace-relative) file has executable code. */
  hasRuntimeCode: (file: string) => boolean
}

/** The tracked source files the declared policy keeps in the denominator. */
export function expectedInDenominator(
  input: Omit<DenominatorInput, 'reported'>
): string[] {
  return input.tracked.filter(
    f =>
      isSourceCandidate(f) &&
      isInDeclaredDenominator(f, input.globs) &&
      input.hasRuntimeCode(f)
  )
}

/** Tracked source files the policy expects but the provider never reported. */
export function findMissingFromDenominator(input: DenominatorInput): string[] {
  return expectedInDenominator(input)
    .filter(f => !input.reported.has(f))
    .sort()
}

/**
 * Resolve a workspace's coverage globs through vitest's own config resolution
 * (the same path `vitest run --coverage` takes), so a glob added to a
 * workspace's `coverage.exclude` is honoured without editing this guard.
 */
export async function resolveCoverageGlobs(
  workspaceRoot: string
): Promise<CoverageGlobs> {
  const { resolveConfig } = await import('vitest/node')
  const resolved = await resolveConfig({
    root: workspaceRoot,
    coverage: { enabled: true },
  })
  const { include, exclude } = resolved.test?.coverage ?? {}
  return { include, exclude: exclude ?? [] }
}

export interface WorkspaceResult {
  workspace: string
  /** Number of tracked source files the policy keeps in the denominator. */
  expected: number
  missing: string[]
}

/** Human-readable report (stderr). */
export function formatDenominatorReport(results: WorkspaceResult[]): string {
  const lines = ['Coverage denominator check (#1536):']
  for (const r of results) {
    const mark = r.missing.length === 0 ? '✓' : '✗'
    lines.push(
      `  ${mark} ${r.workspace}: ${r.expected - r.missing.length}/${r.expected} tracked source files in the coverage report`
    )
    for (const f of r.missing) lines.push(`      missing: ${f}`)
  }
  return lines.join('\n')
}
