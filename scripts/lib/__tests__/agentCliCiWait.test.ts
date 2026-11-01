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
