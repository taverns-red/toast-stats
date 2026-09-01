import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  CI_CHECKS,
  DOCS_CHECK,
  GATE_CHECK,
  describeVerdict,
  evaluateChecks,
  expectedChecks,
  isDeadlineFailure,
  type ObservedCheck,
} from '../ciGate'
import { NON_CODE_GLOBS } from '../changedFilesGate'
import { findJobNames, findPathFilterGlobs } from '../ciConfigGuard'

// Resolve the repo root from this file, not process.cwd() (Lesson 082).
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const workflow = (f: string) =>
  readFileSync(join(repoRoot, '.github', 'workflows', f), 'utf8')
const ruleset = JSON.parse(
  readFileSync(join(repoRoot, '.github', 'rulesets', 'main.json'), 'utf8')
)

const completed = (name: string, conclusion: string): ObservedCheck => ({
  name,
  status: 'completed',
  conclusion,
})
const running = (name: string): ObservedCheck => ({
  name,
  status: 'in_progress',
  conclusion: null,
})
const allGreen = (names: readonly string[]) =>
  names.map(n => completed(n, 'success'))

describe('expectedChecks — expectation comes from the diff, not the checks', () => {
  it('a docs-only diff expects the docs gate and nothing from ci.yml', () => {
    expect(
      expectedChecks(['tasks/lessons/foo.md', 'docs/product-spec.md'])
    ).toEqual([DOCS_CHECK])
  })

  it('a code-only diff expects the ci.yml jobs and not the docs gate', () => {
    expect(expectedChecks(['frontend/src/App.tsx'])).toEqual([...CI_CHECKS])
  })

  it('a mixed diff expects both workflows (paths-ignore is ALL, paths is ANY)', () => {
    expect(expectedChecks(['frontend/src/App.tsx', 'README.md'])).toEqual([
      ...CI_CHECKS,
      DOCS_CHECK,
    ])
  })

  it('an empty diff is not a free pass — it expects the full ci.yml set', () => {
    expect(expectedChecks([])).toEqual([...CI_CHECKS])
  })

  it('never expects its own check (that would self-deadlock)', () => {
    expect(expectedChecks(['frontend/src/App.tsx'])).not.toContain(GATE_CHECK)
    expect(expectedChecks(['README.md'])).not.toContain(GATE_CHECK)
  })
})

