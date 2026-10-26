/**
 * Division and area pages: the officer-training count (#2296) — clubs with
 * 4+ officers trained (DCP goal 9) in each round for this division or area,
 * linking to the Training page pre-filtered to it. Read from the snapshot
 * the pages already load; the date (2026-03-15, PY 2025-26) is past both
 * rounds, so both show final results.
 */
import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, screen, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import '@testing-library/jest-dom'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import DivisionPage from '../DivisionPage'
import AreaPage from '../AreaPage'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

const perf = (number: string, area: string, base: string) => ({
  Division: 'A',
  Area: area,
  'Club Number': number,
  'Club Name': `Club ${number}`,
  'Division Club Base': '3',
  'Area Club Base': base,
  'Nov Visit award': '0',
  'May Visit award': '0',
})
const club = (number: string, area: string, r1: string, r2: string) => ({
  Division: 'A',
  Area: area,
  'Club Number': number,
  'Club Name': `Club ${number}`,
  'Club Status': 'Active',
  'Club Distinguished Status': '',
  CSP: 'Y',
  'Off. Trained Round 1': r1,
  'Off. Trained Round 2': r2,
})

const SNAPSHOT = {
  divisionPerformance: [
    perf('123456', '10', '1'),
    perf('234567', '11', '2'),
    perf('654321', '11', '2'),
  ],
  clubPerformance: [
    club('123456', '10', '7', '4'),
    club('234567', '11', '4', '2'),
    club('654321', '11', '1', '0'),
  ],
}

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

const trend = (clubId: string, areaId: string): ClubTrend => ({
  clubId,
  clubName: `Club ${clubId}`,
  divisionId: 'A',
  divisionName: 'Division A',
  areaId,
  areaName: `Area ${areaId}`,
  distinguishedLevel: 'NotDistinguished',
  currentStatus: 'vulnerable',
  riskFactors: [],
  membershipTrend: [{ date: '2026-03-15', count: 20 }],
  dcpGoalsTrend: [{ date: '2026-03-15', goalsAchieved: 2 }],
})

vi.mock('../../hooks/useDistrictAnalytics', async () => {
  const actual = await vi.importActual<
    typeof import('../../hooks/useDistrictAnalytics')
  >('../../hooks/useDistrictAnalytics')
  return {
    ...actual,
    useDistrictAnalytics: vi.fn(() => ({
      data: {
        allClubs: [
          trend('123456', '10'),
          trend('234567', '11'),
          trend('654321', '11'),
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })),
  }
})

afterEach(() => cleanup())

describe('officer-training count on the division and area pages (#2296)', () => {
  it('division page: per-round count of clubs at 4+, linking to the filtered Training page', () => {
    render(
      <MemoryRouter initialEntries={['/district/61/division/A']}>
        <Routes>
          <Route
            path="/district/:districtId/division/:divId"
            element={<DivisionPage />}
          />
        </Routes>
      </MemoryRouter>
    )
    const summary = screen.getByTestId('officer-training-summary')
    expect(summary).toHaveTextContent(
      'Round 1 (final): 2 of 3 clubs with 4+ trained (67%)'
    )
    expect(summary).toHaveTextContent(
      'Round 2 (final): 1 of 3 clubs with 4+ trained (33%)'
    )
    expect(within(summary).getByRole('link')).toHaveAttribute(
      'href',
      '/district/61/training?division=A'
    )
  })

  it('area page: the area’s own clubs, linking with division and area', () => {
    render(
      <MemoryRouter initialEntries={['/district/61/division/A/area/11']}>
        <Routes>
          <Route
            path="/district/:districtId/division/:divId/area/:areaId"
            element={<AreaPage />}
          />
        </Routes>
      </MemoryRouter>
    )
    const summary = screen.getByTestId('officer-training-summary')
    expect(summary).toHaveTextContent(
      'Round 1 (final): 1 of 2 clubs with 4+ trained (50%)'
    )
    expect(within(summary).getByRole('link')).toHaveAttribute(
      'href',
      '/district/61/training?division=A&area=11'
    )
  })
})
