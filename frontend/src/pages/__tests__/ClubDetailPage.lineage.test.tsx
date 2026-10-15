/**
 * Hero lineage chip on ClubDetailPage (#1805, epic #1781).
 *
 * "District 219 (District 10 until June 2026)" — from the club's one
 * club-district history shard (#1782), read through the #1817/#1843 reader.
 *
 * Perf contract (club LCP ~3.0–3.5 s on previews, #1901/#1843):
 * - nothing new is read before the hero paints: the shard read starts with
 *   the analytics read, after first paint (it is ~12 KB against analytics'
 *   ~150 KB, so it lands first);
 * - the chip never arrives on its own: the full render waits for the shard
 *   to settle, so the chip lands in the same commit as the analytics panels
 *   and does not push already-painted content down (CLS).
 *
 * R22: this is a full-page mount, so it lives in `src/pages/__tests__/`.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { screen, render, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import type { ClubDistrictHistoryShard } from '@taverns-red/shared-contracts'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import ClubDetailPage from '../ClubDetailPage'
import { useDistrictAnalytics } from '../../hooks/useDistrictAnalytics'
import { useDistrictStatistics } from '../../hooks/useMembershipData'
import { fetchClubDistrictHistoryShard } from '../../services/cdnClubDistrictHistory'
import historyShard from '../../__tests__/fixtures/club-district-history-97-2026-10-13.recorded.json'

Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
  writable: true,
})

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: vi.fn(() => ({ data: { districts: [] } })),
}))

vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(() => ({
    data: {
      districtId: '219',
      dates: ['2026-10-13'],
      count: 1,
      dateRange: { startDate: '2026-10-13', endDate: '2026-10-13' },
    },
    isPending: false,
    isError: false,
  })),
}))

vi.mock('../../services/cdn', () => ({
  fetchCdnClubIndex: vi.fn(),
  fetchCdnSuspendedClubs: vi.fn(),
  fetchCdnGlobalClubRace: vi.fn().mockResolvedValue(null),
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: ['2026-10-13'],
    count: 1,
    generatedAt: '2026-10-14T00:00:00Z',
  }),
  fetchCdnRankings: vi
    .fn()
    .mockResolvedValue({ rankings: [], asOfDate: '2026-10-13' }),
  fetchCdnManifest: vi
    .fn()
    .mockResolvedValue({ latestSnapshotDate: '2026-10-13' }),
}))

vi.mock('../../services/cdnClubDistrictHistory', () => ({
  fetchClubDistrictHistoryShard: vi.fn(),
}))

vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(),
}))

vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(),
  ClubTrend: {},
}))

// Shard 97's club 497: District 10 until June 2026, then District 219.
const heroRecord = {
  clubId: '497',
  clubName: 'Westlake Toastmasters #497',
  divisionName: 'Division B',
  areaName: 'Area 12',
}
const elginRecord = {
  clubId: '7238597',
  clubName: '90 Elgin Toastmasters',
  divisionName: 'Division C',
  areaName: 'Area 23',
}
const trend = {
  divisionId: 'B',
  areaId: '12',
  membershipTrend: [{ date: '2026-10-13', count: 20 }],
  dcpGoalsTrend: [{ date: '2026-10-13', goalsAchieved: 2 }],
  membershipBase: 20,
  currentStatus: 'thriving' as const,
  riskFactors: [],
  distinguishedLevel: 'NotDistinguished' as const,
  octoberRenewals: 0,
  aprilRenewals: 0,
  newMembers: 0,
  clubStatus: 'Active',
}

let analyticsReady = true
let analyticsClub: Record<string, unknown> = { ...trend, ...heroRecord }
let snapshotClubs: Record<string, unknown>[] = [heroRecord]

const mockedAnalytics = vi.mocked(useDistrictAnalytics)
const mockedStats = vi.mocked(useDistrictStatistics)
const mockedShard = vi.mocked(fetchClubDistrictHistoryShard)

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
  analyticsReady = true
  analyticsClub = { ...trend, ...heroRecord }
  snapshotClubs = [heroRecord]
  mockedStats.mockImplementation(
    () =>
      ({
        data: {
          districtId: '219',
          data: {
            districtId: '219',
            snapshotDate: '2026-10-13',
            clubs: snapshotClubs,
            clubPerformance: [],
            divisionPerformance: [],
          },
        },
        isLoading: false,
      }) as never
  )
  mockedAnalytics.mockImplementation(((
    districtId: string | null,
    _start?: string,
    _end?: string,
    options?: { enabled?: boolean }
  ) => {
    const enabled = !!districtId && (options?.enabled ?? true)
    return enabled && analyticsReady
      ? {
          data: { districtId, allClubs: [analyticsClub] },
          isLoading: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        }
      : {
          data: undefined,
          isLoading: enabled,
          isError: false,
          error: null,
          refetch: vi.fn(),
        }
  }) as never)
  mockedShard.mockResolvedValue(historyShard as ClubDistrictHistoryShard)
})

function renderAt(url: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <DarkModeProvider>
          <MemoryRouter initialEntries={[url]}>
            <Routes>
              <Route
                path="/district/:districtId/club/:clubId"
                element={<ClubDetailPage />}
              />
            </Routes>
          </MemoryRouter>
        </DarkModeProvider>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

describe('ClubDetailPage — hero lineage chip (#1805)', () => {
  it('names the former district on the hero line, with former names', async () => {
    renderAt('/district/219/club/497')
    const chip = await screen.findByText('(District 10 until June 2026)')
    expect(chip.closest('header')).toHaveClass('club-hero')
    expect(chip.closest('p')).toHaveTextContent(
      'District 219 (District 10 until June 2026)'
    )
    expect(
      screen.getByText('Formerly Westlake Toastmasters Club', {
        selector: '.club-hero__lineage',
      })
    ).toBeInTheDocument()
  })

  it('shows no chip for a club that never moved', async () => {
    analyticsClub = { ...trend, ...elginRecord }
    snapshotClubs = [elginRecord]
    const { container } = renderAt('/district/61/club/7238597')
    await screen.findByText('Thriving')
    expect(container.querySelector('.club-hero__lineage')).toBeNull()
  })

  it('starts the shard read with analytics, after the hero paints', async () => {
    analyticsReady = false // analytics stays in flight
    renderAt('/district/219/club/497')
    await screen.findByRole('heading', { level: 1 })
    await waitFor(() => expect(mockedShard).toHaveBeenCalledWith('97'))
  })

  it('holds the full render until the shard settles, so the chip never shifts painted content', async () => {
    let resolveShard: (v: ClubDistrictHistoryShard) => void = () => {}
    mockedShard.mockReturnValue(
      new Promise(resolve => {
        resolveShard = resolve
      })
    )
    renderAt('/district/219/club/497')
    await waitFor(() => expect(mockedShard).toHaveBeenCalled())
    await new Promise(resolve => setTimeout(resolve, 50))
    // Analytics has landed, but the page is still the hero-first render.
    expect(screen.getByTestId('club-hero-pill-placeholder')).toBeInTheDocument()
    expect(screen.queryByText('Thriving')).not.toBeInTheDocument()

    resolveShard(historyShard as ClubDistrictHistoryShard)
    expect(await screen.findByText('Thriving')).toBeInTheDocument()
    expect(
      screen.getByText('(District 10 until June 2026)')
    ).toBeInTheDocument()
  })

  // Cached analytics (back-navigation) is there before first paint, while the
  // shard read is still gated on paint. The full render must not show (and
  // then flip back to the hero-first render once the shard starts): that
  // unmounted the panels mid-load — the CI flake in the Lifecycle test.
  it('does not show the full render before the shard read has started, even with cached analytics', async () => {
    mockedAnalytics.mockImplementation(((districtId: string | null) =>
      districtId
        ? {
            data: { districtId, allClubs: [analyticsClub] },
            isLoading: false,
            isError: false,
            error: null,
            refetch: vi.fn(),
          }
        : {
            data: undefined,
            isLoading: false,
            isError: false,
            error: null,
            refetch: vi.fn(),
          }) as never)
    let resolveShard: (v: ClubDistrictHistoryShard) => void = () => {}
    mockedShard.mockReturnValue(
      new Promise(resolve => {
        resolveShard = resolve
      })
    )
    renderAt('/district/219/club/497')
    // The first commit: analytics is cached, the shard read not started.
    expect(mockedShard).not.toHaveBeenCalled()
    expect(screen.queryByText('Thriving')).not.toBeInTheDocument()

    await waitFor(() => expect(mockedShard).toHaveBeenCalled())
    expect(screen.queryByText('Thriving')).not.toBeInTheDocument()
    resolveShard(historyShard as ClubDistrictHistoryShard)
    expect(await screen.findByText('Thriving')).toBeInTheDocument()
  })

  it('renders the page without a chip when the shard is unavailable', async () => {
    mockedShard.mockResolvedValue(null)
    const { container } = renderAt('/district/219/club/497')
    await screen.findByText('Thriving')
    expect(container.querySelector('.club-hero__lineage')).toBeNull()
  })
})
