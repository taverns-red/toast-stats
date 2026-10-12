import { describe, it, expect } from 'vitest'
import { isDistrictSlotPending } from '../districtSlotPending'

/* #1837 — a district subpage's data queries are disabled until the
 * per-district date index resolves. A disabled query reports
 * `isLoading: false`, so `isLoading && <Skeleton/>` painted nothing for that
 * whole window and the loaded content then landed on top of whatever was
 * already on screen (CLS 0.20–0.30 on divisions/analytics/action-list). */
describe('isDistrictSlotPending (#1837)', () => {
  const datesInFlight = { hasValidDates: false, datesSettled: false }
  const datesReady = { hasValidDates: true, datesSettled: true }
  const datesEmpty = { hasValidDates: false, datesSettled: true }

  it('is pending while the date index is still in flight', () => {
    expect(
      isDistrictSlotPending({ hasData: false, isError: false }, datesInFlight)
    ).toBe(true)
  })

  it('is pending while the dated query is fetching', () => {
    expect(
      isDistrictSlotPending({ hasData: false, isError: false }, datesReady)
    ).toBe(true)
  })

  it('is settled once the data has landed', () => {
    expect(
      isDistrictSlotPending({ hasData: true, isError: false }, datesReady)
    ).toBe(false)
  })

  it('is settled when the query errored, so the error state renders', () => {
    expect(
      isDistrictSlotPending({ hasData: false, isError: true }, datesReady)
    ).toBe(false)
  })

  it('is settled when the date index resolved with no usable date — never a permanent skeleton', () => {
    expect(
      isDistrictSlotPending({ hasData: false, isError: false }, datesEmpty)
    ).toBe(false)
  })
})
