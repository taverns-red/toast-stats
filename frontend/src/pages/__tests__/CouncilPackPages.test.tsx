/**
 * Council print pack routes (#2299): `/district/:id/division/:div/print` and
 * `/district/:id/division/:div/area/:area/print`.
 *
 * The packs are real routed leaves inside the app shell (no tabs, no
 * `?print=1` toggle). They read the same two queries the Area and Division
 * pages read, pinned by `useDistrictProgramYearControls` (R3), and print both
 * the data's as-of date and the date the page was printed, with a source line.
 * The layout must not depend on viewport width: no `ClubMiniList`, even on a
 * phone, because print lays out at the paper's width, not the screen's.
 */
import React from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, screen, within } from '@testing-library/react'
import {
  MemoryRouter,
  Routes,
  Route,
  RouterProvider,
  createMemoryRouter,
  isRouteErrorResponse,
  useRouteError,
} from 'react-router-dom'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import AreaPrintPage from '../AreaPrintPage'
import DivisionPrintPage from '../DivisionPrintPage'
import AreaPage from '../AreaPage'
import DivisionPage from '../DivisionPage'

// A phone: the pack must still render tables, never the mobile card list.
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => true }))

const DATE = '2026-10-27'

const SNAPSHOT = {
  divisionPerformance: [
    ['A', '10', '123456', 'Ottawa Club', '1'],
    ['A', '10', '234567', 'Capital Speakers', '0'],
    ['A', '11', '345678', 'River Club', '0'],
  ].map(([div, area, id, name, nov]) => ({
    Division: div,
    Area: area,
    'Club Number': id,
    'Club Name': name,
    'Division Club Base': '3',
    'Area Club Base': area === '10' ? '2' : '1',
    'Nov Visit award': nov,
    'May Visit award': '0',
  })),
  clubPerformance: [
    ['123456', 'Ottawa Club', 'Y'],
    ['234567', 'Capital Speakers', 'N'],
    ['345678', 'River Club', 'Y'],
  ].map(([id, name, csp]) => ({
    'Club Number': id,
    'Club Name': name,
    'Club Status': 'Active',
    'Club Distinguished Status': '',
    CSP: csp,
  })),
}

vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: () => ({
    data: {
      districtId: '61',
      dates: ['2026-10-27'],
      count: 1,
      dateRange: { startDate: '2026-10-27', endDate: '2026-10-27' },
    },
  }),
}))
vi.mock('../../hooks/useUrlProgramYear', async () => {
  const { getProgramYear } = await import('../../utils/programYear')
  return {
    useUrlProgramYear: () => ({
      selectedProgramYear: getProgramYear(2026),
      setSelectedProgramYear: () => {},
      selectedDate: undefined,
      setSelectedDate: () => {},
    }),
  }
})
vi.mock('../../hooks/useLatestAsOfDate', () => ({
  useGlobalFreshness: () => ({ asOfDate: '2026-10-26', isLatest: true }),
}))
vi.mock('../../hooks/useMembershipData', () => ({
  useDistrictStatistics: vi.fn(() => ({
    data: SNAPSHOT,
    isLoading: false,
    error: null,
  })),
}))

function club(
  id: string,
  name: string,
  area: string,
  goals: number
): ClubTrend {
  return {
    clubId: id,
    clubName: name,
    divisionId: 'A',
    divisionName: 'Division A',
    areaId: area,
    areaName: `Area ${area}`,
    distinguishedLevel: 'NotDistinguished',
    currentStatus: 'thriving',
    riskFactors: [],
    membershipBase: 18,
    membershipTrend: [{ date: DATE, count: 18 }],
    dcpGoalsTrend: [{ date: DATE, goalsAchieved: goals }],
    cspSubmitted: true,
    clubStatus: 'Active',
    email: 'president@example.org',
    phone: '+1 555 0100',
  } as ClubTrend
}

vi.mock('../../hooks/useDistrictAnalytics', async () => {
  const actual = await vi.importActual<
    typeof import('../../hooks/useDistrictAnalytics')
  >('../../hooks/useDistrictAnalytics')
  return {
    ...actual,
    useDistrictAnalytics: vi.fn(() => ({
      data: {
        allClubs: [
          club('123456', 'Ottawa Club', '10', 4),
          club('234567', 'Capital Speakers', '10', 1),
          club('345678', 'River Club', '11', 3),
        ],
        interventionRequiredClubs: [],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })),
  }
})

// OfficerTrainingSummary on the Area/Division pages reads its own query.
vi.mock('../../components/training/OfficerTrainingSummary', () => ({
  OfficerTrainingSummary: () => null,
}))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 28, 9, 30))
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

function renderAt(path: string, routePath: string, el: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={routePath} element={el} />
      </Routes>
    </MemoryRouter>
  )
}

const AREA_PRINT = '/district/:districtId/division/:divId/area/:areaId/print'
const DIVISION_PRINT = '/district/:districtId/division/:divId/print'

