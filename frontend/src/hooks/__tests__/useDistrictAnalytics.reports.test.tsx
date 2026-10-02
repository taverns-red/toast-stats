/**
 * useDistrictAnalytics exposes the district reports dataset (#1592).
 *
 * The hook already fetches `district_{id}_reports.json` in parallel with the
 * analytics file (for the dues-renewal overlay). The education-award
 * leaderboards need the same dataset, so the hook returns it alongside the
 * analytics rather than the page issuing a second request.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DistrictReportsDataset } from '@taverns-red/shared-contracts'
import { useDistrictAnalytics } from '../useDistrictAnalytics'
import type { DistrictAnalytics } from '../useDistrictAnalytics'
import { fetchFromCdn, fetchCdnDistrictReports } from '../../services/cdn'
import { snap } from '../../test-utils/snapshotDate'

vi.mock('../../services/cdn', () => ({
  fetchLatestSnapshotDate: vi.fn(),
  cdnAnalyticsUrl: vi.fn(() => 'https://cdn.test/analytics.json'),
  fetchFromCdn: vi.fn(),
  fetchCdnDistrictReports: vi.fn(),
}))

const mockedFetch = vi.mocked(fetchFromCdn)
const mockedReports = vi.mocked(fetchCdnDistrictReports)

const analytics = (): DistrictAnalytics =>
  ({
    districtId: '61',
    allClubs: [],
    vulnerableClubs: [],
    thrivingClubs: [],
    interventionRequiredClubs: [],
  }) as unknown as DistrictAnalytics

const reports: DistrictReportsDataset = {
  districtId: '61',
  programYear: '2026-2027',
  generatedAt: '2026-10-01T00:00:00Z',
  sections: {
    educationMembers: {
      sources: [
        {
          reportType: 'education-achievements',
          tableId: 'x',
          asOf: 'October 01, 2026',
        },
      ],
      records: [{ club: '1', membersWithAward: 3 }],
    },
  },
}

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useDistrictAnalytics — district reports dataset (#1592)', () => {
  beforeEach(() => {
    mockedFetch.mockResolvedValue({ data: analytics() })
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('returns the reports dataset it already fetched, with one reports request', async () => {
    mockedReports.mockResolvedValue(reports)
    const { result } = renderHook(
      () => useDistrictAnalytics('61', '2026-07-01', snap('2026-10-01')),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.districtReports).toEqual(reports)
    expect(mockedReports).toHaveBeenCalledTimes(1)
  })

  it('returns null reports when the reports file is absent', async () => {
    mockedReports.mockResolvedValue(null)
    const { result } = renderHook(
      () => useDistrictAnalytics('61', '2026-07-01', snap('2026-10-01')),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.districtReports).toBeNull()
  })
})
