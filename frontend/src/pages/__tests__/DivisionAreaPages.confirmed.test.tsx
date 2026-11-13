/**
 * Division and Area pages: confirmed Distinguished headline (#2580, part).
 *
 * The fixture's one Select club is provisional (pre-April, no confirming
 * renewals), so the snapshot's count of 1 is qualifying today, not confirmed:
 * the pages headline 0 and show "+1 qualifying today" beside it, in the
 * summary pill, the area table and the narrative.
 */
import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import DivisionPage from '../DivisionPage'
import AreaPage from '../AreaPage'

vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}))

// Two clubs in Division A: one Select Distinguished (area 10, R1 visit done),
// two undistinguished (area 11, no visits). base 3 → required distinguished
// ceil(3 * 0.45) = 2, so the division sits below Distinguished with a Gap-to-D
// of 1 and area 10 has a met first-round visit while area 11 does not.
const SNAPSHOT = {
  asOfDate: '2026-03-15',
  divisionPerformance: [
    {
      Division: 'A',
      Area: '10',
      'Club Number': '123456',
      'Club Name': 'Ottawa Club',
      'Division Club Base': '3',
      'Area Club Base': '1',
      'Nov Visit award': '1',
      'May Visit award': '0',
    },
    {
      Division: 'A',
      Area: '11',
      'Club Number': '234567',
      'Club Name': 'Vulnerable Club',
      'Division Club Base': '3',
      'Area Club Base': '2',
      'Nov Visit award': '0',
      'May Visit award': '0',
    },
    {
      Division: 'A',
      Area: '11',
      'Club Number': '654321',
      'Club Name': 'Struggling Club',
      'Division Club Base': '3',
      'Area Club Base': '2',
      'Nov Visit award': '0',
      'May Visit award': '0',
    },
  ],
  clubPerformance: [
    // PY 2025-26 snapshot, so the CSP column is present (#1555): the Select
    // club has filed; the two undistinguished clubs have not.
    {
      'Club Number': '123456',
      'Club Name': 'Ottawa Club',
      'Club Status': 'Active',
      'Club Distinguished Status': 'Select Distinguished',
      CSP: 'Y',
    },
    {
      'Club Number': '234567',
      'Club Name': 'Vulnerable Club',
      'Club Status': 'Active',
      'Club Distinguished Status': '',
      CSP: 'N',
    },
    {
      'Club Number': '654321',
      'Club Name': 'Struggling Club',
      'Club Status': 'Active',
      'Club Distinguished Status': '',
      CSP: 'N',
    },
  ],
}

// PY-selector wiring (#1302): DivisionPage/AreaPage now own program-year state
// via useDistrictProgramYearControls. Mock its two dependencies so these tests
// stay provider-free and PY-agnostic (fixed to the snapshot's PY 2025-2026).
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

// The freshness pill reads the GLOBAL as-of date (#1321). These tests are
// deliberately provider-free and assert recognition data, not the pill, so stub
// it rather than stand up a QueryClientProvider.
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

const CLUB: ClubTrend = {
  clubId: '123456',
  clubName: 'Ottawa Club',
  divisionId: 'A',
  divisionName: 'Division A',
  areaId: '10',
  areaName: 'Area 10',
  distinguishedLevel: 'Select',
  isProvisionallyDistinguished: true,
  currentStatus: 'thriving',
  riskFactors: [],
  membershipTrend: [{ date: '2026-03-15', count: 25 }],
  dcpGoalsTrend: [{ date: '2026-03-15', goalsAchieved: 8 }],
}

vi.mock('../../hooks/useDistrictAnalytics', async () => {
  const actual = await vi.importActual<
    typeof import('../../hooks/useDistrictAnalytics')
  >('../../hooks/useDistrictAnalytics')
  return {
    ...actual,
    useDistrictAnalytics: vi.fn(() => ({
      data: { allClubs: [CLUB] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })),
  }
})

function renderAt(path: string, route: string, element: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={element} />
      </Routes>
    </MemoryRouter>
  )
}

afterEach(() => cleanup())

describe('DivisionPage confirmed Distinguished headline (#2580)', () => {
  const renderDivision = () =>
    renderAt(
      '/district/61/division/A',
      '/district/:districtId/division/:divId',
      <DivisionPage />
    )

  it('the summary pill headlines the confirmed count with the extra beside it', () => {
    const { container } = renderDivision()
    const pill = container.querySelector('[aria-label^="Distinguished clubs:"]')
    expect(pill?.textContent).toContain('0/2')
    expect(
      container.querySelector('[data-testid="distinguished-provisional"]')
        ?.textContent
    ).toContain('+1 qualifying today')
  })

  it('the area row shows the confirmed count and percentage', () => {
    const { getByText } = renderDivision()
    const row = getByText('10', { selector: 'th' }).closest('tr')!
    expect(row.textContent).toContain('0/1 0%')
    expect(row.textContent).toContain('+1 qualifying today')
  })

  it('the narrative names the confirmed count and the extra', () => {
    const { getByTestId } = renderDivision()
    expect(getByTestId('division-progress-text').textContent).toContain(
      '0 of 3 distinguished (+1 qualifying today)'
    )
  })
})

describe('AreaPage confirmed Distinguished headline (#2580)', () => {
  const renderArea = () =>
    renderAt(
      '/district/61/division/A/area/10',
      '/district/:districtId/division/:divId/area/:areaId',
      <AreaPage />
    )

  it('the area row shows the confirmed count and percentage with the extra', () => {
    const { getByText } = renderArea()
    const row = getByText('10', { selector: 'th' }).closest('tr')!
    expect(row.textContent).toContain('0/1 0%')
    expect(row.textContent).toContain('+1 qualifying today')
  })

  it('the narrative names the confirmed count and the extra', () => {
    const { container } = renderArea()
    expect(container.textContent).toContain(
      '0 of 1 distinguished (+1 qualifying today)'
    )
  })
})
