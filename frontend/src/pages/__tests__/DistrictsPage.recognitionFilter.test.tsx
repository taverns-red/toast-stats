/**
 * Filtering the rankings table by Recognition (#1362).
 *
 * #1361 put award and tier badges in the District cell; they were visible but
 * not actionable — there was no way to ask "show me everyone who won the
 * Extension Award" or "show me Select and above". This adds a Recognition chip
 * row directly under the Regions row, with conventional faceted semantics:
 * **OR within a group, AND across groups**, and a tier that reads as a `>=`
 * threshold because the tiers are ordinal.
 *
 * Two properties get their own tests because they are the ones a careless
 * implementation quietly breaks:
 *
 *  - **Rank is the district's GLOBAL rank, not its position in the filtered
 *    set.** The filter is a new step inserted AFTER ranking (R11), alongside
 *    the search filter.
 *  - **The view round-trips through the URL.** A pasted link has to reproduce
 *    the exact filtered table, which is an acceptance criterion rather than an
 *    assumption.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, within, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useLocation } from 'react-router-dom'
import DistrictsPage from '../DistrictsPage'
import { fetchCdnRankings, fetchCdnCompetitiveAwards } from '../../services/cdn'
import { renderWithProviders } from '../../__tests__/test-utils'
import {
  AWARD_RECOGNITION,
  TIER_RECOGNITION,
} from '../../components/recognition/recognitionRegistry'

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

const mkStatus = (districtId: string, currentTier: string) => ({
  districtId,
  currentTier,
  allPrerequisitesMet: currentTier !== 'NotDistinguished',
  prerequisites: {
    dspSubmitted: true,
    trainingMet: true,
    marketAnalysisSubmitted: true,
    communicationPlanSubmitted: true,
    regionAdvisorVisitMet: true,
  },
  nextTierGap: null,
})

/**
 * The issue's worked example, with a region split so the compose-with-regions
 * case has something to bite on.
 *
 *   rank 1  D102  R13  Smedley  Extension + Retention
 *   rank 2  D76   R13  Select   Extension
 *   rank 3  D59   R02  Select   20-Plus
 *   rank 4  D99   R02  —        —
 */
