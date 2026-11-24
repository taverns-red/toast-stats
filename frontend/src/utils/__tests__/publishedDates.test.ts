import { describe, it, expect } from 'vitest'
import { datesForDefaultSelection } from '../publishedDates'
import { getProgramYearForDate } from '../programYear'
import { snapshotDatesFrom, toSnapshotDate } from '../../types/snapshotDate'

const dates = snapshotDatesFrom({
  dates: ['2026-11-20', '2026-11-21', '2026-11-22'],
})
const py = getProgramYearForDate(dates[1]!)

describe('datesForDefaultSelection (#3195)', () => {
  it('drops dates newer than the published date', () => {
    expect(
      datesForDefaultSelection(dates, toSnapshotDate('2026-11-21'), py)
    ).toEqual(['2026-11-20', '2026-11-21'])
  })

  it('keeps every date when the manifest is unknown', () => {
    expect(datesForDefaultSelection(dates, undefined, py)).toEqual(dates)
  })

  it('keeps every date when the cap would empty the program year', () => {
    expect(
      datesForDefaultSelection(dates, toSnapshotDate('2026-06-30'), py)
    ).toEqual(dates)
  })
})
