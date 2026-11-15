import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CI_CHECKS, DOCS_CHECK, GATE_CHECK } from '../ciGate'
import { NON_CODE_GLOBS } from '../changedFilesGate'
import { findJobNames, findPathFilterGlobs } from '../ciConfigGuard'

// Resolve the repo root from this file, not process.cwd() (Lesson 082).
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const workflow = (f: string) =>
  readFileSync(join(repoRoot, '.github', 'workflows', f), 'utf8')
const ruleset = JSON.parse(
  readFileSync(join(repoRoot, '.github', 'rulesets', 'main.json'), 'utf8')
)

describe('drift guards — the classifier must match the live path filters', () => {
  it('ci.yml paths-ignore matches the declared non-code glob set, on every trigger', () => {
    const blocks = findPathFilterGlobs(workflow('ci.yml'), 'paths-ignore')
    // push only: pull_request has no filter since the gate moved in (#2607)
    expect(blocks).toHaveLength(1)
    for (const globs of blocks) expect(globs).toEqual([...NON_CODE_GLOBS])
  })

  it('docs.yml paths is the exact mirror image, on every trigger', () => {
    const blocks = findPathFilterGlobs(workflow('docs.yml'), 'paths')
    expect(blocks).toHaveLength(1)
    for (const globs of blocks) expect(globs).toEqual([...NON_CODE_GLOBS])
  })

  it('the aggregator runs on every PR: ci.yml has no pull_request path filter', () => {
    // A path-filtered required check is the deadlock this whole design avoids:
    // it would sit "Expected" forever on any PR outside its globs. ci.yml's
    // only filter is the push one (asserted above), so the gate job always
    // exists on a PR head (#2607).
    const src = workflow('ci.yml')
    const pr = src.slice(src.indexOf('  pull_request:'))
    const prBlock = pr.slice(0, pr.indexOf('  workflow_call:'))
    expect(findPathFilterGlobs(prBlock, 'paths')).toEqual([])
    expect(findPathFilterGlobs(prBlock, 'paths-ignore')).toEqual([])
  })

  it('every check name the gate can expect is a real job name', () => {
    const ciJobs = findJobNames(workflow('ci.yml'))
    for (const name of CI_CHECKS) expect(ciJobs).toContain(name)
    expect(findJobNames(workflow('docs.yml'))).toContain(DOCS_CHECK)
    expect(ciJobs).toContain(GATE_CHECK)
  })
})

describe('findPathFilterGlobs / findJobNames sentinels', () => {
  it('fires on a known-bad path filter added to the aggregator', () => {
    const bad = [
      'on:',
      '  pull_request:',
      '    paths:',
      "      - 'src/**'",
    ].join('\n')
    expect(findPathFilterGlobs(bad, 'paths')).toEqual([['src/**']])
  })

  it('does not confuse paths-ignore for paths', () => {
    const src = ['  paths-ignore:', "    - '**/*.md'"].join('\n')
    expect(findPathFilterGlobs(src, 'paths')).toEqual([])
    expect(findPathFilterGlobs(src, 'paths-ignore')).toEqual([['**/*.md']])
  })

  it('ends a block at the next key and skips interleaved comments', () => {
    const src = [
      '  pull_request:',
      '    paths:',
      '      # a comment inside the block',
      "      - 'docs/**'",
      '    branches: [main]',
      "      - 'not-a-glob'",
    ].join('\n')
    expect(findPathFilterGlobs(src, 'paths')).toEqual([['docs/**']])
  })

  it('reads job names but not step names', () => {
    const src = [
      'jobs:',
      '  gate:',
      '    name: CI Gate',
      '    steps:',
      '      - name: Checkout code',
    ].join('\n')
    expect(findJobNames(src)).toEqual(['CI Gate'])
  })
})

describe('.github/rulesets/main.json — the checked-in target protection', () => {
  const statusRule = ruleset.rules.find(
    (r: { type: string }) => r.type === 'required_status_checks'
  )

  it('requires the aggregator and ONLY the aggregator', () => {
    expect(statusRule).toBeDefined()
    expect(
      statusRule.parameters.required_status_checks.map(
        (c: { context: string }) => c.context
      )
    ).toEqual([GATE_CHECK])
  })

  it('never requires a path-filtered check directly (that is the deadlock)', () => {
    const contexts: string[] = statusRule.parameters.required_status_checks.map(
      (c: { context: string }) => c.context
    )
    for (const name of [...CI_CHECKS, DOCS_CHECK])
      expect(contexts).not.toContain(name)
  })

  it('keeps the protections the live ruleset already has', () => {
    const types = ruleset.rules.map((r: { type: string }) => r.type)
    expect(types).toContain('deletion')
    expect(types).toContain('non_fast_forward')
    expect(ruleset.conditions.ref_name.include).toEqual(['~DEFAULT_BRANCH'])
    expect(ruleset.target).toBe('branch')
  })
})

// #2204: retargeting a stacked PR to main fires only `pull_request: edited`
// (payload `changes.base.ref.from` / `changes.base.sha.from`). The checks the
// gate requires must run on that event, and nothing else about an edit may
// run them (a body edit would otherwise re-run the 15-minute suite).
describe('retarget wiring — a base change runs the required checks (#2204)', () => {
  const RUN_ON_BASE_CHANGE =
    "if: github.event.action != 'edited' || github.event.changes.base"

  it('ci.yml listens to pull_request edited', () => {
    expect(workflow('ci.yml')).toMatch(
      /pull_request:\n\s+branches: \[main\]\n\s+types: \[opened, synchronize, reopened, edited\]/
    )
  })

  it('ci.yml runs its root job only on a non-edit or a base change', () => {
    // Every other gated job `needs:` changes (directly or via quality-gates),
    // so they skip with it; the gate job itself still runs for the title check.
    expect(workflow('ci.yml')).toContain(
      `  changes:\n    name: Changes\n    ${RUN_ON_BASE_CHANGE}\n`
    )
  })
})
