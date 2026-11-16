/**
 * The verdict on an unrelated label event (#2865, review F1 and re-review).
 *
 * GitHub resolves a required check by the latest run of that name in the most
 * recently created check suite, so a label added while the real run is still
 * going must WAIT for it, not fail on it. Only runs OLDER than this one count
 * (never wait on newer ones), the newest of them by run id is mirrored, and a
 * skipped verdict is not a verdict.
 */
import { describe, it, expect } from 'vitest'
import {
  decideMirror,
  waitForMirror,
  type MirrorState,
  type RunInfo,
  type VerdictJob,
} from '../previewVerdictMirror'

const NAME = 'PR Preview verdict'
const vj = (
  conclusion: string,
  over: Partial<VerdictJob> = {}
): VerdictJob => ({
  name: NAME,
  status: 'completed',
  conclusion,
  started_at: '2026-11-16T10:00:00Z',
  ...over,
})
const run = (
  id: number,
  conclusion: string | null,
  status = 'completed',
  over: Partial<VerdictJob> = {}
): RunInfo => ({
  id,
  status,
  verdictJobs: conclusion === null ? [] : [vj(conclusion, over)],
})
const SELF = 100

describe('decideMirror', () => {
  it('fails at once when the PR head is no longer the head this run was for', () => {
    const d = decideMirror({
      runs: [run(90, 'success')],
      selfRunId: SELF,
      headMoved: true,
    })
    expect(d.done).toBe(true)
    expect(d.pass).toBe(false)
    expect(d.reasons.join(' ')).toContain('head')
  })

  it('fails when no older run exists on the head', () => {
    const d = decideMirror({ runs: [], selfRunId: SELF, headMoved: false })
    expect(d).toMatchObject({ done: true, pass: false })
  })

  it('ignores runs that are not older than this one, even while in progress', () => {
    const d = decideMirror({
      runs: [run(100, null, 'in_progress'), run(120, null, 'in_progress')],
      selfRunId: SELF,
      headMoved: false,
    })
    expect(d).toMatchObject({ done: true, pass: false })
  })

  it('does not wait on a newer run when an older one is done', () => {
    const d = decideMirror({
      runs: [run(90, 'success'), run(120, null, 'in_progress')],
      selfRunId: SELF,
      headMoved: false,
    })
    expect(d).toMatchObject({ done: true, pass: true })
  })

  it.each(['in_progress', 'queued'])(
    'waits while an older run is %s',
    status => {
      const d = decideMirror({
        runs: [run(90, null, status)],
        selfRunId: SELF,
        headMoved: false,
      })
      expect(d.done).toBe(false)
    }
  )

  it('waits for ANY older run still going, even when a newer-older one is done', () => {
    const d = decideMirror({
      runs: [run(80, null, 'in_progress'), run(90, 'success')],
      selfRunId: SELF,
      headMoved: false,
    })
    expect(d.done).toBe(false)
  })

  it('passes when every older run is done and the newest real verdict succeeded', () => {
    const d = decideMirror({
      runs: [run(80, 'failure'), run(90, 'success')],
      selfRunId: SELF,
      headMoved: false,
    })
    expect(d).toMatchObject({ done: true, pass: true })
  })

  it('fails when the newest real verdict failed, even if an older one passed', () => {
    const d = decideMirror({
      runs: [run(80, 'success'), run(90, 'failure')],
      selfRunId: SELF,
      headMoved: false,
    })
    expect(d).toMatchObject({ done: true, pass: false })
    expect(d.reasons.join(' ')).toContain('failure')
  })

  it('a newer skipped verdict does not clear an older failure', () => {
    const d = decideMirror({
      runs: [run(80, 'failure'), run(90, 'skipped')],
      selfRunId: SELF,
      headMoved: false,
    })
    expect(d).toMatchObject({ done: true, pass: false })
  })

  it('fails when every older verdict is skipped', () => {
    const d = decideMirror({
      runs: [run(80, 'skipped'), run(90, 'skipped')],
      selfRunId: SELF,
      headMoved: false,
    })
    expect(d).toMatchObject({ done: true, pass: false })
  })

  it('fails when an older run has no verdict job at all', () => {
    const d = decideMirror({
      runs: [run(90, null, 'completed')],
      selfRunId: SELF,
      headMoved: false,
    })
    expect(d).toMatchObject({ done: true, pass: false })
  })

  it('picks the newest by run id, not by job start time', () => {
    const d = decideMirror({
      runs: [
        run(80, 'success', 'completed', { started_at: '2026-11-16T12:00:00Z' }),
        run(90, 'failure', 'completed', { started_at: '2026-11-16T09:00:00Z' }),
      ],
      selfRunId: SELF,
      headMoved: false,
    })
    expect(d).toMatchObject({ done: true, pass: false })
  })

  it.each(['cancelled', 'timed_out', 'action_required'])(
    'fails on %s',
    conclusion => {
      const d = decideMirror({
        runs: [run(90, conclusion)],
        selfRunId: SELF,
        headMoved: false,
      })
      expect(d).toMatchObject({ done: true, pass: false })
    }
  )

  it('ignores jobs with other names', () => {
    const d = decideMirror({
      runs: [
        {
          id: 90,
          status: 'completed',
          verdictJobs: [vj('success', { name: 'Changes' })],
        },
      ],
      selfRunId: SELF,
      headMoved: false,
    })
    expect(d).toMatchObject({ done: true, pass: false })
  })
})

