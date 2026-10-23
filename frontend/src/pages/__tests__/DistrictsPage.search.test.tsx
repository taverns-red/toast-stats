/**
 * Landing search surfaces (#91, #435, #2249).
 *
 * Two fields, two jobs:
 * - the HERO search is the shared omni-search (LandingSearch): it finds a
 *   district, region, club, division, area or page and navigates. "/" focuses
 *   it. Its behaviour is unit-tested in LandingSearch.test.tsx.
 * - the table FILTER narrows the rankings rows by number or name, keeps the
 *   original ranks (#102) and lives in ?q= (#978).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import DistrictsPage from '../DistrictsPage'
import { fetchCdnRankings } from '../../services/cdn'
import { renderWithProviders } from '../../__tests__/test-utils'

// Mock CDN service — all data now comes from CDN (#173)
vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: [],
    count: 0,
    generatedAt: '2025-01-01T00:00:00Z',
  }),
  fetchCdnSnapshotIndex: vi.fn().mockResolvedValue({}),
  fetchCdnRankings: vi.fn(),
  fetchCdnManifest: vi.fn().mockResolvedValue({
    latestSnapshotDate: '2025-11-22',
    generatedAt: '2025-01-01T00:00:00Z',
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

const mockedFetchCdnRankings = vi.mocked(fetchCdnRankings)

const MOCK_RANKINGS = [
  {
    districtId: '57',
    districtName: 'District 57',
    region: '1',
    paidClubs: 100,
    paidClubBase: 90,
    clubGrowthPercent: 12.5,
    totalPayments: 5000,
    paymentBase: 4500,
    paymentGrowthPercent: 11.1,
    activeClubs: 100,
    distinguishedClubs: 50,
    selectDistinguished: 20,
    presidentsDistinguished: 10,
    distinguishedPercent: 50,
    clubsRank: 1,
    paymentsRank: 1,
    distinguishedRank: 1,
    aggregateScore: 300,
    overallRank: 1,
  },
  {
    districtId: '61',
    districtName: 'District 61',
    region: '2',
    paidClubs: 80,
    paidClubBase: 75,
    clubGrowthPercent: 6.7,
    totalPayments: 3000,
    paymentBase: 2800,
    paymentGrowthPercent: 7.1,
    activeClubs: 80,
    distinguishedClubs: 30,
    selectDistinguished: 10,
    presidentsDistinguished: 5,
    distinguishedPercent: 37.5,
    clubsRank: 2,
    paymentsRank: 2,
    distinguishedRank: 2,
    aggregateScore: 250,
    overallRank: 2,
  },
  {
    districtId: '83',
    districtName: 'District 83',
    region: '1',
    paidClubs: 60,
    paidClubBase: 65,
    clubGrowthPercent: -7.7,
    totalPayments: 2000,
    paymentBase: 2200,
    paymentGrowthPercent: -9.1,
    activeClubs: 60,
    distinguishedClubs: 20,
    selectDistinguished: 5,
    presidentsDistinguished: 3,
    distinguishedPercent: 33.3,
    clubsRank: 3,
    paymentsRank: 3,
    distinguishedRank: 3,
    aggregateScore: 200,
    overallRank: 3,
  },
]

const setupWithData = () => {
  // Rankings query from CDN (#173)
  mockedFetchCdnRankings.mockResolvedValueOnce({
    rankings: MOCK_RANKINGS,
    asOfDate: '2025-11-22',
    generatedAt: '2025-01-01T00:00:00Z',
  })
}

const heroSearch = () =>
  screen.getByRole('combobox', { name: /find a district, club or region/i })
const rowFilter = () =>
  screen.getByRole('textbox', { name: /filter districts/i })

describe('DistrictsPage - hero search (#2249)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the labelled omni-search as the first thing in the hero stack', async () => {
    setupWithData()
    const { container } = renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 57')
    const stack = container.querySelector('.districts-hero-stack')!
    const first = stack.firstElementChild!
    expect(first).toHaveClass('districts-toolbar__search--hero')
    expect(first.contains(heroSearch())).toBe(true)
  })

  it('also renders it in the loading shell, so the field never moves on data', () => {
    mockedFetchCdnRankings.mockReturnValue(new Promise(() => {}))
    renderWithProviders(<DistrictsPage />)
    expect(heroSearch()).toBeInTheDocument()
  })

  it("'/' keyboard shortcut focuses the hero search (#435)", async () => {
    setupWithData()
    renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 57')
    expect(document.activeElement).not.toBe(heroSearch())
    fireEvent.keyDown(window, { key: '/' })
    expect(document.activeElement).toBe(heroSearch())
  })

  it("'/' shortcut does not steal focus when an input is already focused (#435)", async () => {
    setupWithData()
    renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 57')
    const sentinel = document.createElement('input')
    document.body.appendChild(sentinel)
    sentinel.focus()
    fireEvent.keyDown(window, { key: '/' })
    expect(document.activeElement).toBe(sentinel)
    document.body.removeChild(sentinel)
  })
})

describe('DistrictsPage - rankings row filter (#91)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a labelled filter field for the rankings rows', async () => {
    setupWithData()
    renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 57')
    expect(rowFilter()).toBeInTheDocument()
    expect(rowFilter().getAttribute('placeholder')).not.toMatch(/press/)
  })

  it('should filter table rows when typing a district number', async () => {
    setupWithData()
    renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 57')
    expect(screen.getByText('District 61')).toBeInTheDocument()
    expect(screen.getByText('District 83')).toBeInTheDocument()

    fireEvent.change(rowFilter(), { target: { value: '61' } })

    expect(screen.getByText('District 61')).toBeInTheDocument()
    expect(screen.queryByText('District 57')).not.toBeInTheDocument()
    expect(screen.queryByText('District 83')).not.toBeInTheDocument()
  })

  it('should filter table rows when typing a district name', async () => {
    setupWithData()
    renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 57')

    fireEvent.change(rowFilter(), { target: { value: 'district 83' } })

    expect(screen.getByText('District 83')).toBeInTheDocument()
    expect(screen.queryByText('District 57')).not.toBeInTheDocument()
    expect(screen.queryByText('District 61')).not.toBeInTheDocument()
  })

  it('should clear the filter and show all districts when clear is clicked', async () => {
    setupWithData()
    renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 57')

    fireEvent.change(rowFilter(), { target: { value: '57' } })
    expect(screen.queryByText('District 61')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /clear filter/i }))

    expect(screen.getByText('District 57')).toBeInTheDocument()
    expect(screen.getByText('District 61')).toBeInTheDocument()
    expect(screen.getByText('District 83')).toBeInTheDocument()
  })

  it('should retain original rank when filtering (#102)', async () => {
    setupWithData()
    renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 57')

    // Before filtering: D57=rank 1 (score 300), D61=rank 2 (score 250), D83=rank 3 (score 200)
    fireEvent.change(rowFilter(), { target: { value: '61' } })

    // District 61 should retain its original rank of 2, NOT become rank 1
    expect(screen.getByText('District 61')).toBeInTheDocument()
    expect(screen.getByTestId('rank-badge-61').textContent?.trim()).toBe('2')
    // No surviving row should show rank "1" — D57 (rank 1) is filtered out.
    expect(screen.queryByTestId('rank-badge-57')).toBeNull()
  })
})
