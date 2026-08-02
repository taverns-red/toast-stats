/**
 * Region filter — OR multi-select (#1374).
 *
 * The pill bar was solo-select (#434): a plain click REPLACED the whole
 * selection and shift-click was the only way to hold two regions at once.
 * There is no shift key on a phone, so multi-select was unreachable on touch
 * — a functionality gap, not a preference — and the chips rendered as
 * `aria-pressed` toggles while behaving like radio buttons.
 *
 * The model here is the one #1362 shipped in the row directly beneath:
 * **OR within a group, AND across groups.** Regions OR-combine with each
 * other, then AND with the Recognition chips and the search box.
 *
 * Three properties get their own tests because they are the ones a careless
 * implementation quietly breaks:
 *
 *  - **No keyboard modifier is required for two selections.** That is the
 *    whole issue; a test that only ever clicks one chip cannot fail on it.
 *  - **Removing the last selected region lands on "All", not an empty table.**
 *    An empty selection already means "no filtering" upstream, but that is a
 *    property to assert, not to assume.
 *  - **Rank stays the district's GLOBAL rank** (R11 — the region filter is a
 *    pipeline step, and the displayed rank comes from the CDN's `overallRank`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useLocation } from 'react-router-dom'
import DistrictsPage from '../DistrictsPage'
import { fetchCdnRankings, fetchCdnCompetitiveAwards } from '../../services/cdn'
import { renderWithProviders } from '../../__tests__/test-utils'

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: [],
    count: 0,
    generatedAt: '2025-01-01T00:00:00Z',
  }),
  fetchCdnSnapshotIndex: vi.fn().mockResolvedValue({}),
  fetchCdnRankings: vi.fn(),
  fetchCdnRankingsForDate: vi.fn(),
  fetchCdnCompetitiveAwards: vi.fn(),
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2026-05-18'),
  fetchCdnManifest: vi.fn().mockResolvedValue({
    latestSnapshotDate: '2026-05-18',
    generatedAt: '2026-05-18T00:00:00Z',
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
const mockedFetchCdnCompetitiveAwards = vi.mocked(fetchCdnCompetitiveAwards)

const mkRanking = (id: string, rank: number, region: string) => ({
  districtId: id,
  districtName: `District ${id}`,
  region,
  paidClubs: 75,
  paidClubBase: 70,
  clubGrowthPercent: 7.1,
  totalPayments: 2800,
  paymentBase: 2600,
  paymentGrowthPercent: 7.7,
  activeClubs: 75,
  distinguishedClubs: 35,
  selectDistinguished: 15,
  presidentsDistinguished: 8,
  distinguishedPercent: 50,
  clubsRank: rank,
  paymentsRank: rank,
  distinguishedRank: rank,
  aggregateScore: 300 - rank * 10,
  overallRank: rank,
})

const noAwards = {
  extensionRank: 0,
  extensionValue: 0,
  extensionIsWinner: false,
  twentyPlusRank: 0,
  twentyPlusValue: 0,
  twentyPlusIsWinner: false,
  retentionRank: 0,
  retentionValue: 0,
  retentionIsWinner: false,
}

/**
 * Three regions so "two of three selected" is a distinct state from "all",
 * and region 03 holds two districts so the OR union has something to
 * duplicate if the implementation gets it wrong.
 *
 *   rank 1  D102  R01  Extension
 *   rank 2  D76   R02  —
 *   rank 3  D59   R03  —
 *   rank 4  D99   R03  Extension
 */
const setup = () => {
  mockedFetchCdnRankings.mockResolvedValue({
    rankings: [
      mkRanking('102', 1, '01'),
      mkRanking('76', 2, '02'),
      mkRanking('59', 3, '03'),
      mkRanking('99', 4, '03'),
    ],
    asOfDate: '2026-05-18',
  } as never)
  mockedFetchCdnCompetitiveAwards.mockResolvedValue({
    metadata: {
      snapshotId: '2026-05-18',
      calculatedAt: '2026-05-18T00:00:00Z',
      totalDistricts: 4,
    },
    extensionAward: [],
    twentyPlusAward: [],
    retentionAward: [],
    byDistrict: {
      '102': { ...noAwards, extensionIsWinner: true },
      '76': { ...noAwards },
      '59': { ...noAwards },
      '99': { ...noAwards, extensionIsWinner: true },
    },
    distinguishedDistrict: {},
  } as never)
}

const LocationProbe = () => {
  const location = useLocation()
  return <span data-testid="loc-search">{location.search}</span>
}

