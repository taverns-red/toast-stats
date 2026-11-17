import { describe, it, expect } from 'vitest'
import {
  decideGate,
  jobsCacheKey,
  retryUntilOk,
  runBelongsToPr,
  waitForGate,
  type GateRun,
  type GateState,
} from '../ciGateWait'
import type { HeadCheckRun } from '../ciGateNeeds'

const NAMES = ['Quality Gates', 'Test Suite', 'Build Applications']
const SELF = 100

const job = (
  name: string,
  conclusion: string | null,
  extra: Partial<HeadCheckRun> = {}
): HeadCheckRun => ({
  name,
  status: conclusion === null ? 'in_progress' : 'completed',
  conclusion,
  app: { slug: 'github-actions' },
  ...extra,
})
// A real run has a `Changes` job that ran; a no-op edit run skips it.
const jobsOf = (
  conclusion: string | null,
  changes: string | null = conclusion
): HeadCheckRun[] => [
  job('Changes', changes, { id: 99 }),
  ...NAMES.map((n, i) => job(n, conclusion, { id: i })),
]
const run = (
  id: number,
  status: string,
  jobs: HeadCheckRun[] = []
): GateRun => ({ id, status, jobs })

const decide = (runs: GateRun[], headMoved = false) =>
  decideGate({ expected: NAMES, runs, selfRunId: SELF, headMoved })

describe('decideGate (#2881)', () => {
  it('passes when every older run is done and green', () => {
    const d = decide([run(50, 'completed', jobsOf('success'))])
    expect(d).toMatchObject({ done: true, pass: true })
  })
  it('fails when the newest older run has a failed job', () => {
    const jobs = jobsOf('success').map(j =>
      j.name === 'Test Suite' ? job('Test Suite', 'failure', { id: 9 }) : j
    )
    const d = decide([run(50, 'completed', jobs)])
    expect(d.done).toBe(true)
    expect(d.pass).toBe(false)
    expect(d.reasons.join(' ')).toContain('Test Suite')
  })
  it('fails at once when the head moved, even with a run in flight', () => {
    const d = decide([run(50, 'in_progress')], true)
    expect(d.done).toBe(true)
    expect(d.pass).toBe(false)
    expect(d.reasons.join(' ')).toContain('head moved')
  })
  it('fails when there is no older run', () => {
    const d = decide([run(100, 'in_progress'), run(150, 'completed')])
    expect(d.done).toBe(true)
    expect(d.pass).toBe(false)
    expect(d.reasons.join(' ')).toContain('no earlier')
  })
  it('keeps waiting while an older run is not completed', () => {
    const d = decide([run(50, 'in_progress', jobsOf(null))])
    expect(d.done).toBe(false)
    expect(d.pass).toBe(false)
    expect(d.reasons.join(' ')).toContain('50')
  })
  it('waits for every older run, not just the newest', () => {
    const d = decide([
      run(60, 'completed', jobsOf('success')),
      run(50, 'queued'),
    ])
    expect(d.done).toBe(false)
  })
  it('never waits on or decides from this run or newer ones', () => {
    const d = decide([
      run(50, 'completed', jobsOf('success')),
      run(SELF, 'in_progress', jobsOf(null)),
      run(200, 'in_progress', jobsOf('failure')),
    ])
    expect(d).toMatchObject({ done: true, pass: true })
  })
  it('decides from the newest older real run, not an older red one', () => {
    const d = decide([
      run(40, 'completed', jobsOf('failure')),
      run(50, 'completed', jobsOf('success')),
    ])
    expect(d.pass).toBe(true)
  })
  it('skips an older no-op run whose jobs are all skipped', () => {
    const d = decide([
      run(50, 'completed', jobsOf('success')),
      run(70, 'completed', jobsOf('skipped')),
    ])
    expect(d.pass).toBe(true)
  })
  it('fails when every older run is all-skipped', () => {
    const d = decide([run(70, 'completed', jobsOf('skipped'))])
    expect(d.done).toBe(true)
    expect(d.pass).toBe(false)
  })
  // F1: a real run whose Changes job failed or was cancelled skips every
  // other job too. It must not be mistaken for a no-op run.
  it.each(['failure', 'cancelled'])(
    'FAILS when the newest older run has Changes=%s, even with an older green run',
    changes => {
      const d = decide([
        run(40, 'completed', jobsOf('success')),
        run(50, 'completed', jobsOf('skipped', changes)),
      ])
      expect(d.done).toBe(true)
      expect(d.pass).toBe(false)
      expect(d.reasons.join(' ')).toContain('Changes')
    }
  )
  it('FAILS when the newest older run has no jobs at all (Changes missing)', () => {
    const d = decide([
      run(40, 'completed', jobsOf('success')),
      run(50, 'completed', []),
    ])
    expect(d.done).toBe(true)
    expect(d.pass).toBe(false)
    expect(d.reasons.join(' ')).toContain('Changes is missing')
  })
  it('passes a docs-only PR: code jobs skipped, Docs Gate success', () => {
    const jobs = [
      job('Changes', 'success'),
      ...NAMES.map(n => job(n, 'skipped')),
      job('Docs Gate', 'success'),
    ]
    const d = decideGate({
      expected: ['Docs Gate'],
      runs: [run(50, 'completed', jobs)],
      selfRunId: SELF,
      headMoved: false,
    })
    expect(d.pass).toBe(true)
  })
  it('a mixed PR passes only if every expected job succeeded', () => {
    const base = [job('Changes', 'success'), ...jobsOf('success').slice(1)]
    const expected = [...NAMES, 'Docs Gate']
    const go = (docs: HeadCheckRun) =>
      decideGate({
        expected,
        runs: [run(50, 'completed', [...base, docs])],
        selfRunId: SELF,
        headMoved: false,
      })
    expect(go(job('Docs Gate', 'success')).pass).toBe(true)
    expect(go(job('Docs Gate', 'failure')).pass).toBe(false)
    expect(go(job('Docs Gate', 'skipped')).pass).toBe(false)
  })
  it('ignores a same-named success from another app', () => {
    const foreign = jobsOf('success').map(j => ({
      ...j,
      app: { slug: 'some-other-app' },
    }))
    expect(decide([run(50, 'completed', foreign)]).pass).toBe(false)
  })
})

