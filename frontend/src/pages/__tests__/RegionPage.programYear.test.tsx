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
import {
  fetchCdnRankingsForDate,
  fetchCdnCompetitiveAwards,
} from '../../services/cdn'

const LocationProbe = () => {
  const { search } = useLocation()
  return <div data-testid="loc-search">{search}</div>
}

const mockedAwards = vi.mocked(fetchCdnCompetitiveAwards)

// Minimal region-07 ranking rows for override scenarios.
const mkRanking = (districtId: string, score: number) => ({
  districtId,
  districtName: `District ${districtId}`,
  region: '07',
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

  it('keys competitive-awards on the SNAPSHOT date, not the as-of sourceCsvDate (month-end reconciliation)', async () => {
    // Reconciliation window: the 2026-05-01 snapshot's sourceCsvDate has
    // advanced to 2026-05-20. The countdown/tier columns read from the awards
    // file, which is stored under the SNAPSHOT date — keying it on the advanced
    // sourceCsvDate 404s and blanks those columns.
    // `date` was the key here until #1368 — CdnRankingsData has no such
    // field, so the "advanced sourceCsvDate" this test is about never
    // actually reached the component. It is `asOfDate`; `snapshotDate` stays
    // pinned to the requested date, which is the divergence being asserted.
    mockedForDate.mockImplementation(date =>
      Promise.resolve({
        asOfDate: date === '2026-05-01' ? '2026-05-20' : date,
        snapshotDate: date,
        generatedAt: '2026-05-20T00:00:00Z',
        rankings: [mkRanking('57', 350), mkRanking('60', 300)],
      })
    )
    renderAt('/region/07?py=2025') // latest in PY2025 = 2026-05-01
    await screen.findByRole('table', { name: /region 07 district rankings/i })
    await waitFor(() => expect(mockedAwards).toHaveBeenCalled())
    expect(mockedAwards).toHaveBeenCalledWith('2026-05-01')
    expect(mockedAwards).not.toHaveBeenCalledWith('2026-05-20')
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