const renderPage = (initialEntry = '/') =>
  renderWithProviders(
    <>
      <DistrictsPage />
      <LocationProbe />
    </>,
    { initialEntries: [initialEntry] }
  )

const search = () => screen.getByTestId('loc-search').textContent ?? ''
const param = (key: string) => new URLSearchParams(search()).get(key)

/** District ids currently rendered as rows, in DOM order. */
const visibleIds = () =>
  screen
    .queryAllByTestId(/^district-row-/)
    .map(r => r.getAttribute('data-testid')!.replace('district-row-', ''))

const chip = (region: string) =>
  screen.getByRole('button', { name: `Region ${region}` })
const allChip = () => screen.getByRole('button', { name: 'All' })

const awaitLoaded = () => screen.findByTestId('district-row-102')

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('Region filter — plain click toggles (#1374)', () => {
  it('selects a SECOND region on a plain click — no keyboard modifier', async () => {
    setup()
    renderPage()
    await awaitLoaded()

    // First click starts a selection. Nothing was individually pressed (the
    // "All" state), so this reads as "filter to region 01".
    fireEvent.click(chip('01'))
    await waitFor(() => expect(visibleIds()).toEqual(['102']))

    // The click that used to require Shift. This is the acceptance criterion:
    // two regions, one plain click each, reachable on a touch device.
    fireEvent.click(chip('02'))
    await waitFor(() => expect(visibleIds()).toEqual(['102', '76']))

    expect(chip('01')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('02')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('03')).toHaveAttribute('aria-pressed', 'false')
    expect(allChip()).toHaveAttribute('aria-pressed', 'false')
  })

  it('removes a region when its active chip is clicked again', async () => {
    setup()
    renderPage()
    await awaitLoaded()

    fireEvent.click(chip('01'))
    fireEvent.click(chip('02'))
    await waitFor(() => expect(visibleIds()).toEqual(['102', '76']))

    fireEvent.click(chip('01'))
    await waitFor(() => expect(visibleIds()).toEqual(['76']))
    expect(chip('01')).toHaveAttribute('aria-pressed', 'false')
  })

  it('falls back to All when the LAST selected region is removed', async () => {
    setup()
    renderPage()
    await awaitLoaded()

    fireEvent.click(chip('02'))
    await waitFor(() => expect(visibleIds()).toEqual(['76']))

    // Not an empty table: an empty selection means "no filtering".
    fireEvent.click(chip('02'))
    await waitFor(() => expect(visibleIds()).toEqual(['102', '76', '59', '99']))
    expect(screen.queryByTestId('rankings-empty-state')).toBeNull()
    expect(allChip()).toHaveAttribute('aria-pressed', 'true')
    expect(chip('02')).toHaveAttribute('aria-pressed', 'false')
  })

  it('"All" clears the individual selections and returns the full table', async () => {
    setup()
    renderPage()
    await awaitLoaded()

    fireEvent.click(chip('01'))
    fireEvent.click(chip('02'))
    await waitFor(() => expect(visibleIds()).toEqual(['102', '76']))

    fireEvent.click(allChip())
    await waitFor(() => expect(visibleIds()).toEqual(['102', '76', '59', '99']))
    for (const r of ['01', '02', '03']) {
      expect(chip(r)).toHaveAttribute('aria-pressed', 'false')
    }
    expect(allChip()).toHaveAttribute('aria-pressed', 'true')
  })

  it('selecting every region individually reads as "all", not as a 3-region filter', async () => {
    setup()
    renderPage()
    await awaitLoaded()

    fireEvent.click(chip('01'))
    fireEvent.click(chip('02'))
    fireEvent.click(chip('03'))

    await waitFor(() => expect(visibleIds()).toEqual(['102', '76', '59', '99']))
    expect(allChip()).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/showing all regions/i)).toBeInTheDocument()
  })

  it('shift-click is not a separate gesture — it behaves as a plain click', async () => {
    // #1374 retires the shift-click "additive toggle": plain click IS the
    // additive toggle now, so the old muscle memory still adds a region and
    // no capability hides behind a key a phone does not have.
    setup()
    renderPage()
    await awaitLoaded()

    fireEvent.click(chip('01'))
    fireEvent.click(chip('02'), { shiftKey: true })
    await waitFor(() => expect(visibleIds()).toEqual(['102', '76']))

    fireEvent.click(chip('02'), { shiftKey: true })
    await waitFor(() => expect(visibleIds()).toEqual(['102']))
  })
})

