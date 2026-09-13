/* /clubs hub (#1556, phase 3). Mounts ClubsWorldPage with the race hook
   mocked so the test stays small (integration project — page mount, R22). */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import type {
  GlobalClubRace,
  GlobalClubRaceCurrent,
  GlobalClubRaceLevel,
  GlobalClubRaceReached,
} from '@taverns-red/shared-contracts'
import ClubsWorldPage from '../ClubsWorldPage'
import { useGlobalClubRace } from '../../hooks/useGlobalClubRace'

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({ dates: [], count: 0 }),
}))

vi.mock('../../hooks/useLatestAsOfDate', () => ({
  useLatestAsOfDate: () => ({
    asOfDate: undefined,
    latestSnapshotDate: undefined,
  }),
}))

vi.mock('../../hooks/useGlobalClubRace', () => ({
  useGlobalClubRace: vi.fn(),
}))

// Recharts needs a measured container; the chart's data contract is covered
// by the artifact tests, so stub the responsive wrapper to a plain box here.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 800, height: 260 }}>{children}</div>
    ),
  }
})

const race = (overrides: Partial<GlobalClubRace> = {}): GlobalClubRace =>
  ({
    _format: { version: '1.0.0', type: 'global-club-race' },
    date: '2026-09-11',
    programYear: '2026-2027',
    generatedAt: '2026-09-11T10:00:00.000Z',
    scope: {
      districts: { total: 94, numbered: 93, includesUndistricted: true },
      clubsScanned: 14377,
      excludedDistricts: [],
      missingDistricts: [],
      reachedAbsentToday: 0,
      officialWithoutDerived: 0,
    },
    ruleset: {
      programYear: '2026-2027',
      cspRequired: true,
      smedleyAvailable: true,
      membershipBasis: 'confirmed-renewals',
      officialRecognitionFrom: '2027-04-01',
      tiers: [],
    },
    observation: {
      firstObservedDate: '2026-07-26',
      previousSnapshotDate: '2026-09-10',
      observedDates: 34,
      resolution: 'daily',
    },
    timeline: [
      {
        date: '2026-07-26',
        Distinguished: 1,
        Select: 0,
        President: 0,
        Smedley: 0,
        official: 0,
      },
      {
        date: '2026-09-11',
        Distinguished: 35,
        Select: 4,
        President: 3,
        Smedley: 0,
        official: 0,
      },
    ],
    distribution: {
      goalsMet: [14377, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      membership: { lt12: 14377, from12to19: 0, from20to24: 0, ge25: 0 },
      byTierRequirementsMet: {
        none: 14342,
        Distinguished: 31,
        Select: 1,
        President: 3,
        Smedley: 0,
      },
      byOfficialCode: { none: 14377, D: 0, S: 0, P: 0, M: 0 },
      cohorts: {
        lt12: [14377, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        from12to19: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        from20to24: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        ge25: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    },
    reached: [
      {
        clubId: '28679356',
        clubName: '1+ Toastmasters Club',
        districtId: '80',
        current: null,
        tiers: {
          Distinguished: {
            reachedOn: '2026-07-26',
            observedAfter: null,
            rank: 1,
          },
        },
        official: null,
      },
    ],
    byDistrict: [],
    ...overrides,
  }) as GlobalClubRace

const mockHook = (value: Partial<ReturnType<typeof useGlobalClubRace>>) =>
  vi.mocked(useGlobalClubRace).mockReturnValue({
    race: null,
    snapshotDate: null,
    reachedById: new Map(),
    isLoading: false,
    isError: false,
    ...value,
  })

const renderPage = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ProgramYearProvider>
        <MemoryRouter initialEntries={['/clubs']}>
          <ClubsWorldPage />
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )

describe('ClubsWorldPage (#1556)', () => {
  beforeEach(() => vi.mocked(useGlobalClubRace).mockReset())

  it('renders the heading, the clubs subnav and the basis block', () => {
    mockHook({ race: race(), snapshotDate: '2026-09-11' })
    renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: /Clubs worldwide/ })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: 'Clubs worldwide sections' })
    ).toBeInTheDocument()
    const basis = screen.getByTestId('race-basis')
    expect(basis).toHaveTextContent(/confirmed April renewals/)
    expect(
      within(basis).getByRole('link', { name: /Methodology/ })
    ).toHaveAttribute('href', '/methodology#club-race')
  })

  /* #1570: the tile counts CLUBS AT THIS LEVEL NOW, not the cumulative
     timeline — this fixture holds one reached club, so Distinguished is 1.
     The old read said 35 because it took the artifact's cumulative point. */
  it('shows one KPI per tier with the count of clubs at that level now, linking to the race', () => {
    mockHook({ race: race(), snapshotDate: '2026-09-11' })
    renderPage()
    const kpis = screen.getAllByTestId('clubs-kpi')
    expect(kpis).toHaveLength(4)
    expect(kpis[0]).toHaveTextContent('Distinguished')
    expect(kpis[0]).toHaveTextContent('1')
    expect(kpis[0]).toHaveAttribute('href', '/clubs/race/distinguished')
    expect(kpis[3]).toHaveTextContent('Smedley')
    expect(kpis[3]).toHaveTextContent('0')
  })

  it('renders a podium per tier, with the empty state where nobody has reached', () => {
    mockHook({ race: race(), snapshotDate: '2026-09-11' })
    renderPage()
    expect(
      screen.getByRole('list', { name: 'First to Distinguished' })
    ).toHaveTextContent('1+ Toastmasters Club')
    expect(screen.getAllByTestId('race-podium-empty')).toHaveLength(3)
  })

  it('renders the "not available" state when the artifact is absent', () => {
    mockHook({ race: null, snapshotDate: '2026-06-30' })
    renderPage()
    expect(
      screen.getByText(/race is not available for this date/i)
    ).toBeInTheDocument()
    expect(screen.queryByTestId('clubs-kpi')).toBeNull()
  })

  it('reserves the KPI and podium slots while loading (no late layout shift)', () => {
    mockHook({ race: null, isLoading: true })
    renderPage()
    expect(screen.getByTestId('clubs-kpis-skeleton')).toBeInTheDocument()
  })
})