describe('run selection (#2881 review)', () => {
  it('F2: a re-run (same id, new attempt) is a different cache key', () => {
    expect(jobsCacheKey({ id: 5, run_attempt: 1 })).not.toBe(
      jobsCacheKey({ id: 5, run_attempt: 2 })
    )
  })
  it('F4: drops a run that belongs to another PR on the same SHA', () => {
    expect(runBelongsToPr({ id: 1, pull_requests: [{ number: 7 }] }, 8)).toBe(
      false
    )
    expect(runBelongsToPr({ id: 1, pull_requests: [{ number: 8 }] }, 8)).toBe(
      true
    )
  })
  it('F4: keeps a run with no pull_requests (fork PRs report none)', () => {
    expect(runBelongsToPr({ id: 1, pull_requests: [] }, 8)).toBe(true)
    expect(runBelongsToPr({ id: 1 }, 8)).toBe(true)
  })
})

describe('retryUntilOk (#2881 review)', () => {
  it('retries a failing call after the poll interval, then returns', async () => {
    let calls = 0
    const sleeps: number[] = []
    const msgs: string[] = []
    const out = await retryUntilOk(
      async () => {
        if (++calls < 3) throw new Error('network blip')
        return 'files'
      },
      {
        sleep: async ms => void sleeps.push(ms),
        onRetry: m => msgs.push(m),
      }
    )
    expect(out).toBe('files')
    expect(calls).toBe(3)
    expect(sleeps).toEqual([30_000, 30_000])
    expect(msgs[0]).toContain('network blip')
  })
  it('returns at once when the first call works', async () => {
    const out = await retryUntilOk(async () => 7, { sleep: async () => {} })
    expect(out).toBe(7)
  })
})

