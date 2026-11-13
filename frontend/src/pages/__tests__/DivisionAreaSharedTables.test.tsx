/**
 * Division and Area pages: shared club table, legend, headings (#2718, M5 of
 * #2676; #2655 UNIT-11, UNIT-27; #2707 legend).
 *
 * Page mounts live here (R22). The component-level contract is in
 * components/__tests__/DivisionAreaTables.sharedTable.test.tsx.
 */
import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import DivisionPage from '../DivisionPage'
import AreaPage from '../AreaPage'

const SNAPSHOT = {
  asOfDate: '2026-03-15',
  divisionPerformance: [
    {
      Division: 'A',
      Area: '10',
      'Club Number': 'c1',
      'Club Name': 'Limestone City Club',
      'Division Club Base': '2',
      'Area Club Base': '2',
      'Nov Visit award': '1',
      'May Visit award': '0',
    },
    {
      Division: 'A',
      Area: '10',
      'Club Number': 'c2',
      'Club Name': 'Select Club',
      'Division Club Base': '2',
      'Area Club Base': '2',
      'Nov Visit award': '1',
      'May Visit award': '0',
    },
  ],
  clubPerformance: [
    {
      'Club Number': 'c1',
      'Club Name': 'Limestone City Club',
      'Club Status': 'Active',
      'Club Distinguished Status': '',
    },
    {
      'Club Number': 'c2',
      'Club Name': 'Select Club',
      'Club Status': 'Active',
      'Club Distinguished Status': 'Select Distinguished',
    },
  ],
}

let mobile = false
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => mobile }))
vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: () => ({
    data: {
      districtId: '61',
      dates: ['2026-03-15'],
      count: 1,
      dateRange: { startDate: '2026-03-15', endDate: '2026-03-15' },
    },
  }),
}))
vi.mock('../../hooks/useUrlProgramYear', async () => {
  const { getProgramYear } = await import('../../utils/programYear')
  return {
    useUrlProgramYear: () => ({
      selectedProgramYear: getProgramYear(2025),
      setSelectedProgramYear: () => {},
      selectedDate: undefined,
      setSelectedDate: () => {},
    }),
  }
})
vi.mock('../../hooks/useLatestAsOfDate', () => ({
  useGlobalFreshness: () => ({ asOfDate: undefined, isLatest: false }),
}))
vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(() => ({
    data: SNAPSHOT,
    isLoading: false,
    error: null,
  })),
}))

const BASE: ClubTrend = {
  clubId: 'c1',
  clubName: 'Limestone City Club',
  divisionId: 'A',
  divisionName: 'Division A',
  areaId: '10',
  areaName: 'Area 10',
  distinguishedLevel: 'NotDistinguished',
  currentStatus: 'intervention-required',
  riskFactors: [],
  membershipTrend: [{ date: '2026-03-15', count: 18 }],
  dcpGoalsTrend: [{ date: '2026-03-15', goalsAchieved: 3 }],
}
const CLUBS: ClubTrend[] = [
  BASE,
  {
    ...BASE,
    clubId: 'c2',
    clubName: 'Select Club',
    currentStatus: 'thriving',
    distinguishedLevel: 'Select',
  },
]

vi.mock('../../hooks/useDistrictAnalytics', async () => {
  const actual = await vi.importActual<
    typeof import('../../hooks/useDistrictAnalytics')
  >('../../hooks/useDistrictAnalytics')
  return {
    ...actual,
    useDistrictAnalytics: vi.fn(() => ({
      data: { allClubs: CLUBS },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })),
  }
})

function renderDivision() {
  return render(
    <MemoryRouter initialEntries={['/district/61/division/A']}>
      <Routes>
        <Route
          path="/district/:districtId/division/:divId"
          element={<DivisionPage />}
        />
      </Routes>
    </MemoryRouter>
  )
}

function renderArea() {
  return render(
    <MemoryRouter initialEntries={['/district/61/division/A/area/10']}>
      <Routes>
        <Route
          path="/district/:districtId/division/:divId/area/:areaId"
          element={<AreaPage />}
        />
      </Routes>
    </MemoryRouter>
  )
}

afterEach(() => {
  cleanup()
  mobile = false
})

describe.each([
  ['DivisionPage', renderDivision],
  ['AreaPage', renderArea],
])('%s club table (#2718)', (_name, renderPage) => {
  it('renders the club table on the shared .dt styles with a caption and row headers', () => {
    const { container } = renderPage()
    const table = container.querySelector('table.dt.entity-table--clubs')
    expect(table).not.toBeNull()
    expect(table?.querySelector('caption')).not.toBeNull()
    const heads = [...table!.querySelectorAll('tbody th[scope="row"]')]
    expect(heads.map(h => h.textContent)).toEqual([
      'Limestone City Club',
      'Select Club',
    ])
  })

  it('has no whole-row click target', () => {
    const { container } = renderPage()
    expect(container.querySelector('tr.cursor-pointer')).toBeNull()
  })

  it('shows the health shape legend once above the club table (#2707)', () => {
    const { container } = renderPage()
    const legends = container.querySelectorAll('[data-testid="health-legend"]')
    expect(legends).toHaveLength(1)
    const table = container.querySelector('table.dt.entity-table--clubs')!
    // The legend precedes the first club table in document order.
    expect(
      legends[0]!.compareDocumentPosition(table) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('shows the legend above the phone list too', () => {
    mobile = true
    const { container } = renderPage()
    expect(
      container.querySelectorAll('[data-testid="health-legend"]')
    ).toHaveLength(1)
  })

  it('uses the 16px phone gutter class on the page root (UNIT-28)', () => {
    const { container } = renderPage()
    expect(container.querySelector('.app-shell__page')).toHaveClass(
      'entity-page'
    )
  })
})

describe('DivisionPage headings (#2718, UNIT-11)', () => {
  it('prints the area name once, not "Area 10 — Area 10"', () => {
    const { getAllByTestId } = renderDivision()
    const text = getAllByTestId('division-area-heading').map(h =>
      (h.textContent ?? '').replace(/\s+/g, ' ').trim()
    )
    expect(text).toHaveLength(1)
    expect(text[0]).not.toMatch(/Area 10\s*[—-]\s*Area 10/)
    expect(text[0]).toMatch(/^Area 10/)
  })

  it('gives the heading link a chevron so it reads as a link on a phone', () => {
    mobile = true
    const { getByTestId } = renderDivision()
    const link = getByTestId('division-area-heading').querySelector('a')!
    expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    expect(link).toHaveAttribute('href', '/district/61/division/A/area/10')
  })
})

describe('AreaPage headings (#2718, UNIT-27)', () => {
  it('labels the recognition pill "Recognition: <level>"', () => {
    const { container } = renderArea()
    const pill = container.querySelector('.districts-page-header [aria-label]')
    expect(pill?.textContent).toMatch(/^Recognition:\s*\S/)
  })

  it('has visible h2 headings "Recognition" and "Clubs (2)"', () => {
    const { getByRole } = renderArea()
    expect(
      getByRole('heading', { level: 2, name: 'Recognition' })
    ).toBeVisible()
    expect(getByRole('heading', { level: 2, name: 'Clubs (2)' })).toBeVisible()
  })

  it('the Division page labels its club sections the same way', () => {
    const { getByRole } = renderDivision()
    expect(
      getByRole('heading', { level: 2, name: 'Recognition' })
    ).toBeVisible()
  })
})
