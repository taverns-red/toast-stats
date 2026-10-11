/**
 * Landing-page fetch budget (#1830, mobile epic #1827).
 *
 * The landing page needs only the UNION of every district's snapshot dates
 * (to offer program years). `v1/dates.json` (~4 KB) is exactly that union;
 * `config/district-snapshot-index.json` (~473 KB, every district's dates) was
 * fetched only to union it back down. The landing page must read the small one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import DistrictsPage from '../DistrictsPage'
import {
  fetchCdnDates,
  fetchCdnRankings,
  fetchCdnSnapshotIndex,
} from '../../services/cdn'
import { renderWithProviders } from '../../__tests__/test-utils'

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: ['2025-11-22'],
    count: 1,
    generatedAt: '2025-11-22T00:00:00Z',
  }),
  fetchCdnSnapshotIndex: vi.fn().mockResolvedValue({
    D1: ['2025-11-22'],
  }),
  fetchCdnRankings: vi.fn().mockResolvedValue({
    rankings: [],
    asOfDate: '2025-11-22',
    generatedAt: '2025-11-22T00:00:00Z',
  }),
  fetchCdnManifest: vi.fn().mockResolvedValue({
    latestSnapshotDate: '2025-11-22',
    generatedAt: '2025-11-22T00:00:00Z',
  }),
  cdnAnalyticsUrl: vi.fn().mockReturnValue('https://cdn.taverns.red/test'),
  fetchFromCdn: vi.fn(),
}))

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: () => ({
    data: { districts: [] },
    isLoading: false,
    isError: false,
  }),
}))

// Let any effect-scheduled fetch run before asserting a negative.
const settle = () => new Promise(resolve => setTimeout(resolve, 50))

describe('DistrictsPage — landing fetch budget (#1830)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads the program-year dates from v1/dates.json, not the 473 KB snapshot index', async () => {
    renderWithProviders(<DistrictsPage />)

    await waitFor(() => expect(vi.mocked(fetchCdnRankings)).toHaveBeenCalled())
    await waitFor(() => expect(vi.mocked(fetchCdnDates)).toHaveBeenCalled())
    await settle()

    expect(vi.mocked(fetchCdnSnapshotIndex)).not.toHaveBeenCalled()
  })
})
