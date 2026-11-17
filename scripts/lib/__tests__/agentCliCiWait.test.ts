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
      [/^gh pr view 2416 /, ok('{"mergeStateStatus":"CLEAN"}')],
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
      // The merge state is not what these tests are about (#2905); the
      // recorded pull request has none, so say it is clean.
      [
        /^gh api repos\/taverns-red\/toast-stats\/pulls\/2482$/,
        ok(
          JSON.stringify({
            ...JSON.parse(fixture('pull-2482.json')),
            mergeable_state: 'clean',
          })
        ),
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

/**
 * #2905: green checks are not enough. After a PR title or body edit, a new
 * CI run starts whose gate is not yet in the check list, so ci-wait read only
 * the older green run and said PASS while GitHub still showed the PR BLOCKED
 * (PR #2904, 2026-11-17). The verdict now also needs mergeStateStatus to
 * allow a merge.
 */
describe('ciWait merge state (#2905)', () => {
  const GRAPHQL_403 =
    'HTTP 403: GitHub GraphQL is not available from Claude Code sessions; use the REST API'
  const GREEN = JSON.stringify([check({}), check({ name: 'Lint' })])
  const view = (mergeStateStatus: string) =>
    ok(JSON.stringify({ mergeStateStatus, headRefOid: 'abc123' }))

  it('keeps waiting while all checks are green but the PR is BLOCKED, then passes on CLEAN (#2904)', async () => {
    const clock = fakeClock()
    const sleeps: number[] = []
    const runner = fakeRunner([
      [/^gh pr checks 2904 /, ok(GREEN)],
      // Each confirmation reads the PR twice, around a re-read of the checks.
      [
        /^gh pr view 2904 /,
        [
          view('BLOCKED'),
          view('BLOCKED'),
          view('BLOCKED'),
          view('BLOCKED'),
          view('CLEAN'),
        ],
      ],
    ])
    const r = await ciWait(2904, {
      repo: REPO,
      runner,
      intervalMs: 60_000,
      timeoutMs: 600_000,
      now: clock.now,
      sleep: async ms => {
        sleeps.push(ms)
        await clock.sleep(ms)
      },
    })
    expect(r.outcome).toBe('pass')
    expect(r.polls).toBe(3)
    expect(sleeps).toEqual([60_000, 60_000])
    expect(r.mergeState).toBe('CLEAN')
  })

  it.each(['BLOCKED', 'BEHIND', 'UNKNOWN'])(
    'on timeout with %s, exits pending and names the merge state',
    async state => {
      const runner = fakeRunner([
        [/^gh pr checks 5 /, ok(GREEN)],
        [/^gh pr view 5 /, view(state)],
      ])
      const r = await ciWait(5, {
        repo: REPO,
        runner,
        intervalMs: 60_000,
        timeoutMs: 180_000,
        ...fakeClock(),
      })
      expect(r.outcome).toBe('pending')
      expect(r.timedOut).toBe(true)
      expect(ciWaitExitCode(r)).toBe(2)
      expect(formatCiWait(r)).toContain(state)
    }
  )

  it('fails at once on DIRTY (conflicts) and says so', async () => {
    const runner = fakeRunner([
      [/^gh pr checks 6 /, ok(GREEN)],
      [/^gh pr view 6 /, view('DIRTY')],
    ])
    const r = await ciWait(6, { repo: REPO, runner, ...fakeClock() })
    expect(r.outcome).toBe('fail')
    expect(ciWaitExitCode(r)).toBe(1)
    expect(r.polls).toBe(1)
    expect(formatCiWait(r)).toMatch(/conflict/i)
  })

  it('passes a draft PR whose checks are green (mergeStateStatus DRAFT)', async () => {
    const runner = fakeRunner([
      [/^gh pr checks 7 /, ok(GREEN)],
      [/^gh pr view 7 /, view('DRAFT')],
    ])
    const r = await ciWait(7, { repo: REPO, runner, ...fakeClock() })
    expect(r.outcome).toBe('pass')
    expect(r.mergeState).toBe('DRAFT')
  })

  it('judges a merged PR on its checks alone: GitHub reports its merge state as UNKNOWN', async () => {
    const runner = fakeRunner([
      [/^gh pr checks 12 /, ok(GREEN)],
      [
        /^gh pr view 12 /,
        ok(JSON.stringify({ mergeStateStatus: 'UNKNOWN', state: 'MERGED' })),
      ],
    ])
    const r = await ciWait(12, {
      repo: REPO,
      runner,
      once: true,
      ...fakeClock(),
    })
    expect(r.outcome).toBe('pass')
  })

  it('does the same over REST for a closed PR', async () => {
    const runner = fakeRunner([
      [/^gh pr checks /, fail(GRAPHQL_403)],
      [/^gh pr view /, fail(GRAPHQL_403)],
      [
        /\/pulls\/13$/,
        ok(
          JSON.stringify({
            head: { sha: 'abc' },
            state: 'closed',
            mergeable_state: 'unknown',
          })
        ),
      ],
      [
        /\/commits\/abc\/check-runs/,
        ok(
          JSON.stringify({
            total_count: 1,
            check_runs: [
              {
                name: 'T',
                status: 'completed',
                conclusion: 'success',
                details_url: 'https://x/1',
                started_at: '2026-11-17T10:00:00Z',
                completed_at: '2026-11-17T10:05:00Z',
                check_suite: { id: 7 },
              },
            ],
          })
        ),
      ],
      [
        /\/actions\/runs\?/,
        ok(JSON.stringify({ total_count: 0, workflow_runs: [] })),
      ],
    ])
    const r = await ciWait(13, {
      repo: REPO,
      runner,
      once: true,
      ...fakeClock(),
    })
    expect(r.outcome).toBe('pass')
  })

  it('does not read the merge state while a check is still failing', async () => {
    const runner = fakeRunner([
      [/^gh pr checks 8 /, ok(JSON.stringify([check({ bucket: 'fail' })]))],
    ])
    const r = await ciWait(8, { repo: REPO, runner, ...fakeClock() })
    expect(r.outcome).toBe('fail')
    expect(runner.calls.some(c => c.startsWith('gh pr view'))).toBe(false)
  })

  it('--once reports a BLOCKED PR as pending and shows the merge state in text and JSON', async () => {
    const runner = fakeRunner([
      [/^gh pr checks 9 /, ok(GREEN)],
      [/^gh pr view 9 /, view('BLOCKED')],
    ])
    const r = await ciWait(9, {
      repo: REPO,
      runner,
      once: true,
      ...fakeClock(),
    })
    expect(r.outcome).toBe('pending')
    expect(r.timedOut).toBe(false)
    expect(r.polls).toBe(1)
    expect(JSON.parse(JSON.stringify(r))).toMatchObject({
      mergeState: 'BLOCKED',
    })
    expect(formatCiWait(r)).toContain('BLOCKED')
  })

  describe('REST fallback maps mergeable_state', () => {
    function restRunner(mergeable_state: string) {
      return fakeRunner([
        [/^gh pr checks /, fail(GRAPHQL_403)],
        [/^gh pr view /, fail(GRAPHQL_403)],
        [
          /^gh api repos\/taverns-red\/toast-stats\/pulls\/\d+$/,
          ok(JSON.stringify({ head: { sha: 'abc' }, mergeable_state })),
        ],
        [
          /\/commits\/abc\/check-runs\?per_page=100&page=1$/,
          ok(
            JSON.stringify({
              total_count: 1,
              check_runs: [
                {
                  name: 'Test Suite',
                  status: 'completed',
                  conclusion: 'success',
                  details_url: 'https://x/job/1',
                  started_at: '2026-11-17T10:00:00Z',
                  completed_at: '2026-11-17T10:05:00Z',
                  check_suite: { id: 7 },
                },
              ],
            })
          ),
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
    }

    it.each([
      ['clean', 'pass', 'CLEAN'],
      ['draft', 'pass', 'DRAFT'],
      ['blocked', 'pending', 'BLOCKED'],
      ['behind', 'pending', 'BEHIND'],
      ['unknown', 'pending', 'UNKNOWN'],
      ['dirty', 'fail', 'DIRTY'],
    ])('%s -> %s', async (rest, outcome, state) => {
      const r = await ciWait(11, {
        repo: REPO,
        runner: restRunner(rest),
        once: true,
        ...fakeClock(),
      })
      expect(r.outcome).toBe(outcome)
      expect(r.mergeState).toBe(state)
    })
  })
})

/**
 * #2905 review: UNSTABLE waits, the head SHA must hold still across the
 * merge-state read, DRAFT passes but says it is not mergeable, and REST reads
 * the pull request once per poll.
 */
describe('ciWait merge state, review fixes (#2905)', () => {
  const GRAPHQL_403 =
    'HTTP 403: GitHub GraphQL is not available from Claude Code sessions; use the REST API'
  const GREEN = JSON.stringify([check({}), check({ name: 'Lint' })])
  const GREEN_WITH_CANCELLED = JSON.stringify([
    check({}),
    check({ name: 'Deploy', bucket: 'cancel', state: 'CANCELLED' }),
  ])
  const view = (mergeStateStatus: string, headRefOid = 'aaa') =>
    ok(JSON.stringify({ mergeStateStatus, headRefOid, state: 'OPEN' }))

  it('keeps waiting on UNSTABLE when nothing was cancelled', async () => {
    const runner = fakeRunner([
      [/^gh pr checks 21 /, ok(GREEN)],
      [/^gh pr view 21 /, view('UNSTABLE')],
    ])
    const r = await ciWait(21, {
      repo: REPO,
      runner,
      intervalMs: 60_000,
      timeoutMs: 180_000,
      ...fakeClock(),
    })
    expect(r.outcome).toBe('pending')
    expect(r.timedOut).toBe(true)
    expect(r.mergeState).toBe('UNSTABLE')
    expect(JSON.parse(JSON.stringify(r)).mergeable).toBe(false)
  })

  it('passes UNSTABLE only with --allow-cancelled and a cancelled check', async () => {
    const runner = fakeRunner([
      [/^gh pr checks 22 /, ok(GREEN_WITH_CANCELLED)],
      [/^gh pr view 22 /, view('UNSTABLE')],
    ])
    const r = await ciWait(22, {
      repo: REPO,
      runner,
      allowCancelled: true,
      once: true,
      ...fakeClock(),
    })
    expect(r.outcome).toBe('pass')
    expect(JSON.parse(JSON.stringify(r)).mergeable).toBe(true)
  })

  it('does not pass UNSTABLE with --allow-cancelled when nothing was cancelled', async () => {
    const runner = fakeRunner([
      [/^gh pr checks 23 /, ok(GREEN)],
      [/^gh pr view 23 /, view('UNSTABLE')],
    ])
    const r = await ciWait(23, {
      repo: REPO,
      runner,
      allowCancelled: true,
      once: true,
      ...fakeClock(),
    })
    expect(r.outcome).toBe('pending')
  })

  it('is not a pass when the head SHA moved between the checks and the merge state', async () => {
    const runner = fakeRunner([
      [/^gh pr checks 24 /, ok(GREEN)],
      // First read sees A, the read after the checks sees B.
      [/^gh pr view 24 /, [view('CLEAN', 'aaa'), view('CLEAN', 'bbb')]],
    ])
    const r = await ciWait(24, {
      repo: REPO,
      runner,
      once: true,
      ...fakeClock(),
    })
    expect(r.outcome).toBe('pending')
  })

  it('passes on the next poll once the head SHA holds still, and reports it', async () => {
    const runner = fakeRunner([
      [/^gh pr checks 25 /, ok(GREEN)],
      [/^gh pr view 25 /, [view('CLEAN', 'aaa'), view('CLEAN', 'bbb')]],
    ])
    const r = await ciWait(25, {
      repo: REPO,
      runner,
      intervalMs: 60_000,
      timeoutMs: 600_000,
      ...fakeClock(),
    })
    expect(r.outcome).toBe('pass')
    expect(r.polls).toBe(2)
    expect(JSON.parse(JSON.stringify(r)).headSha).toBe('bbb')
  })

  it('says a draft is not mergeable yet, in text and JSON, but still passes', async () => {
    const runner = fakeRunner([
      [/^gh pr checks 26 /, ok(GREEN)],
      [/^gh pr view 26 /, view('DRAFT')],
    ])
    const r = await ciWait(26, {
      repo: REPO,
      runner,
      once: true,
      ...fakeClock(),
    })
    expect(r.outcome).toBe('pass')
    expect(JSON.parse(JSON.stringify(r)).mergeable).toBe(false)
    expect(formatCiWait(r)).toContain('draft: not mergeable yet')
  })

  it.each(['CLEAN', 'HAS_HOOKS'])('%s is mergeable', async state => {
    const runner = fakeRunner([
      [/^gh pr checks 27 /, ok(GREEN)],
      [/^gh pr view 27 /, view(state)],
    ])
    const r = await ciWait(27, {
      repo: REPO,
      runner,
      once: true,
      ...fakeClock(),
    })
    expect(r.outcome).toBe('pass')
    expect(JSON.parse(JSON.stringify(r)).mergeable).toBe(true)
  })

  it('reads the REST pull request once per poll and reuses it for the merge state', async () => {
    const runner = fakeRunner([
      [/^gh pr checks /, fail(GRAPHQL_403)],
      [/^gh pr view /, fail(GRAPHQL_403)],
      [
        /\/pulls\/28$/,
        ok(
          JSON.stringify({
            head: { sha: 'abc' },
            state: 'open',
            mergeable_state: 'clean',
          })
        ),
      ],
      [
        /\/commits\/abc\/check-runs/,
        ok(
          JSON.stringify({
            total_count: 1,
            check_runs: [
              {
                name: 'T',
                status: 'completed',
                conclusion: 'success',
                details_url: 'https://x/1',
                started_at: '2026-11-17T10:00:00Z',
                completed_at: '2026-11-17T10:05:00Z',
                check_suite: { id: 7 },
              },
            ],
          })
        ),
      ],
      [
        /\/actions\/runs\?/,
        ok(JSON.stringify({ total_count: 0, workflow_runs: [] })),
      ],
    ])
    const r = await ciWait(28, {
      repo: REPO,
      runner,
      once: true,
      ...fakeClock(),
    })
    expect(r.outcome).toBe('pass')
    expect(runner.calls.filter(c => /\/pulls\/28$/.test(c))).toHaveLength(1)
  })
})

/**
 * #2910: GitHub can report mergeStateStatus CLEAN for a draft PR (PR #2911),
 * so the merge state alone doesn't say whether the PR is a draft. ci-wait
 * reads isDraft (REST: draft) and never calls a draft mergeable.
 */
describe('ciWait draft PRs are never mergeable (#2910)', () => {
  const GRAPHQL_403 =
    'HTTP 403: GitHub GraphQL is not available from Claude Code sessions; use the REST API'
  const GREEN = JSON.stringify([check({}), check({ name: 'Lint' })])
  const NO_RUNS = [
    /\/actions\/runs\?/,
    ok(JSON.stringify({ total_count: 0, workflow_runs: [] })),
  ] as [RegExp, ReturnType<typeof ok>]

  it('says mergeable false for a draft that GraphQL reports as CLEAN', async () => {
    const runner = fakeRunner([
      [/^gh pr checks 2911 /, ok(GREEN)],
      [
        /^gh pr view 2911 /,
        ok(
          JSON.stringify({
            mergeStateStatus: 'CLEAN',
            headRefOid: 'abc123',
            state: 'OPEN',
            isDraft: true,
          })
        ),
      ],
      NO_RUNS,
    ])
    const r = await ciWait(2911, {
      repo: REPO,
      runner,
      once: true,
      ...fakeClock(),
    })
    expect(r.outcome).toBe('pass')
    expect(r.mergeState).toBe('CLEAN')
    expect(JSON.parse(JSON.stringify(r)).mergeable).toBe(false)
    expect(formatCiWait(r)).toContain('draft: not mergeable yet')
  })

  it('says mergeable false for a draft that REST reports as clean', async () => {
    const runner = fakeRunner([
      [/^gh pr checks /, fail(GRAPHQL_403)],
      [
        /^gh api repos\/taverns-red\/toast-stats\/pulls\/2911$/,
        ok(
          JSON.stringify({
            head: { sha: 'abc' },
            mergeable_state: 'clean',
            draft: true,
          })
        ),
      ],
      [
        /\/commits\/abc\/check-runs/,
        ok(
          JSON.stringify({
            total_count: 1,
            check_runs: [
              {
                name: 'T',
                status: 'completed',
                conclusion: 'success',
                details_url: 'https://x/1',
                started_at: '2026-11-17T10:00:00Z',
                completed_at: '2026-11-17T10:05:00Z',
                check_suite: { id: 7 },
              },
            ],
          })
        ),
      ],
      NO_RUNS,
    ])
    const r = await ciWait(2911, {
      repo: REPO,
      runner,
      once: true,
      ...fakeClock(),
    })
    expect(r.outcome).toBe('pass')
    expect(JSON.parse(JSON.stringify(r)).mergeable).toBe(false)
    expect(formatCiWait(r)).toContain('draft: not mergeable yet')
  })

  it('still says mergeable true for a non-draft CLEAN PR (no run in flight)', async () => {
    const runner = fakeRunner([
      [/^gh pr checks 30 /, ok(GREEN)],
      [
        /^gh pr view 30 /,
        ok(
          JSON.stringify({
            mergeStateStatus: 'CLEAN',
            headRefOid: 'abc123',
            state: 'OPEN',
            isDraft: false,
          })
        ),
      ],
      NO_RUNS,
    ])
    const r = await ciWait(30, {
      repo: REPO,
      runner,
      once: true,
      ...fakeClock(),
    })
    expect(JSON.parse(JSON.stringify(r)).mergeable).toBe(true)
  })
})

/**
 * #2910: right after `gh pr ready` or a push, ci-wait said PASS while a
 * workflow run for the head commit was still queued or running, because that
 * run's check hadn't registered yet (PR Preview run 44141207002 on PR #2911).
 * Before passing, ci-wait reads the workflow runs for the head SHA, once per
 * green poll, and keeps waiting while any is unfinished.
 */
describe('ciWait waits for unfinished workflow runs on the head commit (#2910)', () => {
  const GREEN = JSON.stringify([check({}), check({ name: 'Lint' })])
  const RUNS_URL =
    /^gh api repos\/taverns-red\/toast-stats\/actions\/runs\?head_sha=abc123&per_page=100$/
  const view = ok(
    JSON.stringify({
      mergeStateStatus: 'CLEAN',
      headRefOid: 'abc123',
      state: 'OPEN',
      isDraft: false,
    })
  )
  const run = (status: string, over: Record<string, unknown> = {}) => ({
    id: 44141207002,
    name: 'PR Preview',
    status,
    conclusion: status === 'completed' ? 'success' : null,
    html_url:
      'https://github.com/taverns-red/toast-stats/actions/runs/44141207002',
    ...over,
  })
  const runs = (...rs: unknown[]) =>
    ok(JSON.stringify({ total_count: rs.length, workflow_runs: rs }))

  it('keeps waiting while a run is in progress, then passes once it completes', async () => {
    const clock = fakeClock()
    const sleeps: number[] = []
    const runner = fakeRunner([
      [/^gh pr checks 2911 /, ok(GREEN)],
      [/^gh pr view 2911 /, view],
      [RUNS_URL, [runs(run('in_progress')), runs(run('completed'))]],
    ])
    const r = await ciWait(2911, {
      repo: REPO,
      runner,
      intervalMs: 60_000,
      timeoutMs: 600_000,
      now: clock.now,
      sleep: async ms => {
        sleeps.push(ms)
        await clock.sleep(ms)
      },
    })
    expect(r.outcome).toBe('pass')
    expect(r.polls).toBe(2)
    expect(sleeps).toEqual([60_000])
  })

  it.each(['queued', 'in_progress', 'waiting', 'requested', 'pending'])(
    'treats a %s run as unfinished',
    async status => {
      const runner = fakeRunner([
        [/^gh pr checks 2911 /, ok(GREEN)],
        [/^gh pr view 2911 /, view],
        [RUNS_URL, runs(run(status))],
      ])
      const r = await ciWait(2911, {
        repo: REPO,
        runner,
        once: true,
        ...fakeClock(),
      })
      expect(r.outcome).toBe('pending')
      expect(ciWaitExitCode(r)).toBe(2)
    }
  )

  it('names the unfinished runs in the pending output', async () => {
    const runner = fakeRunner([
      [/^gh pr checks 2911 /, ok(GREEN)],
      [/^gh pr view 2911 /, view],
      [
        RUNS_URL,
        runs(
          run('in_progress'),
          run('completed', { id: 1, name: 'CI' }),
          run('queued', { id: 2, name: 'Quality Gates' })
        ),
      ],
    ])
    const r = await ciWait(2911, {
      repo: REPO,
      runner,
      once: true,
      ...fakeClock(),
    })
    const text = formatCiWait(r)
    expect(text).toContain('PR Preview')
    expect(text).toContain('in_progress')
    expect(text).toContain('Quality Gates')
    expect(text).toContain('queued')
    expect(text).toContain('actions/runs/44141207002')
    expect(text).not.toMatch(/CI \(/)
  })

  it('passes when every run for the head commit has completed', async () => {
    const runner = fakeRunner([
      [/^gh pr checks 2911 /, ok(GREEN)],
      [/^gh pr view 2911 /, view],
      [RUNS_URL, runs(run('completed'), run('completed', { name: 'CI' }))],
    ])
    const r = await ciWait(2911, {
      repo: REPO,
      runner,
      once: true,
      ...fakeClock(),
    })
    expect(r.outcome).toBe('pass')
  })

  it('reads the workflow runs once per green poll, and not while a check is failing', async () => {
    const runner = fakeRunner([
      [/^gh pr checks 2911 /, ok(GREEN)],
      [/^gh pr view 2911 /, view],
      [RUNS_URL, runs(run('completed'))],
    ])
    await ciWait(2911, { repo: REPO, runner, once: true, ...fakeClock() })
    expect(runner.calls.filter(c => /actions\/runs/.test(c))).toHaveLength(1)

    const failing = fakeRunner([
      [
        /^gh pr checks 2912 /,
        ok(JSON.stringify([check({ bucket: 'fail', state: 'FAILURE' })])),
      ],
    ])
    await ciWait(2912, { repo: REPO, runner: failing, ...fakeClock() })
    expect(failing.calls.some(c => /actions\/runs/.test(c))).toBe(false)
  })
})
