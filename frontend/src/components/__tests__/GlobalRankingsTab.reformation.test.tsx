/**
 * Global rankings across the 2026 district reformation (#1442).
 *
 * Site 4 of 4. The previous-year rank comparison takes the next entry in
 * `yearlyRankings` and hands it to `EndOfYearRankingsPanel`, which renders a
 * "+5 positions" delta on each ranking card. A rank is a position in a field,
 * and the reformation shrank the field by 25+ districts — so across
 * 2026-07-01 the same rank number is not the same achievement, and the delta
 * between the two is not an improvement or a decline.
 *
 * `totalDistricts` is the population this comparison is measured against, so
 * it is what the shared discontinuity detector is fed here.
 */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import GlobalRankingsTab, {
  type GlobalRankingsTabProps,
} from '../GlobalRankingsTab'
import {
  renderWithProviders,
  cleanupAllResources,
} from '../../__tests__/utils/componentTestUtils'
import { DISTRICT_REFORMATION_NOTICE } from '@taverns-red/shared-contracts'
import type { UseGlobalRankingsResult } from '../../hooks/useGlobalRankings'
import type { ProgramYear } from '../../utils/programYear'

vi.mock('../../hooks/useGlobalRankings', () => ({
  useGlobalRankings: vi.fn(),
}))

import { useGlobalRankings } from '../../hooks/useGlobalRankings'

const mockUseGlobalRankings = vi.mocked(useGlobalRankings)

const py2026: ProgramYear = {
  year: 2026,
  startDate: '2026-07-01',
  endDate: '2027-06-30',
  label: '2026-2027',
}
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

function yearly(
  programYear: string,
  overallRank: number,
  totalDistricts: number
) {
  return {
    programYear,
    overallRank,
    clubsRank: overallRank,
    paymentsRank: overallRank,
    distinguishedRank: overallRank,
    totalDistricts,
    isPartialYear: false,
    yearOverYearChange: null,
  }
}

function hookResult(
  yearlyRankings: ReturnType<typeof yearly>[],
  availableProgramYears: ProgramYear[],
  totalDistricts: number
): UseGlobalRankingsResult {
  return {
    currentYearHistory: null,
    endOfYearRankings: {
      overall: { rank: 15, totalDistricts, percentile: 88.1 },
      paidClubs: { rank: 10, totalDistricts, percentile: 92.1 },
      membershipPayments: { rank: 15, totalDistricts, percentile: 88.1 },
      distinguishedClubs: { rank: 5, totalDistricts, percentile: 96.0 },
      asOfDate: '2026-11-30',
      isPartialYear: true,
    },
    availableProgramYears,
    yearlyRankings,
    isLoading: false,
    isLoadingChart: false,
    isLoadingMultiYear: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as UseGlobalRankingsResult
}

const baseProps: GlobalRankingsTabProps = {
  districtId: '61',
  districtName: 'District 61',
  selectedProgramYear: py2026,
}

describe('GlobalRankingsTab across the 2026 reformation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanupAllResources()
  })

  it('suppresses the previous-year rank delta when the ranked field changed size', () => {
    // 126 districts last year, 101 this year — the reformation, not a trend.
    mockUseGlobalRankings.mockReturnValue(
      hookResult(
        [yearly('2026-2027', 15, 101), yearly('2025-2026', 20, 126)],
        [py2026, py2025],
        101
      )
    )

    renderWithProviders(<GlobalRankingsTab {...baseProps} />)

    expect(screen.queryAllByLabelText(/by \d+ positions?/i)).toHaveLength(0)
    expect(screen.getByText(DISTRICT_REFORMATION_NOTICE)).toBeInTheDocument()
  })

  it('still compares ranks when the field size held steady across the boundary', () => {
    mockUseGlobalRankings.mockReturnValue(
      hookResult(
        [yearly('2026-2027', 15, 124), yearly('2025-2026', 20, 126)],
        [py2026, py2025],
        124
      )
    )

    renderWithProviders(<GlobalRankingsTab {...baseProps} />)

    expect(
      screen.getAllByLabelText(/by \d+ positions?/i).length
    ).toBeGreaterThan(0)
    expect(
      screen.queryByText(DISTRICT_REFORMATION_NOTICE)
    ).not.toBeInTheDocument()
  })

  it('leaves an ordinary year-over-year rank comparison untouched', () => {
    // The same field-size jump, one program year earlier — not the boundary.
    mockUseGlobalRankings.mockReturnValue(
      hookResult(
        [yearly('2025-2026', 15, 101), yearly('2024-2025', 20, 126)],
        [py2025, py2024],
        101
      )
    )

    renderWithProviders(
      <GlobalRankingsTab {...baseProps} selectedProgramYear={py2025} />
    )

    expect(
      screen.getAllByLabelText(/by \d+ positions?/i).length
    ).toBeGreaterThan(0)
    expect(
      screen.queryByText(DISTRICT_REFORMATION_NOTICE)
    ).not.toBeInTheDocument()
  })
})
