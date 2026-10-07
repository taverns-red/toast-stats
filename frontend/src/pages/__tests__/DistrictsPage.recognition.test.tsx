/**
 * Recognition on the rankings table (#1361).
 *
 * Two defects, one concept. (1) All three competitive awards rendered the same
 * `🏆`, with the distinguishing text `sr-only` below 640px — two wins looked
 * like two identical chips and nothing on the page said what a trophy meant.
 * (2) The `Tier` column was empty (`—`) for the majority of districts — every
 * district at the start of a program year — yet consumed a desktop column.
 *
 * Both resolve into "Recognition": distinct labelled badges in the District
 * cell, the tier badge alongside them, the Tier column pulled, and a legend
 * above the table.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import DistrictsPage from '../DistrictsPage'
import {
  fetchCdnRankings,
  fetchCdnRankingsForDate,
  fetchCdnRankingsForDateExact,
  fetchCdnSnapshotIndex,
  fetchCdnCompetitiveAwards,
} from '../../services/cdn'
import { renderWithProviders } from '../../__tests__/test-utils'
import {
  AWARD_RECOGNITION,
  CLUB_GROWTH_RECOGNITION,
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
  fetchCdnRankingsForDateExact: vi.fn().mockResolvedValue(null),
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

const mkRanking = (id: string, rank: number) => ({
  districtId: id,
  districtName: `District ${id}`,
  region: '13',
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

const mkStatus = (id: string, tier: string) => ({
  districtId: id,
  currentTier: tier,
  allPrerequisitesMet: tier !== 'NotDistinguished',
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
 * D102 sweeps all three awards (the two-identical-chips case, amplified).
 * D76 wins one. D99 wins none and holds no tier — the majority state that
 * used to render an empty `—` Tier cell.
 */
const setup = () => {
  mockedFetchCdnRankings.mockResolvedValue({
    rankings: [mkRanking('102', 1), mkRanking('76', 2), mkRanking('99', 3)],
    asOfDate: '2026-05-18',
  } as never)
  mockedFetchCdnCompetitiveAwards.mockResolvedValue({
    metadata: {
      snapshotId: '2026-05-18',
      calculatedAt: '2026-05-18T00:00:00Z',
      totalDistricts: 3,
    },
    extensionAward: [],
    twentyPlusAward: [],
    retentionAward: [],
    byDistrict: {
      '102': {
        ...noAwards,
        extensionIsWinner: true,
        twentyPlusIsWinner: true,
        retentionIsWinner: true,
      },
      '76': { ...noAwards, retentionIsWinner: true },
      '99': { ...noAwards },
    },
    distinguishedDistrict: {
      '102': mkStatus('102', 'Smedley'),
      '76': mkStatus('76', 'Select'),
      '99': mkStatus('99', 'NotDistinguished'),
    },
  } as never)
}

const row = (id: string) => screen.getByTestId(`district-row-${id}`)
const cell = (id: string) => screen.getByTestId(`district-cell-${id}`)

describe('DistrictsPage recognition badges (#1361)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('gives the three awards three distinct names and three distinct glyphs', async () => {
    setup()
    renderWithProviders(<DistrictsPage />)
    await screen.findByTestId('district-row-102')

    const badges = within(row('102')).getAllByRole('img')
    const names = badges.map(b => b.getAttribute('aria-label'))
    for (const award of AWARD_RECOGNITION) {
      expect(names).toContain(award.title)
    }
    // No two badges in the row share a glyph path — the `🏆 🏆 🏆` bug.
    const awardBadges = AWARD_RECOGNITION.map(a =>
      within(row('102')).getByTestId(`recognition-${a.id}-102`)
    )
    const glyphs = awardBadges.map(b => b.querySelector('svg')?.innerHTML)
    expect(new Set(glyphs).size).toBe(3)
  })

  it('shows each award’s short label at every width (no sr-only)', async () => {
    setup()
    renderWithProviders(<DistrictsPage />)
    await screen.findByTestId('district-row-102')

    for (const award of AWARD_RECOGNITION) {
      const badge = within(row('102')).getByTestId(
        `recognition-${award.id}-102`
      )
      const label = badge.querySelector('.recognition-badge__label')
      expect(label?.textContent).toBe(award.shortLabel)
      expect(label?.className).not.toMatch(/sr-only/)
    }
  })

  it('renders only the awards a district actually won', async () => {
    setup()
    renderWithProviders(<DistrictsPage />)
    await screen.findByTestId('district-row-76')

    expect(
      within(row('76')).getByTestId('recognition-retention-76')
    ).toBeInTheDocument()
    expect(
      within(row('76')).queryByTestId('recognition-extension-76')
    ).toBeNull()
    expect(
      within(row('99')).queryByTestId('recognition-retention-99')
    ).toBeNull()
  })

  it('moves the tier badge into the District cell, beside the award badges', async () => {
    setup()
    renderWithProviders(<DistrictsPage />)
    await screen.findByTestId('district-row-102')

    // Same testid as the retired Tier-column chip, so #546's coverage carries.
    const tier = within(cell('102')).getByTestId('tier-chip-102')
    expect(tier).toHaveAttribute('data-tier', 'Smedley')
    expect(tier).toHaveTextContent(/smedley/i)
    // Smedley keeps its rare-tier ring (#546).
    expect(tier.className).toMatch(/recognition-badge--rare/)

    expect(
      within(cell('102')).getByTestId('recognition-extension-102')
    ).toBeInTheDocument()
  })

  it('renders one rosette for every tier — they are ordinal, not independent', async () => {
    setup()
    renderWithProviders(<DistrictsPage />)
    await screen.findByTestId('district-row-102')

    const smedley = within(cell('102'))
      .getByTestId('tier-chip-102')
      .querySelector('svg')?.innerHTML
    const select = within(cell('76'))
      .getByTestId('tier-chip-76')
      .querySelector('svg')?.innerHTML
    expect(smedley).toBe(select)
    expect(
      TIER_RECOGNITION.every(t => t.Icon === TIER_RECOGNITION[0].Icon)
    ).toBe(true)
  })

  it('pulls the Tier column — no header, no empty em-dash cell', async () => {
    setup()
    renderWithProviders(<DistrictsPage />)
    await screen.findByTestId('district-row-99')

    const table = screen.getByRole('table', { name: /district rankings/i })
    const headers = within(table)
      .getAllByRole('columnheader')
      .map(h => h.textContent?.trim() ?? '')
    expect(headers).not.toContain('Tier')

    // D99 holds no tier: previously an em-dash placeholder cell, now nothing.
    expect(within(row('99')).queryByTestId('tier-chip-99')).toBeNull()
    expect(within(row('99')).queryByText('—')).toBeNull()
  })
})

