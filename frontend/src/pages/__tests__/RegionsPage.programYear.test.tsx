/**
 * PY-selector tests for RegionsPage (#1301, epic #1298 Sprint 2).
 *
 * RegionsPage shows program-year-scoped aggregation but historically had no
 * way to choose the year (it fetched "latest"). It must now render the shared
 * DataControlsBar PY chip, re-query when the PY changes, and honor a `?py=`
 * deep link — defaulting to the data-driven latest PY-with-data.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import RegionsPage from '../RegionsPage'
import { fetchCdnRankings, fetchCdnRankingsForDate } from '../../services/cdn'

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
    rankings: [baseRanking('01', '01', 500), baseRanking('07', '57', 350)],
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
  }
})

const mockedForDate = vi.mocked(fetchCdnRankingsForDate)
const mockedLatest = vi.mocked(fetchCdnRankings)

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
            <Route path="/regions" element={<RegionsPage />} />
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

describe('RegionsPage — program year selector (#1301)', () => {
  it('renders the PY selector chip', async () => {
    renderAt('/regions')
    await screen.findByRole('link', { name: /^region 01/i })
    expect(screen.getByTestId('py-chip')).toBeInTheDocument()
  })

  it('defaults to the newest PY-with-data and fetches its latest snapshot', async () => {
    renderAt('/regions')
    await screen.findByRole('link', { name: /^region 01/i })
    // Newest PY with data is 2026 → latest snapshot 2026-08-01.
    await waitFor(() =>
      expect(mockedForDate).toHaveBeenCalledWith('2026-08-01')
    )
    // Default PY writes no ?py= (data-driven default, Sprint 1).
    expect(screen.getByTestId('loc-search').textContent).not.toContain('py=')
  })

  it('honors a ?py= deep link and fetches that PY latest snapshot', async () => {
    renderAt('/regions?py=2025')
    await screen.findByRole('link', { name: /^region 01/i })
    expect(screen.getByTestId('py-chip-select')).toHaveValue('2025')
    await waitFor(() =>
      expect(mockedForDate).toHaveBeenCalledWith('2026-05-01')
    )
  })

  it('re-queries when the PY selector changes', async () => {
    renderAt('/regions')
    await screen.findByRole('link', { name: /^region 01/i })
    await waitFor(() =>
      expect(mockedForDate).toHaveBeenCalledWith('2026-08-01')
    )
    mockedForDate.mockClear()

    await userEvent.selectOptions(screen.getByTestId('py-chip-select'), '2025')
    // Switching to PY2025 re-queries its latest snapshot and writes ?py=2025.
    await waitFor(() =>
      expect(mockedForDate).toHaveBeenCalledWith('2026-05-01')
    )
    await waitFor(() =>
      expect(screen.getByTestId('loc-search').textContent).toContain('py=2025')
    )
  })

  it('still renders when the dates index is unavailable (fallback to latest)', async () => {
    mockedLatest.mockResolvedValueOnce({
      asOfDate: '2026-08-01',
      rankings: [
        {
          districtId: '01',
          districtName: 'District 01',
          region: '01',
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
          aggregateScore: 500,
        },
      ],
    } as never)
    renderAt('/regions')
    expect(
      await screen.findByRole('link', { name: /^region 01/i })
    ).toBeInTheDocument()
  })
})
