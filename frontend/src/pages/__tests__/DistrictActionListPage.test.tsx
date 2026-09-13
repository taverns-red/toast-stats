/**
 * District Action List Page (#1231, epic #1228 Sprint 3).
 *
 * Verifies the `/district/:districtId/action-list` route renders the three
 * action sections from existing predicates/visit data, that scope filtering is
 * URL-synced, that links resolve to canonical club/area pages, and that each
 * section has an empty state.
 */

import React, { Suspense } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import {
  createMemoryRouter,
  RouterProvider,
  type RouteObject,
} from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@testing-library/jest-dom'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import {
  useDistrictAnalytics,
  type ClubTrend,
} from '../../hooks/useDistrictAnalytics'
import type {
  AreaPerformance,
  DivisionPerformance,
} from '../../utils/divisionStatus'
import { useDistrictCachedDates } from '../../hooks/useDistrictData'
import { downloadCSV } from '../../utils/csvExport'

function makeClub(overrides: Partial<ClubTrend> = {}): ClubTrend {
  return {
    clubId: 'c1',
    clubName: 'Club One',
    divisionId: 'A',
    areaId: 'A1',
    areaName: 'Area A1',
    membershipTrend: [
      { date: '2025-07-01', count: 18 },
      { date: '2025-07-15', count: 18 },
    ],
    dcpGoalsTrend: [
      { date: '2025-07-01', goalsAchieved: 0 },
      { date: '2025-07-15', goalsAchieved: 4 },
    ],
    membershipBase: 18,
    aprilRenewals: null,
    cspSubmitted: true,
    currentStatus: 'thriving',
    distinguishedLevel: 'NotDistinguished',
    ...overrides,
  } as ClubTrend
}

// A club the predicate flags (members gap 2, goals 4, CSP submitted).
const closeClub = makeClub({
  clubId: 'close-1',
  clubName: 'Rising Club',
  divisionId: 'A',
  areaId: 'A1',
})

const interventionClub = makeClub({
  clubId: 'int-1',
  clubName: 'Struggling Club',
  divisionId: 'B',
  areaId: 'B2',
  currentStatus: 'intervention-required',
  // Only 1 DCP goal, so it is NOT also close-to-Distinguished — it must appear
  // solely in the intervention section.
  dcpGoalsTrend: [{ date: '2025-07-15', goalsAchieved: 1 }],
})

// #1555: an active club without a Club Success Plan (1 goal, so it is not
// also close-to-Distinguished) and a suspended one that must be footnoted,
// not listed.
const noCspClub = makeClub({
  clubId: 'csp-1',
  clubName: 'Unplanned Club',
  divisionId: 'A',
  areaId: 'A1',
  cspSubmitted: false,
  currentStatus: 'vulnerable',
  dcpGoalsTrend: [{ date: '2025-07-15', goalsAchieved: 1 }],
})
const noCspSuspendedClub = makeClub({
  clubId: 'csp-2',
  clubName: 'Dormant Club',
  divisionId: 'B',
  areaId: 'B2',
  cspSubmitted: false,
  clubStatus: 'Suspended',
  dcpGoalsTrend: [{ date: '2025-07-15', goalsAchieved: 1 }],
})
// #1565: chartered after 1 April of PY 2025-26 — automatic credit for its
// Club Success Plan, so it is footnoted, never listed, whatever its CSP cell.
const springCharterClub = makeClub({
  clubId: 'csp-3',
  clubName: 'Spring Charter Club',
  divisionId: 'B',
  areaId: 'B2',
  cspSubmitted: false,
  charterDate: '2026-04-15',
  currentStatus: 'vulnerable',
  dcpGoalsTrend: [{ date: '2025-07-15', goalsAchieved: 1 }],
})

function makeArea(overrides: Partial<AreaPerformance>): AreaPerformance {
  return {
    areaId: 'A1',
    currentRound: 1,
    clubsMissingCurrentRoundVisit: [],
    clubsMissingCurrentRoundVisitIneligible: [],
    recognitionState: {
      level: 'distinguished',
      status: 'provisional',
      pendingRounds: [{ round: 1, deadline: '2025-11-30' }],
      failureReason: null,
    },
    ...overrides,
  } as AreaPerformance
}

