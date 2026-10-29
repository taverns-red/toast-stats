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
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
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

// #1943: the preview is decorative, so its failure (a chunk that does not
// load, a render error) must never take the live map down with it.
let mockPreviewFails = false
let previewFailures = 0
vi.mock('../../components/LocatorDots', async importOriginal => {
  const real =
    await importOriginal<typeof import('../../components/LocatorDots')>()
  return {
    LocatorDots: (props: Parameters<typeof real.LocatorDots>[0]) => {
      if (mockPreviewFails) {
        previewFailures++
        throw new Error('preview failed')
      }
      return real.LocatorDots(props)
    },
  }
})

// #2394: the phone sheets are their own lazy chunk, fetched on mount, while
// the "Colour" pill is eager — so a tap can land before the chunk does.
// Holding the chunk pending (React `use` suspends at the page's boundary
// exactly as a still-loading lazy import does) makes that order happen on
// demand instead of only under full-suite contention.
let sheetsChunk: Promise<void> | null = null
vi.mock('../../components/map/MapPhoneSheets', async importOriginal => {
  const real =
    await importOriginal<typeof import('../../components/map/MapPhoneSheets')>()
  const Gated = (props: Parameters<typeof real.MapPhoneSheets>[0]) => {
    if (sheetsChunk) React.use(sheetsChunk)
    return <real.MapPhoneSheets {...props} />
  }
  return { ...real, MapPhoneSheets: Gated, default: Gated }
})

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
  club({
    clubId: '101',
    clubName: 'Alpha Speakers',
    allowsVirtualAttendance: true,
  }),
  club({
    clubId: '102',
    clubName: 'Beta Orators',
    currentStatus: 'intervention-required',
    divisionId: 'B',
    divisionName: 'Division B',
    areaId: '12',
    areaName: 'Area 12',
    distinguishedLevel: 'Distinguished',
    meetingSchedule: [
      { day: 'Wednesday', cadence: 'weekly', startTime: '19:30' },
    ],
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
// The reports sidecar the analytics query returns with the clubs (#1787).
let mockReports: unknown = null
vi.mock('../../hooks/useDistrictAnalytics', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../hooks/useDistrictAnalytics')>()
  return {
    ...actual,
    useDistrictAnalytics: vi.fn(() => ({
      data: {
        allClubs: mockClubs,
        prospectiveClubs: PROSPECTIVE,
        districtReports: mockReports,
      },
      isLoading: false,
      error: null,
    })),
  }
})

// The raw district snapshot (visit awards, #1788), in the CDN's envelope.
const fetchSnapshot = vi.fn(async (_date: string, _districtId: string) => ({
  districtId: '61',
  data: {
    divisionPerformance: [
      { Club: '00000101', 'Nov Visit award': '1', 'May Visit award': '0' },
      { Club: '00000102', 'Nov Visit award': '0', 'May Visit award': '0' },
      { Club: '00000103', 'Nov Visit award': '0', 'May Visit award': '0' },
    ],
  },
}))
// The sandbox's CSV export (#1819): capture instead of downloading.
const downloadCSV = vi.fn()
vi.mock('../../utils/csvExport', async importOriginal => ({
  ...(await importOriginal<typeof import('../../utils/csvExport')>()),
  downloadCSV: (csv: string, name: string) => downloadCSV(csv, name),
}))

vi.mock('../../services/cdn', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/cdn')>()),
  fetchCdnDistrictSnapshot: (date: string, districtId: string) =>
    fetchSnapshot(date, districtId),
}))

const DistrictMapPage = React.lazy(() => import('../DistrictMapPage'))

