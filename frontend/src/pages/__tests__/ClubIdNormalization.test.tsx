/**
 * Club-id normalization at the frontend read sites (#1440).
 *
 * Three club-id conventions coexisted in the data — raw, bare `9905`, and
 * 8-char padded `00009905`. Every frontend miss degraded to an empty state:
 * ClubDetailPage's `.find()` returned undefined → "Club Not Found";
 * ClubRedirectPage's `data.clubs[clubId]` missed → "Club Not Found". A real
 * production instance is indistinguishable from "this club has no data"
 * (Lesson 47's silent-lookup signature).
 *
 * These tests exercise BOTH directions at each site: a club stored bare found
 * by a padded URL, and a club stored padded found by a bare URL. The
 * pre-#1440 code passed exactly one of the four combinations per site.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, render, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import ClubDetailPage from '../ClubDetailPage'
import ClubRedirectPage from '../ClubRedirectPage'
import { useDistrictAnalytics } from '../../hooks/useDistrictAnalytics'
import { useDistrictStatistics } from '../../hooks/useMembershipData'
import { fetchCdnClubIndex } from '../../services/cdn'

const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
}
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

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
  useDistricts: vi.fn(() => ({
    data: { districts: [{ id: '61', name: 'District 61' }] },
  })),
}))

vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(() => ({ data: { dates: ['2025-10-15'] } })),
}))

vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(),
}))

vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(),
}))

vi.mock('../../services/cdn', () => ({
  fetchCdnClubIndex: vi.fn(),
}))

const CLUB_NAME = 'Leading Zero Toastmasters'

function clubTrend(clubId: string) {
  return {
    clubId,
    clubName: CLUB_NAME,
    divisionId: 'A',
    divisionName: 'Division A',
    areaId: 'A1',
    areaName: 'Area A1',
    membershipTrend: [{ date: '2025-10-31', count: 41 }],
    dcpGoalsTrend: [{ date: '2025-10-31', goalsAchieved: 8 }],
    membershipBase: 46,
    currentStatus: 'thriving' as const,
    riskFactors: [],
    distinguishedLevel: 'NotDistinguished' as const,
    octoberRenewals: 5,
    aprilRenewals: 3,
    newMembers: 2,
  }
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

function renderClubDetail(urlClubId: string) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <DarkModeProvider>
          <MemoryRouter
            initialEntries={[`/district/61/club/${urlClubId}?date=2025-10-15`]}
          >
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

/** stored form → URL form. The two cross pairs are the #1440 bug. */
const DIRECTIONS: Array<[stored: string, url: string, label: string]> = [
  ['9905', '00009905', 'stored bare, looked up padded'],
  ['00009905', '9905', 'stored padded, looked up bare'],
  ['9905', '9905', 'both bare'],
  ['00009905', '00009905', 'both padded'],
]

describe('ClubDetailPage club-id normalization (#1440)', () => {
  afterEach(() => {
    cleanup()
    queryClient.clear()
    vi.clearAllMocks()
  })

  it.each(DIRECTIONS)(
    'finds the club in analytics — %s / %s (%s)',
    async (stored, url) => {
      vi.mocked(useDistrictAnalytics).mockReturnValue({
        data: { districtId: '61', allClubs: [clubTrend(stored)] },
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useDistrictAnalytics>)
      vi.mocked(useDistrictStatistics).mockReturnValue({
        data: null,
        isLoading: false,
      } as unknown as ReturnType<typeof useDistrictStatistics>)

      renderClubDetail(url)

      expect(await screen.findByText(CLUB_NAME)).toBeInTheDocument()
      expect(screen.queryByText(/Club Not Found/i)).not.toBeInTheDocument()
    }
  )

  it.each(DIRECTIONS)(
    'finds the raw clubPerformance record — %s / %s (%s)',
    async (stored, url) => {
      vi.mocked(useDistrictAnalytics).mockReturnValue({
        data: { districtId: '61', allClubs: [clubTrend(stored)] },
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useDistrictAnalytics>)
      vi.mocked(useDistrictStatistics).mockReturnValue({
        data: {
          data: {
            clubPerformance: [
              {
                'Club Number': stored,
                'Club Name': CLUB_NAME,
                'Goals Met': '8',
              },
            ],
          },
        },
        isLoading: false,
      } as unknown as ReturnType<typeof useDistrictStatistics>)

      renderClubDetail(url)

      // The per-goal grid only renders when the raw record was matched.
      expect(await screen.findByText('Per-Goal Status')).toBeInTheDocument()
    }
  )
})

function renderRedirect(urlClubId: string) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/club/${urlClubId}`]}>
        <Routes>
          <Route path="/club/:clubId" element={<ClubRedirectPage />} />
          <Route
            path="/district/:districtId/club/:clubId"
            element={<div>resolved to district page</div>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ClubRedirectPage club-index normalization (#1440)', () => {
  afterEach(() => {
    cleanup()
    queryClient.clear()
    vi.clearAllMocks()
  })

  it.each(DIRECTIONS)(
    'resolves the club index entry — %s / %s (%s)',
    async (stored, url) => {
      vi.mocked(fetchCdnClubIndex).mockResolvedValue({
        clubs: { [stored]: { districtId: '61', clubName: CLUB_NAME } },
      })

      renderRedirect(url)

      expect(
        await screen.findByText('resolved to district page')
      ).toBeInTheDocument()
    }
  )

  it('still reports a genuinely unknown club as not found', async () => {
    vi.mocked(fetchCdnClubIndex).mockResolvedValue({
      clubs: { '9905': { districtId: '61', clubName: CLUB_NAME } },
    })

    renderRedirect('1234')

    await waitFor(() => {
      expect(screen.getByText(/Club Not Found/i)).toBeInTheDocument()
    })
  })
})