const divisionPerf: DivisionPerformance[] = [
  {
    divisionId: 'A',
    areas: [
      makeArea({
        areaId: 'A1',
        currentRound: 1,
        clubsMissingCurrentRoundVisit: [
          { clubNumber: '900', clubName: 'Unvisited Club' },
        ],
      }),
    ],
  } as DivisionPerformance,
  {
    divisionId: 'B',
    areas: [makeArea({ areaId: 'B2', clubsMissingCurrentRoundVisit: [] })],
  } as DivisionPerformance,
]

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: vi.fn(() => ({
    data: { districts: [{ id: '61', name: 'District 61' }] },
    isLoading: false,
    error: null,
  })),
}))

const analyticsData = {
  allClubs: [closeClub, interventionClub, noCspClub, noCspSuspendedClub],
  interventionRequiredClubs: [interventionClub],
}

vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(() => ({
    data: analyticsData,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
}))

// PY 2025-26 by default (the first year a Club Success Plan was required);
// the #1555 year-gate test swaps in a PY 2024-25 date set.
const DATES_2025_26 = {
  data: {
    dates: ['2025-07-15', '2025-07-01'],
    dateRange: { startDate: '2025-07-01', endDate: '2025-07-15' },
  },
  isLoading: false,
}
const DATES_2024_25 = {
  data: {
    dates: ['2025-05-15', '2025-05-01'],
    dateRange: { startDate: '2025-05-01', endDate: '2025-05-15' },
  },
  isLoading: false,
}
// #1565: the same program year, pinned after the 30 September deadline and
// after the April charter above, so both rules are live on one snapshot.
const DATES_2025_26_MAY = {
  data: {
    dates: ['2026-05-15', '2026-05-01'],
    dateRange: { startDate: '2026-05-01', endDate: '2026-05-15' },
  },
  isLoading: false,
}

vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(() => DATES_2025_26),
}))

vi.mock('../../utils/csvExport', async () => {
  const actual = await vi.importActual<typeof import('../../utils/csvExport')>(
    '../../utils/csvExport'
  )
  return { ...actual, downloadCSV: vi.fn() }
})

vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(() => ({
    data: { asOfDate: '2025-07-15' },
    isLoading: false,
  })),
}))

// Partial mock: only the extractor is stubbed. `isIneligibleStatus` (the
// predicate `summarizeCspCompletion` shares with the raw path, #1555) must
// stay real.
vi.mock('../../utils/extractDivisionPerformance', async () => {
  const actual = await vi.importActual<
    typeof import('../../utils/extractDivisionPerformance')
  >('../../utils/extractDivisionPerformance')
  return { ...actual, extractDivisionPerformance: vi.fn(() => divisionPerf) }
})

const DistrictActionListPage = React.lazy(
  () => import('../DistrictActionListPage')
)

const renderAt = (initialUrl: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const routes: RouteObject[] = [
    {
      path: '/district/:districtId/action-list',
      element: (
        <Suspense fallback={<div>Loading…</div>}>
          <DistrictActionListPage />
        </Suspense>
      ),
    },
  ]
  const router = createMemoryRouter(routes, { initialEntries: [initialUrl] })
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <DarkModeProvider>
          <RouterProvider router={router} />
        </DarkModeProvider>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
  return { ...utils, router }
}

