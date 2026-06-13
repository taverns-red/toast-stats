import { describe, it, expect } from 'vitest'
import { deriveProgramYear } from '../useRankHistory'

/**
 * Timezone-boundary regression (#1116 item 2, live-path twin found in review).
 *
 * deriveProgramYear parsed its date via `new Date(str).getMonth()`, which reads
 * UTC-parsed midnight in local time — so a first-of-July date rolls back to June
 * in UTC-negative zones and the derived program year is off by one. Run the
 * suite under TZ=America/New_York to exercise the negative-offset path.
 */
describe('deriveProgramYear timezone invariance (#1116 item 2)', () => {
  it('puts July 1 in the program year that starts that July (from explicit startDate)', () => {
    expect(deriveProgramYear('2026-07-01').year).toBe('2026-2027')
    expect(deriveProgramYear('2026-07-01').startDate).toBe('2026-07-01')
  })

  it('puts June 30 in the prior program year', () => {
    expect(deriveProgramYear('2026-06-30').year).toBe('2025-2026')
  })

  it('derives from the latest history point when no startDate is given', () => {
    const history = [{ date: '2025-12-01' }, { date: '2026-07-01' }]
    expect(deriveProgramYear(undefined, undefined, history).year).toBe(
      '2026-2027'
    )
  })

  it('returns the empty shape when neither dates nor history are available', () => {
    expect(deriveProgramYear()).toEqual({
      startDate: '',
      endDate: '',
      year: '',
    })
  })
})
