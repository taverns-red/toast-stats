/**
 * District club map (#1784) at /district/:id/map — a routed subpage (ADR-005),
 * with the colour mode and the legend filters in the URL (`?color=`,
 * `?status=`, `?divisions=`, `?areas=`, `?view=list`).
 *
 * Page mount → pages/__tests__ (R22). MapLibre is stubbed: what the map draws
 * is covered by the pin-layer unit tests and the preview smoke; this file
 * covers the page around it — legend, filters, unmapped and prospective
 * lists, the empty state and the list view.
 */
import React, { Suspense } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
  type RouteObject,
} from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@testing-library/jest-dom'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import type {
  ClubTrend,
  ProspectiveClub,
} from '../../hooks/useDistrictAnalytics'

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: vi.fn(() => ({
    data: { districts: [{ id: '61', name: 'District 61' }] },
    isLoading: false,
    error: null,
  })),
}))

vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: vi.fn(() => ({
    data: {
      dates: ['2026-10-11', '2026-10-01'],
      dateRange: { startDate: '2026-07-01', endDate: '2026-10-11' },
    },
    isLoading: false,
  })),
}))

vi.mock('../../components/DistrictDetailHeader', () => ({
  DistrictDetailHeader: () => <div data-testid="district-header" />,
}))

vi.mock('../../components/map/LazyBasemapMap', () => ({
  default: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="region" aria-label={ariaLabel} data-testid="map-stub" />
  ),
}))

let mockIsMobile = false
vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => mockIsMobile,
}))

const club = (o: Partial<ClubTrend>): ClubTrend =>
  ({
    clubId: '0',
    clubName: 'Club',
    divisionId: 'A',
    divisionName: 'Division A',
    areaId: '01',
    areaName: 'Area 01',
    membershipTrend: [],
    dcpGoalsTrend: [],
    currentStatus: 'thriving',
    riskFactors: [],
    distinguishedLevel: 'NotDistinguished',
    coordinates: { lat: 45.4, lng: -75.7 },
    ...o,
  }) as ClubTrend

const CLUBS: ClubTrend[] = [
  club({ clubId: '101', clubName: 'Alpha Speakers' }),
  club({
    clubId: '102',
    clubName: 'Beta Orators',
    currentStatus: 'intervention-required',
    divisionId: 'B',
    divisionName: 'Division B',
    areaId: '12',
    areaName: 'Area 12',
    distinguishedLevel: 'Distinguished',
  }),
  club({
    clubId: '103',
    clubName: 'Gamma Voices',
    currentStatus: 'intervention-required',
    coordinates: undefined,
    email: 'gamma@example.org',
    phone: '555-0100',
  }),
]

const PROSPECTIVE: ProspectiveClub[] = [
  {
    clubId: '900',
    clubName: 'Delta Prospects',
    city: 'Hawkesbury',
    region: 'ON',
    country: 'Canada',
    email: 'secret@example.org',
    isProspective: true,
  } as ProspectiveClub,
]

let mockClubs = CLUBS
vi.mock('../../hooks/useDistrictAnalytics', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../hooks/useDistrictAnalytics')>()
  return {
    ...actual,
    useDistrictAnalytics: vi.fn(() => ({
      data: { allClubs: mockClubs, prospectiveClubs: PROSPECTIVE },
      isLoading: false,
      error: null,
    })),
  }
})

const DistrictMapPage = React.lazy(() => import('../DistrictMapPage'))

const Search: React.FC = () => {
  const loc = useLocation()
  return <div data-testid="search">{loc.search}</div>
}

const renderAt = (url: string) => {
  const routes: RouteObject[] = [
    {
      path: '/district/:districtId/map',
      element: (
        <Suspense fallback={<div>Loading…</div>}>
          <DistrictMapPage />
          <Search />
        </Suspense>
      ),
    },
  ]
  const router = createMemoryRouter(routes, { initialEntries: [url] })
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DarkModeProvider>
        <ProgramYearProvider>
          <RouterProvider router={router} />
        </ProgramYearProvider>
      </DarkModeProvider>
    </QueryClientProvider>
  )
}

// The query string as a reader sees it ('+' and %XX decoded).
const search = () =>
  decodeURIComponent(
    (screen.getByTestId('search').textContent ?? '').replace(/\+/g, ' ')
  )

afterEach(() => {
  cleanup()
  mockClubs = CLUBS
  mockIsMobile = false
})

