/**
 * agent-cli ci-wait (#2418). Fixture: the real `gh pr checks 2416 --json`
 * output — 13 checks incl. 4 skipped CI jobs, one cancelled preview deploy
 * and two `CodeQL` checks that differ only by workflow.
 */
import { describe, it, expect } from 'vitest'
import {
  ciWait,
  ciWaitExitCode,
  formatCiWait,
  summarizeChecks,
  type PrCheck,
} from '../agentCli/ciWait.js'
import { fakeRunner, fixture, ok, fail } from './agentCliFakes.js'

const CHECKS = JSON.parse(fixture('pr-checks-2416.json')) as PrCheck[]
const REPO = 'taverns-red/toast-stats'

function check(over: Partial<PrCheck>): PrCheck {
  return {
    name: 'Test Suite',
    workflow: 'CI',
    state: 'SUCCESS',
    bucket: 'pass',
    link: 'https://github.com/x/y/actions/runs/1/job/2',
    startedAt: '2026-10-30T13:00:00Z',
    completedAt: '2026-10-30T13:05:00Z',
    ...over,
  }
}

/** A clock that advances by whatever the code sleeps. */
function fakeClock() {
  let t = 0
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms
    },
  }
}

describe('summarizeChecks', () => {
  it('counts the real PR 2416 checks by bucket', () => {
    const s = summarizeChecks(CHECKS)
    expect(s).toMatchObject({
      total: 13,
      passed: 8,
      failed: 0,
      pending: 0,
      skipped: 4,
      cancelled: 1,
      done: true,
    })
    expect(s.cancelledChecks.map(c => c.name)).toEqual([
      'Deploy preview channel',
    ])
  })

  it('keeps only the latest attempt of a re-run check', () => {
    const s = summarizeChecks([
      check({
        bucket: 'fail',
        state: 'FAILURE',
        startedAt: '2026-10-30T13:00:00Z',
      }),
      check({ bucket: 'pass', startedAt: '2026-10-30T14:00:00Z' }),
    ])
    expect(s).toMatchObject({ total: 1, passed: 1, failed: 0 })
  })

  it('is not done while anything is pending, or before any check exists', () => {
    expect(
      summarizeChecks([check({ bucket: 'pending', state: 'IN_PROGRESS' })]).done
    ).toBe(false)
    expect(summarizeChecks([]).done).toBe(false)
  })
})

describe('ciWait', () => {
  it('polls until the checks finish and reports only the failures', async () => {
    const clock = fakeClock()
    const pending = [
      check({ bucket: 'pending', state: 'IN_PROGRESS' }),
      check({ name: 'Lint' }),
    ]
    const finished = [
      check({ bucket: 'fail', state: 'FAILURE', link: 'https://x/job/9' }),
      check({ name: 'Lint' }),
    ]
    const runner = fakeRunner([
      [
        /^gh pr checks 77 /,
        [
          // gh exits 8 while checks are pending and 1 when one failed, even with --json.
          fail('', 8, JSON.stringify(pending)),
          fail('HTTP 503: ServerBusy'),
          fail('', 1, JSON.stringify(finished)),
        ],
      ],
    ])
    const r = await ciWait(77, {
      repo: REPO,
      runner,
      intervalMs: 30_000,
      timeoutMs: 600_000,
      ...clock,
    })
    expect(r.outcome).toBe('fail')
    expect(r.summary.failures.map(f => f.name)).toEqual(['Test Suite'])
    expect(ciWaitExitCode(r)).toBe(1)
    const text = formatCiWait(r)
    expect(text).toContain('https://x/job/9')
    expect(text).not.toContain('Lint')
  })

  it('treats "no checks reported" as pending and times out with exit 2', async () => {
    const clock = fakeClock()
    const runner = fakeRunner([
      [/^gh pr checks 5 /, fail("no checks reported on the 'feat/x' branch")],
    ])
    const r = await ciWait(5, {
      repo: REPO,
      runner,
      intervalMs: 1000,
      timeoutMs: 3000,
      ...clock,
    })
    expect(r.outcome).toBe('pending')
    expect(r.timedOut).toBe(true)
    expect(ciWaitExitCode(r)).toBe(2)
  })

  it('fails on a cancelled check unless --allow-cancelled', async () => {
    const runner = fakeRunner([
      [/^gh pr checks 2416 /, ok(JSON.stringify(CHECKS))],
    ])
    const strict = await ciWait(2416, {
      repo: REPO,
      runner,
      once: true,
      ...fakeClock(),
    })
    expect(strict.outcome).toBe('fail')
    const lenient = await ciWait(2416, {
      repo: REPO,
      runner,
      once: true,
      allowCancelled: true,
      ...fakeClock(),
    })
    expect(lenient.outcome).toBe('pass')
    expect(ciWaitExitCode(lenient)).toBe(0)
  })

  it('stops at the first failure with --fail-fast', async () => {
    const runner = fakeRunner([
      [
        /^gh pr checks 8 /,
        ok(
          JSON.stringify([
            check({ bucket: 'fail', state: 'FAILURE' }),
            check({ name: 'B', bucket: 'pending' }),
          ])
        ),
      ],
    ])
    const r = await ciWait(8, {
      repo: REPO,
      runner,
      failFast: true,
      ...fakeClock(),
    })
    expect(r.outcome).toBe('fail')
    expect(runner.calls).toHaveLength(1)
  })
})