describe('evaluateChecks — fail closed on absence (#1484)', () => {
  it('passes when every expected check is present and green', () => {
    const v = evaluateChecks([...CI_CHECKS], allGreen(CI_CHECKS))
    expect(v.state).toBe('pass')
    expect(v.satisfied).toEqual([...CI_CHECKS])
  })

  it('FAILS a code PR whose checks were never scheduled at all — the #1484 case', () => {
    // PR #1484: zero check-suites registered, mergeState CLEAN, mergeable.
    const v = evaluateChecks([...CI_CHECKS], [])
    expect(v.missing).toEqual([...CI_CHECKS])
    expect(v.state).not.toBe('pass')
    expect(isDeadlineFailure(v, true)).toBe(true)
  })

  it('does NOT fail a docs-only PR for the absent ci.yml checks (legitimately skipped)', () => {
    // Same observed reality as the case above — no ci.yml checks anywhere —
    // but the diff says they were never supposed to run.
    const v = evaluateChecks(expectedChecks(['tasks/lessons/x.md']), [
      completed(DOCS_CHECK, 'success'),
    ])
    expect(v.state).toBe('pass')
    expect(v.missing).toEqual([])
  })

  it('treats an expected-but-absent check as pending while the clock runs', () => {
    const v = evaluateChecks(
      [...CI_CHECKS],
      [completed('Quality Gates', 'success')]
    )
    expect(v.state).toBe('pending')
    expect(isDeadlineFailure(v, false)).toBe(false)
    expect(isDeadlineFailure(v, true)).toBe(true)
  })

  it('treats a running check as pending, not as a pass', () => {
    const v = evaluateChecks(
      [...CI_CHECKS],
      [
        completed('Quality Gates', 'success'),
        running('Test Suite'),
        running('Build Applications'),
      ]
    )
    expect(v.state).toBe('pending')
    expect(v.pending).toEqual(['Test Suite', 'Build Applications'])
  })

  it('fails an expected job that reports conclusion=skipped', () => {
    // A job-level `if:` skip, or a job skipped because `needs:` went red.
    // Skipped counts as success for GitHub's own required checks — that is
    // exactly the masquerade this gate exists to stop.
    const v = evaluateChecks(
      [...CI_CHECKS],
      [
        completed('Quality Gates', 'success'),
        completed('Test Suite', 'success'),
        completed('Build Applications', 'skipped'),
      ]
    )
    expect(v.state).toBe('fail')
    expect(v.failed).toEqual([
      { name: 'Build Applications', conclusion: 'skipped' },
    ])
  })

  it.each(['failure', 'cancelled', 'timed_out', 'action_required', 'neutral'])(
    'fails terminally on conclusion=%s without waiting out the clock',
    conclusion => {
      const v = evaluateChecks(
        [...CI_CHECKS],
        [completed('Quality Gates', conclusion), running('Test Suite')]
      )
      expect(v.state).toBe('fail')
      expect(isDeadlineFailure(v, false)).toBe(true)
    }
  )

  it('fails closed when the expectation set is empty (classifier bug)', () => {
    expect(evaluateChecks([], allGreen(CI_CHECKS)).state).toBe('fail')
  })

  it('ignores unexpected extra checks (pr-preview, lighthouse, trivy)', () => {
    const v = evaluateChecks(
      [...CI_CHECKS],
      [
        ...allGreen(CI_CHECKS),
        completed('Security Scan', 'failure'),
        completed('Deploy Preview', 'cancelled'),
      ]
    )
    expect(v.state).toBe('pass')
  })

  it('only shouts NOT SCHEDULED on the terminal line, not every poll', () => {
    // Mid-poll a `needs:`-blocked job is legitimately absent; shouting about it
    // every 20s trains the reader to ignore the one line that matters.
    const v = evaluateChecks([...CI_CHECKS], [])
    expect(describeVerdict(v)).toContain('not-yet-reported')
    expect(describeVerdict(v)).not.toContain('NOT SCHEDULED')
    expect(describeVerdict(v, true)).toContain('NOT SCHEDULED')
  })
})

describe('drift guards — the classifier must match the live path filters', () => {
  it('ci.yml paths-ignore matches the declared non-code glob set, on every trigger', () => {
    const blocks = findPathFilterGlobs(workflow('ci.yml'), 'paths-ignore')
    expect(blocks.length).toBeGreaterThanOrEqual(2) // push + pull_request
    for (const globs of blocks) expect(globs).toEqual([...NON_CODE_GLOBS])
  })

  it('docs.yml paths is the exact mirror image, on every trigger', () => {
    const blocks = findPathFilterGlobs(workflow('docs.yml'), 'paths')
    expect(blocks.length).toBeGreaterThanOrEqual(2)
    for (const globs of blocks) expect(globs).toEqual([...NON_CODE_GLOBS])
  })

  it('the aggregator workflow carries NO path filter — it must always run', () => {
    // A path-filtered required check is the deadlock this whole design avoids:
    // it would sit "Expected" forever on any PR outside its globs.
    const src = workflow('ci-gate.yml')
    expect(findPathFilterGlobs(src, 'paths')).toEqual([])
    expect(findPathFilterGlobs(src, 'paths-ignore')).toEqual([])
  })

  it('every check name the gate can expect is a real job name', () => {
    const ciJobs = findJobNames(workflow('ci.yml'))
    for (const name of CI_CHECKS) expect(ciJobs).toContain(name)
    expect(findJobNames(workflow('docs.yml'))).toContain(DOCS_CHECK)
    expect(findJobNames(workflow('ci-gate.yml'))).toContain(GATE_CHECK)
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
