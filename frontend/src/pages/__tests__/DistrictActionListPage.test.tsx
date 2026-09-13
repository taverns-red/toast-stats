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
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
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

expect.extend(toHaveNoViolations)

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

/** The rendered section order, top to bottom (#1569). */
const renderedOrder = () =>
  Array.from(document.querySelectorAll('.action-list-section')).map(s =>
    s.getAttribute('data-testid')
  )

/** A section's disclosure header button (#1569). */
const toggleOf = (testId: string) =>
  within(screen.getByTestId(testId)).getByRole('button')

/** Expand a section if it is collapsed — since #1569 only the FIRST section
 *  is open on load, so any test reading another section's rows opens it the
 *  way a user would. */
async function openSection(testId: string): Promise<HTMLElement> {
  const section = await screen.findByTestId(testId)
  const toggle = within(section).getByRole('button')
  if (toggle.getAttribute('aria-expanded') === 'false') {
    await userEvent.click(toggle)
  }
  return section
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
    await openSection('section-close')
    const link = screen.getByRole('link', { name: 'Rising Club' })
    expect(link).toHaveAttribute('href', '/district/61/club/close-1')
    // gap reused from the projection: members gap 2, goals gap 1
    expect(
      screen.getByText(/needs 2 members \+ 1 DCP goal/)
    ).toBeInTheDocument()
  })

  it('lists the area missing club visits with round + deadline, linking to the area page', async () => {
    renderAt('/district/61/action-list')
    await openSection('section-visits')
    const link = screen.getByRole('link', { name: 'Area A1' })
    expect(link).toHaveAttribute('href', '/district/61/division/A/area/A1')
    expect(
      screen.getByText(/1 club unvisited · Round 1, due 2025-11-30/)
    ).toBeInTheDocument()
  })

  it('lists intervention-required clubs linking to the club page', async () => {
    renderAt('/district/61/action-list')
    await openSection('section-intervention')
    const link = screen.getByRole('link', { name: 'Struggling Club' })
    expect(link).toHaveAttribute('href', '/district/61/club/int-1')
  })

  it('URL-syncs scope: ?division=B drops the division-A items', async () => {
    renderAt('/district/61/action-list?division=B')
    await screen.findByTestId('action-list-page')
    // Every section open, so the absences below are the scope filter's doing
    // and not the #1569 default collapse.
    await openSection('section-close')
    await openSection('section-visits')
    await openSection('section-intervention')
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

  it('renders the section first while actionable, with a count badge, club link and meta', async () => {
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
    // #1569 — pinned 2025-07-15, before the 30 September deadline, so the CSP
    // section leads: csp → close → visits → intervention.
    expect(renderedOrder()).toEqual([
      'section-csp',
      'section-close',
      'section-visits',
      'section-intervention',
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
    // #1569 — the clause order tracks the rendered order, and before the
    // deadline the Club Success Plan leads.
    expect(
      screen.getByText(
        /clubs without a Club Success Plan, clubs within reach of Distinguished/
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

/**
 * Collapsible sections (#1569).
 *
 * Three operator decisions, each proven here:
 *   1. the FIRST section is expanded on load and the rest collapsed (stated
 *      that way so it survives the seasonal reorder below);
 *   2. the collapse state is remembered per browser in localStorage, and a
 *      blocked/throwing store falls back to the default in silence;
 *   3. the Club Success Plan section leads while its deadline can still earn
 *      credit and trails once it has passed — decided by the program year and
 *      pinned date the page already owns (R3), so both windows below are
 *      pinned dates, never a mocked clock.
 */
describe('DistrictActionListPage — collapsible sections (#1569)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useDistrictCachedDates).mockReturnValue(
      DATES_2025_26 as ReturnType<typeof useDistrictCachedDates>
    )
  })
  afterEach(() => cleanup())

  it('expands only the first section on load and leaves the rest collapsed', async () => {
    renderAt('/district/61/action-list')
    await screen.findByTestId('section-csp')
    expect(renderedOrder()).toEqual([
      'section-csp',
      'section-close',
      'section-visits',
      'section-intervention',
    ])
    expect(toggleOf('section-csp')).toHaveAttribute('aria-expanded', 'true')
    for (const id of [
      'section-close',
      'section-visits',
      'section-intervention',
    ])
      expect(toggleOf(id)).toHaveAttribute('aria-expanded', 'false')
  })

  it('gives each section real disclosure semantics, count badge included in the name', async () => {
    renderAt('/district/61/action-list')
    await screen.findByTestId('section-csp')
    const toggle = toggleOf('section-csp')
    expect(toggle.tagName).toBe('BUTTON')
    expect(toggle).toHaveAccessibleName(/Clubs without a Club Success Plan\s+1/)
    expect(toggle).toHaveAttribute('aria-controls', 'action-csp-panel')
    expect(document.getElementById('action-csp-panel')).toBeInTheDocument()
  })

  it('keeps the count badge visible when collapsed, with only the rows hidden', async () => {
    renderAt('/district/61/action-list')
    const section = await screen.findByTestId('section-intervention')
    expect(toggleOf('section-intervention')).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    expect(
      section.querySelector('.action-list-section__count')
    ).toHaveTextContent('1')
    expect(
      screen.queryByRole('link', { name: 'Struggling Club' })
    ).not.toBeInTheDocument()
  })

  it('toggles a section open and closed from its header button', async () => {
    renderAt('/district/61/action-list')
    await screen.findByTestId('section-close')
    await userEvent.click(toggleOf('section-close'))
    expect(toggleOf('section-close')).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('link', { name: 'Rising Club' })
    ).toBeInTheDocument()
    await userEvent.click(toggleOf('section-close'))
    expect(toggleOf('section-close')).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.queryByRole('link', { name: 'Rising Club' })
    ).not.toBeInTheDocument()
  })

  it('remembers the collapse state for the next visit in this browser', async () => {
    const first = renderAt('/district/61/action-list')
    await screen.findByTestId('section-close')
    await userEvent.click(toggleOf('section-close')) // open a collapsed one
    await userEvent.click(toggleOf('section-csp')) // close the default-open one
    first.unmount()

    renderAt('/district/61/action-list')
    await screen.findByTestId('section-close')
    expect(toggleOf('section-close')).toHaveAttribute('aria-expanded', 'true')
    expect(toggleOf('section-csp')).toHaveAttribute('aria-expanded', 'false')
  })

  it('falls back to the default silently when localStorage throws', async () => {
    // Fault-inject on THIS page's key only: other stored preferences
    // (ProgramYearContext) are not what #1569 hardened, and blanking them
    // would be testing somebody else's code.
    const elsewhere = new Map<string, string>()
    const blocked = (key: string) => {
      if (key.includes('action-list-sections'))
        throw new Error('localStorage is disabled')
    }
    const getItem = vi
      .spyOn(window.localStorage, 'getItem')
      .mockImplementation(key => {
        blocked(key)
        return elsewhere.get(key) ?? null
      })
    const setItem = vi
      .spyOn(window.localStorage, 'setItem')
      .mockImplementation((key, value) => {
        blocked(key)
        elsewhere.set(key, value)
      })
    try {
      renderAt('/district/61/action-list')
      await screen.findByTestId('section-csp')
      expect(toggleOf('section-csp')).toHaveAttribute('aria-expanded', 'true')
      expect(toggleOf('section-close')).toHaveAttribute(
        'aria-expanded',
        'false'
      )
      // Still usable in-session — the write failure is swallowed.
      await userEvent.click(toggleOf('section-close'))
      expect(toggleOf('section-close')).toHaveAttribute('aria-expanded', 'true')
    } finally {
      getItem.mockRestore()
      setItem.mockRestore()
    }
  })

  it('follows #action-csp into the section even when a stored preference collapsed it', async () => {
    window.localStorage.setItem(
      'toast-stats:v1:action-list-sections',
      JSON.stringify({ 'action-csp': false })
    )
    const scrollIntoView = vi.fn()
    // jsdom has no layout, so the method does not exist at all.
    ;(
      Element.prototype as unknown as { scrollIntoView: unknown }
    ).scrollIntoView = scrollIntoView
    try {
      renderAt('/district/61/action-list#action-csp')
      await screen.findByTestId('section-csp')
      await waitFor(() =>
        expect(toggleOf('section-csp')).toHaveAttribute('aria-expanded', 'true')
      )
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    } finally {
      delete (Element.prototype as unknown as { scrollIntoView?: unknown })
        .scrollIntoView
    }
  })

  it('leads with the Club Success Plan section, and says so, while it can still earn credit', async () => {
    renderAt('/district/61/action-list')
    await screen.findByTestId('section-csp')
    expect(renderedOrder()[0]).toBe('section-csp')
    expect(
      screen.getByText(
        /clubs without a Club Success Plan, clubs within reach of Distinguished, areas with outstanding club visits, and clubs that need intervention\./
      )
    ).toBeInTheDocument()
  })

  it('moves it last — and reorders the intro copy — once the deadline has passed', async () => {
    vi.mocked(useDistrictCachedDates).mockReturnValue(
      DATES_2025_26_MAY as ReturnType<typeof useDistrictCachedDates>
    )
    renderAt('/district/61/action-list')
    await screen.findByTestId('section-csp')
    expect(renderedOrder()).toEqual([
      'section-close',
      'section-visits',
      'section-intervention',
      'section-csp',
    ])
    // The default is still "first expanded", which is now close-to-Distinguished.
    expect(toggleOf('section-close')).toHaveAttribute('aria-expanded', 'true')
    expect(toggleOf('section-csp')).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.getByText(
        /clubs within reach of Distinguished, areas with outstanding club visits, clubs that need intervention, and clubs without a Club Success Plan\./
      )
    ).toBeInTheDocument()
  })

  it('exports every row of every section regardless of collapse state, in display order', async () => {
    renderAt('/district/61/action-list')
    await screen.findByTestId('section-csp')
    // Only the first section is expanded — collapsing is a view concern.
    screen.getByRole('button', { name: 'Export CSV' }).click()
    await waitFor(() => expect(downloadCSV).toHaveBeenCalledTimes(1))
    const csv = vi.mocked(downloadCSV).mock.calls[0]![0]
    for (const row of [
      'Unplanned Club',
      'Rising Club',
      'Area A1',
      'Struggling Club',
    ])
      expect(csv).toContain(row)
    const at = (section: string) => csv.indexOf(section)
    expect(at('Club Success Plan not submitted')).toBeLessThan(
      at('Close to Distinguished')
    )
    expect(at('Close to Distinguished')).toBeLessThan(at('Missing club visits'))
    expect(at('Missing club visits')).toBeLessThan(at('Intervention required'))
  })

  it('renders three correctly ordered sections for a pre-2025-26 program year', async () => {
    vi.mocked(useDistrictCachedDates).mockReturnValue(
      DATES_2024_25 as ReturnType<typeof useDistrictCachedDates>
    )
    renderAt('/district/61/action-list')
    await screen.findByTestId('section-close')
    expect(renderedOrder()).toEqual([
      'section-close',
      'section-visits',
      'section-intervention',
    ])
    expect(toggleOf('section-close')).toHaveAttribute('aria-expanded', 'true')
    expect(toggleOf('section-visits')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/Club Success Plan/)).not.toBeInTheDocument()
  })

  /* Structural WCAG scan of the disclosures. It lives in this file rather than
     src/__tests__/accessibility/ so it reuses the page's existing hook mocks
     instead of forking a second copy of them (lessons 61/76); src/pages/
     __tests__/ is already in the integration project, where axe scans belong.

     JSDOM has no layout engine, so axe auto-disables `color-contrast`
     (lesson 075) — a green scan here proves structure, not contrast. Contrast
     and the focus ring are verified live on the PR preview. */
  it('is axe-clean with sections collapsed and after expanding one', async () => {
    const { container } = renderAt('/district/61/action-list')
    await screen.findByTestId('section-csp')
    expect(await axe(container)).toHaveNoViolations()
    await userEvent.click(toggleOf('section-close'))
    expect(await axe(container)).toHaveNoViolations()
  })
})
