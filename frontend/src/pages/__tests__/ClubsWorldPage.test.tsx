/* /clubs hub (#1556, phase 3). Mounts ClubsWorldPage with the race hook
   mocked so the test stays small (integration project — page mount, R22). */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import type { GlobalClubRace } from '@taverns-red/shared-contracts'
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

  it('shows one KPI per tier with the count of clubs that have reached it, linking to the race', () => {
    mockHook({ race: race(), snapshotDate: '2026-09-11' })
    renderPage()
    const kpis = screen.getAllByTestId('clubs-kpi')
    expect(kpis).toHaveLength(4)
    expect(kpis[0]).toHaveTextContent('Distinguished')
    expect(kpis[0]).toHaveTextContent('35')
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