describe('waitForMirror', () => {
  const HEAD = 'abc'
  const script = (states: MirrorState[]) => {
    let i = 0
    const sleeps: number[] = []
    return {
      sleeps,
      fetchState: async () => states[Math.min(i++, states.length - 1)]!,
      sleep: async (ms: number) => {
        sleeps.push(ms)
      },
    }
  }

  it('polls every 30 s until the older runs are done, then mirrors', async () => {
    const s = script([
      { headSha: HEAD, runs: [run(90, null, 'in_progress')] },
      { headSha: HEAD, runs: [run(90, null, 'in_progress')] },
      { headSha: HEAD, runs: [run(90, 'success')] },
    ])
    const r = await waitForMirror({ ...s, headSha: HEAD, selfRunId: SELF })
    expect(r.pass).toBe(true)
    expect(s.sleeps).toEqual([30_000, 30_000])
  })

  it('fails when the real run it waited for failed', async () => {
    const s = script([
      { headSha: HEAD, runs: [run(90, null, 'in_progress')] },
      { headSha: HEAD, runs: [run(90, 'failure')] },
    ])
    const r = await waitForMirror({ ...s, headSha: HEAD, selfRunId: SELF })
    expect(r.pass).toBe(false)
  })

  it('fails as soon as the PR head moves, without waiting out the run', async () => {
    const s = script([
      { headSha: HEAD, runs: [run(90, null, 'in_progress')] },
      { headSha: 'def', runs: [run(90, null, 'in_progress')] },
    ])
    const r = await waitForMirror({ ...s, headSha: HEAD, selfRunId: SELF })
    expect(r.pass).toBe(false)
    expect(r.reasons.join(' ')).toContain('head')
    expect(s.sleeps).toEqual([30_000])
  })

  it('fails at once with no older run, without sleeping', async () => {
    const s = script([{ headSha: HEAD, runs: [] }])
    const r = await waitForMirror({ ...s, headSha: HEAD, selfRunId: SELF })
    expect(r.pass).toBe(false)
    expect(s.sleeps).toEqual([])
  })

  it('fails at once when the older runs are skipped-only', async () => {
    const s = script([{ headSha: HEAD, runs: [run(90, 'skipped')] }])
    const r = await waitForMirror({ ...s, headSha: HEAD, selfRunId: SELF })
    expect(r.pass).toBe(false)
    expect(s.sleeps).toEqual([])
  })
})
