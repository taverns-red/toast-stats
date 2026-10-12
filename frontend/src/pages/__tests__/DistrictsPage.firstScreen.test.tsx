/* Landing first screen on phones (#1846, mobile epic #1827 Phase 2).
 *
 * Below 768 the shared ContextBar replaces the landing header stack; the
 * orientation copy and the actions move into its sheet, and search leads.
 * jsdom has no layout (geometry is e2e/landing-first-screen.smoke.ts); this
 * pins the wiring: where the bar mounts, what the sheet carries, and that the
 * phone search does not advertise a keyboard shortcut a phone cannot press.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

describe('DistrictsPage first screen on phones (#1846)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('mounts the context bar as the first child of the page, before the header', async () => {
    stubViewport(true)
    setupRows(3)
    const { container } = renderWithProviders(<DistrictsPage />)
    await screen.findAllByTestId(/^district-row-/)
    const page = container.querySelector('.districts-page')!
    expect(page.firstElementChild).toHaveAttribute('data-testid', 'context-bar')
    expect(page.children[1]).toHaveClass('districts-page-header')
  })

  it('also mounts it in the loading shell, so data landing inserts nothing above the KPI', () => {
    stubViewport(true)
    mockedFetchCdnRankings.mockReturnValue(new Promise(() => {}))
    const { container } = renderWithProviders(<DistrictsPage />)
    expect(
      container.querySelector('.districts-page > [data-testid="context-bar"]')
    ).not.toBeNull()
  })

  it('carries the orientation copy, with the data-derived count, in the sheet', async () => {
    stubViewport(true)
    setupRows(3)
    renderWithProviders(<DistrictsPage />)
    await screen.findAllByTestId(/^district-row-/)
    await userEvent.click(screen.getByTestId('context-bar-chip'))
    const sheet = screen.getByRole('dialog')
    expect(sheet).toHaveTextContent(
      /Each row below is one of the 3 Toastmasters districts worldwide/
    )
    expect(
      within(sheet).getByRole('button', { name: 'Export CSV' })
    ).toBeInTheDocument()
  })

  it('drops the "(press /)" keyboard hint from the phone search placeholder', async () => {
    stubViewport(true)
    setupRows(3)
    renderWithProviders(<DistrictsPage />)
    await screen.findAllByTestId(/^district-row-/)
    const input = screen.getByRole('textbox', {
      name: 'Search districts by number or name',
    })
    expect(input.getAttribute('placeholder')).not.toMatch(/press/)
  })

  it('keeps the desktop placeholder, shortcut hint included (>=768 unchanged)', async () => {
    stubViewport(false)
    setupRows(3)
    renderWithProviders(<DistrictsPage />)
    await screen.findAllByTestId(/^district-row-/)
    expect(
      screen.getByRole('textbox', {
        name: 'Search districts by number or name',
      })
    ).toHaveAttribute(
      'placeholder',
      'Search by district number or name… (press /)'
    )
  })
})