describe('DistrictsPage Club Growth Achievement badge (#1537)', () => {
  beforeEach(() => vi.clearAllMocks())

  /**
   * The page is pinned to 2026-09-30, so the September checkpoint is settled.
   * Its OWN file says 102 chartered 5 and 76 chartered 2; the page's rankings
   * (and any falling-back read) say 76 has since reached 9. The badge must
   * follow the checkpoint file.
   */
  const setupCheckpoint = () => {
    setup()
    vi.mocked(fetchCdnSnapshotIndex).mockResolvedValue({
      '102': ['2026-09-29', '2026-09-30'],
    } as never)
    const today = {
      rankings: [
        { ...mkRanking('102', 1), newCharteredClubs: 5 },
        { ...mkRanking('76', 2), newCharteredClubs: 9 },
        { ...mkRanking('99', 3), newCharteredClubs: 0 },
      ],
      asOfDate: '2026-10-05',
    }
    vi.mocked(fetchCdnRankingsForDate).mockResolvedValue(today as never)
    mockedFetchCdnRankings.mockResolvedValue(today as never)
    vi.mocked(fetchCdnRankingsForDateExact).mockImplementation(
      async date =>
        (date === '2026-09-30'
          ? {
              rankings: [
                { ...mkRanking('102', 1), newCharteredClubs: 5 },
                { ...mkRanking('76', 2), newCharteredClubs: 2 },
                { ...mkRanking('99', 3), newCharteredClubs: 0 },
              ],
              snapshotDate: '2026-09-30',
              asOfDate: '2026-10-05',
              generatedAt: '2026-10-05T00:00:00Z',
            }
          : null) as never
    )
  }

  it('badges a district holding a settled milestone, naming the tier reached', async () => {
    setupCheckpoint()
    renderWithProviders(<DistrictsPage />)
    const badge = await screen.findByTestId(
      `recognition-${CLUB_GROWTH_RECOGNITION.id}-102`
    )
    expect(badge).toHaveAttribute(
      'aria-label',
      `${CLUB_GROWTH_RECOGNITION.title} — 5-club milestone by September 30, 2026`
    )
    expect(badge).toHaveTextContent(`${CLUB_GROWTH_RECOGNITION.shortLabel}5`)
    expect(cell('102')).toContainElement(badge)
  })

  it("follows the checkpoint's own file — today's higher count earns nothing", async () => {
    setupCheckpoint()
    renderWithProviders(<DistrictsPage />)
    await screen.findByTestId(`recognition-${CLUB_GROWTH_RECOGNITION.id}-102`)
    expect(
      within(row('76')).queryByTestId(
        `recognition-${CLUB_GROWTH_RECOGNITION.id}-76`
      )
    ).toBeNull()
    expect(
      within(row('99')).queryByTestId(
        `recognition-${CLUB_GROWTH_RECOGNITION.id}-99`
      )
    ).toBeNull()
  })
})

describe('DistrictsPage recognition legend (#1361)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a legend above the rankings table', async () => {
    setup()
    const { container } = renderWithProviders(<DistrictsPage />)
    await screen.findByTestId('district-row-102')

    const legend = container.querySelector('.recognition-legend')
    const table = container.querySelector('.districts-rankings-table-wrap')
    expect(legend).not.toBeNull()
    expect(table).not.toBeNull()
    expect(
      Boolean(
        legend!.compareDocumentPosition(table!) &
        Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true)
  })

  it('reserves the legend in the loading shell so it cannot shift the table (#1359)', async () => {
    // The legend is part of the LOADED tree. PR #1357 took landing CLS from
    // 0.265 to 0.046 by reserving the hero stack; inserting an unreserved
    // element above the table would hand that back. The reserve is the real
    // component (it needs no data), so it cannot drift from what it reserves.
    mockedFetchCdnRankings.mockReturnValue(new Promise(() => {}) as never)
    mockedFetchCdnCompetitiveAwards.mockReturnValue(
      new Promise(() => {}) as never
    )
    const { container } = renderWithProviders(<DistrictsPage />)
    await screen.findByRole('status', { name: /loading district rankings/i })

    expect(container.querySelector('.recognition-legend')).not.toBeNull()
  })
})