describe('DistrictActionListPage (#1231)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useDistrictCachedDates).mockReturnValue(
      DATES_2025_26 as ReturnType<typeof useDistrictCachedDates>
    )
  })
  afterEach(() => cleanup())

  it('renders the three action sections at /district/:id/action-list', async () => {
    renderAt('/district/61/action-list')
    expect(await screen.findByTestId('action-list-page')).toBeInTheDocument()
    expect(screen.getByTestId('section-close')).toBeInTheDocument()
    expect(screen.getByTestId('section-visits')).toBeInTheDocument()
    expect(screen.getByTestId('section-intervention')).toBeInTheDocument()
  })

  it('shows the close-to-Distinguished club with its concrete gap, linking to the club page', async () => {
    renderAt('/district/61/action-list')
    const link = await screen.findByRole('link', { name: 'Rising Club' })
    expect(link).toHaveAttribute('href', '/district/61/club/close-1')
    // gap reused from the projection: members gap 2, goals gap 1
    expect(
      screen.getByText(/needs 2 members \+ 1 DCP goal/)
    ).toBeInTheDocument()
  })

  it('lists the area missing club visits with round + deadline, linking to the area page', async () => {
    renderAt('/district/61/action-list')
    const link = await screen.findByRole('link', { name: 'Area A1' })
    expect(link).toHaveAttribute('href', '/district/61/division/A/area/A1')
    expect(
      screen.getByText(/1 club unvisited · Round 1, due 2025-11-30/)
    ).toBeInTheDocument()
  })

  it('lists intervention-required clubs linking to the club page', async () => {
    renderAt('/district/61/action-list')
    const link = await screen.findByRole('link', { name: 'Struggling Club' })
    expect(link).toHaveAttribute('href', '/district/61/club/int-1')
  })

  it('URL-syncs scope: ?division=B drops the division-A items', async () => {
    renderAt('/district/61/action-list?division=B')
    await screen.findByTestId('action-list-page')
    // Division A close club + visit gap are filtered out; B intervention stays.
    expect(
      screen.queryByRole('link', { name: 'Rising Club' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Area A1' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Struggling Club' })
    ).toBeInTheDocument()
  })

  it('renders empty states for every section when the scope matches nothing', async () => {
    renderAt('/district/61/action-list?division=ZZ')
    await screen.findByTestId('action-list-page')
    expect(
      screen.getByText(/No clubs are within reach of Distinguished/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Every area has completed the current round/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/No clubs are flagged intervention-required/)
    ).toBeInTheDocument()
  })

  it('marks the Action List subnav item active and self-titles the document', async () => {
    renderAt('/district/61/action-list')
    await screen.findByTestId('action-list-page')
    expect(
      screen.getByRole('link', { name: 'Action List', current: 'page' })
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(document.title).toBe('District 61 Action List — Toast Stats')
    )
  })
})

/**
 * Fourth section: clubs without a Club Success Plan (#1555, spec §6.4).
 * Present only for a program year in which a plan was required — the page
 * passes its own `effectiveProgramYear` to `buildActionList` (R3).
 */
