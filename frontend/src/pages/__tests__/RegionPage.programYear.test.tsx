/**
 * PY-selector tests for RegionPage (#1301, epic #1298 Sprint 2).
 *
 * Single-region rankings must expose the shared DataControlsBar PY chip,
 * re-query when the PY changes, and honor a `?py=` deep link.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import RegionPage from '../RegionPage'
import { fetchCdnRankingsForDate } from '../../services/cdn'

const LocationProbe = () => {
  const { search } = useLocation()
  return <div data-testid="loc-search">{search}</div>
}

afterEach(() => cleanup())

vi.mock('../../services/cdn', () => {
  const baseRanking = (region: string, districtId: string, score: number) => ({
    districtId,
    districtName: `District ${districtId}`,
    region,
    paidClubs: 50,
    paidClubBase: 48,
    clubGrowthPercent: 4,
    totalPayments: 2000,
    paymentBase: 1900,
    paymentGrowthPercent: 5,
    activeClubs: 50,
    distinguishedClubs: 20,
    selectDistinguished: 5,
    presidentsDistinguished: 3,
    distinguishedPercent: 40,
    clubsRank: 1,
    paymentsRank: 1,
    distinguishedRank: 1,
    overallRank: 1,
    aggregateScore: score,
  })
  const rankingsFor = (date: string) => ({
    date,
    rankings: [baseRanking('07', '57', 350), baseRanking('07', '60', 300)],
  })
  return {
    // PY2025: 2025-08-01, 2026-05-01 (latest) · PY2026: 2026-08-01 (latest)
    fetchCdnDates: vi.fn().mockResolvedValue({
      dates: ['2025-08-01', '2026-05-01', '2026-08-01'],
      count: 3,
      generatedAt: '2026-08-02T00:00:00Z',
    }),
    fetchCdnRankings: vi.fn().mockResolvedValue(rankingsFor('2026-08-01')),
    fetchCdnRankingsForDate: vi
      .fn()
      .mockImplementation((date: string) => Promise.resolve(rankingsFor(date))),
    fetchCdnCompetitiveAwards: vi.fn().mockResolvedValue(null),
    fetchCdnManifest: vi
      .fn()
      .mockResolvedValue({ latestSnapshotDate: '2026-08-01' }),
  }
})

const mockedForDate = vi.mocked(fetchCdnRankingsForDate)

const renderAt = (url: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <MemoryRouter initialEntries={[url]}>
          <LocationProbe />
          <Routes>
            <Route path="/region/:n" element={<RegionPage />} />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('RegionPage — program year selector (#1301)', () => {
  it('renders the PY selector chip', async () => {
    renderAt('/region/07')
    await screen.findByRole('table', { name: /region 07 district rankings/i })
    expect(screen.getByTestId('py-chip')).toBeInTheDocument()
  })

  it('honors a ?py= deep link and fetches that PY latest snapshot', async () => {
    renderAt('/region/07?py=2025')
    await screen.findByRole('table', { name: /region 07 district rankings/i })
    expect(screen.getByTestId('py-chip-select')).toHaveValue('2025')
    await waitFor(() =>
      expect(mockedForDate).toHaveBeenCalledWith('2026-05-01')
    )
  })

  it('re-queries when the PY selector changes', async () => {
    renderAt('/region/07')
    await screen.findByRole('table', { name: /region 07 district rankings/i })
    await waitFor(() =>
      expect(mockedForDate).toHaveBeenCalledWith('2026-08-01')
    )
    mockedForDate.mockClear()

    await userEvent.selectOptions(screen.getByTestId('py-chip-select'), '2025')
    await waitFor(() =>
      expect(mockedForDate).toHaveBeenCalledWith('2026-05-01')
    )
    await waitFor(() =>
      expect(screen.getByTestId('loc-search').textContent).toContain('py=2025')
    )
  })
})
