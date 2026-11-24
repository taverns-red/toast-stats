import { describe, it, expect } from 'vitest'
import { pickerDatesFrom } from '../publishedDates'
import { snapshotDatesFrom } from '../../types/snapshotDate'

const all = snapshotDatesFrom({
  dates: ['2026-11-20', '2026-11-21', '2026-11-22'],
})

describe('pickerDatesFrom (#3195)', () => {
  it('lists the held date when the hook capped the default dates', () => {
    expect(pickerDatesFrom({ dates: all.slice(0, 2), allDates: all })).toEqual(
      all
    )
  })

  it('falls back to dates when nothing was capped', () => {
    expect(pickerDatesFrom({ dates: all })).toEqual(all)
  })

  it('returns an empty list before the index loads', () => {
    expect(pickerDatesFrom(undefined)).toEqual([])
  })
})
