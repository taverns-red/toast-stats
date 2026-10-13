/**
 * #1791 — prior program years for the club page's membership trend, from the
 * club's year-end history rows (`useClubHistory`): each completed PY becomes
 * a two-point series, base at its July 1 start and the year-end close at the
 * row's own snapshot date. The shape is #1705's `PriorYearTrend`, so the
 * shared builder (`buildMembershipTrendChartData`) places and anchors it.
 */
import { describe, it, expect } from 'vitest'
import { clubPriorYearTrends } from '../clubPriorYearTrends'
import type { ClubHistoryRow } from '../clubHistory'

const row = (o: Partial<ClubHistoryRow>): ClubHistoryRow => ({
  startYear: 2025,
  label: '2025-2026',
  yearEndDate: '2026-06-30',
  hasData: true,
  dcpGoals: 5,
  tierCode: null,
  tierLabel: '—',
  membershipBase: 16,
  membershipEnd: 21,
  membershipNet: 5,
  octoberRenewals: 10,
  aprilRenewals: 9,
  clubStatus: 'Active',
  ...o,
})

// Newest first, as useClubHistory returns them.
const ROWS: ClubHistoryRow[] = [
  row({}),
  row({
    startYear: 2024,
    label: '2024-2025',
    yearEndDate: '2025-06-30',
    membershipBase: 20,
    membershipEnd: 16,
  }),
  row({
    startYear: 2023,
    label: '2023-2024',
    yearEndDate: '2024-06-30',
    hasData: false,
    membershipBase: null,
    membershipEnd: null,
  }),
]

describe('clubPriorYearTrends', () => {
  it('turns each prior year into base (Jul 1) and close (year-end date)', () => {
    expect(clubPriorYearTrends(ROWS, '2026-2027')).toEqual([
      {
        label: '2025-2026',
        data: [
          { date: '2025-07-01', count: 16 },
          { date: '2026-06-30', count: 21 },
        ],
      },
      {
        label: '2024-2025',
        data: [
          { date: '2024-07-01', count: 20 },
          { date: '2025-06-30', count: 16 },
        ],
      },
    ])
  })

  it('keeps only years before the page program year (R3: the page decides)', () => {
    expect(clubPriorYearTrends(ROWS, '2025-2026').map(t => t.label)).toEqual([
      '2024-2025',
    ])
  })

  it('drops years with no data and keeps a single known point', () => {
    const out = clubPriorYearTrends(
      [row({ membershipBase: null, membershipEnd: 12 })],
      '2026-2027'
    )
    expect(out).toEqual([
      { label: '2025-2026', data: [{ date: '2026-06-30', count: 12 }] },
    ])
  })

  it('returns nothing for an unparseable program year', () => {
    expect(clubPriorYearTrends(ROWS, 'current')).toEqual([])
  })
})
