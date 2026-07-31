import { describe, it, expect } from 'vitest'
import { evaluateRolloverAlert, ROLLOVER_GRACE_DAYS } from '../rolloverAlert.js'

describe('evaluateRolloverAlert (#1343)', () => {
  it('never alerts when the calendar program year resolved', () => {
    const r = evaluateRolloverAlert({
      reason: 'resolved',
      programYear: '2026-2027',
      date: '2026-12-01',
    })

    expect(r.alert).toBe(false)
    expect(r.shouldClose).toBe(true)
  })

  // An upstream error means we could not ask the question. That is never
  // "wait and see", regardless of how early in the rollover we are.
  it('alerts immediately on an upstream error, even on day 1', () => {
    const r = evaluateRolloverAlert({
      reason: 'upstream-error',
      programYear: '2025-2026',
      date: '2026-07-01',
    })

    expect(r.alert).toBe(true)
    expect(r.shouldClose).toBe(false)
    expect(r.summary).toMatch(/upstream/i)
  })

  // TI's rollover legitimately lags July 1, so an unpublished new year is
  // expected for a while. Alerting on day 1 would train people to ignore it.
  it('stays quiet for an unpublished year inside the grace window', () => {
    const r = evaluateRolloverAlert({
      reason: 'not-published',
      programYear: '2025-2026',
      date: '2026-07-10',
    })

    expect(r.alert).toBe(false)
    expect(r.daysIntoProgramYear).toBe(9)
  })

  it('alerts once an unpublished year passes the grace window', () => {
    const r = evaluateRolloverAlert({
      reason: 'not-published',
      programYear: '2025-2026',
      date: '2026-08-20',
    })

    expect(r.alert).toBe(true)
    expect(r.daysIntoProgramYear).toBeGreaterThan(ROLLOVER_GRACE_DAYS)
  })

  it('treats the grace boundary as not-yet-overdue', () => {
    const boundary = new Date(Date.UTC(2026, 6, 1))
    boundary.setUTCDate(boundary.getUTCDate() + ROLLOVER_GRACE_DAYS)
    const iso = boundary.toISOString().slice(0, 10)

    expect(
      evaluateRolloverAlert({
        reason: 'not-published',
        programYear: '2025-2026',
        date: iso,
      }).alert
    ).toBe(false)
  })

  // The date drives the day count, so a non-ISO or garbage date must not
  // silently produce a 0-day count that suppresses a real alert.
  it('fails loud (alerts) when the date cannot be parsed', () => {
    const r = evaluateRolloverAlert({
      reason: 'not-published',
      programYear: '2025-2026',
      date: 'not-a-date',
    })

    expect(r.alert).toBe(true)
  })
})
