/**
 * #3100 (M1) — the last day a suspended club can reinstate and still add to
 * the club base, from the reason code and the snapshot date the page passes
 * in (R3). A September 30 suspension has until March 31; a March 31
 * suspension until September 30. The year is the first such date on or after
 * the snapshot date.
 */
import { describe, expect, it } from 'vitest'
import { reinstateDeadline } from '../reinstateDeadline'

const SEPT30 = 'suspended_sept30_october_cycle'
const MAR31 = 'suspended_mar31_before_oct1'

describe('reinstateDeadline', () => {
  it.each([
    ['2026-09-30', '2027-03-31'],
    ['2026-10-01', '2027-03-31'],
    ['2026-11-18', '2027-03-31'],
    ['2027-01-15', '2027-03-31'],
    ['2027-03-31', '2027-03-31'],
    ['2027-04-01', '2028-03-31'],
    ['2027-07-01', '2028-03-31'],
  ])('a September 30 suspension on %s: by %s', (snapshot, deadline) => {
    expect(reinstateDeadline(SEPT30, snapshot)).toBe(deadline)
  })

  it.each([
    ['2027-03-31', '2027-09-30'],
    ['2027-04-01', '2027-09-30'],
    ['2027-07-01', '2027-09-30'],
    ['2027-09-30', '2027-09-30'],
    ['2027-10-01', '2028-09-30'],
  ])('a March 31 suspension on %s: by %s', (snapshot, deadline) => {
    expect(reinstateDeadline(MAR31, snapshot)).toBe(deadline)
  })

  it.each([
    'suspended_mar31_after_oct1',
    'suspended_sept30_past_october_cycle',
    'suspend_date_unexpected',
    'suspend_date_after_as_of',
    'closed_does_not_add',
    'some_future_code',
  ])('%s has no deadline', reason => {
    expect(reinstateDeadline(reason, '2026-11-18')).toBeNull()
  })

  it('has no deadline for a date that is not ISO', () => {
    expect(reinstateDeadline(SEPT30, 'Nov 18, 2026')).toBeNull()
  })
})
