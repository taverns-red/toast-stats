/**
 * Lifecycle timeline on ClubDetailPage (#1843, mobile review §6.3).
 *
 * The panel joins data already on the CDN: the snapshot's `charterDate`, one
 * shard of `config/club-district-history/` (#1782) and, only for a club the
 * dashboard lists as Suspended, the date's `suspended-clubs.json` (#1953).
 *
 * Perf contract (club LCP ≤ 3.0 s, #1843): the shard read starts with the
 * analytics read, after first paint (#1901; since #1805 the hero's lineage
 * chip needs it), so it never competes with the hero's reads; an active club
 * never reads the suspended list at all.
 *
 * R22: this is a full-page mount, so it lives in `src/pages/__tests__/`.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { screen, render, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import ClubDetailPage from '../ClubDetailPage'
import { useDistrictCachedDates } from '../../hooks/useDistrictData'
import { fetchCdnSuspendedClubs } from '../../services/cdn'
import { fetchClubDistrictHistoryShard } from '../../services/cdnClubDistrictHistory'
import historyShard from '../../__tests__/fixtures/club-district-history-97-2026-10-13.recorded.json'
import suspendedFile from '../../__tests__/fixtures/suspended-clubs-2026-10-13.recorded.json'

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

const DATES = {
  data: {
    districtId: '61',
    dates: ['2026-10-13'],
    count: 1,
    dateRange: { startDate: '2026-10-13', endDate: '2026-10-13' },
  },
  isPending: false,
  isError: false,
}

vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(() => DATES),
}))

vi.mock('../../services/cdn', () => ({
  fetchCdnClubIndex: vi.fn(),
  fetchCdnSuspendedClubs: vi.fn(),
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
  useDistrictStatistics: vi.fn(() => ({ data: null, isLoading: false })),
}))

const baseClub = {
  divisionId: 'A',
  divisionName: 'Division A',
  areaId: 'A1',
  areaName: 'Area A1',
  membershipTrend: [{ date: '2026-10-13', count: 20 }],
  dcpGoalsTrend: [{ date: '2026-10-13', goalsAchieved: 2 }],
  membershipBase: 20,
  currentStatus: 'thriving' as const,
  riskFactors: [],
  distinguishedLevel: 'NotDistinguished' as const,
  octoberRenewals: 0,
  aprilRenewals: 0,
  newMembers: 0,
}
// Shard 97's 90 Elgin Toastmasters (D61), with its snapshot charter date.
const activeClub = {
  ...baseClub,
  clubId: '7238597',
  clubName: '90 Elgin Toastmasters',
  clubStatus: 'Active',
  charterDate: '2019-04-30',
}
// D83's Travelers Toastmasters, suspended 2026-10-01 (recorded file).
const suspendedClub = {
  ...baseClub,
  clubId: '1380016',
  clubName: 'Travelers Toastmasters',
  clubStatus: 'Suspended',
  charterDate: '1990-05-01',
}

let currentClub: Record<string, unknown> = activeClub
vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn((districtId: string | null) =>
    districtId
      ? {
          data: { districtId, allClubs: [currentClub] },
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
        }
  ),
  ClubTrend: {},
}))

const mockedShard = vi.mocked(fetchClubDistrictHistoryShard)
const mockedSuspended = vi.mocked(fetchCdnSuspendedClubs)
const mockedCachedDates = vi.mocked(useDistrictCachedDates)

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
  currentClub = activeClub
  mockedCachedDates.mockReturnValue(DATES as never)
  mockedShard.mockResolvedValue(historyShard as never)
  mockedSuspended.mockResolvedValue(suspendedFile as never)
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

const settle = () => new Promise(resolve => setTimeout(resolve, 50))

describe('ClubDetailPage — Lifecycle timeline (#1843)', () => {
  it('renders the charter and the district history as a timeline', async () => {
    renderAt('/district/61/club/7238597')
    const panel = await screen.findByRole('region', { name: 'Lifecycle' })
    expect(
      await within(panel).findByText('First record in District 61')
    ).toBeInTheDocument()
    const items = within(panel).getAllByRole('listitem')
    expect(items.map(li => li.textContent)).toEqual([
      expect.stringContaining('Chartered'),
      expect.stringContaining('2018–19 program year'),
    ])
    expect(mockedShard).toHaveBeenCalledWith('97')
  })

  it('never reads the suspended list for an active club', async () => {
    renderAt('/district/61/club/7238597')
    await screen.findByText('First record in District 61')
    await settle()
    expect(mockedSuspended).not.toHaveBeenCalled()
  })

  it('adds the suspension date for a club the dashboard lists as Suspended', async () => {
    currentClub = suspendedClub
    renderAt('/district/83/club/1380016')
    const panel = await screen.findByRole('region', { name: 'Lifecycle' })
    expect(await within(panel).findByText('Suspended')).toBeInTheDocument()
    expect(within(panel).getByText('Oct 1, 2026')).toBeInTheDocument()
    // Club 16 is not in the trimmed shard: history is reported missing.
    expect(
      within(panel).getByText(/District history is not available/)
    ).toBeInTheDocument()
  })

  it('does not read the shard before the district dates resolve', async () => {
    mockedCachedDates.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    } as never)
    renderAt('/district/61/club/7238597')
    await settle()
    expect(mockedShard).not.toHaveBeenCalled()
  })

  // #2076 — a shard read that has not started yet is not a read that found
  // nothing. Before the gate opened, the panel built the timeline from
  // `history: null`, said the history was missing, and was then torn down by
  // the hold-for-history render, detaching the node a test had just found.
  it('does not report the history missing before the shard read starts', async () => {
    // Hold the after-paint gate shut: no frame is painted, and `settle` ends
    // well inside the 250 ms hidden-tab fallback.
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 0)
    try {
      currentClub = suspendedClub
      renderAt('/district/83/club/1380016')
      await settle()
      expect(mockedShard).not.toHaveBeenCalled()
      expect(
        screen.queryByText(/District history is not available/)
      ).not.toBeInTheDocument()
    } finally {
      raf.mockRestore()
    }
  })
})