/**
 * #2485: the cloud-session proxy rejects GraphQL with a 403, so `gh pr
 * checks` never answers there. ci-wait falls back to REST: the PR's head
 * SHA, its check-runs (paginated — PR Preview alone has >35) and the
 * workflow runs that name each check suite. Fixtures: the real REST answers
 * for PR 2482 (54 check-runs, split into two pages of 30 + 24).
 */
describe('ciWait REST fallback when GraphQL is blocked (#2485)', () => {
  const GRAPHQL_403 =
    'HTTP 403: GitHub GraphQL is not available from Claude Code sessions; use the REST API (gh api repos/{owner}/{repo}/...). (https://api.github.com/graphql)'
  const SHA = 'b4cf07d293594e3243b6ee5c4175211e6d2a6a91'

  function restRunner(prChecks = fail(GRAPHQL_403)) {
    return fakeRunner([
      [/^gh pr checks 2482 /, prChecks],
      [
        /^gh api repos\/taverns-red\/toast-stats\/pulls\/2482$/,
        ok(fixture('pull-2482.json')),
      ],
      [
        new RegExp(`/commits/${SHA}/check-runs\\?per_page=100&page=1$`),
        ok(fixture('check-runs-2482-page1.json')),
      ],
      [
        new RegExp(`/commits/${SHA}/check-runs\\?per_page=100&page=2$`),
        ok(fixture('check-runs-2482-page2.json')),
      ],
      [
        new RegExp(`/actions/runs\\?head_sha=${SHA}&per_page=100&page=1$`),
        ok(fixture('actions-runs-2482.json')),
      ],
    ])
  }

  it('reads every page of check-runs over REST when gh pr checks gets a GraphQL 403', async () => {
    const runner = restRunner()
    const r = await ciWait(2482, {
      repo: REPO,
      runner,
      once: true,
      ...fakeClock(),
    })
    // 54 runs; re-runs of `lighthouse`, `PR Preview verdict` and `Deploy
    // preview channel` collapse to their newest attempt → 51.
    expect(r.summary).toMatchObject({
      total: 51,
      passed: 47,
      failed: 0,
      pending: 0,
      skipped: 0,
      cancelled: 4,
      done: true,
    })
    expect(r.summary.cancelledChecks.map(c => c.name).sort()).toEqual([
      'Deploy preview channel',
      'Lighthouse mobile (${{ matrix.route }})',
      'PR Preview verdict',
      'Smoke (${{ matrix.shard }})',
    ])
    const verdict = r.summary.cancelledChecks.find(
      c => c.name === 'PR Preview verdict'
    )
    expect(verdict).toMatchObject({
      workflow: 'PR Preview',
      state: 'CANCELLED',
      bucket: 'cancel',
    })
    expect(verdict?.link).toMatch(/\/actions\/runs\/\d+\/job\/\d+$/)
    expect(r.outcome).toBe('fail')
    expect(runner.calls.filter(c => c.includes('check-runs'))).toHaveLength(2)
  })

  it('also falls back on a GraphQL error without an HTTP 403', async () => {
    const r = await ciWait(2482, {
      repo: REPO,
      runner: restRunner(
        fail(
          'GraphQL: Resource not accessible by integration (repository.pullRequest)'
        )
      ),
      once: true,
      allowCancelled: true,
      ...fakeClock(),
    })
    expect(r.outcome).toBe('pass')
    expect(r.summary.total).toBe(51)
  })

  it('maps REST check-runs into the same buckets gh pr checks reports', async () => {
    const run = (name: string, status: string, conclusion: string | null) => ({
      name,
      status,
      conclusion,
      details_url: `https://github.com/x/y/actions/runs/1/job/${name}`,
      started_at: '2026-11-02T18:00:00Z',
      completed_at: conclusion ? '2026-11-02T18:05:00Z' : null,
      check_suite: { id: 7 },
      app: { slug: 'github-actions' },
    })
    const checkRuns = [
      run('ok', 'completed', 'success'),
      run('neutral', 'completed', 'neutral'),
      run('skip', 'completed', 'skipped'),
      run('bad', 'completed', 'failure'),
      run('slow', 'completed', 'timed_out'),
      run('act', 'completed', 'action_required'),
      run('stop', 'completed', 'cancelled'),
      run('busy', 'in_progress', null),
      run('wait', 'queued', null),
    ]
    const runner = fakeRunner([
      [/^gh pr checks 9 /, fail(GRAPHQL_403)],
      [/\/pulls\/9$/, ok(JSON.stringify({ head: { sha: 'abc' } }))],
      [
        /\/commits\/abc\/check-runs\?per_page=100&page=1$/,
        ok(JSON.stringify({ total_count: 9, check_runs: checkRuns })),
      ],
      [
        /\/actions\/runs\?head_sha=abc&per_page=100&page=1$/,
        ok(
          JSON.stringify({
            total_count: 1,
            workflow_runs: [{ name: 'CI', check_suite_id: 7 }],
          })
        ),
      ],
    ])
    const r = await ciWait(9, {
      repo: REPO,
      runner,
      once: true,
      ...fakeClock(),
    })
    const bucket = (b: string) =>
      [
        ...r.summary.failures,
        ...r.summary.cancelledChecks,
        ...r.summary.pendingChecks,
      ]
        .filter(c => c.bucket === b)
        .map(c => `${c.name}:${c.state}`)
        .sort()
    expect(r.summary).toMatchObject({
      total: 9,
      passed: 1,
      skipped: 2,
      failed: 3,
      cancelled: 1,
      pending: 2,
      done: false,
    })
    expect(bucket('fail')).toEqual([
      'act:ACTION_REQUIRED',
      'bad:FAILURE',
      'slow:TIMED_OUT',
    ])
    expect(bucket('pending')).toEqual(['busy:IN_PROGRESS', 'wait:QUEUED'])
    expect(r.summary.failures.every(c => c.workflow === 'CI')).toBe(true)
    expect(r.outcome).toBe('pending')
  })

  it('does not touch REST when gh pr checks answers', async () => {
    const runner = fakeRunner([
      [/^gh pr checks 2416 /, ok(JSON.stringify(CHECKS))],
    ])
    await ciWait(2416, { repo: REPO, runner, once: true, ...fakeClock() })
    expect(runner.calls.some(c => c.startsWith('gh api'))).toBe(false)
  })
})