describe('waitForGate (#2881)', () => {
  const instant = async () => {}
  // F3: a transient poll error must not pin the gate red.
  it('retries after fetchState throws, then decides normally', async () => {
    let i = 0
    const waits: string[][] = []
    const v = await waitForGate({
      fetchState: async () => {
        if (i++ === 0) throw new Error('GET /x -> 429')
        return { headSha: 'a', runs: [run(50, 'completed', jobsOf('success'))] }
      },
      expected: NAMES,
      headSha: 'a',
      selfRunId: SELF,
      sleep: instant,
      onWait: r => waits.push(r),
    })
    expect(v.pass).toBe(true)
    expect(i).toBe(2)
    expect(waits[0]!.join(' ')).toContain('429')
  })
  it('waits through in-progress states, then passes once the run completes', async () => {
    const states: GateState[] = [
      { headSha: 'a', runs: [run(50, 'in_progress', jobsOf(null))] },
      { headSha: 'a', runs: [run(50, 'in_progress', jobsOf(null))] },
      { headSha: 'a', runs: [run(50, 'completed', jobsOf('success'))] },
    ]
    let i = 0
    const sleeps: number[] = []
    const waits: string[][] = []
    const v = await waitForGate({
      fetchState: async () => states[i++]!,
      expected: NAMES,
      headSha: 'a',
      selfRunId: SELF,
      sleep: async ms => void sleeps.push(ms),
      onWait: r => waits.push(r),
    })
    expect(v.pass).toBe(true)
    expect(i).toBe(3)
    expect(sleeps).toEqual([30_000, 30_000])
    expect(waits).toHaveLength(2)
  })
  it('fails when the head moves while waiting', async () => {
    const states: GateState[] = [
      { headSha: 'a', runs: [run(50, 'in_progress')] },
      { headSha: 'b', runs: [run(50, 'in_progress')] },
    ]
    let i = 0
    const v = await waitForGate({
      fetchState: async () => states[i++]!,
      expected: NAMES,
      headSha: 'a',
      selfRunId: SELF,
      sleep: instant,
    })
    expect(v.pass).toBe(false)
    expect(v.reasons.join(' ')).toContain('head moved')
  })
  it('fails (no hang) when the awaited run ends red', async () => {
    const jobs = jobsOf('success').map(j =>
      j.name === 'Build Applications'
        ? job('Build Applications', 'failure', { id: 7 })
        : j
    )
    const states: GateState[] = [
      { headSha: 'a', runs: [run(50, 'in_progress')] },
      { headSha: 'a', runs: [run(50, 'completed', jobs)] },
    ]
    let i = 0
    const v = await waitForGate({
      fetchState: async () => states[i++]!,
      expected: NAMES,
      headSha: 'a',
      selfRunId: SELF,
      sleep: instant,
    })
    expect(v.pass).toBe(false)
    expect(v.reasons.join(' ')).toContain('Build Applications')
  })
})

// #2887: a permanent 4xx must fail at once, not poll until the job timeout.
describe('non-retryable 4xx (#2887)', () => {
  const httpErr = (status: number, rateLimited = false) =>
    Object.assign(new Error(`GET /x -> ${status}`), { status, rateLimited })
  // A sleep that fails the test if the code tries to retry.
  const noRetry = () => {
    let sleeps = 0
    return async () => {
      if (++sleeps > 2) throw new Error('retried a permanent error')
    }
  }

  it.each([401, 403, 404, 422])(
    'retryUntilOk rethrows a %i at once',
    async s => {
      let calls = 0
      await expect(
        retryUntilOk(
          async () => {
            calls++
            throw httpErr(s)
          },
          { sleep: noRetry() }
        )
      ).rejects.toThrow(String(s))
      expect(calls).toBe(1)
    }
  )

  it.each([
    ['500', httpErr(500)],
    ['502', httpErr(502)],
    ['429', httpErr(429)],
    ['rate-limit 403', httpErr(403, true)],
    ['network error', new TypeError('fetch failed')],
  ])('retryUntilOk still retries %s', async (_n, err) => {
    let calls = 0
    const out = await retryUntilOk(
      async () => {
        if (++calls < 2) throw err
        return 'ok'
      },
      { sleep: async () => {} }
    )
    expect(out).toBe('ok')
    expect(calls).toBe(2)
  })

  it.each([404, 401])(
    'waitForGate fails the gate at once on a %i, status in the reason',
    async s => {
      let calls = 0
      const v = await waitForGate({
        fetchState: async () => {
          calls++
          throw httpErr(s)
        },
        expected: NAMES,
        headSha: 'a',
        selfRunId: SELF,
        sleep: noRetry(),
      })
      expect(v.pass).toBe(false)
      expect(v.reasons.join(' ')).toContain(String(s))
      expect(calls).toBe(1)
    }
  )
})
