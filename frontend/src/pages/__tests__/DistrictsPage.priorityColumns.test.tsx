/**
 * DistrictsPage rankings below 768 (#1834, mobile epic #1827).
 *
 * Replaces the column-hiding horizontal scroll and the MOBILE_RANKINGS_CAP
 * top-20 disclosure (#863) with a PriorityColumnsTable: district (my-district
 * star + chip, a link to the district) + 2 metrics chosen by chip (?cols=),
 * sortable through the shared SortableHeader / ?sort=, every row shown, and
 * the full table in the full-screen sheet. ≥768 is unchanged.
 *
 * jsdom has no media queries; useIsMobile reads a stubbed matchMedia.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import DistrictsPage from '../DistrictsPage'
import { fetchCdnRankings } from '../../services/cdn'
import { renderWithProviders } from '../../__tests__/test-utils'

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

const makeRow = (i: number) => ({
  districtId: String(i),
  districtName: `District ${i}`,
  region: String((i % 14) + 1),
  paidClubs: 100 + i,
  paidClubBase: 90,
  clubGrowthPercent: 5,
  totalPayments: 5000 - i,
  paymentBase: 4500,
  paymentGrowthPercent: 5,
  activeClubs: 200 - i,
  distinguishedClubs: 50,
  selectDistinguished: 20,
  presidentsDistinguished: 10,
  distinguishedPercent: 25,
  clubsRank: 26 - i,
  paymentsRank: i,
  distinguishedRank: i,
  aggregateScore: 1000 - i,
  overallRank: i,
})

const setupRows = (n: number) => {
  mockedFetchCdnRankings.mockResolvedValue({
    rankings: Array.from({ length: n }, (_, idx) => makeRow(idx + 1)),
    asOfDate: '2025-11-22',
  } as never)
}

const stubViewport = (mobile: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: mobile,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  )
}

const table = () => screen.getByRole('table', { name: 'District rankings' })
const headers = () =>
  [...table().querySelectorAll('thead th')].map(th => th.textContent?.trim())
const rowIds = () =>
  screen
    .getAllByTestId(/^district-row-/)
    .map(r => r.getAttribute('data-testid')!.replace('district-row-', ''))

describe('DistrictsPage rankings priority columns below 768 (#1834)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows district + Rank + Score, with every row (no top-20 cap)', async () => {
    stubViewport(true)
    setupRows(25)
    renderWithProviders(<DistrictsPage />)
    await screen.findAllByTestId(/^district-row-/)
    expect(headers()).toEqual(['District', 'Rank', 'Score'])
    expect(rowIds()).toHaveLength(25)
    expect(screen.queryByTestId('mobile-show-all-districts')).toBeNull()
    expect(
      screen.queryByRole('region', { name: /scroll horizontally/i })
    ).toBeNull()
  })

  it('links each district and keeps the my-district star', async () => {
    stubViewport(true)
    setupRows(3)
    renderWithProviders(<DistrictsPage />)
    await screen.findAllByTestId(/^district-row-/)
    const row = screen.getByTestId('district-row-2')
    expect(within(row).getByRole('link', { name: /D2/ })).toHaveAttribute(
      'href',
      '/district/2'
    )
    expect(
      within(row).getByRole('button', {
        name: 'Set District 2 as my district',
      })
    ).toBeInTheDocument()
  })

  it('sorts by a chosen metric through the shared header into ?sort=', async () => {
    stubViewport(true)
    setupRows(3)
    renderWithProviders(<DistrictsPage />)
    await screen.findAllByTestId(/^district-row-/)
    await userEvent.click(screen.getByRole('button', { name: 'Paid clubs' }))
    expect(headers()).toEqual(['District', 'Score', 'Paid clubs'])
    await userEvent.click(
      within(table()).getByRole('button', { name: /Sort by Paid clubs/ })
    )
    // The page sorts Paid Clubs by its clubs RANK (1 = best): ascending puts
    // the best rank first — D3 holds clubsRank 23, D1 holds 25.
    expect(rowIds()[0]).toBe('3')
    await userEvent.click(
      within(table()).getByRole('button', { name: /Sort by Paid clubs/ })
    )
    expect(rowIds()[0]).toBe('1')
    const th = [...table().querySelectorAll('thead th')][2]!
    expect(th).toHaveAttribute('aria-sort', 'descending')
  })

  it('opens the complete rankings table in the full-screen sheet', async () => {
    stubViewport(true)
    setupRows(3)
    renderWithProviders(<DistrictsPage />)
    await screen.findAllByTestId(/^district-row-/)
    await userEvent.click(screen.getByRole('button', { name: /full table/i }))
    const dialog = screen.getByRole('dialog', { name: /District rankings/ })
    const full = within(within(dialog).getByRole('region')).getByRole('table')
    expect(full.querySelectorAll('thead th')).toHaveLength(6)
  })

  it('still says so when filters match nothing', async () => {
    stubViewport(true)
    setupRows(3)
    renderWithProviders(<DistrictsPage />)
    await screen.findAllByTestId(/^district-row-/)
    await userEvent.type(
      screen.getByRole('textbox', { name: /search districts/i }),
      'zzz-no-match'
    )
    expect(
      within(table()).getByTestId('rankings-empty-state')
    ).toBeInTheDocument()
  })

  it('desktop keeps the original table, with every row', async () => {
    stubViewport(false)
    setupRows(25)
    renderWithProviders(<DistrictsPage />)
    await screen.findAllByTestId(/^district-row-/)
    expect(rowIds()).toHaveLength(25)
    expect(document.querySelector('.priority-columns__table')).toBeNull()
  })
})

/* Progressive reveal (#1834 follow-up): the phone list shows 25 rows, then
   "Show 25 more" / "Show all N" — the MobileRowList step pattern, not a hard
   cap — with the reveal in ?rows= so back and deep links keep it. A district
   named in ?district= (e.g. arriving from a district page) pins near the top
   with its rank. Desktop always shows every row. */
