/**
 * `officerTraining` on a time-series data point (#2296).
 *
 * The field is optional: every point published before it existed must keep
 * validating. When present it must survive parsing (a stripped field would
 * read as "not measured" on the Training page) and keep its 0–7 shape.
 */
import { describe, it, expect } from 'vitest'
import { TimeSeriesDataPointSchema } from '../schemas/time-series.schema.js'

const basePoint = {
  date: '2026-10-11',
  snapshotId: '2026-10-11',
  membership: 3000,
  payments: 2500,
  dcpGoals: 300,
  distinguishedTotal: 10,
  clubCounts: {
    total: 161,
    thriving: 50,
    vulnerable: 90,
    interventionRequired: 21,
  },
}

describe('TimeSeriesDataPointSchema officerTraining (#2296)', () => {
  it('still accepts a point without the field', () => {
    const parsed = TimeSeriesDataPointSchema.safeParse(basePoint)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.officerTraining).toBeUndefined()
  })

  it('keeps the field when present', () => {
    const officerTraining = {
      round1: [19, 5, 3, 14, 43, 25, 27, 25],
      round2: [161, 0, 0, 0, 0, 0, 0, 0],
    }
    const parsed = TimeSeriesDataPointSchema.safeParse({
      ...basePoint,
      officerTraining,
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.officerTraining).toEqual(
      officerTraining
    )
  })

  it('rejects a distribution that is not eight counts (0–7 officers)', () => {
    const parsed = TimeSeriesDataPointSchema.safeParse({
      ...basePoint,
      officerTraining: { round1: [1, 2, 3], round2: [0, 0, 0, 0, 0, 0, 0, 0] },
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects a negative count', () => {
    const parsed = TimeSeriesDataPointSchema.safeParse({
      ...basePoint,
      officerTraining: {
        round1: [-1, 0, 0, 0, 0, 0, 0, 0],
        round2: [0, 0, 0, 0, 0, 0, 0, 0],
      },
    })
    expect(parsed.success).toBe(false)
  })
})
