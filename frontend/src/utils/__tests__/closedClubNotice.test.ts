/**
 * The closed-club header (#3104), wording approved by Ron on 2026-11-20:
 * "Closed. Last on Toastmasters’ club list: {Month D, YYYY}", with the
 * curly apostrophe the rest of the UI uses.
 */
import { describe, it, expect } from 'vitest'
import { closedClubNotice } from '../closedClubNotice'

describe('closedClubNotice', () => {
  it('names the last snapshot date in full', () => {
    expect(closedClubNotice('2025-06-30')).toBe(
      'Closed. Last on Toastmasters’ club list: June 30, 2025'
    )
  })

  it('formats any month and day the same way', () => {
    expect(closedClubNotice('2025-04-30')).toBe(
      'Closed. Last on Toastmasters’ club list: April 30, 2025'
    )
    expect(closedClubNotice('2026-01-05')).toBe(
      'Closed. Last on Toastmasters’ club list: January 5, 2026'
    )
  })
})