const Where = () => {
  const { search } = useLocation()
  return <output data-testid="where">{search}</output>
}
const where = () => screen.getByTestId('where').textContent ?? ''

describe('DistrictsPage phone rankings reveal (#1834)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows 25 rows, then 25 more, then all — the reveal lives in ?rows=', async () => {
    stubViewport(true)
    setupRows(60)
    renderWithProviders(
      <>
        <DistrictsPage />
        <Where />
      </>
    )
    await screen.findAllByTestId(/^district-row-/)
    expect(rowIds()).toHaveLength(25)
    await userEvent.click(
      screen.getByRole('button', { name: /Show 25 more districts/ })
    )
    expect(rowIds()).toHaveLength(50)
    expect(where()).toContain('rows=50')
    await userEvent.click(
      screen.getByRole('button', { name: 'Show all 60 districts' })
    )
    expect(rowIds()).toHaveLength(60)
    expect(where()).toContain('rows=all')
    expect(screen.queryByRole('button', { name: /Show .* more/ })).toBeNull()
  })

  it('a deep link with ?rows=all opens with every row', async () => {
    stubViewport(true)
    setupRows(60)
    renderWithProviders(<DistrictsPage />, { initialEntries: ['/?rows=all'] })
    await screen.findAllByTestId(/^district-row-/)
    expect(rowIds()).toHaveLength(60)
  })

  it('pins the ?district= row near the top, with its rank, past the first 25', async () => {
    stubViewport(true)
    setupRows(60)
    renderWithProviders(<DistrictsPage />, {
      initialEntries: ['/?district=40'],
    })
    await screen.findAllByTestId(/^district-row-/)
    expect(rowIds()[0]).toBe('40')
    expect(rowIds()).toHaveLength(26) // the pinned row + the first 25
    expect(
      within(screen.getByTestId('district-row-40')).getByText('#40')
    ).toBeInTheDocument()
  })

  it('an active search shows every match (search never hides results)', async () => {
    stubViewport(true)
    setupRows(60)
    renderWithProviders(<DistrictsPage />)
    await screen.findAllByTestId(/^district-row-/)
    await userEvent.type(
      screen.getByRole('textbox', { name: /search districts/i }),
      'District'
    )
    expect(rowIds()).toHaveLength(60)
    expect(screen.queryByRole('button', { name: /Show .* more/ })).toBeNull()
  })

  it('desktop shows every row and no reveal buttons', async () => {
    stubViewport(false)
    setupRows(60)
    renderWithProviders(<DistrictsPage />)
    await screen.findAllByTestId(/^district-row-/)
    expect(rowIds()).toHaveLength(60)
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull()
  })
})
