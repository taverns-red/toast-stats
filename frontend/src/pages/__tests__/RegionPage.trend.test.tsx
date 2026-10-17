/**
 * RegionPage — the membership sparkline column and the Health & compliance
 * subnav (#1815). The sparkline reads each district's program-year
 * time-series file (one small file per district, shared cache with the
 * district pages) for the page's own program year (R3); at 375 it rides in
 * the row identity as the row's only chart (mobile review §6.5).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import RegionPage from '../RegionPage'
import { fetchCdnRankings } from '../../services/cdn'
import { fetchTimeSeriesProgramYear } from '../../services/cdnTimeSeries'

const isMobile = vi.hoisted(() => ({ value: false }))
vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => isMobile.value,
}))

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({ dates: [], count: 0 }),
  fetchCdnRankings: vi.fn(),
  fetchCdnRankingsForDate: vi.fn(),
  fetchCdnCompetitiveAwards: vi.fn().mockResolvedValue(null),
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2026-10-15'),
  fetchCdnManifest: vi
    .fn()
    .mockResolvedValue({ latestSnapshotDate: '2026-10-15', generatedAt: 'x' }),
}))

vi.mock('../../services/cdnTimeSeries', () => ({
  fetchTimeSeriesProgramYear: vi.fn(),
}))

const mkRanking = (overrides: Record<string, unknown>) => ({
  districtId: '1',
  districtName: '1',
  region: '7',
  paidClubs: 100,
  totalPayments: 5000,
  distinguishedClubs: 50,
  aggregateScore: 300,
  overallRank: 1,
  paidClubBase: 90,
  paymentBase: 4500,
  clubGrowthPercent: 10,
  paymentGrowthPercent: 10,
  activeClubs: 100,
  selectDistinguished: 20,
  presidentsDistinguished: 10,
  distinguishedPercent: 50,
  clubsRank: 1,
  paymentsRank: 1,
  distinguishedRank: 1,
  ...overrides,
})

const series = (districtId: string, values: number[]) => ({
  districtId,
  programYear: '2026-2027',
  startDate: '2026-07-01',
  endDate: '2027-06-30',
  lastUpdated: 'x',
  dataPoints: values.map((membership, i) => ({
    date: `2026-0${7 + i}-15`,
    snapshotId: `2026-0${7 + i}-15`,
    membership,
    payments: 0,
    dcpGoals: 0,
    distinguishedTotal: 0,
    clubCounts: {
      total: 0,
      thriving: 0,
      vulnerable: 0,
      interventionRequired: 0,
    },
  })),
})

const renderRegion = () => {
  vi.mocked(fetchCdnRankings).mockResolvedValue({
    rankings: [
      mkRanking({ districtId: '7', aggregateScore: 300 }),
      mkRanking({ districtId: '8', aggregateScore: 200 }),
    ],
    asOfDate: '2026-10-15',
  } as never)
  vi.mocked(fetchTimeSeriesProgramYear).mockImplementation(async id => {
    if (id === '7') return series('7', [2900, 2950, 3010]) as never
    throw new Error('404')
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ProgramYearProvider>
        <MemoryRouter initialEntries={['/region/7']}>
          <Routes>
            <Route path="/region/:n" element={<RegionPage />} />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  isMobile.value = false
})

describe('RegionPage membership trend (#1815)', () => {
  it('adds a Trend column with one sparkline per district', async () => {
    renderRegion()
    const table = await screen.findByRole('table', {
      name: 'Region 7 district rankings',
    })
    expect(
      within(table).getByRole('columnheader', { name: 'Trend' })
    ).toBeInTheDocument()
    expect(
      await within(table).findByRole('img', {
        name: 'Membership 2,900 → 3,010 this program year, net +110',
      })
    ).toBeInTheDocument()
    expect(vi.mocked(fetchTimeSeriesProgramYear)).toHaveBeenCalledWith(
      '7',
      expect.stringMatching(/^\d{4}-\d{4}$/)
    )
  })

  it('says so, without a fake line, when a district has no series', async () => {
    renderRegion()
    const table = await screen.findByRole('table', {
      name: 'Region 7 district rankings',
    })
    expect(
      await within(table).findByText('No membership trend for this date')
    ).toBeInTheDocument()
  })

  it('keeps the sparkline on at 375, in the row identity', async () => {
    isMobile.value = true
    renderRegion()
    const table = await screen.findByRole('table', {
      name: 'Region 7 district rankings',
    })
    const link = within(table).getByRole('link', { name: /D7/ })
    const img = await within(link).findByRole('img', { name: /net \+110/ })
    // Its own line under rank + chip: a 60px line beside them overflows the
    // ~105px identity link and is clipped (Lesson 134).
    expect(img.parentElement).toHaveClass('region-identity__trend')
    expect(link).toHaveClass('region-identity')
  })

  it('links to the Health & compliance subpage', async () => {
    renderRegion()
    expect(
      await screen.findByRole('link', { name: 'Health & compliance' })
    ).toHaveAttribute('href', '/region/7/health')
  })
})
