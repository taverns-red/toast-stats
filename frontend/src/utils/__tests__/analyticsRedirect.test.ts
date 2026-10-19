import { describe, it, expect } from 'vitest'
import { analyticsRedirectTarget } from '../analyticsRedirect'

/* The retired Analytics subpage (#2159). Its two top-10 lists were duplicated
   by the Clubs table's sortable columns, so the old URL lands on Clubs sorted
   by the Trend (net change) column — the `sort` / `dir` URL keys
   DistrictClubsPage reads, with `netChange` from the SortField union. The
   old `#education-awards` anchor keeps going to the Education leaderboards. */

describe('analyticsRedirectTarget (#2159)', () => {
  it('sends the bare route to Clubs sorted by net change, descending', () => {
    expect(analyticsRedirectTarget('61', '', '')).toBe(
      '/district/61/clubs?sort=netChange&dir=desc'
    )
  })

  it('keeps the program year and date params', () => {
    expect(analyticsRedirectTarget('61', '?py=2025&date=2026-03-31', '')).toBe(
      '/district/61/clubs?py=2025&date=2026-03-31&sort=netChange&dir=desc'
    )
  })

  it('keeps any other params too, and overrides a stale sort', () => {
    expect(
      analyticsRedirectTarget('61', '?sort=name&dir=asc&utm_source=x', '')
    ).toBe('/district/61/clubs?sort=netChange&dir=desc&utm_source=x')
  })

  it('sends #education-awards to the Education leaderboards with the params', () => {
    expect(analyticsRedirectTarget('61', '?py=2025', '#education-awards')).toBe(
      '/district/61/education?py=2025#leaderboards'
    )
    expect(analyticsRedirectTarget('61', '', '#education-awards')).toBe(
      '/district/61/education#leaderboards'
    )
  })

  it('drops any other hash: it named a block that no longer exists', () => {
    expect(analyticsRedirectTarget('61', '', '#top-growth')).toBe(
      '/district/61/clubs?sort=netChange&dir=desc'
    )
  })
})
