/**
 * Moved-club tests for ClubDetailPage (#1441).
 *
 * The 2026-07-01 district reformation moved clubs between districts. A club is
 * continuous across that move — same number, same charter — so every link made
 * before July points at the club's OLD district. The not-found branch used to
 * tell those visitors the club "may have been removed"; `config/club-index.json`
 * (the same index `ClubRedirectPage` consumes) knows exactly which district the
 * club is in now.
 *
 * R22: this is a full-page mount, so it lives in `src/pages/__tests__/`.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { screen, render, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import ClubDetailPage from '../ClubDetailPage'
import { fetchCdnClubIndex } from '../../services/cdn'

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
    data: {
      districts: [
        { id: '90', name: 'District 90' },
        { id: '70', name: 'District 70' },
      ],
    },
  })),
}))

vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(() => ({
    data: {
      districtId: '90',
      dates: ['2026-08-01'],
      count: 1,
      dateRange: { startDate: '2026-08-01', endDate: '2026-08-01' },
    },
  })),
}))

vi.mock('../../services/cdn', () => ({
  fetchCdnClubIndex: vi.fn(),
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: ['2026-08-01'],
    count: 1,
    generatedAt: '2026-08-02T00:00:00Z',
  }),
  fetchCdnRankings: vi
    .fn()
    .mockResolvedValue({ rankings: [], asOfDate: '2026-08-01' }),
  fetchCdnManifest: vi
    .fn()
    .mockResolvedValue({ latestSnapshotDate: '2026-08-01' }),
}))

vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(() => ({ data: null, isLoading: false })),
}))

// District 90's PY-2026 snapshot no longer contains club 00002274 — it moved.
vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(() => ({
    data: { districtId: '90', allClubs: [] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  })),
  ClubTrend: {},
}))

const mockedClubIndex = vi.mocked(fetchCdnClubIndex)

const LocationProbe = () => {
  const { pathname } = useLocation()
  return <div data-testid="loc-path">{pathname}</div>
}

afterEach(() => cleanup())
beforeEach(() => vi.clearAllMocks())

function renderAt(url = '/district/90/club/00002274') {
  // A fresh client per render — the club-index query key is shared app-wide,
  // so a module-level client would leak one test's index into the next.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <DarkModeProvider>
          <MemoryRouter initialEntries={[url]}>
            <LocationProbe />
            <Routes>
              <Route
                path="/district/:districtId/club/:clubId"
                element={<ClubDetailPage />}
              />
              <Route
                path="/district/:districtId"
                element={<div>district landing</div>}
              />
            </Routes>
          </MemoryRouter>
        </DarkModeProvider>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

describe('ClubDetailPage — club moved districts (#1441)', () => {
  it('does not claim the club may have been removed when the index knows its new district', async () => {
    mockedClubIndex.mockResolvedValue({
      clubs: {
        '00002274': { districtId: '70', clubName: 'Riverside Toastmasters' },
      },
    })

    renderAt()

    expect(await screen.findByText(/now in District 70/i)).toBeInTheDocument()
    expect(screen.queryByText(/may have been removed/i)).not.toBeInTheDocument()
  })

  it('links through to the club in its new district', async () => {
    mockedClubIndex.mockResolvedValue({
      clubs: {
        '00002274': { districtId: '70', clubName: 'Riverside Toastmasters' },
      },
    })

    renderAt()

    const go = await screen.findByRole('button', { name: /District 70/i })
    await userEvent.click(go)

    await waitFor(() =>
      expect(screen.getByTestId('loc-path')).toHaveTextContent(
        '/district/70/club/00002274'
      )
    )
  })

  it('keeps the cautious copy for a club absent from the index entirely', async () => {
    mockedClubIndex.mockResolvedValue({ clubs: {} })

    renderAt()

    expect(
      await screen.findByText(/may have been removed/i)
    ).toBeInTheDocument()
  })

  it('keeps the cautious copy when the index still places the club in this district', async () => {
    mockedClubIndex.mockResolvedValue({
      clubs: {
        '00002274': { districtId: '90', clubName: 'Riverside Toastmasters' },
      },
    })

    renderAt()

    expect(
      await screen.findByText(/may have been removed/i)
    ).toBeInTheDocument()
    expect(screen.queryByText(/now in District/i)).not.toBeInTheDocument()
  })

  it('degrades to the cautious copy when the index itself cannot be fetched', async () => {
    mockedClubIndex.mockRejectedValue(new Error('CDN club index fetch failed'))

    renderAt()

    expect(
      await screen.findByText(/may have been removed/i)
    ).toBeInTheDocument()
  })
})
