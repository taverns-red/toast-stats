/* /clubs/race/:tier (#1556, phase 3). Mounted through a real memory router
   with the app's branded ErrorPage as the boundary, so an unknown tier is
   proven to land on the 404 rather than an empty race (integration project). */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import type { GlobalClubRace } from '@taverns-red/shared-contracts'
import ClubsRacePage from '../ClubsRacePage'
import ErrorPage from '../../components/ErrorPage'
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

// ErrorPage's smart recovery reads the district list; keep it inert here.
vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: () => ({ data: [], isLoading: false }),
}))

const RACE: GlobalClubRace = {
  _format: { version: '1.0.0', type: 'global-club-race' },
  date: '2026-09-11',
  programYear: '2026-2027',
  generatedAt: '2026-09-11T10:00:00.000Z',
  scope: {
    districts: { total: 1, numbered: 1, includesUndistricted: false },
    clubsScanned: 3,
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
    observedDates: 3,
    resolution: 'daily',
  },
  timeline: [],
  distribution: {
    goalsMet: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    membership: { lt12: 3, from12to19: 0, from20to24: 0, ge25: 0 },
    byTierRequirementsMet: {
      none: 1,
      Distinguished: 1,
      Select: 1,
      President: 0,
      Smedley: 0,
    },
    byOfficialCode: { none: 3, D: 0, S: 0, P: 0, M: 0 },
    cohorts: {
      lt12: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      from12to19: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      from20to24: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ge25: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
  },
  reached: [
    {
      clubId: '3045',
      clubName: 'Limestone City Club',
      districtId: '61',
      current: null,
      tiers: {
        Distinguished: {
          reachedOn: '2026-07-26',
          observedAfter: null,
          rank: 1,
        },
        Select: {
          reachedOn: '2026-08-12',
          observedAfter: '2026-08-11',
          rank: 1,
        },
      },
      official: null,
    },
    {
      clubId: '9',
      clubName: 'Nine',
      districtId: '61',
      current: null,
      tiers: {
        Distinguished: {
          reachedOn: '2026-08-12',
          observedAfter: '2026-08-11',
          rank: 2,
        },
      },
      official: null,
    },
  ],
  byDistrict: [],
}

const mockHook = (value: Partial<ReturnType<typeof useGlobalClubRace>>) =>
  vi.mocked(useGlobalClubRace).mockReturnValue({
    race: null,
    snapshotDate: null,
    reachedById: new Map(),
    isLoading: false,
    isError: false,
    ...value,
  })

const renderAt = (url: string) => {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        errorElement: <ErrorPage />,
        children: [{ path: 'clubs/race/:tier', element: <ClubsRacePage /> }],
      },
    ],
    { initialEntries: [url] }
  )
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ProgramYearProvider>
        <RouterProvider router={router} />
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

describe('ClubsRacePage (#1556)', () => {
  beforeEach(() => vi.mocked(useGlobalClubRace).mockReset())

  it('renders the race table for a valid tier, titled with the real tier name', () => {
    mockHook({ race: RACE, snapshotDate: '2026-09-11' })
    renderAt('/clubs/race/select')
    expect(
      screen.getByRole('heading', { level: 1, name: /Select Distinguished/ })
    ).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(table).toHaveTextContent('Limestone City Club')
    // Nine has not reached Select — it must not appear on this tier's page.
    expect(table).not.toHaveTextContent('Nine')
  })

  it('renders the branded 404 for an unknown tier', () => {
    mockHook({ race: RACE, snapshotDate: '2026-09-11' })
    renderAt('/clubs/race/foo')
    expect(
      screen.getByRole('heading', { name: 'Page not found' })
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('marks the ?highlight= club row as current', () => {
    mockHook({ race: RACE, snapshotDate: '2026-09-11' })
    renderAt('/clubs/race/distinguished?highlight=9')
    const current = screen
      .getAllByRole('row')
      .filter(r => r.getAttribute('aria-current') === 'true')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent('Nine')
  })

  it('renders the empty state when nobody has reached the tier yet', () => {
    mockHook({ race: RACE, snapshotDate: '2026-09-11' })
    renderAt('/clubs/race/smedley')
    expect(
      screen.getByText(/No club has reached Smedley Distinguished yet/)
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('says the race is not available when the artifact is absent', () => {
    mockHook({ race: null, snapshotDate: '2026-06-30' })
    renderAt('/clubs/race/distinguished')
    expect(
      screen.getByText(/race is not available for this date/i)
    ).toBeInTheDocument()
  })
})
