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
  workflowRunsInFlight,
  type ObservedCheck,
  type ObservedWorkflowRun,
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

  it('ignores a skipped run of a check that also has a green run (#2204)', () => {
    // A body-only `pull_request: edited` event schedules ci.yml/docs.yml again
    // with every job skipped by its `if:` (only a base change runs them). That
    // adds a second, skipped run of the same name on the same head SHA. The
    // green run already proved this SHA, so the skip must not fail the gate.
    const v = evaluateChecks(
      [...CI_CHECKS],
      [...allGreen(CI_CHECKS), ...CI_CHECKS.map(n => completed(n, 'skipped'))]
    )
    expect(v.state).toBe('pass')
  })

  it('still fails a check whose only run is skipped, even beside a green one (#2204)', () => {
    const v = evaluateChecks(
      [...CI_CHECKS],
      [
        completed('Quality Gates', 'success'),
        completed('Quality Gates', 'skipped'),
        completed('Test Suite', 'skipped'),
        completed('Build Applications', 'success'),
      ]
    )
    expect(v.state).toBe('fail')
    expect(v.failed).toEqual([{ name: 'Test Suite', conclusion: 'skipped' }])
  })

  it('waits on a skipped-only check while another run on the head is in flight (#2219)', () => {
    // #2212: a no-op `edited` CI run (all jobs skipped) finished before the
    // real CI run had created Test Suite / Build Applications. Skipped-only is
    // not a verdict yet — the in-flight run may still report the real check.
    const v = evaluateChecks(
      [...CI_CHECKS],
      [
        completed('Quality Gates', 'skipped'),
        completed('Test Suite', 'skipped'),
        completed('Build Applications', 'skipped'),
      ],
      { runsInFlight: true }
    )
    expect(v.state).toBe('pending')
    expect(v.failed).toEqual([])
    expect(v.pending).toEqual([...CI_CHECKS])
    expect(isDeadlineFailure(v, false)).toBe(false)
    // ...but never forever: the existing deadline still converts it to a fail.
    expect(isDeadlineFailure(v, true)).toBe(true)
  })

  it('still fails a skipped-only check once every run on the head completed (#2219)', () => {
    const v = evaluateChecks(
      [...CI_CHECKS],
      [
        completed('Quality Gates', 'success'),
        completed('Test Suite', 'skipped'),
        completed('Build Applications', 'success'),
      ],
      { runsInFlight: false }
    )
    expect(v.state).toBe('fail')
    expect(v.failed).toEqual([{ name: 'Test Suite', conclusion: 'skipped' }])
  })

  it('an in-flight run does not soften a real failure (#2219)', () => {
    const v = evaluateChecks(
      [...CI_CHECKS],
      [
        completed('Quality Gates', 'success'),
        completed('Test Suite', 'skipped'),
        completed('Test Suite', 'failure'),
        completed('Build Applications', 'success'),
      ],
      { runsInFlight: true }
    )
    expect(v.state).toBe('fail')
    expect(v.failed).toEqual([{ name: 'Test Suite', conclusion: 'failure' }])
  })

  it('a failure still fails even when another run of the name is green', () => {
    const v = evaluateChecks(
      [...CI_CHECKS],
      [...allGreen(CI_CHECKS), completed('Test Suite', 'failure')]
    )
    expect(v.state).toBe('fail')
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

// Real shape of GET /repos/{repo}/actions/runs?head_sha=… items, trimmed to
// the fields the gate reads (observed on #2212's head 5a7c3fa, 2026-10-20).
const wfRun = (
  id: number,
  name: string,
  status: string
): ObservedWorkflowRun => ({ id, name, status })

describe('workflowRunsInFlight — is another run on the head still going? (#2219)', () => {
  it('is true while a non-gate workflow run is queued or in progress', () => {
    expect(
      workflowRunsInFlight(
        [
          wfRun(39513092034, 'CI', 'completed'),
          wfRun(39513094743, 'CI', 'in_progress'),
          wfRun(39513094797, 'CI Gate', 'in_progress'),
        ],
        39513094797
      )
    ).toBe(true)
    expect(workflowRunsInFlight([wfRun(1, 'Docs', 'queued')], 2)).toBe(true)
  })

  it('ignores the gate itself and any other CI Gate run', () => {
    // The gate is always in progress while it polls, and a superseded gate
    // run never produces a required check.
    expect(
      workflowRunsInFlight(
        [
          wfRun(39513092034, 'CI', 'completed'),
          wfRun(39513094743, 'CI', 'completed'),
          wfRun(39513092089, 'CI Gate', 'in_progress'),
          wfRun(39513094797, 'CI Gate', 'in_progress'),
        ],
        39513094797
      )
    ).toBe(false)
  })

  it('is false when every run on the head has completed', () => {
    expect(workflowRunsInFlight([wfRun(1, 'CI', 'completed')], 2)).toBe(false)
    expect(workflowRunsInFlight([], 2)).toBe(false)
  })

  it('ci-gate.yml grants actions: read so the run listing is readable', () => {
    expect(workflow('ci-gate.yml')).toMatch(
      /permissions:\n(?:\s+\S+: \S+\n)*\s+actions: read\n/
    )
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

// #2204: retargeting a stacked PR to main fires only `pull_request: edited`
// (payload `changes.base.ref.from` / `changes.base.sha.from`). The checks the
// gate requires must run on that event, and nothing else about an edit may
// run them (a body edit would otherwise re-run the 15-minute suite).
describe('retarget wiring — a base change runs the required checks (#2204)', () => {
  const RUN_ON_BASE_CHANGE =
    "if: github.event.action != 'edited' || github.event.changes.base"

  it.each(['ci.yml', 'docs.yml', 'ci-gate.yml'])(
    '%s listens to pull_request edited',
    f => {
      expect(workflow(f)).toMatch(
        /pull_request:\n\s+branches: \[main\]\n\s+types: \[opened, synchronize, reopened, edited\]/
      )
    }
  )

  it('ci.yml runs its root job only on a non-edit or a base change', () => {
    // Every other ci.yml job `needs:` quality-gates, so they skip with it.
    expect(workflow('ci.yml')).toContain(
      `  quality-gates:\n    name: Quality Gates\n    ${RUN_ON_BASE_CHANGE}\n`
    )
  })

  it('docs.yml runs Docs Gate only on a non-edit or a base change', () => {
    expect(workflow('docs.yml')).toContain(
      `    name: Docs Gate\n    ${RUN_ON_BASE_CHANGE}\n`
    )
  })

  it('a no-op edit of docs.yml cannot cancel an in-flight Docs Gate', () => {
    // cancel-in-progress would turn the real run `cancelled`, which fails the
    // gate. A skipped edit run gets its own group so it supersedes nothing.
    expect(workflow('docs.yml')).toContain(
      "group: docs-${{ github.workflow }}-${{ github.ref }}${{ github.event.action == 'edited' && !github.event.changes.base && format('-noop-{0}', github.run_id) || '' }}"
    )
  })
})
