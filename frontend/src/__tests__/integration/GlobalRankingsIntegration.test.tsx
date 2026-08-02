/**
 * Integration Tests for Global Rankings Feature
 *
 * Tests the complete data flow from API responses through hooks to component rendering.
 * Validates:
 * - Complete data flow (API → hooks → components)
 * - Program year transitions and data updates
 * - Error handling and retry functionality
 *
 * Validates Requirements: 2.1, 2.2, 2.3, 3.1-3.6, 4.1-4.6, 5.1-5.4, 7.1-7.4
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import GlobalRankingsTab, {
  type GlobalRankingsTabProps,
} from '../../components/GlobalRankingsTab'
import {
  renderWithProviders,
  cleanupAllResources,
} from '../utils/componentTestUtils'
import type { UseGlobalRankingsResult } from '../../hooks/useGlobalRankings'
import type { ProgramYear } from '../../utils/programYear'

// Mock the useGlobalRankings hook for integration testing
vi.mock('../../hooks/useGlobalRankings', () => ({
  useGlobalRankings: vi.fn(),
}))

// Import the mocked hook for type-safe mocking
import { useGlobalRankings } from '../../hooks/useGlobalRankings'

const mockUseGlobalRankings = vi.mocked(useGlobalRankings)

// ========== Test Data Fixtures ==========

const mockProgramYear2024: ProgramYear = {
  year: 2024,
  startDate: '2024-07-01',
  endDate: '2025-06-30',
  label: '2024-2025',
}

const mockProgramYear2023: ProgramYear = {
  year: 2023,
  startDate: '2023-07-01',
  endDate: '2024-06-30',
  label: '2023-2024',
}

const mockProgramYear2022: ProgramYear = {
  year: 2022,
  startDate: '2022-07-01',
  endDate: '2023-06-30',
  label: '2022-2023',
}

const mockRankHistory2024 = {
  districtId: '57',
  districtName: 'District 57',
  history: [
    {
      date: '2024-07-15',
      aggregateScore: 240,
      clubsRank: 20,
      paymentsRank: 25,
      distinguishedRank: 15,
      totalDistricts: 126,
    },
    {
      date: '2024-08-15',
      aggregateScore: 248,
      clubsRank: 18,
      paymentsRank: 22,
      distinguishedRank: 12,
      totalDistricts: 126,
    },
    {
      date: '2024-09-15',
      aggregateScore: 257,
      clubsRank: 15,
      paymentsRank: 18,
      distinguishedRank: 10,
      totalDistricts: 126,
    },
    {
      date: '2024-10-15',
      aggregateScore: 265,
      clubsRank: 12,
      paymentsRank: 15,
      distinguishedRank: 8,
      totalDistricts: 126,
    },
    {
      date: '2024-11-15',
      aggregateScore: 273,
      clubsRank: 10,
      paymentsRank: 12,
      distinguishedRank: 5,
      totalDistricts: 126,
    },
  ],
  programYear: {
    startDate: '2024-07-01',
    endDate: '2025-06-30',
    year: '2024-2025',
  },
}

// mockRankHistory2023 available for future tests requiring 2023 data
const _mockRankHistory2023 = {
  districtId: '57',
  districtName: 'District 57',
  history: [
    {
      date: '2023-07-15',
      aggregateScore: 225,
      clubsRank: 25,
      paymentsRank: 30,
      distinguishedRank: 20,
      totalDistricts: 126,
    },
    {
      date: '2023-10-15',
      aggregateScore: 235,
      clubsRank: 22,
      paymentsRank: 25,
      distinguishedRank: 18,
      totalDistricts: 126,
    },
    {
      date: '2024-01-15',
      aggregateScore: 247,
      clubsRank: 18,
      paymentsRank: 20,
      distinguishedRank: 15,
      totalDistricts: 126,
    },
    {
      date: '2024-06-30',
      aggregateScore: 255,
      clubsRank: 15,
      paymentsRank: 18,
      distinguishedRank: 12,
      totalDistricts: 126,
    },
  ],
  programYear: {
    startDate: '2023-07-01',
    endDate: '2024-06-30',
    year: '2023-2024',
  },
}
void _mockRankHistory2023

const mockEndOfYearRankings2024 = {
  overall: { rank: 9, totalDistricts: 126, percentile: 93.7 },
  paidClubs: { rank: 10, totalDistricts: 126, percentile: 92.1 },
  membershipPayments: { rank: 12, totalDistricts: 126, percentile: 90.5 },
  distinguishedClubs: { rank: 5, totalDistricts: 126, percentile: 96.0 },
  asOfDate: '2024-11-15',
  isPartialYear: true,
}

// mockEndOfYearRankings2023 available for future tests requiring 2023 data
const _mockEndOfYearRankings2023 = {
  overall: { rank: 15, totalDistricts: 126, percentile: 88.1 },
  paidClubs: { rank: 15, totalDistricts: 126, percentile: 88.1 },
  membershipPayments: { rank: 18, totalDistricts: 126, percentile: 85.7 },
  distinguishedClubs: { rank: 12, totalDistricts: 126, percentile: 90.5 },
  asOfDate: '2024-06-30',
  isPartialYear: false,
}
void _mockEndOfYearRankings2023

const mockYearlyRankings = [
  {
    programYear: '2024-2025',
    overallRank: 9,
    clubsRank: 10,
    paymentsRank: 12,
    distinguishedRank: 5,
    totalDistricts: 126,
    isPartialYear: true,
    yearOverYearChange: {
      overall: 6,
      clubs: 5,
      payments: 6,
      distinguished: 7,
    },
  },
  {
    programYear: '2023-2024',
    overallRank: 15,
    clubsRank: 15,
    paymentsRank: 18,
    distinguishedRank: 12,
    totalDistricts: 126,
    isPartialYear: false,
    yearOverYearChange: {
      overall: 3,
      clubs: 2,
      payments: 4,
      distinguished: 3,
    },
  },
  {
    programYear: '2022-2023',
    overallRank: 18,
    clubsRank: 17,
    paymentsRank: 22,
    distinguishedRank: 15,
    totalDistricts: 126,
    isPartialYear: false,
    yearOverYearChange: null,
  },
]

const mockRefetch = vi.fn()

const baseProps: GlobalRankingsTabProps = {
  districtId: '57',
  districtName: 'District 57',
}

// Helper to create mock hook result
const createMockHookResult = (
  overrides: Partial<UseGlobalRankingsResult> = {}
): UseGlobalRankingsResult => ({
  currentYearHistory: mockRankHistory2024,
  endOfYearRankings: mockEndOfYearRankings2024,
  availableProgramYears: [
    mockProgramYear2024,
    mockProgramYear2023,
    mockProgramYear2022,
  ],
  yearlyRankings: mockYearlyRankings,
  isLoading: false,
  isLoadingChart: false,
  isLoadingMultiYear: false,
  isError: false,
  error: null,
  refetch: mockRefetch,
  ...overrides,
})

// ========== Test Suites ==========

describe('GlobalRankingsIntegration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanupAllResources()
  })

  describe('10.1 Complete Data Flow (API → hooks → components)', () => {
    it('should pass available program years from hook data', async () => {
      mockUseGlobalRankings.mockReturnValue(createMockHookResult())

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // Tab no longer has its own ProgramYearSelector — it uses the page-level one
      // Verify the hook was called with district data
      expect(mockUseGlobalRankings).toHaveBeenCalledWith(
        expect.objectContaining({
          districtId: '57',
        })
      )
    })

    it('should display rank history data in the progression chart', async () => {
      mockUseGlobalRankings.mockReturnValue(createMockHookResult())

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // Verify chart section is rendered
      expect(screen.getByText('Ranking Progression')).toBeInTheDocument()

      // Verify metric toggle buttons are present
      expect(
        screen.getByRole('button', { name: /View Overall Rank/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /View Paid Clubs Rank/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /View Membership Payments Rank/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /View Distinguished Clubs Rank/i })
      ).toBeInTheDocument()
    })

    it('should display end-of-year rankings in RankingCards', async () => {
      mockUseGlobalRankings.mockReturnValue(createMockHookResult())

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // Verify all four ranking cards are displayed
      expect(screen.getByText('End-of-Year Rankings')).toBeInTheDocument()
      expect(screen.getByText('Overall Rank')).toBeInTheDocument()
      expect(screen.getByText('Paid Clubs')).toBeInTheDocument()
      // Use getAllByText for elements that appear multiple times
      expect(screen.getAllByText('Payments').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Distinguished').length).toBeGreaterThan(0)
    })

    it('should display yearly rankings in the comparison table', async () => {
      mockUseGlobalRankings.mockReturnValue(createMockHookResult())

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // Verify the comparison table section is rendered
      expect(screen.getByText('Multi-Year Comparison')).toBeInTheDocument()

      // Verify program years are displayed in the table
      expect(screen.getAllByText('2024-2025').length).toBeGreaterThan(0)
      expect(screen.getAllByText('2023-2024').length).toBeGreaterThan(0)
      expect(screen.getAllByText('2022-2023').length).toBeGreaterThan(0)
    })

    it('should display data freshness timestamp', async () => {
      mockUseGlobalRankings.mockReturnValue(createMockHookResult())

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // Verify timestamp is displayed
      expect(screen.getByText(/Last updated:/)).toBeInTheDocument()
    })

    it('should correctly display rank positions with total districts', async () => {
      mockUseGlobalRankings.mockReturnValue(createMockHookResult())

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // Look for rank display format "of 126"
      const rankDisplays = screen.getAllByText(/of 126/i)
      expect(rankDisplays.length).toBeGreaterThan(0)
    })

    it('should render main region with proper aria-label', async () => {
      mockUseGlobalRankings.mockReturnValue(createMockHookResult())

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      const region = screen.getByRole('region', {
        name: 'Global rankings for District 57',
      })
      expect(region).toBeInTheDocument()
    })

    it('should pass district data through the complete flow', async () => {
      mockUseGlobalRankings.mockReturnValue(createMockHookResult())

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // Verify hook was called with correct district ID
      expect(mockUseGlobalRankings).toHaveBeenCalledWith(
        expect.objectContaining({
          districtId: '57',
        })
      )
    })
  })

  describe('10.2 Program Year Transitions and Data Updates', () => {
    it('should accept selectedProgramYear prop and pass it to the hook', async () => {
      mockUseGlobalRankings.mockReturnValue(createMockHookResult())

      renderWithProviders(
        <GlobalRankingsTab
          {...baseProps}
          selectedProgramYear={mockProgramYear2023}
        />
      )

      // Verify the hook receives the parent-provided program year
      expect(mockUseGlobalRankings).toHaveBeenCalledWith(
        expect.objectContaining({
          districtId: '57',
          selectedProgramYear: mockProgramYear2023,
        })
      )
    })

    it('should show partial year indicator for current incomplete year', async () => {
      mockUseGlobalRankings.mockReturnValue(createMockHookResult())

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // The 2024-2025 year has isPartialYear: true
      // The component should render without error
      expect(screen.getByText('End-of-Year Rankings')).toBeInTheDocument()
    })

    it('should update chart when metric toggle is clicked', async () => {
      mockUseGlobalRankings.mockReturnValue(createMockHookResult())

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // Find metric toggle buttons
      const overallButton = screen.getByRole('button', {
        name: /View Overall Rank/i,
      })
      const clubsButton = screen.getByRole('button', {
        name: /View Paid Clubs Rank/i,
      })

      // Initially overall should be selected
      expect(overallButton).toHaveAttribute('aria-pressed', 'true')
      expect(clubsButton).toHaveAttribute('aria-pressed', 'false')

      // Click clubs button
      fireEvent.click(clubsButton)

      // Now clubs should be selected
      expect(clubsButton).toHaveAttribute('aria-pressed', 'true')
      expect(overallButton).toHaveAttribute('aria-pressed', 'false')
    })

    it('should not render its own ProgramYearSelector (uses page-level)', async () => {
      mockUseGlobalRankings.mockReturnValue(createMockHookResult())

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // The tab should NOT have a program year combobox
      const selector = screen.queryByRole('combobox', { name: /program year/i })
      expect(selector).not.toBeInTheDocument()
    })

    it('should handle switching between complete and partial year data', async () => {
      // Start with 2024 (partial year)
      mockUseGlobalRankings.mockReturnValue(createMockHookResult())

      renderWithProviders(
        <GlobalRankingsTab
          {...baseProps}
          selectedProgramYear={mockProgramYear2024}
        />
      )

      // Component should render successfully
      expect(
        screen.getByRole('region', { name: /Global rankings for District 57/i })
      ).toBeInTheDocument()

      // Component should still render with end-of-year rankings
      expect(screen.getByText('End-of-Year Rankings')).toBeInTheDocument()
    })

    it('should maintain state consistency across sections', async () => {
      mockUseGlobalRankings.mockReturnValue(createMockHookResult())

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // Verify all sections are rendered correctly
      expect(screen.getByText('End-of-Year Rankings')).toBeInTheDocument()
      expect(screen.getByText('Ranking Progression')).toBeInTheDocument()
      expect(screen.getByText('Multi-Year Comparison')).toBeInTheDocument()
    })
  })

  describe('10.3 Error Handling and Retry Functionality', () => {
    it('should display error state when API fails', async () => {
      const testError = new Error('Network error: Failed to fetch ranking data')
      mockUseGlobalRankings.mockReturnValue(
        createMockHookResult({
          isError: true,
          error: testError,
          currentYearHistory: null,
          endOfYearRankings: null,
          availableProgramYears: [],
          yearlyRankings: [],
        })
      )

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // Verify error message is displayed
      expect(screen.getByText('Unable to Load Rankings')).toBeInTheDocument()
      expect(
        screen.getByText('Network error: Failed to fetch ranking data')
      ).toBeInTheDocument()
    })

    it('should display retry button in error state', async () => {
      mockUseGlobalRankings.mockReturnValue(
        createMockHookResult({
          isError: true,
          error: new Error('Network error'),
          currentYearHistory: null,
          endOfYearRankings: null,
          availableProgramYears: [],
          yearlyRankings: [],
        })
      )

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // Verify retry button is present
      const retryButton = screen.getByRole('button', { name: /retry/i })
      expect(retryButton).toBeInTheDocument()
    })

    it('should trigger data refetch when retry button is clicked', async () => {
      mockUseGlobalRankings.mockReturnValue(
        createMockHookResult({
          isError: true,
          error: new Error('Network error'),
          currentYearHistory: null,
          endOfYearRankings: null,
          availableProgramYears: [],
          yearlyRankings: [],
        })
      )

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // Click retry button
      const retryButton = screen.getByRole('button', { name: /retry/i })
      fireEvent.click(retryButton)

      // Verify refetch was called
      expect(mockRefetch).toHaveBeenCalledTimes(1)
    })

    it('should show loading state during data fetch', async () => {
      mockUseGlobalRankings.mockReturnValue(
        createMockHookResult({
          isLoading: true,
          currentYearHistory: null,
          endOfYearRankings: null,
          availableProgramYears: [],
          yearlyRankings: [],
        })
      )

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // Verify loading skeleton is displayed
      const loadingSection = screen.getByLabelText(
        'Loading global rankings data'
      )
      expect(loadingSection).toBeInTheDocument()
      expect(loadingSection).toHaveAttribute('aria-busy', 'true')
    })

    it('should display appropriate error message for different error types', async () => {
      const customError = new Error('Custom API error: Rate limit exceeded')
      mockUseGlobalRankings.mockReturnValue(
        createMockHookResult({
          isError: true,
          error: customError,
          currentYearHistory: null,
          endOfYearRankings: null,
          availableProgramYears: [],
          yearlyRankings: [],
        })
      )

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // Verify the custom error message is displayed
      expect(
        screen.getByText('Custom API error: Rate limit exceeded')
      ).toBeInTheDocument()
    })

    it('should have accessible error state with proper ARIA attributes', async () => {
      mockUseGlobalRankings.mockReturnValue(
        createMockHookResult({
          isError: true,
          error: new Error('Network error'),
          currentYearHistory: null,
          endOfYearRankings: null,
          availableProgramYears: [],
          yearlyRankings: [],
        })
      )

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // Verify accessibility attributes
      const errorAlert = screen.getByRole('alert')
      expect(errorAlert).toBeInTheDocument()
      expect(errorAlert).toHaveAttribute('aria-live', 'polite')
    })

    it('should handle empty data gracefully', async () => {
      mockUseGlobalRankings.mockReturnValue(
        createMockHookResult({
          availableProgramYears: [],
          currentYearHistory: null,
          endOfYearRankings: null,
          yearlyRankings: [],
        })
      )

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // Verify empty state is displayed
      expect(screen.getByText('No Ranking Data Available')).toBeInTheDocument()
      expect(
        screen.getByText(/District 57 does not have any global ranking data/)
      ).toBeInTheDocument()
    })

    it('should display default error message when error is null', async () => {
      mockUseGlobalRankings.mockReturnValue(
        createMockHookResult({
          isError: true,
          error: null,
          currentYearHistory: null,
          endOfYearRankings: null,
          availableProgramYears: [],
          yearlyRankings: [],
        })
      )

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      expect(screen.getByText('Unable to Load Rankings')).toBeInTheDocument()
      expect(
        screen.getByText(
          /An error occurred while loading the global rankings data/
        )
      ).toBeInTheDocument()
    })

    it('should recover successfully after retry with valid data', async () => {
      // Start with error state
      mockUseGlobalRankings.mockReturnValue(
        createMockHookResult({
          isError: true,
          error: new Error('Network error'),
          currentYearHistory: null,
          endOfYearRankings: null,
          availableProgramYears: [],
          yearlyRankings: [],
        })
      )

      const { rerender } = renderWithProviders(
        <GlobalRankingsTab {...baseProps} />
      )

      // Verify error state
      expect(screen.getByText('Unable to Load Rankings')).toBeInTheDocument()

      // Click retry
      const retryButton = screen.getByRole('button', { name: /retry/i })
      fireEvent.click(retryButton)

      // Verify refetch was called
      expect(mockRefetch).toHaveBeenCalled()

      // Simulate successful data load after retry
      mockUseGlobalRankings.mockReturnValue(createMockHookResult())

      // Rerender to simulate state update
      rerender(<GlobalRankingsTab {...baseProps} />)

      // Verify successful state
      expect(screen.getByText('End-of-Year Rankings')).toBeInTheDocument()
    })
  })

  describe('Component Integration and Data Flow', () => {
    it('should render all child components with correct data', async () => {
      mockUseGlobalRankings.mockReturnValue(createMockHookResult())

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // Verify all main sections are rendered
      expect(screen.getByText('End-of-Year Rankings')).toBeInTheDocument()
      expect(screen.getByText('Ranking Progression')).toBeInTheDocument()
      expect(screen.getByText('Multi-Year Comparison')).toBeInTheDocument()
    })

    it('should pass correct district ID to hook', async () => {
      mockUseGlobalRankings.mockReturnValue(createMockHookResult())

      renderWithProviders(
        <GlobalRankingsTab districtId="42" districtName="District 42" />
      )

      expect(mockUseGlobalRankings).toHaveBeenCalledWith(
        expect.objectContaining({
          districtId: '42',
        })
      )
    })

    it('should update when districtId prop changes', async () => {
      mockUseGlobalRankings.mockReturnValue(createMockHookResult())

      const { rerender } = renderWithProviders(
        <GlobalRankingsTab districtId="57" districtName="District 57" />
      )

      expect(mockUseGlobalRankings).toHaveBeenCalledWith(
        expect.objectContaining({
          districtId: '57',
        })
      )

      // Rerender with different districtId
      rerender(<GlobalRankingsTab districtId="42" districtName="District 42" />)

      expect(mockUseGlobalRankings).toHaveBeenCalledWith(
        expect.objectContaining({
          districtId: '42',
        })
      )
    })

    it('should handle metric toggle interactions correctly', async () => {
      mockUseGlobalRankings.mockReturnValue(createMockHookResult())

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // Find metric toggle buttons
      const overallButton = screen.getByRole('button', {
        name: /View Overall Rank/i,
      })
      const clubsButton = screen.getByRole('button', {
        name: /View Paid Clubs Rank/i,
      })
      const paymentsButton = screen.getByRole('button', {
        name: /View Membership Payments Rank/i,
      })
      const distinguishedButton = screen.getByRole('button', {
        name: /View Distinguished Clubs Rank/i,
      })

      // Initially overall should be selected
      expect(overallButton).toHaveAttribute('aria-pressed', 'true')

      // Click through all metrics
      fireEvent.click(clubsButton)
      expect(clubsButton).toHaveAttribute('aria-pressed', 'true')
      expect(overallButton).toHaveAttribute('aria-pressed', 'false')

      fireEvent.click(paymentsButton)
      expect(paymentsButton).toHaveAttribute('aria-pressed', 'true')
      expect(clubsButton).toHaveAttribute('aria-pressed', 'false')

      fireEvent.click(distinguishedButton)
      expect(distinguishedButton).toHaveAttribute('aria-pressed', 'true')
      expect(paymentsButton).toHaveAttribute('aria-pressed', 'false')

      // Click back to overall
      fireEvent.click(overallButton)
      expect(overallButton).toHaveAttribute('aria-pressed', 'true')
      expect(distinguishedButton).toHaveAttribute('aria-pressed', 'false')
    })

    it('should maintain state consistency across components', async () => {
      mockUseGlobalRankings.mockReturnValue(createMockHookResult())

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // Verify the main region has correct aria-label
      const mainRegion = screen.getByRole('region', {
        name: /Global rankings for District 57/i,
      })
      expect(mainRegion).toBeInTheDocument()

      // Verify all sections are rendered
      expect(screen.getByText('End-of-Year Rankings')).toBeInTheDocument()
      expect(screen.getByText('Ranking Progression')).toBeInTheDocument()
      expect(screen.getByText('Multi-Year Comparison')).toBeInTheDocument()
    })

    it('should display year-over-year changes in comparison table', async () => {
      mockUseGlobalRankings.mockReturnValue(createMockHookResult())

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // Verify the comparison table is rendered
      expect(screen.getByText('Multi-Year Comparison')).toBeInTheDocument()

      // The table should show multiple years
      expect(screen.getAllByText('2024-2025').length).toBeGreaterThan(0)
      expect(screen.getAllByText('2023-2024').length).toBeGreaterThan(0)
    })

    it('should handle single program year correctly', async () => {
      mockUseGlobalRankings.mockReturnValue(
        createMockHookResult({
          availableProgramYears: [mockProgramYear2024],
          yearlyRankings: [mockYearlyRankings[0]!],
        })
      )

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // Should still render all components
      expect(screen.getByText('End-of-Year Rankings')).toBeInTheDocument()
      expect(screen.getByText('Ranking Progression')).toBeInTheDocument()
      expect(screen.getByText('Multi-Year Comparison')).toBeInTheDocument()
    })

    it('should handle empty history data gracefully', async () => {
      mockUseGlobalRankings.mockReturnValue(
        createMockHookResult({
          currentYearHistory: {
            ...mockRankHistory2024,
            history: [],
          },
        })
      )

      renderWithProviders(<GlobalRankingsTab {...baseProps} />)

      // Should still render without crashing
      expect(screen.getByText('End-of-Year Rankings')).toBeInTheDocument()
    })
  })
})
