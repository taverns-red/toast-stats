import { describe, it, expect } from 'vitest'
import {
  decideGate,
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
const jobsOf = (conclusion: string | null): HeadCheckRun[] =>
  NAMES.map((n, i) => job(n, conclusion, { id: i }))
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
    const jobs = jobsOf('success')
    jobs[1] = job('Test Suite', 'failure', { id: 9 })
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
  it('ignores a same-named success from another app', () => {
    const foreign = jobsOf('success').map(j => ({
      ...j,
      app: { slug: 'some-other-app' },
    }))
    expect(decide([run(50, 'completed', foreign)]).pass).toBe(false)
  })
})

describe('waitForGate (#2881)', () => {
  const instant = async () => {}
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
    const jobs = jobsOf('success')
    jobs[2] = job('Build Applications', 'failure', { id: 7 })
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
