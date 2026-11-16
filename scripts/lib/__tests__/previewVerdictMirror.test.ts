/**
 * An unrelated label event must not clear an earlier failed verdict (#2865,
 * review F1). The verdict on such an event mirrors the newest real
 * `PR Preview verdict` job on the same head. Same shape as evaluateHeadChecks
 * in ciGateNeeds.ts (#2859).
 */
import { describe, it, expect } from 'vitest'
import { mirrorVerdict, type VerdictJob } from '../previewVerdictMirror'

const NAME = 'PR Preview verdict'
const job = (over: Partial<VerdictJob>): VerdictJob => ({
  name: NAME,
  status: 'completed',
  conclusion: 'success',
  started_at: '2026-11-16T10:00:00Z',
  id: 1,
  ...over,
})

describe('mirrorVerdict', () => {
  it('fails when there is no earlier verdict on the head', () => {
    const r = mirrorVerdict([])
    expect(r.pass).toBe(false)
    expect(r.reasons.join(' ')).toContain('no earlier')
  })

  it('ignores jobs with other names', () => {
    const r = mirrorVerdict([job({ name: 'Changes' })])
    expect(r.pass).toBe(false)
  })

  it('passes when the newest real verdict succeeded', () => {
    expect(mirrorVerdict([job({})]).pass).toBe(true)
  })

  it('fails when the newest real verdict failed', () => {
    const r = mirrorVerdict([job({ conclusion: 'failure' })])
    expect(r.pass).toBe(false)
    expect(r.reasons.join(' ')).toContain('failure')
  })

  it('a newer skipped verdict does not clear an older failure', () => {
    const r = mirrorVerdict([
      job({ conclusion: 'failure', started_at: '2026-11-16T10:00:00Z', id: 1 }),
      job({ conclusion: 'skipped', started_at: '2026-11-16T10:05:00Z', id: 2 }),
    ])
    expect(r.pass).toBe(false)
  })

  it('only skipped verdicts count as missing', () => {
    const r = mirrorVerdict([job({ conclusion: 'skipped' })])
    expect(r.pass).toBe(false)
  })

  it('the newest real verdict wins: a later success after a failure passes', () => {
    const r = mirrorVerdict([
      job({ conclusion: 'failure', started_at: '2026-11-16T10:00:00Z', id: 1 }),
      job({ conclusion: 'success', started_at: '2026-11-16T10:30:00Z', id: 2 }),
    ])
    expect(r.pass).toBe(true)
  })

  it('the newest real verdict wins: a later failure after a success fails', () => {
    const r = mirrorVerdict([
      job({ conclusion: 'success', started_at: '2026-11-16T10:00:00Z', id: 1 }),
      job({ conclusion: 'failure', started_at: '2026-11-16T10:30:00Z', id: 2 }),
    ])
    expect(r.pass).toBe(false)
  })

  it('falls back to the id when start times are equal or absent', () => {
    const r = mirrorVerdict([
      job({ conclusion: 'success', started_at: null, id: 1 }),
      job({ conclusion: 'failure', started_at: null, id: 2 }),
    ])
    expect(r.pass).toBe(false)
  })

  it('fails while the newest real verdict is still running', () => {
    const r = mirrorVerdict([
      job({ status: 'in_progress', conclusion: null, id: 3 }),
    ])
    expect(r.pass).toBe(false)
    expect(r.reasons.join(' ')).toContain('still running')
  })

  it.each(['cancelled', 'timed_out', 'action_required'])(
    'fails on %s',
    conclusion => {
      expect(mirrorVerdict([job({ conclusion })]).pass).toBe(false)
    }
  )
})