describe('Region filter — OR semantics', () => {
  it('unions the selected regions, each district appearing exactly once', async () => {
    setup()
    renderPage()
    await awaitLoaded()

    fireEvent.click(chip('02'))
    fireEvent.click(chip('03'))

    await waitFor(() => expect(visibleIds()).toEqual(['76', '59', '99']))
    // Union, not intersection, and no duplicated row for the 2-district region.
    expect(new Set(visibleIds()).size).toBe(3)
  })

  it('shows the district’s GLOBAL rank, not its position in the filtered set', async () => {
    setup()
    renderPage()
    await awaitLoaded()

    fireEvent.click(chip('03'))
    await waitFor(() => expect(visibleIds()).toEqual(['59', '99']))
    // R11: filtering is a pipeline step after ranking. D59 is #3 worldwide and
    // must never renumber to #1 just because the two rows above it are hidden.
    expect(screen.getByTestId('rank-badge-59')).toHaveTextContent('3')
    expect(screen.getByTestId('rank-badge-99')).toHaveTextContent('4')
  })
})

describe('Region filter — AND across groups', () => {
  it('intersects with the Recognition chips (#1362)', async () => {
    setup()
    renderPage()
    await awaitLoaded()

    fireEvent.click(chip('01'))
    fireEvent.click(chip('02'))
    await waitFor(() => expect(visibleIds()).toEqual(['102', '76']))

    // Regions OR-combine, then AND with Recognition: D76 holds no award, and
    // D99 holds Extension but sits in the unselected region 03.
    fireEvent.click(screen.getByTestId('recognition-filter-extension'))
    await waitFor(() => expect(visibleIds()).toEqual(['102']))
  })

  it('intersects with the search box', async () => {
    setup()
    renderPage()
    await awaitLoaded()

    fireEvent.click(chip('02'))
    fireEvent.click(chip('03'))
    await waitFor(() => expect(visibleIds()).toEqual(['76', '59', '99']))

    fireEvent.change(
      screen.getByLabelText(/search districts by number or name/i),
      { target: { value: '99' } }
    )
    await waitFor(() => expect(visibleIds()).toEqual(['99']))
  })
})

describe('Region filter — state announcement', () => {
  it('stays accurate as regions are added and removed', async () => {
    setup()
    renderPage()
    await awaitLoaded()

    expect(screen.getByText(/showing all regions/i)).toBeInTheDocument()

    fireEvent.click(chip('01'))
    await waitFor(() =>
      expect(screen.getByText(/showing region 01 only/i)).toBeInTheDocument()
    )

    fireEvent.click(chip('02'))
    await waitFor(() =>
      expect(screen.getByText(/showing 2 of 3 regions/i)).toBeInTheDocument()
    )

    fireEvent.click(chip('02'))
    await waitFor(() =>
      expect(screen.getByText(/showing region 01 only/i)).toBeInTheDocument()
    )
  })
})

describe('Region filter — URL round-trip (?regions=, #978)', () => {
  it('OUTWARD: each plain click accumulates into ?regions=', async () => {
    setup()
    renderPage()
    await awaitLoaded()

    fireEvent.click(chip('01'))
    await waitFor(() => expect(param('regions')).toBe('01'))

    fireEvent.click(chip('03'))
    await waitFor(() => expect(param('regions')).toBe('01,03'))

    // Removing the last one lands on the explicit full set — the "All" state,
    // which is what the inflate-on-load effect also produces (#978).
    fireEvent.click(chip('01'))
    await waitFor(() => expect(param('regions')).toBe('03'))
    fireEvent.click(chip('03'))
    await waitFor(() =>
      expect(param('regions')?.split(',')).toEqual(
        expect.arrayContaining(['01', '02', '03'])
      )
    )
  })

  it('INWARD: a pasted multi-region link reproduces the exact view', async () => {
    setup()
    renderPage('/?regions=01,03')
    await awaitLoaded()

    await waitFor(() => expect(visibleIds()).toEqual(['102', '59', '99']))
    expect(chip('01')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('02')).toHaveAttribute('aria-pressed', 'false')
    expect(chip('03')).toHaveAttribute('aria-pressed', 'true')
    expect(allChip()).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(/showing 2 of 3 regions/i)).toBeInTheDocument()
  })
})

describe('Region filter — touch affordance', () => {
  it('keeps every chip inside the single-line scroller (#1359 gap c)', async () => {
    setup()
    const { container } = renderPage()
    await awaitLoaded()

    const scroller = container.querySelector(
      '.districts-toolbar__row .districts-toolbar__scroller'
    )!
    for (const region of ['01', '02', '03']) {
      expect(scroller.contains(chip(region))).toBe(true)
    }
    expect(scroller.contains(allChip())).toBe(true)
  })
})