describe('DistrictActionListPage — Clubs without a Club Success Plan (#1555)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useDistrictCachedDates).mockReturnValue(
      DATES_2025_26 as ReturnType<typeof useDistrictCachedDates>
    )
  })
  afterEach(() => {
    cleanup()
    // The May-snapshot tests below add the spring-charter club; put the
    // default roster back so the other tests keep their badge counts.
    vi.mocked(useDistrictAnalytics).mockReturnValue({
      data: analyticsData,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDistrictAnalytics>)
  })

  it('renders the section after intervention, with a count badge, club link and meta', async () => {
    renderAt('/district/61/action-list')
    const section = await screen.findByTestId('section-csp')
    expect(section).toHaveAttribute('aria-labelledby', 'action-csp')
    expect(section).toHaveTextContent('Clubs without a Club Success Plan')
    // Suspended club is footnoted, not counted — badge is 1.
    expect(
      section.querySelector('.action-list-section__count')
    ).toHaveTextContent('1')
    const link = screen.getByRole('link', { name: 'Unplanned Club' })
    expect(link).toHaveAttribute('href', '/district/61/club/csp-1')
    // #1565: pinned 2025-07-15, an existing club → due 30 September 2025.
    expect(section).toHaveTextContent(
      'A/A1 · CSP due 30 September 2025 · Vulnerable'
    )
    // Section order: close → visits → intervention → csp.
    const ids = Array.from(
      document.querySelectorAll('.action-list-section')
    ).map(s => s.getAttribute('data-testid'))
    expect(ids).toEqual([
      'section-close',
      'section-visits',
      'section-intervention',
      'section-csp',
    ])
  })

  it('footnotes suspended/ineligible clubs without a plan instead of listing them', async () => {
    renderAt('/district/61/action-list')
    const section = await screen.findByTestId('section-csp')
    expect(
      screen.queryByRole('link', { name: 'Dormant Club' })
    ).not.toBeInTheDocument()
    expect(section).toHaveTextContent(
      '1 suspended/ineligible club without a plan is not listed.'
    )
  })

  it('mentions Club Success Plans in the intro paragraph', async () => {
    renderAt('/district/61/action-list')
    await screen.findByTestId('action-list-page')
    expect(
      screen.getByText(
        /clubs that need intervention, and clubs without a Club Success Plan\./
      )
    ).toBeInTheDocument()
  })

  it('scopes to ?area= like the other sections, with the empty state when nothing matches', async () => {
    renderAt('/district/61/action-list?area=B2')
    const section = await screen.findByTestId('section-csp')
    // B2 holds only the suspended club: nothing listed, but it is footnoted.
    expect(
      screen.queryByRole('link', { name: 'Unplanned Club' })
    ).not.toBeInTheDocument()
    expect(section).toHaveTextContent(
      'Every active club in this scope has submitted its Club Success Plan.'
    )
    expect(section).toHaveTextContent(
      '1 suspended/ineligible club without a plan is not listed.'
    )
  })

  it('exports one "Club Success Plan not submitted" CSV row per listed club', async () => {
    renderAt('/district/61/action-list')
    await screen.findByTestId('section-csp')
    screen.getByRole('button', { name: 'Export CSV' }).click()
    await waitFor(() => expect(downloadCSV).toHaveBeenCalledTimes(1))
    const csv = vi.mocked(downloadCSV).mock.calls[0]![0]
    expect(csv).toContain(
      'Club Success Plan not submitted,A,A1,Unplanned Club,CSP due 30 September 2025 · Vulnerable'
    )
    // The footnoted suspended club is not exported.
    expect(csv).not.toContain('Dormant Club')
  })

  it('after the due date the row states the lost eligibility — judged by the pinned date (#1565)', async () => {
    vi.mocked(useDistrictCachedDates).mockReturnValue(
      DATES_2025_26_MAY as ReturnType<typeof useDistrictCachedDates>
    )
    renderAt('/district/61/action-list')
    const section = await screen.findByTestId('section-csp')
    expect(section).toHaveTextContent(
      'A/A1 · CSP not filed by 30 September 2025 — cannot be Distinguished this program year · Vulnerable'
    )
    expect(section).not.toHaveTextContent(/until/)
    // The CSV carries the same terminal wording.
    screen.getByRole('button', { name: 'Export CSV' }).click()
    await waitFor(() => expect(downloadCSV).toHaveBeenCalledTimes(1))
    expect(vi.mocked(downloadCSV).mock.calls[0]![0]).toContain(
      'Club Success Plan not submitted,A,A1,Unplanned Club,CSP not filed by 30 September 2025 — cannot be Distinguished this program year · Vulnerable'
    )
  })

  it('footnotes a club chartered after 1 April as automatic credit instead of listing it (#1565)', async () => {
    vi.mocked(useDistrictCachedDates).mockReturnValue(
      DATES_2025_26_MAY as ReturnType<typeof useDistrictCachedDates>
    )
    vi.mocked(useDistrictAnalytics).mockReturnValue({
      data: {
        ...analyticsData,
        allClubs: [...analyticsData.allClubs, springCharterClub],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDistrictAnalytics>)
    renderAt('/district/61/action-list?area=B2')
    const section = await screen.findByTestId('section-csp')
    expect(
      screen.queryByRole('link', { name: 'Spring Charter Club' })
    ).not.toBeInTheDocument()
    expect(
      section.querySelector('.action-list-section__count')
    ).toHaveTextContent('0')
    expect(section).toHaveTextContent(
      '1 suspended/ineligible club without a plan is not listed. ' +
        '1 club chartered after 1 April has automatic credit and is not listed.'
    )
  })

  it('renders no CSP section and no intro clause for a pre-2025-26 program year', async () => {
    vi.mocked(useDistrictCachedDates).mockReturnValue(
      DATES_2024_25 as ReturnType<typeof useDistrictCachedDates>
    )
    renderAt('/district/61/action-list')
    await screen.findByTestId('action-list-page')
    expect(screen.getByTestId('section-intervention')).toBeInTheDocument()
    expect(screen.queryByTestId('section-csp')).not.toBeInTheDocument()
    expect(screen.queryByText(/Club Success Plan/)).not.toBeInTheDocument()
  })
})