describe('DistrictMapPage — map and legend', () => {
  it('renders the map region, coloured by club health by default', async () => {
    renderAt('/district/61/map')
    expect(
      await screen.findByRole('region', {
        name: 'Club map, coloured by club health',
      })
    ).toBeInTheDocument()
    const legend = screen.getByRole('group', { name: /Club health legend/ })
    expect(
      within(legend).getByRole('button', { name: /Thriving 1/ })
    ).toHaveAttribute('aria-pressed', 'false')
    // Counts include the unmapped club (2 intervention, one has no location).
    expect(
      within(legend).getByRole('button', { name: /Intervention required 2/ })
    ).toBeInTheDocument()
    // Zero-count status chips are hidden.
    expect(
      within(legend).queryByRole('button', { name: /Vulnerable/ })
    ).not.toBeInTheDocument()
  })

  it('colours by Distinguished level with ?color=tier, and clamps unknown values', async () => {
    renderAt('/district/61/map?color=tier')
    expect(
      await screen.findByRole('group', { name: /Distinguished level legend/ })
    ).toBeInTheDocument()
    cleanup()
    renderAt('/district/61/map?color=nonsense')
    expect(
      await screen.findByRole('group', { name: /Club health legend/ })
    ).toBeInTheDocument()
  })

  it('switches mode with aria-pressed buttons and keeps every filter', async () => {
    renderAt('/district/61/map?status=intervention')
    const modes = await screen.findByRole('group', { name: 'Colour pins by' })
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    fireEvent.click(within(modes).getByRole('button', { name: 'Area' }))
    expect(search()).toContain('color=area')
    expect(search()).toContain('status=intervention')
    fireEvent.click(within(modes).getByRole('button', { name: 'Club health' }))
    expect(search()).not.toContain('color=')
  })

  it('a legend chip filters through ?status= and announces the count', async () => {
    renderAt('/district/61/map')
    const chip = await screen.findByRole('button', {
      name: /Intervention required 2/,
    })
    fireEvent.click(chip)
    expect(search()).toContain('status=intervention')
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Showing 2 of 3 clubs')
  })

  it('a division chip writes the Clubs-table ?divisions= key', async () => {
    renderAt('/district/61/map?color=division')
    fireEvent.click(await screen.findByRole('button', { name: /Division B 1/ }))
    expect(search()).toContain('divisions=Division B')
  })
})

describe('DistrictMapPage — clubs not on the map', () => {
  it('lists unmapped clubs with the reason and a link, never contact details', async () => {
    renderAt('/district/61/map')
    const unmapped = await screen.findByRole('region', {
      name: /Not on the map \(1\)/,
    })
    expect(within(unmapped).getByText(/No Find-a-Club location/)).toBeVisible()
    expect(
      within(unmapped).getByRole('link', { name: /Gamma Voices/ })
    ).toHaveAttribute('href', '/district/61/club/103')
    expect(document.body.textContent).not.toContain('gamma@example.org')
    expect(document.body.textContent).not.toContain('555-0100')
  })

  it('lists prospective clubs as a count and names, without their email', async () => {
    renderAt('/district/61/map')
    const prospective = await screen.findByRole('region', {
      name: /Prospective \(1\)/,
    })
    expect(within(prospective).getByText(/Delta Prospects/)).toBeVisible()
    expect(within(prospective).getByText(/Hawkesbury/)).toBeVisible()
    expect(document.body.textContent).not.toContain('secret@example.org')
  })

  it('shows the no-location empty state when no club has coordinates', async () => {
    mockClubs = CLUBS.map(c => ({ ...c, coordinates: undefined }))
    renderAt('/district/61/map?date=2026-10-01')
    expect(
      await screen.findByText('No location data for this date')
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /Latest date/ }))
    expect(search()).not.toContain('date=2026-10-01')
  })
})

describe('DistrictMapPage — list view', () => {
  it('?view=list renders the same filtered set as a list', async () => {
    renderAt('/district/61/map?view=list&status=intervention')
    const list = await screen.findByRole('list', { name: /Clubs/ })
    const items = within(list).getAllByRole('link')
    expect(items.map(a => a.textContent)).toEqual([
      expect.stringContaining('Beta Orators'),
      expect.stringContaining('Gamma Voices'),
    ])
    expect(screen.queryByTestId('map-stub')).not.toBeInTheDocument()
  })
})

describe('DistrictMapPage — phone', () => {
  it('opens the mode picker from the "Colour" pill as a sheet', async () => {
    mockIsMobile = true
    renderAt('/district/61/map')
    fireEvent.click(
      await screen.findByRole('button', { name: /Colour: Club health/ })
    )
    const dialog = screen.getByRole('dialog', { name: 'Colour pins by' })
    fireEvent.click(
      within(dialog).getByRole('button', { name: /Distinguished level/ })
    )
    expect(search()).toContain('color=tier')
  })
})
