/**
 * Division / Area desktop tables reuse the shared Health and Tier cells
 * (#2669, decision T2): a marker shape plus one-casing text for Health, and
 * the plain-text tier for Distinguished. No raw `Select` or bare dash.
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
    data: undefined,
    isLoading: false,
    error: null,
  })),
}))

const BASE: ClubTrend = {
  clubId: 'c1',
  clubName: 'Limestone City Club',
  divisionId: 'A',
  divisionName: 'Division A',
  areaId: '01',
  areaName: 'Area 01',
  distinguishedLevel: 'NotDistinguished',
  currentStatus: 'intervention-required',
  riskFactors: [],
  membershipTrend: [{ date: '2025-07-15', count: 18 }],
  dcpGoalsTrend: [{ date: '2025-07-15', goalsAchieved: 3 }],
}
const CLUBS: ClubTrend[] = [
  BASE,
  {
    ...BASE,
    clubId: 'c2',
    clubName: 'Select Club',
    currentStatus: 'thriving',
    distinguishedLevel: 'Select',
    isProvisionallyDistinguished: false,
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
    <MemoryRouter initialEntries={['/district/61/division/A/area/01']}>
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

describe.each([
  ['DivisionPage', renderDivision],
  ['AreaPage', renderArea],
])('%s desktop cells (#2669)', (_name, renderPage) => {
  it('renders Health with the shared HealthStatusCell and one casing', () => {
    const { container } = renderPage()
    const cells = [...container.querySelectorAll('td .dt-health')]
    expect(cells).toHaveLength(2)
    expect(
      cells[0]!.querySelector('svg[data-marker="intervention-required"]')
    ).not.toBeNull()
    expect(cells[0]!.textContent).toBe('Intervention required')
    expect(
      cells[1]!.querySelector('svg[data-marker="thriving"]')
    ).not.toBeNull()
    expect(container.textContent).not.toMatch(/Intervention Required/)
  })

  it('renders Distinguished with the shared TierCell', () => {
    const { container } = renderPage()
    const tiers = [...container.querySelectorAll('td .dt-tier')]
    expect(tiers).toHaveLength(2)
    expect(tiers[0]).toHaveClass('dt-tier--none')
    expect(tiers[0]!.textContent).toContain('Not distinguished')
    expect(tiers[1]!.textContent).toContain('Select')
  })
})
