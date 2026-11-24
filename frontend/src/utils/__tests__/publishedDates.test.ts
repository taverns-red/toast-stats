import { describe, it, expect } from 'vitest'
import { capDatesAtPublished } from '../publishedDates'
import { snapshotDatesFrom, toSnapshotDate } from '../../types/snapshotDate'

const dates = snapshotDatesFrom({
  dates: ['2026-11-20', '2026-11-21', '2026-11-22'],
})

describe('capDatesAtPublished (#3195)', () => {
  it('drops dates newer than the published date', () => {
    expect(capDatesAtPublished(dates, toSnapshotDate('2026-11-21'))).toEqual([
      '2026-11-20',
      '2026-11-21',
    ])
  })

  it('keeps every date when the manifest is unknown', () => {
    expect(capDatesAtPublished(dates, undefined)).toEqual(dates)
  })

  it('keeps every date when the cap would empty the list', () => {
    expect(capDatesAtPublished(dates, toSnapshotDate('2026-06-30'))).toEqual(
      dates
    )
  })
})
