/**
 * AreaPage data parity with the Divisions overview (#1016, epic #1008).
 *
 * Sprint 1 (#1015) gave DivisionPage parity with the Divisions overview via the
 * shared extractDivisionPerformance → DivisionPerformanceCard surface. Sprint 2
 * ports the same recognition-aware data down to the standalone AreaPage: the
 * scoped page must render, for its single area, the same per-area row the
 * overview shows (recognition badge, First/Second Round Visits, Gap-to-D/S/P
 * via AreaPerformanceTable) AND the scoped narrative the overview carries
 * (generateAreaProgressText — the #974/#976 per-area progress prose), all from
 * the snapshot — one source of truth (R6/R8). Per Lesson 147, the recognition
 * surface is fed by the snapshot and must NOT be hidden behind the *other*
 * source's (allClubs) emptiness check.
 */
import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import { extractDivisionPerformance } from '../../utils/extractDivisionPerformance'
import { withProvisionalDistinguished } from '../../utils/divisionAreaDistinguished'
import { generateAreaProgressText } from '../../utils/areaProgressText'
import { calculateAreaGapAnalysis } from '../../utils/areaGapAnalysis'
import AreaPage from '../AreaPage'
import { downloadCSV } from '../../utils/csvExport'

vi.mock('../../utils/csvExport', async () => {
  const actual = await vi.importActual<typeof import('../../utils/csvExport')>(
    '../../utils/csvExport'
  )
  return { ...actual, downloadCSV: vi.fn() }
})

vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}))

// Division A, Area 10: one Select Distinguished club (R1 visit done). Area 11:
// two undistinguished clubs (no visits). We scope to Area 10.
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

afterEach(() => cleanup())

describe('AreaPage data parity with the Divisions overview (#1016)', () => {
  it('renders the per-area recognition badge from the snapshot', () => {
    const { getAllByLabelText } = renderArea()
    expect(
      getAllByLabelText(/Recognition status:/i).length
    ).toBeGreaterThanOrEqual(1)
  })

  it('renders the per-area First/Second Round Visit columns', () => {
    const { getByText } = renderArea()
    expect(getByText('First round visits')).toBeInTheDocument()
    expect(getByText('Second round visits')).toBeInTheDocument()
  })

  it('renders Gap-to-D / S / P columns from the shared area performance row', () => {
    const { getByText } = renderArea()
    expect(getByText('Gap to D')).toBeInTheDocument()
    expect(getByText('Gap to S')).toBeInTheDocument()
    expect(getByText('Gap to P')).toBeInTheDocument()
  })

  it('renders the scoped areaProgressText narrative for this area', () => {
    const { getByTestId } = renderArea()
    const narrative = getByTestId('area-progress-text')
    // The generator always prefixes the area label "Area <id> (Division <id)".
    expect(narrative.textContent).toMatch(/Area 10 \(Division A\)/)
  })

  it('narrative equals the overview generator output for the same snapshot — Club Success Plan clause included (#1555)', () => {
    // Parity by construction: the page must feed the SAME derived area row to
    // the SAME generator the Divisions overview uses, so the CSP clause (raw
    // path, `cspTracked` gated on the pinned date's program year) lands here
    // with no page-specific logic.
    // The page splits the count into confirmed + qualifying today from the
    // club rows (#2580); the overview path does the same, so parity holds.
    const area = withProvisionalDistinguished(
      extractDivisionPerformance(SNAPSHOT, '2026-03-15'),
      [CLUB],
      '2026-03-15'
    )
      .find(d => d.divisionId === 'A')!
      .areas.find(a => a.areaId === '10')!
    const expected = generateAreaProgressText(
      { ...area, divisionId: 'A' },
      calculateAreaGapAnalysis({
        clubBase: area.clubBase,
        paidClubs: area.paidClubs,
        distinguishedClubs: area.distinguishedClubs,
      })
    ).progressText

    const { getByTestId } = renderArea()
    const narrative = getByTestId('area-progress-text').textContent ?? ''
    expect(area.cspTracked).toBe(true)
    expect(expected).toContain('Club Success Plans: all 1 club has submitted.')
    expect(narrative).toContain(expected)
  })

  it('still renders the recognition surface when allClubs has no rows for the area', async () => {
    // Parity surface is fed by the snapshot, not allClubs. An area with snapshot
    // data but zero analytics-club rows (suspended/migrated clubs, or a casing
    // skew) must still show parity data — not a bare "No clubs" placeholder that
    // hides it (Lesson 147, inherited from Sprint 1 #1015).
    const mod = await import('../../hooks/useDistrictAnalytics')
    const spy = mod.useDistrictAnalytics as unknown as ReturnType<typeof vi.fn>
    spy.mockReturnValueOnce({
      data: { allClubs: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    const { getAllByLabelText, getByTestId } = renderArea()
    expect(
      getAllByLabelText(/Recognition status:/i).length
    ).toBeGreaterThanOrEqual(1)
    expect(getByTestId('area-progress-text').textContent).toMatch(
      /Area 10 \(Division A\)/
    )
  })
})

describe('AreaPage area workbook (#2428)', () => {
  it('downloads the area workbook: one row per club, named for district, area and date', () => {
    const { getByRole } = renderArea()
    fireEvent.click(getByRole('button', { name: 'Download area workbook' }))
    expect(downloadCSV).toHaveBeenCalledTimes(1)
    const [csv, filename] = vi.mocked(downloadCSV).mock.calls[0]!
    expect(filename).toBe('area_workbook_district_61_area_A10_2026-03-15.csv')
    expect(csv.split('\n')).toEqual([
      'Club Number,Club Name,Division,Area,Health,Members,DCP Goals Met,Distinguished,Missing for Distinguished,Club Visit (Current Round),Club Success Plan,Next Deadline,Next Deadline For',
      // 15 March 2026 is round 2 (no May visit yet); the next date that
      // applies to a club with its plan filed is the 1 April dues renewal.
      '123456,Ottawa Club,A,10,Thriving,25,8,Select,Achieved,Not yet,Filed,2026-04-01,April dues renewal due',
    ])
  })
})