/* #1570 — each club counted ONCE, at its top level. The lists are unchanged:
   a club still appears under every tier it reached, with its crossing date
   and rank (R-A2). Only the counts became exclusive. */
describe('ClubsWorldPage — exclusive tile counts (#1570)', () => {
  beforeEach(() => vi.mocked(useGlobalClubRace).mockReset())

  const standing = (reachedOn: string, rank = 1) => ({
    reachedOn,
    observedAfter: null,
    rank,
  })

  const current = (level: GlobalClubRaceLevel): GlobalClubRaceCurrent => ({
    level,
    activeMembersLevel: level,
    goalsMet: 7,
    members: 22,
    membershipBase: 20,
    netGrowth: 2,
    aprilRenewals: 22,
    cspSubmitted: true,
    dcpGoalsAchieved: null,
    divisionId: 'A',
    areaId: 'A1',
    country: 'Singapore',
  })

  const club = (
    over: Partial<GlobalClubRaceReached> & { clubId: string }
  ): GlobalClubRaceReached => ({
    clubName: `Club ${over.clubId}`,
    districtId: '80',
    current: current('Distinguished'),
    tiers: { Distinguished: standing('2026-07-26') },
    official: null,
    ...over,
  })

  /** The club the old cumulative read counted three times. */
  const angMoKio = club({
    clubId: '5193',
    clubName: 'Ang Mo Kio C.C. Mandarin Toastmasters Club',
    current: current('President'),
    tiers: {
      Distinguished: standing('2026-07-26'),
      Select: standing('2026-08-14', 2),
      President: standing('2026-08-14'),
    },
  })

  /** 31 Distinguished + 1 Select + 3 President's = 35 reached rows. */
  const liveShapedReached = (): GlobalClubRaceReached[] => [
    ...Array.from({ length: 31 }, (_, i) => club({ clubId: `d${i}` })),
    club({
      clubId: 's0',
      current: current('Select'),
      tiers: {
        Distinguished: standing('2026-07-26'),
        Select: standing('2026-08-14'),
      },
    }),
    angMoKio,
    ...Array.from({ length: 2 }, (_, i) =>
      club({
        clubId: `p${i}`,
        current: current('President'),
        tiers: {
          Distinguished: standing('2026-07-26'),
          Select: standing('2026-08-14', 2),
          President: standing('2026-08-14'),
        },
      })
    ),
  ]

  const tileCounts = (): number[] =>
    screen
      .getAllByTestId('clubs-kpi')
      .map(
        kpi =>
          Number(kpi.querySelector('.clubs-kpi__value')?.textContent?.trim()) ||
          0
      )

  it('counts each club once at its current level: 31 / 1 / 3 / 0', () => {
    const reached = liveShapedReached()
    mockHook({ race: race({ reached }), snapshotDate: '2026-09-12' })
    renderPage()
    expect(tileCounts()).toEqual([31, 1, 3, 0])
  })

  it('INVARIANT: the tiles sum to reached.length', () => {
    const reached = liveShapedReached()
    mockHook({ race: race({ reached }), snapshotDate: '2026-09-12' })
    renderPage()
    expect(tileCounts().reduce((a, b) => a + b, 0)).toBe(reached.length)
  })

  it('labels each tile "at this level now" and states the counting rule once', () => {
    const reached = liveShapedReached()
    mockHook({ race: race({ reached }), snapshotDate: '2026-09-12' })
    renderPage()
    for (const kpi of screen.getAllByTestId('clubs-kpi')) {
      expect(kpi).toHaveTextContent(/at this level now/i)
    }
    expect(screen.getByTestId('clubs-kpis-total')).toHaveTextContent(
      '35 clubs recognised worldwide — each counted once, at its top level.'
    )
  })

  it('still lists a triple-reaching club under every tier it reached', () => {
    mockHook({
      race: race({ reached: liveShapedReached() }),
      snapshotDate: '2026-09-12',
    })
    renderPage()
    for (const listName of [
      'First to Distinguished',
      'First to Select Distinguished',
      "First to President's Distinguished",
    ]) {
      expect(screen.getByRole('list', { name: listName })).toHaveTextContent(
        'Ang Mo Kio C.C. Mandarin Toastmasters Club'
      )
    }
  })

  describe('when a club has slipped below a tier it once reached', () => {
    // Ang Mo Kio drops President's → Distinguished. Today's live data has
    // zero drift, so only a fixture can exercise this.
    const slipped = (): GlobalClubRaceReached[] =>
      liveShapedReached().map(row =>
        row.clubId === '5193'
          ? { ...row, current: current('Distinguished') }
          : row
      )

    it('moves the tile counts down a tier', () => {
      mockHook({
        race: race({ reached: slipped() }),
        snapshotDate: '2026-09-12',
      })
      renderPage()
      expect(tileCounts()).toEqual([32, 1, 2, 0])
      expect(tileCounts().reduce((a, b) => a + b, 0)).toBe(35)
    })

    it('keeps the club in the higher tier list with its original crossing date', () => {
      mockHook({
        race: race({ reached: slipped() }),
        snapshotDate: '2026-09-12',
      })
      renderPage()
      const presidents = screen.getByRole('list', {
        name: "First to President's Distinguished",
      })
      expect(presidents).toHaveTextContent(
        'Ang Mo Kio C.C. Mandarin Toastmasters Club'
      )
      // reachedOn 2026-08-14, no earlier observation → "by 14 Aug 2026".
      expect(presidents).toHaveTextContent('by 14 Aug 2026')
    })
  })
})