const setup = () => {
  mockedFetchCdnRankings.mockResolvedValue({
    rankings: [
      mkRanking('102', 1, '13'),
      mkRanking('76', 2, '13'),
      mkRanking('59', 3, '02'),
      mkRanking('99', 4, '02'),
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
      '102': { ...noAwards, extensionIsWinner: true, retentionIsWinner: true },
      '76': { ...noAwards, extensionIsWinner: true },
      '59': { ...noAwards, twentyPlusIsWinner: true },
      '99': { ...noAwards },
    },
    distinguishedDistrict: {
      '102': mkStatus('102', 'Smedley'),
      '76': mkStatus('76', 'Select'),
      '59': mkStatus('59', 'Select'),
      '99': mkStatus('99', 'NotDistinguished'),
    },
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

const awaitLoaded = () => screen.findByTestId('district-row-102')

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('Recognition filter — the chip row (#1362)', () => {
  it('sits in the toolbar directly under the Regions row', async () => {
    setup()
    const { container } = renderPage()
    await awaitLoaded()

    const toolbar = container.querySelector('.districts-toolbar')!
    const rows = Array.from(
      toolbar.querySelectorAll('.districts-toolbar__row')
    )
    const regionRow = rows.find(r => /regions:/i.test(r.textContent ?? ''))
    const recognitionRow = screen.getByTestId('recognition-filter-row')

    expect(regionRow).toBeDefined()
    expect(rows.indexOf(recognitionRow)).toBe(rows.indexOf(regionRow!) + 1)
  })
})

describe('Recognition filter — award chips (OR within the group)', () => {
  it('filters to districts holding the selected award', async () => {
    setup()
    renderPage()
    await awaitLoaded()

    fireEvent.click(screen.getByTestId('recognition-filter-retention'))
    await waitFor(() => expect(visibleIds()).toEqual(['102']))
  })

  it('unions two award chips rather than intersecting them', async () => {
    setup()
    renderPage()
    await awaitLoaded()

    fireEvent.click(screen.getByTestId('recognition-filter-extension'))
    fireEvent.click(screen.getByTestId('recognition-filter-twentyPlus'))
    // D102 + D76 hold Extension, D59 holds 20-Plus. D99 holds neither.
    await waitFor(() => expect(visibleIds()).toEqual(['102', '76', '59']))
  })

  it('restores the full table when the last award chip is cleared', async () => {
    setup()
    renderPage()
    await awaitLoaded()

    fireEvent.click(screen.getByTestId('recognition-filter-retention'))
    await waitFor(() => expect(visibleIds()).toEqual(['102']))
    fireEvent.click(screen.getByTestId('recognition-filter-retention'))
    await waitFor(() =>
      expect(visibleIds()).toEqual(['102', '76', '59', '99'])
    )
  })
})

describe('Recognition filter — tier chips (>= threshold)', () => {
  it('includes every district AT OR ABOVE the selected tier', async () => {
    setup()
    renderPage()
    await awaitLoaded()

    fireEvent.click(screen.getByTestId('recognition-filter-tier-Select'))
    // Smedley (102) is above Select and must not be filtered out.
    await waitFor(() => expect(visibleIds()).toEqual(['102', '76', '59']))
  })

  it('excludes districts below the selected tier', async () => {
    setup()
    renderPage()
    await awaitLoaded()

    fireEvent.click(screen.getByTestId('recognition-filter-tier-Presidents'))
    await waitFor(() => expect(visibleIds()).toEqual(['102']))
  })
})

describe('Recognition filter — AND across groups', () => {
  it('requires an award match AND the tier threshold', async () => {
    setup()
    renderPage()
    await awaitLoaded()

    fireEvent.click(screen.getByTestId('recognition-filter-extension'))
    fireEvent.click(screen.getByTestId('recognition-filter-retention'))
    fireEvent.click(screen.getByTestId('recognition-filter-tier-Select'))

    // D59 is Select but holds neither award; D99 fails both legs.
    await waitFor(() => expect(visibleIds()).toEqual(['102', '76']))
  })
})

describe('Recognition filter — composes with the existing pipeline', () => {
  it('intersects with the region filter', async () => {
    setup()
    renderPage('/?regions=02')
    await screen.findByTestId('district-row-59')

    fireEvent.click(screen.getByTestId('recognition-filter-tier-Select'))
    await waitFor(() => expect(visibleIds()).toEqual(['59']))
  })

  it('intersects with the search box', async () => {
    setup()
    renderPage()
    await awaitLoaded()

    fireEvent.click(screen.getByTestId('recognition-filter-extension'))
    await waitFor(() => expect(visibleIds()).toEqual(['102', '76']))

    fireEvent.change(
      screen.getByLabelText(/search districts by number or name/i),
      { target: { value: '76' } }
    )
    await waitFor(() => expect(visibleIds()).toEqual(['76']))
  })

  it('shows the district’s GLOBAL rank, not its position in the filtered set', async () => {
    // R11: the filter is a step AFTER ranking. D59 is #3 worldwide; filtered
    // down to one row it must still read #3, never #1.
    setup()
    renderPage()
    await awaitLoaded()

    fireEvent.click(screen.getByTestId('recognition-filter-twentyPlus'))
    await waitFor(() => expect(visibleIds()).toEqual(['59']))
    expect(screen.getByTestId('rank-badge-59')).toHaveTextContent('3')
  })
})

describe('Recognition filter — URL round-trip', () => {
  it('OUTWARD: a chip click writes ?awards= / ?tier=, and clearing removes them', async () => {
    setup()
    renderPage()
    await awaitLoaded()

    fireEvent.click(screen.getByTestId('recognition-filter-extension'))
    await waitFor(() => expect(param('awards')).toBe('extension'))

    fireEvent.click(screen.getByTestId('recognition-filter-retention'))
    await waitFor(() => expect(param('awards')).toBe('extension,retention'))

    fireEvent.click(screen.getByTestId('recognition-filter-tier-Select'))
    await waitFor(() => expect(param('tier')).toBe('select'))

    fireEvent.click(screen.getByTestId('recognition-filter-tier-Select'))
    await waitFor(() => expect(param('tier')).toBeNull())

    fireEvent.click(screen.getByTestId('recognition-filter-extension'))
    fireEvent.click(screen.getByTestId('recognition-filter-retention'))
    await waitFor(() => expect(param('awards')).toBeNull())
  })

  it('INWARD: a pasted link reproduces the exact filtered view', async () => {
    setup()
    renderPage('/?regions=13,02&awards=extension,retention&tier=select')
    await awaitLoaded()

    // Same rows the equivalent click sequence produced, above.
    await waitFor(() => expect(visibleIds()).toEqual(['102', '76']))
    // …and the chips show the state the link encodes.
    expect(screen.getByTestId('recognition-filter-extension')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByTestId('recognition-filter-retention')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByTestId('recognition-filter-twentyPlus')).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(
      screen.getByTestId('recognition-filter-tier-Select')
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('INWARD: the tier token is a threshold, so ?tier=distinguished keeps Smedley', async () => {
    setup()
    renderPage('/?tier=distinguished')
    await awaitLoaded()
    await waitFor(() => expect(visibleIds()).toEqual(['102', '76', '59']))
  })

  it('ignores award and tier tokens that are not registry ids', async () => {
    setup()
    renderPage('/?awards=banana&tier=platinum')
    await awaitLoaded()
    await waitFor(() =>
      expect(visibleIds()).toEqual(['102', '76', '59', '99'])
    )
  })
})

describe('Recognition filter — empty result set', () => {
  it('renders a "no districts match" state, not a blank table', async () => {
    setup()
    renderPage()
    await awaitLoaded()

    // 20-Plus is held only by D59, which is Select — never Smedley.
    fireEvent.click(screen.getByTestId('recognition-filter-twentyPlus'))
    fireEvent.click(screen.getByTestId('recognition-filter-tier-Smedley'))

    const empty = await screen.findByTestId('rankings-empty-state')
    expect(empty).toHaveTextContent(/no districts match/i)
    expect(visibleIds()).toEqual([])
  })

  it('offers a way back — clearing the filters restores the table', async () => {
    setup()
    renderPage()
    await awaitLoaded()

    fireEvent.click(screen.getByTestId('recognition-filter-twentyPlus'))
    fireEvent.click(screen.getByTestId('recognition-filter-tier-Smedley'))
    await screen.findByTestId('rankings-empty-state')

    fireEvent.click(screen.getByTestId('rankings-empty-state-clear'))
    await waitFor(() =>
      expect(visibleIds()).toEqual(['102', '76', '59', '99'])
    )
    expect(screen.queryByTestId('rankings-empty-state')).toBeNull()
    expect(param('awards')).toBeNull()
    expect(param('tier')).toBeNull()
  })

  it('does not show the empty state while the data is still loading', async () => {
    mockedFetchCdnRankings.mockReturnValue(new Promise(() => {}) as never)
    mockedFetchCdnCompetitiveAwards.mockReturnValue(
      new Promise(() => {}) as never
    )
    renderPage()
    await screen.findByRole('status', { name: /loading district rankings/i })
    expect(screen.queryByTestId('rankings-empty-state')).toBeNull()
  })
})

describe('Recognition filter — loading-shell reserve (#1359 CLS)', () => {
  it('holds the chip row open while the data is in flight', async () => {
    // The row is part of the LOADED tree. Adding a toolbar row without a
    // reserve hands back the CLS #1357/#1367 just recovered, so the shell
    // renders the SAME component (it needs no data) rather than a look-alike.
    mockedFetchCdnRankings.mockReturnValue(new Promise(() => {}) as never)
    mockedFetchCdnCompetitiveAwards.mockReturnValue(
      new Promise(() => {}) as never
    )
    renderPage()
    await screen.findByRole('status', { name: /loading district rankings/i })

    const reserved = within(
      screen.getByTestId('recognition-filter-row')
    ).getAllByRole('button')
    expect(reserved).toHaveLength(
      AWARD_RECOGNITION.length + TIER_RECOGNITION.length
    )
    // Reserve only — it must not be reachable by keyboard or click.
    for (const chip of reserved) expect(chip).toBeDisabled()
  })
})