describe('Area print pack (#2299)', () => {
  it('renders one document with the area title, sections and footer', () => {
    renderAt(
      '/district/61/division/A/area/10/print',
      AREA_PRINT,
      <AreaPrintPage />
    )
    const pack = screen.getByTestId('council-pack')
    expect(within(pack).getByRole('heading', { level: 1 })).toHaveTextContent(
      'Area 10'
    )
    for (const name of [
      /recognition/i,
      /close to distinguished/i,
      /club visits/i,
      /club success plans/i,
      /clubs/i,
    ]) {
      expect(
        within(pack).getAllByRole('heading', { level: 2, name }).length
      ).toBeGreaterThan(0)
    }
  })

  it('prints the data as-of date, the snapshot date, the printed date and the source', () => {
    renderAt(
      '/district/61/division/A/area/10/print',
      AREA_PRINT,
      <AreaPrintPage />
    )
    const footer = screen.getByTestId('council-pack-footer')
    expect(footer).toHaveTextContent(/Toastmasters International/)
    expect(footer).toHaveTextContent(/ts\.taverns\.red/)
    expect(footer).toHaveTextContent(/Data as of Oct 26, 2026/)
    expect(footer).toHaveTextContent(/Snapshot Oct 27, 2026/)
    expect(footer).toHaveTextContent(/Printed Oct 28, 2026/)
    // The header repeats both dates, labelled, so a reader can't confuse them.
    const header = screen.getByTestId('council-pack-dates')
    expect(header).toHaveTextContent(/Data as of Oct 26, 2026/)
    expect(header).toHaveTextContent(/Printed Oct 28, 2026/)
  })

  it('lists only this area’s clubs, as a table even on a phone', () => {
    renderAt(
      '/district/61/division/A/area/10/print',
      AREA_PRINT,
      <AreaPrintPage />
    )
    const roster = screen.getByTestId('council-pack-roster')
    expect(roster.tagName).toBe('TABLE')
    expect(roster).toHaveTextContent('Ottawa Club')
    expect(roster).toHaveTextContent('Capital Speakers')
    expect(roster).not.toHaveTextContent('River Club')
    expect(document.querySelector('.club-mini-list')).toBeNull()
  })

  it('never shows contact details', () => {
    const { container } = renderAt(
      '/district/61/division/A/area/10/print',
      AREA_PRINT,
      <AreaPrintPage />
    )
    expect(container.textContent).not.toMatch(/example\.org|555 0100/)
  })

  it('offers a Print button and a way back, both screen-only', () => {
    renderAt(
      '/district/61/division/A/area/10/print',
      AREA_PRINT,
      <AreaPrintPage />
    )
    const print = screen.getByRole('button', { name: /print/i })
    expect(print.closest('.council-pack__screen-only')).not.toBeNull()
    const back = screen.getByRole('link', { name: /back to area 10/i })
    expect(back).toHaveAttribute('href', '/district/61/division/A/area/10')
    expect(back.closest('.council-pack__screen-only')).not.toBeNull()
  })
})

describe('Division print pack (#2299)', () => {
  it('puts the summary on page 1 and the full roster on its own page', () => {
    renderAt(
      '/district/61/division/A/print',
      DIVISION_PRINT,
      <DivisionPrintPage />
    )
    const pack = screen.getByTestId('council-pack')
    expect(within(pack).getByRole('heading', { level: 1 })).toHaveTextContent(
      'Division A'
    )
    const roster = screen.getByTestId('council-pack-roster')
    expect(roster.closest('.council-pack__roster--own-page')).not.toBeNull()
    for (const name of ['Ottawa Club', 'Capital Speakers', 'River Club']) {
      expect(roster).toHaveTextContent(name)
    }
    // One row per area in the area table.
    const areas = screen.getByTestId('council-pack-areas')
    expect(within(areas).getAllByRole('row')).toHaveLength(1 + 2)
  })
})

// --- Slug validation → branded 404 ------------------------------------------
function StatusBoundary() {
  const err = useRouteError()
  const status = isRouteErrorResponse(err)
    ? err.status
    : err instanceof Response
      ? err.status
      : 'non-response'
  return <div data-testid="boundary">{status}</div>
}

function renderViaDataRouter(
  path: string,
  routePath: string,
  Element: React.ComponentType
) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        errorElement: <StatusBoundary />,
        children: [
          { path: routePath.replace(/^\//, ''), element: <Element /> },
        ],
      },
    ],
    { initialEntries: [path] }
  )
  return render(<RouterProvider router={router} />)
}

describe('print pack slug validation (#2299)', () => {
  it('404s an unknown area', () => {
    renderViaDataRouter(
      '/district/61/division/A/area/99/print',
      AREA_PRINT,
      AreaPrintPage
    )
    expect(screen.getByTestId('boundary')).toHaveTextContent('404')
  })

  it('404s an unknown division', () => {
    renderViaDataRouter(
      '/district/61/division/Z/print',
      DIVISION_PRINT,
      DivisionPrintPage
    )
    expect(screen.getByTestId('boundary')).toHaveTextContent('404')
  })
})

describe('print pack links from the Area and Division pages (#2299)', () => {
  it('the Area page links to its pack, carrying ?py= and ?date=', () => {
    renderAt(
      '/district/61/division/A/area/10?py=2026-2027&date=2026-10-27',
      '/district/:districtId/division/:divId/area/:areaId',
      <AreaPage />
    )
    expect(screen.getByRole('link', { name: /print pack/i })).toHaveAttribute(
      'href',
      '/district/61/division/A/area/10/print?py=2026-2027&date=2026-10-27'
    )
  })

  it('the Division page links to its pack', () => {
    renderAt(
      '/district/61/division/A',
      '/district/:districtId/division/:divId',
      <DivisionPage />
    )
    expect(screen.getByRole('link', { name: /print pack/i })).toHaveAttribute(
      'href',
      '/district/61/division/A/print'
    )
  })
})
