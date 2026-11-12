/**
 * Try again on a failed date index only re-asks for the date index (#2636).
 *
 * While the dates query has failed, the analytics query is disabled. Calling
 * its `refetch` anyway ignores `enabled` and throws "District ID is required",
 * which then replaced the friendly copy. Retry refetches only what failed.
 */
import React from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import DivisionPage from '../DivisionPage'
import AreaPage from '../AreaPage'

const { refetchDates, refetchAnalytics } = vi.hoisted(() => ({
  refetchDates: vi.fn(),
  refetchAnalytics: vi.fn(),
}))

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(() => ({
    data: undefined,
    isPending: false,
    error: new Error('Failed to fetch'),
    refetch: refetchDates,
  })),
}))

vi.mock('../../hooks/useDistrictAnalytics', async () => {
  const actual = await vi.importActual<
    typeof import('../../hooks/useDistrictAnalytics')
  >('../../hooks/useDistrictAnalytics')
  return {
    ...actual,
    useDistrictAnalytics: vi.fn(() => ({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: refetchAnalytics,
    })),
  }
})

vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    error: null,
  })),
}))

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: ['2026-08-01'],
    count: 1,
    generatedAt: '2026-08-02T00:00:00Z',
  }),
  fetchCdnRankings: vi.fn().mockResolvedValue({
    rankings: [],
    asOfDate: '2026-08-05',
  }),
  fetchCdnManifest: vi.fn().mockResolvedValue({
    latestSnapshotDate: '2026-08-01',
  }),
}))

afterEach(() => cleanup())
beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('Division and Area page retry (#2636)', () => {
  it.each([
    ['DivisionPage', '/district/61/division/A', DivisionPage],
    ['AreaPage', '/district/61/division/A/area/10', AreaPage],
  ])(
    '%s: Try again refetches the failed date index and not the disabled analytics query',
    async (_name, url, Page) => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      render(
        <QueryClientProvider client={queryClient}>
          <ProgramYearProvider>
            <MemoryRouter initialEntries={[url]}>
              <Routes>
                <Route
                  path="/district/:districtId/division/:divId"
                  element={<Page />}
                />
                <Route
                  path="/district/:districtId/division/:divId/area/:areaId"
                  element={<Page />}
                />
              </Routes>
            </MemoryRouter>
          </ProgramYearProvider>
        </QueryClientProvider>
      )
      await userEvent.click(
        await screen.findByRole('button', { name: /try again/i })
      )
      expect(refetchDates).toHaveBeenCalledTimes(1)
      expect(refetchAnalytics).not.toHaveBeenCalled()
    }
  )
})