// Compile the page's module graph (and its on-demand chunks) once, up front:
// otherwise the first test's 1 s findBy window measures Vite's transform of
// the whole graph, not the page (cold-start, not a slow render).
beforeAll(async () => {
  await Promise.all([
    import('../DistrictMapPage'),
    import('../../components/map/pinTerritory'),
    import('../../components/map/pinExtended'),
    import('../../components/map/MapModePicker'),
    import('../../components/map/MapClubLists'),
    import('../../components/map/MapPreview'),
    import('../../components/map/mapFilters'),
    import('../../components/map/MapFilterPanel'),
    // Not MapPhoneSheets: it is gated above (#2394), and importing it here
    // as well hands the page's lazy import the unmocked module.
    import('../../components/map/realign/RealignSandbox'),
  ])
}, 60_000)

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
  mockReports = null
  mockIsMobile = false
  sheetsChunk = null
  fetchSnapshot.mockClear()
  downloadCSV.mockClear()
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

  it('names the cluster pip as the "!" badge clusters now draw (#2173)', async () => {
    renderAt('/district/61/map')
    expect(
      await screen.findByText(
        /a red “!” badge marks clusters with clubs needing intervention/
      )
    ).toBeInTheDocument()
  })

  it('hides online-only clubs from the map and lists them from a chip (#2174)', async () => {
    mockClubs = [
      ...CLUBS,
      club({
        clubId: '104',
        clubName: 'Online Orators',
        meetsOnline: true,
      }),
    ]
    renderAt('/district/61/map')
    const chip = await screen.findByRole('button', { name: '1 online club' })
    fireEvent.click(chip)
    expect(
      screen.getByRole('link', { name: 'Online Orators' })
    ).toHaveAttribute('href', '/district/61/club/104')
  })

  it('stacks zoom and "Reset map view" over the map (#2173)', async () => {
    renderAt('/district/61/map')
    const stack = await screen.findByRole('group', { name: 'Map view' })
    expect(
      within(stack).getByRole('button', { name: 'Reset map view' })
    ).toBeInTheDocument()
    expect(
      within(stack).getByRole('button', { name: 'Zoom in' })
    ).toBeInTheDocument()
  })

  // #1943: while MapLibre loads, the map box shows the located clubs as a
  // static preview (no tiles, no MapLibre); the list view has no map box.
  it('shows a static preview of the located clubs in the map box', async () => {
    const { container } = renderAt('/district/61/map')
    await screen.findByTestId('map-stub')
    const canvas = container.querySelector('.district-map__canvas')!
    await vi.waitFor(() =>
      expect(
        canvas.querySelectorAll(
          '[data-testid="map-preview"] circle.club-minimap__dot'
        )
      ).toHaveLength(2)
    )
    cleanup()
    const list = renderAt('/district/61/map?view=list')
    await screen.findByRole('link', { name: 'Map view' })
    expect(
      list.container.querySelector('[data-testid="map-preview"]')
    ).toBeNull()
  })

  it('keeps the live map when the static preview fails', async () => {
    mockPreviewFails = true
    previewFailures = 0
    try {
      renderAt('/district/61/map')
      expect(await screen.findByTestId('map-stub')).toBeInTheDocument()
      await vi.waitFor(() => expect(previewFailures).toBeGreaterThan(0))
      expect(screen.getByTestId('map-stub')).toBeInTheDocument()
    } finally {
      mockPreviewFails = false
    }
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

  it('switches mode from the Colour popover and keeps every filter', async () => {
    renderAt('/district/61/map?status=intervention')
    const pill = await screen.findByRole('button', {
      name: /Colour: Club health/,
    })
    expect(pill).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(pill)
    expect(pill).toHaveAttribute('aria-expanded', 'true')
    const modes = await screen.findByRole('group', { name: 'Colour pins by' })
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    // Grouped as the spec's picker (§5).
    expect(
      within(modes).getByRole('group', { name: 'Membership & DCP' })
    ).toBeInTheDocument()
    fireEvent.click(within(modes).getByRole('button', { name: 'Area' }))
    expect(search()).toContain('color=area')
    expect(search()).toContain('status=intervention')
    expect(pill).toHaveAttribute('aria-expanded', 'false')
    // The quick toggle keeps Health | Distinguished one tap away.
    const quick = screen.getByRole('group', { name: 'Quick colour' })
    fireEvent.click(within(quick).getByRole('button', { name: 'Club health' }))
    expect(search()).not.toContain('color=')
  })

  it('Escape closes the Colour popover and returns focus to the pill', async () => {
    renderAt('/district/61/map')
    const pill = await screen.findByRole('button', { name: /Colour:/ })
    fireEvent.click(pill)
    await screen.findByRole('group', { name: 'Colour pins by' })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(pill).toHaveAttribute('aria-expanded', 'false')
    expect(pill).toHaveFocus()
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

// #1787: the extended modes, from fields already on each club.
describe('DistrictMapPage — extended colour modes', () => {
  const sized = (): ClubTrend[] => [
    { ...CLUBS[0]!, membershipTrend: [{ date: '2026-10-11', count: 9 }] },
    { ...CLUBS[1]!, membershipTrend: [{ date: '2026-10-11', count: 25 }] },
    // No count for the date: "not available", never 0–7.
    { ...CLUBS[2]!, membershipTrend: [] },
  ]

  it('?color=size colours by members, with an ordinal legend in words', async () => {
    mockClubs = sized()
    renderAt('/district/61/map?color=size')
    expect(
      await screen.findByRole('region', {
        name: 'Club map, coloured by members',
      })
    ).toBeInTheDocument()
    const legend = await screen.findByRole('group', { name: 'Members legend' })
    const chips = within(legend)
      .getAllByRole('button')
      .map(b => b.textContent?.replace(/\s+/g, ' ').trim())
    expect(chips).toEqual([
      '0–7 members 0',
      '8–11 members 1',
      '12–19 members 0',
      '20–29 members 1',
      '30 or more members 0',
      'Not available for this date 1',
    ])
  })

  it('a members chip writes ?size= and filters the map and the list', async () => {
    mockClubs = sized()
    renderAt('/district/61/map?color=size')
    fireEvent.click(
      await screen.findByRole('button', { name: /20–29 members 1/ })
    )
    expect(search()).toContain('size=20-29')
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 3 clubs')
  })

  it('a ?size= deep link filters once its chunk loads, never the unfiltered set', async () => {
    mockClubs = sized()
    renderAt('/district/61/map?view=list&color=size&size=8-11')
    const list = await screen.findByRole('list', { name: 'Clubs' })
    await vi.waitFor(() =>
      expect(
        within(list)
          .getAllByRole('link')
          .map(a => a.textContent)
      ).toEqual([expect.stringContaining('Alpha Speakers')])
    )
    // The list chip names the category in words.
    expect(within(list).getByText('8–11 members')).toBeInTheDocument()
  })

  it('?color=status reads the renewal overlay and writes the Clubs-table ?clubStatus=', async () => {
    mockClubs = [
      { ...CLUBS[0]!, clubStatus: 'Low' },
      {
        ...CLUBS[1]!,
        clubStatus: 'Suspended',
        statusOverlay: {
          status: 'Active',
          source: 'dues-renewal',
          activeSince: '2026-10-01',
          asOf: '',
        },
      },
      { ...CLUBS[2]!, clubStatus: 'Active' },
    ]
    renderAt('/district/61/map?color=status')
    expect(
      await screen.findByRole('region', {
        name: 'Club map, coloured by TI club status',
      })
    ).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /^Active 2/ }))
    expect(search()).toContain('clubStatus=Active')
    expect(screen.getByRole('status')).toHaveTextContent('Showing 2 of 3 clubs')
  })
})

describe('DistrictMapPage — reports-sidecar colour modes (#1787)', () => {
  const officerList = (rows: [string, boolean][]) => ({
    districtId: '61',
    programYear: '2026-2027',
    generatedAt: '2026-10-14T09:05:16.444Z',
    sections: {
      officerList: {
        sources: [
          {
            reportType: 'officer-list',
            tableId: 't',
            asOf: 'October 14, 2026',
          },
        ],
        records: rows.map(([club, submitted]) => ({
          club,
          clubName: `Club ${club}`,
          division: 'A',
          area: '01',
          listStatus: submitted ? 'Received - 05/25/2026' : 'List Not Here',
          electionCadence: 'annual',
          officerListSubmitted: submitted,
        })),
      },
    },
  })

  it('?color=officers reads the sidecar; a club without a row is not available', async () => {
    mockReports = officerList([
      ['101', true],
      ['102', false],
    ])
    renderAt('/district/61/map?color=officers')
    const legend = await screen.findByRole('group', {
      name: 'Officer list legend',
    })
    const chips = within(legend)
      .getAllByRole('button')
      .map(b => b.textContent?.replace(/\s+/g, ' ').trim())
    expect(chips).toEqual([
      'Submitted 1',
      'Not received 1',
      'Not available for this date 1',
    ])
    fireEvent.click(
      within(legend).getByRole('button', { name: /^Not received/ })
    )
    expect(search()).toContain('officers=no')
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 3 clubs')
  })

  it('without a reports file the legend says so, and no club is "Not received"', async () => {
    renderAt('/district/61/map?color=officers')
    const legend = await screen.findByRole('group', {
      name: 'Officer list legend',
    })
    expect(within(legend).getAllByRole('button')).toHaveLength(1)
    expect(
      within(legend).getByRole('button', {
        name: /Not available for this date 3/,
      })
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(/Officer list is not available for/).length
    ).toBeGreaterThan(0)
  })

  it('?color=day colours by the parsed schedule; clubs without one are "Not stated"', async () => {
    renderAt('/district/61/map?color=day')
    const legend = await screen.findByRole('group', {
      name: 'Meeting day legend',
    })
    const chips = within(legend)
      .getAllByRole('button')
      .map(b => b.textContent?.replace(/\s+/g, ' ').trim())
    expect(chips).toEqual(['We Wednesday 1', 'Not stated 2'])
    fireEvent.click(within(legend).getByRole('button', { name: /Wednesday/ }))
    expect(search()).toContain('day=wed')
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 3 clubs')
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

// #1843 — the club page's static mini-map links here with ?club=<id>.
describe('DistrictMapPage — ?club= deep link', () => {
  it('opens the linked club as the selected club', async () => {
    renderAt('/district/61/map?club=102')
    const panel = await screen.findByRole('region', { name: 'Selected club' })
    expect(await within(panel).findByText(/Beta Orators/)).toBeVisible()
  })

  it('matches a zero-padded club id', async () => {
    renderAt('/district/61/map?club=0000102')
    const panel = await screen.findByRole('region', { name: 'Selected club' })
    expect(await within(panel).findByText(/Beta Orators/)).toBeVisible()
  })

  it('selects nothing for an unknown club', async () => {
    renderAt('/district/61/map?club=999')
    await screen.findByRole('region', {
      name: 'Club map, coloured by club health',
    })
    expect(
      screen.queryByRole('region', { name: 'Selected club' })
    ).not.toBeInTheDocument()
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

  it('?view=list uses the shared MobileRowList rows (#1945)', async () => {
    renderAt('/district/61/map?view=list')
    const list = await screen.findByRole('list', { name: 'Clubs' })
    const rows = within(list).getAllByTestId('mobile-row')
    expect(rows).toHaveLength(3)
    const beta = rows.find(r => r.textContent?.includes('Beta Orators'))!
    expect(beta).toHaveAttribute('href', '/district/61/club/102')
    // The chip names the pin category in words, not colour alone.
    expect(beta.querySelector('.mobile-row__chip')?.textContent).toMatch(
      /Intervention/
    )
    expect(beta.querySelector('.mobile-row__meta')).toHaveTextContent(
      'Div B · Area 12'
    )
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

  it('a tap on "Colour" before the phone sheets chunk lands opens the picker once it does (#2394)', async () => {
    mockIsMobile = true
    let land!: () => void
    sheetsChunk = new Promise<void>(r => (land = r))
    renderAt('/district/61/map')
    fireEvent.click(
      await screen.findByRole('button', { name: /Colour: Club health/ })
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    land()
    const dialog = screen.getByRole('dialog', { name: 'Colour pins by' })
    fireEvent.click(
      within(dialog).getByRole('button', { name: /Distinguished level/ })
    )
    expect(search()).toContain('color=tier')
  })
})

describe('DistrictMapPage — filters (#1788)', () => {
  it('?online=yes keeps online-capable clubs on the map and in the list', async () => {
    renderAt('/district/61/map?online=yes')
    await vi.waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Showing 1 of 3 clubs'
      )
    )
    cleanup()
    renderAt('/district/61/map?view=list&online=yes')
    const list = await screen.findByRole('list', { name: /Clubs/ })
    await vi.waitFor(() =>
      expect(
        within(list)
          .getAllByRole('link')
          .map(a => a.textContent)
      ).toEqual([expect.stringContaining('Alpha Speakers')])
    )
  })

  it('?meets= (the meeting heatmap link) keeps the clubs in that slot (#1796)', async () => {
    renderAt('/district/61/map?view=list&meets=wed-19')
    const list = await screen.findByRole('list', { name: /Clubs/ })
    await vi.waitFor(() =>
      expect(
        within(list)
          .getAllByRole('link')
          .map(a => a.textContent)
      ).toEqual([expect.stringContaining('Beta Orators')])
    )
  })

  it('?visit=r1 reads the snapshot visit awards for the viewed date', async () => {
    renderAt('/district/61/map?visit=r1&date=2026-10-11')
    await vi.waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Showing 2 of 3 clubs'
      )
    )
    expect(fetchSnapshot).toHaveBeenCalledWith('2026-10-11', '61')
  })

  it('composes with the colour mode and the legend facets', async () => {
    renderAt('/district/61/map?color=tier&online=yes&status=thriving')
    await vi.waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Showing 1 of 3 clubs'
      )
    )
    expect(
      screen.getByRole('group', { name: /Distinguished level legend/ })
    ).toBeInTheDocument()
  })

  it('desktop: Filters opens a panel section; a chip writes its key and keeps the mode', async () => {
    renderAt('/district/61/map?color=tier')
    const trigger = await screen.findByRole('button', { name: /^Filters/ })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const panel = await screen.findByRole('region', { name: 'Filters' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Online attendance possible' })
    )
    expect(search()).toContain('online=yes')
    expect(search()).toContain('color=tier')
    fireEvent.click(within(panel).getByRole('button', { name: 'Division B' }))
    expect(search()).toContain('divisions=Division B')
    expect(search()).toContain('online=yes')
    expect(trigger).toHaveAccessibleName('Filters, 2 active')
  })

  it('phone: Filters opens the shared Filter & sort sheet; Clear all keeps mode and legend filters', async () => {
    mockIsMobile = true
    renderAt('/district/61/map?color=area&status=thriving&visit=r1&online=yes')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Filters, 2 active' })
    )
    const sheet = await screen.findByRole('dialog', { name: 'Filter & sort' })
    expect(
      within(sheet).getByRole('button', { name: 'Round 1' })
    ).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Clear all' }))
    expect(search()).not.toContain('visit=')
    expect(search()).not.toContain('online=')
    expect(search()).toContain('color=area')
    expect(search()).toContain('status=thriving')
  })

  it('loads no filter UI or snapshot until a filter needs it', async () => {
    renderAt('/district/61/map')
    await screen.findByRole('button', { name: /^Filters/ })
    expect(screen.queryByRole('region', { name: 'Filters' })).toBeNull()
    expect(fetchSnapshot).not.toHaveBeenCalled()
  })
})

describe('DistrictMapPage — realignment sandbox (#1819)', () => {
  const sandbox = () =>
    screen.findByRole('region', { name: 'Realignment sandbox' })
  const summary = (within_: HTMLElement) =>
    within(within_).getByRole('status', { name: 'Plan summary' })

  it('is entered from the panel, a link that pushes ?sandbox=1', async () => {
    renderAt('/district/61/map?color=tier')
    fireEvent.click(
      await screen.findByRole('link', { name: /Open the realignment sandbox/ })
    )
    const panel = await sandbox()
    expect(search()).toContain('sandbox=1')
    expect(summary(panel)).toHaveTextContent('No clubs moved yet')
    // The map says what its pins now mean.
    expect(
      screen.getByRole('region', {
        name: 'Club map, coloured by proposed area',
      })
    ).toBeInTheDocument()
  })

  it('list path: a labelled select moves a club, writing ?plan= and recounting areas', async () => {
    renderAt('/district/61/map?sandbox=1')
    const panel = await sandbox()
    fireEvent.click(within(panel).getByText('Assign clubs from a list'))
    const pick = within(panel).getByRole('combobox', {
      name: 'Area for Alpha Speakers',
    })
    fireEvent.change(pick, { target: { value: 'B|12' } })
    expect(search()).toContain('plan=B-12-101')
    expect(summary(panel)).toHaveTextContent('1 club moved')
    const areas = within(panel).getByRole('table', { name: /Areas/ })
    // B12 has two clubs now (one more than today); A01 one fewer.
    expect(within(areas).getByRole('row', { name: /^B12/ })).toHaveTextContent(
      '2(+1)'
    )
    expect(within(areas).getByRole('row', { name: /^A01/ })).toHaveTextContent(
      '1(−1)'
    )
  })

  it('a shared ?plan= link restores the plan; Reset clears it', async () => {
    renderAt('/district/61/map?sandbox=1&plan=B-12-101')
    const panel = await sandbox()
    expect(summary(panel)).toHaveTextContent('1 club moved')
    const moved = within(panel).getByRole('list', { name: 'Moved clubs' })
    expect(moved).toHaveTextContent('Alpha Speakers')
    expect(moved).toHaveTextContent('A01 → B12')
    fireEvent.click(within(panel).getByRole('button', { name: 'Reset' }))
    expect(search()).not.toContain('plan=')
    expect(search()).toContain('sandbox=1')
  })

  it('exports the proposed assignment as CSV, without contact details', async () => {
    renderAt('/district/61/map?sandbox=1&plan=B-12-101')
    const panel = await sandbox()
    fireEvent.click(within(panel).getByRole('button', { name: 'Export CSV' }))
    expect(downloadCSV).toHaveBeenCalledTimes(1)
    const [csv, name] = downloadCSV.mock.calls[0] as [string, string]
    expect(name).toBe('district-61-realignment-plan-2026-10-11.csv')
    expect(csv).toContain('101,Alpha Speakers,A,A01,B,B12,yes')
    expect(csv).not.toContain('gamma@example.org')
    expect(csv).not.toContain('555-0100')
  })

  it('Done leaves the sandbox and drops the plan', async () => {
    renderAt('/district/61/map?sandbox=1&plan=B-12-101&color=tier')
    const panel = await sandbox()
    fireEvent.click(within(panel).getByRole('link', { name: 'Done' }))
    expect(search()).not.toContain('sandbox')
    expect(search()).not.toContain('plan=')
    expect(search()).toContain('color=tier')
  })

  it('phone: the plan opens in a bottom sheet from the bar under the map', async () => {
    mockIsMobile = true
    renderAt('/district/61/map?sandbox=1')
    fireEvent.click(await screen.findByRole('button', { name: 'Open plan' }))
    const dialog = screen.getByRole('dialog', { name: 'Realignment plan' })
    expect(
      within(dialog).getByRole('table', { name: /Areas/ })
    ).toBeInTheDocument()
  })
})
