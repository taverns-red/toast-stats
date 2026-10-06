/**
 * Coverage-denominator exhaustiveness guard (#1536) — R20 applied to coverage.
 *
 * For every npm workspace, asserts that each git-tracked source file the
 * workspace's own vitest coverage config keeps in scope actually appears in
 * the provider's report (`<workspace>/coverage/coverage-final.json`). A file
 * outside the denominator has 0% coverage that counts as 100% — this names it.
 *
 * Consumes an EXISTING full-suite coverage run; it never runs tests itself.
 * Run it only after full-suite coverage (a filtered subset run legitimately
 * omits files — Lesson 135):
 *
 *   npm run test:coverage && npm run test:coverage:denominator-check
 *
 * Exclusions are read from each workspace's vitest config through vitest's
 * own resolution — add a glob to `coverage.exclude` and it is honoured here
 * with no edit to this script.
 *
 * Exit codes:
 *   0 — every workspace's denominator is exhaustive
 *   1 — a tracked source file is missing from a coverage report, or a
 *       workspace has no coverage-final.json (coverage not run / no json reporter)
 *
 * All output goes to stderr (R4).
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  findMissingFromDenominator,
  expectedInDenominator,
  formatDenominatorReport,
  hasRuntimeCode,
  isInDeclaredDenominator,
  isSourceCandidate,
  reportedFiles,
  resolveCoverageGlobs,
  type WorkspaceResult,
} from './lib/coverageDenominator'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function workspaces(): string[] {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'))
  return pkg.workspaces as string[]
}

function trackedFiles(workspaceRoot: string): string[] {
  return execFileSync('git', ['ls-files', '--', 'src'], {
    cwd: workspaceRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
}

async function checkWorkspace(workspace: string): Promise<WorkspaceResult> {
  const root = join(REPO_ROOT, workspace)
  const finalPath = join(root, 'coverage', 'coverage-final.json')
  if (!existsSync(finalPath)) {
    throw new Error(
      `${workspace}: ${finalPath} not found — run full-suite coverage first (npm run test:coverage) with the json reporter enabled`
    )
  }
  const coverageFinal = JSON.parse(readFileSync(finalPath, 'utf8'))
  const globs = await resolveCoverageGlobs(root)
  const tracked = trackedFiles(root)
  // Runtime-code detection is async (vite's transformer); resolve it up front
  // for the in-scope candidates so the pure comparison stays synchronous.
  const runtime = new Set<string>()
  for (const file of tracked) {
    if (!isSourceCandidate(file) || !isInDeclaredDenominator(file, globs)) {
      continue
    }
    const source = readFileSync(join(root, file), 'utf8')
    if (await hasRuntimeCode(source, file)) runtime.add(file)
  }
  const input = {
    tracked,
    reported: reportedFiles(coverageFinal, root),
    globs,
    hasRuntimeCode: (file: string) => runtime.has(file),
  }
  return {
    workspace,
    expected: expectedInDenominator(input).length,
    missing: findMissingFromDenominator(input),
  }
}

async function main(): Promise<void> {
  const results: WorkspaceResult[] = []
  try {
    for (const ws of workspaces()) results.push(await checkWorkspace(ws))
  } catch (err) {
    console.error(`✗ ${(err as Error).message}`)
    process.exit(1)
  }

  console.error(formatDenominatorReport(results))

  const missing = results.reduce((n, r) => n + r.missing.length, 0)
  if (missing > 0) {
    console.error(
      `\n✗ ${missing} tracked source file(s) are outside the coverage denominator — they count as covered while being unmeasured. Make the provider report them (e.g. coverage.include), or declare an intentional exclusion in that workspace's coverage.exclude.`
    )
    process.exit(1)
  }
  process.exit(0)
}

// Only run when invoked as a script, not when imported by a test.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main()
}
