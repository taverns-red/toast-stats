/**
 * ClubHistoryTable — each row's district (#1803, epic #1781).
 *
 * Rows now carry the district the club was in that program year (from the
 * club-district history, #1782). The table shows a District column only when
 * the page asks for it (`showDistrict`: the districts vary), and each year
 * links straight to the club page in THAT year's district.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { ClubHistoryTable } from '../ClubHistoryTable'
import type { ClubHistoryRow } from '../../utils/clubHistory'

let mobile = false
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => mobile }))

afterEach(() => {
  cleanup()
  mobile = false
})

const base = {
  hasData: true,
  dcpGoals: 4,
  tierCode: null,
  tierLabel: '—',
  membershipBase: 25,
  membershipEnd: 19,
  membershipNet: -6,
  octoberRenewals: 12,
  aprilRenewals: null,
  clubStatus: 'Active',
} as const

// Club 977: District 01 through 2025-26 (prod history), D201 after.
const rows: ClubHistoryRow[] = [
  {
    ...base,
    startYear: 2025,
    label: '2025-2026',
    yearEndDate: '2026-06-30',
    districtId: '01',
  },
  {
    ...base,
    startYear: 2024,
    label: '2024-2025',
    yearEndDate: '2025-06-30',
    districtId: '01',
  },
]

function renderTable(showDistrict: boolean) {
  return render(
    <MemoryRouter>
      <ClubHistoryTable
        rows={rows}
        clubName="Professional Women Toastmasters"
        clubId="977"
        showDistrict={showDistrict}
      />
    </MemoryRouter>
  )
}

describe('ClubHistoryTable — district per year (#1803)', () => {
  it("links each year to the club page in that year's district", () => {
    renderTable(false)
    expect(screen.getByRole('link', { name: '2024-2025' })).toHaveAttribute(
      'href',
      '/district/01/club/977?py=2024'
    )
  })

  it('shows a District column when asked', () => {
    renderTable(true)
    expect(
      screen.getByRole('columnheader', { name: /District/ })
    ).toBeInTheDocument()
    const firstRow = screen.getAllByRole('row')[1]!
    expect(within(firstRow).getByText('District 1')).toBeInTheDocument()
  })

  it('has no District column otherwise', () => {
    renderTable(false)
    expect(screen.queryByRole('columnheader', { name: /District/ })).toBeNull()
  })

  it("names each year's district under the year on phones", () => {
    mobile = true
    renderTable(true)
    const table = screen.getByRole('table', {
      name: 'Professional Women Toastmasters program-year history',
    })
    expect(within(table).getAllByText('District 1')).toHaveLength(2)
  })
})
