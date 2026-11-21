/* The ranking cards on tied dates (#3145). A tie across every district makes
   each district rank 1, so the Overall card must say "Tied", and a tied
   previous year must not give this year's cards a change. */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import GlobalRankingsTab from '../GlobalRankingsTab'
import {
  renderWithProviders,
  cleanupAllResources,
} from '../../__tests__/utils/componentTestUtils'
import type {
  EndOfYearRankings,
  UseGlobalRankingsResult,
  YearlyRankingSummary,
} from '../../hooks/useGlobalRankings'
import type { ProgramYear } from '../../utils/programYear'

vi.mock('../../hooks/useGlobalRankings', () => ({
  useGlobalRankings: vi.fn(),
}))

import { useGlobalRankings } from '../../hooks/useGlobalRankings'

const mockUseGlobalRankings = vi.mocked(useGlobalRankings)

const py2025: ProgramYear = {
  year: 2025,
  startDate: '2025-07-01',
  endDate: '2026-06-30',
  label: '2025-2026',
}
const py2024: ProgramYear = {
  year: 2024,
  startDate: '2024-07-01',
  endDate: '2025-06-30',
  label: '2024-2025',
}

const yearly = (
  programYear: string,
  rank: number,
  extra: Partial<YearlyRankingSummary> = {}
): YearlyRankingSummary => ({
  programYear,
  overallRank: rank,
  clubsRank: rank,
  paymentsRank: rank,
  distinguishedRank: rank,
  totalDistricts: 94,
  isPartialYear: false,
  yearOverYearChange: null,
  ...extra,
})

const current = (
  extra: Partial<EndOfYearRankings['overall']> = {}
): EndOfYearRankings => ({
  overall: { rank: 10, totalDistricts: 94, percentile: 89.4, ...extra },
  paidClubs: { rank: 10, totalDistricts: 94, percentile: 89.4 },
  membershipPayments: { rank: 10, totalDistricts: 94, percentile: 89.4 },
  distinguishedClubs: { rank: 10, totalDistricts: 94, percentile: 89.4 },
  asOfDate: '2026-06-30',
  isPartialYear: false,
})

const hookResult = (
  endOfYearRankings: EndOfYearRankings,
  yearlyRankings: YearlyRankingSummary[]
): UseGlobalRankingsResult =>
  ({
    currentYearHistory: null,
    endOfYearRankings,
    availableProgramYears: [py2025, py2024],
    yearlyRankings,
    isLoading: false,
    isLoadingChart: false,
    isLoadingMultiYear: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }) as unknown as UseGlobalRankingsResult

const props = {
  districtId: '61',
  districtName: 'District 61',
  selectedProgramYear: py2025,
}

describe('GlobalRankingsTab cards on tied dates (#3145)', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanupAllResources())

  it('shows "Tied" on the Overall Rank card when the overall score is tied', () => {
    mockUseGlobalRankings.mockReturnValue(
      hookResult(current({ rank: 1, percentile: 98.9, tied: true }), [
        yearly('2025-2026', 1),
        yearly('2024-2025', 20),
      ])
    )

    renderWithProviders(<GlobalRankingsTab {...props} />)

    const panel = screen.getByRole('list', {
      name: 'End-of-year ranking metrics',
    })
    expect(
      within(panel).getByLabelText(
        'Overall Rank: Tied, every district has the same value'
      )
    ).toBeInTheDocument()
  })

  it('shows no change on the cards when the previous year was tied', () => {
    mockUseGlobalRankings.mockReturnValue(
      hookResult(current(), [
        yearly('2025-2026', 10),
        yearly('2024-2025', 1, {
          overallTied: true,
          clubsTied: true,
          paymentsTied: true,
          distinguishedTied: true,
        }),
      ])
    )

    renderWithProviders(<GlobalRankingsTab {...props} />)

    expect(screen.queryAllByLabelText(/by \d+ positions?/i)).toHaveLength(0)
  })

  it('still shows the change when the previous year was not tied', () => {
    mockUseGlobalRankings.mockReturnValue(
      hookResult(current(), [yearly('2025-2026', 10), yearly('2024-2025', 1)])
    )

    renderWithProviders(<GlobalRankingsTab {...props} />)

    expect(
      screen.getAllByLabelText(/by \d+ positions?/i).length
    ).toBeGreaterThan(0)
  })
})
