/**
 * World club explorer (#1809) at /regions/map — a routed subpage of
 * /regions (ADR-005): a world summary, the clustered map of every club, a
 * top-50 list by the selected metric and search, every control in the URL.
 *
 * Load strategy: world.json first (totals + the top-50 seed rows), so the
 * list renders without a shard; the region shards are fetched in parallel,
 * only when the page needs every club (the desktop map, the phone's map,
 * a search or a filter). `?region=` fetches only the named shards.
 *
 * Data: the recorded staging 2026-10-16 world file and its 01/05/12/
 * unassigned shards (#1800). Page mount → pages/__tests__ (R22). MapLibre is
 * stubbed: what the map draws is covered by the pin-layer tests and the
 * preview smoke.
 */
import React, { Suspense } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
} from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@testing-library/jest-dom'
import {
  ClubsByRegionShardSchema,
  ClubsByRegionWorldSchema,
  type ClubsByRegionShard,
} from '@taverns-red/shared-contracts'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import recorded from '../../../../packages/shared-contracts/src/__tests__/__fixtures__/recorded-clubs-by-region.json'

const world = ClubsByRegionWorldSchema.parse(recorded.world)
const shardOf = (k: string): ClubsByRegionShard =>
  ClubsByRegionShardSchema.parse(
    (recorded.shards as Record<string, unknown>)[k]
  )

let mockIsMobile = false
vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => mockIsMobile,
}))

vi.mock('../../components/map/LazyBasemapMap', () => ({
  default: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="region" aria-label={ariaLabel} data-testid="map-stub" />
  ),
}))

const fetchWorld = vi.fn()
const fetchShard = vi.fn()
vi.mock('../../services/cdn', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/cdn')>()),
  fetchCdnDates: vi.fn().mockResolvedValue({ dates: ['2026-10-16'], count: 1 }),
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2026-10-16'),
  fetchCdnManifest: vi
    .fn()
    .mockResolvedValue({ latestSnapshotDate: '2026-10-16', generatedAt: 'x' }),
  fetchCdnClubsByRegionWorld: (date: string) => fetchWorld(date),
  fetchCdnClubsByRegionShard: (date: string, region: string) =>
    fetchShard(date, region),
}))

const WorldMapPage = React.lazy(() => import('../WorldMapPage'))

beforeAll(async () => {
  await Promise.all([
    import('../WorldMapPage'),
    import('../../components/ClubSearchBox'),
    import('../../components/filters/FilterSheet'),
    import('../../components/map/MapClubLists'),
    import('../../components/map/MapClubSummary'),
    import('../../components/map/MapModePicker'),
    import('../../components/map/MapPhoneSheets'),
    import('../../components/map/MapPinKeys'),
    import('../../components/map/OnlineClubsChip'),
    import('../../components/map/RegionClubList'),
    import('../../components/map/worldModels'),
  ])
}, 30_000)

const serve = (shards: Record<string, ClubsByRegionShard> = {}) => {
  fetchWorld.mockResolvedValue(world)
  fetchShard.mockImplementation(async (_d: string, k: string) => {
    if (k in shards) return shards[k]
    return shardOf(k)
  })
}

afterEach(() => {
  cleanup()
  fetchWorld.mockReset()
  fetchShard.mockReset()
  mockIsMobile = false
})

const LocationProbe: React.FC = () => (
  <div data-testid="search">{useLocation().search}</div>
)
const search = () => screen.getByTestId('search').textContent

const renderAt = (url: string) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      {
        path: '/regions/map',
        element: (
          <>
            <LocationProbe />
            <Suspense fallback={null}>
              <WorldMapPage />
            </Suspense>
          </>
        ),
      },
    ],
    { initialEntries: [url] }
  )
  return render(
    <QueryClientProvider client={qc}>
      <DarkModeProvider>
        <ProgramYearProvider>
          <RouterProvider router={router} />
        </ProgramYearProvider>
      </DarkModeProvider>
    </QueryClientProvider>
  )
}

const rowsOf = async () => {
  const list = await screen.findByRole('list', {
    name: /^(Top clubs by|\d+ clubs? match)/,
  })
  return within(list).getAllByTestId('mobile-row')
}

describe('WorldMapPage', () => {
  it('shows the world summary and top 50 from world.json alone on a phone', async () => {
    mockIsMobile = true
    serve()
    renderAt('/regions/map')
    expect(
      await screen.findByRole('heading', { level: 1, name: /Regions/ })
    ).toBeInTheDocument()
    const summary = await screen.findByTestId('world-map-summary')
    expect(within(summary).getByText('318')).toBeInTheDocument()
    expect(within(summary).getByText('4')).toBeInTheDocument()
    const rows = await rowsOf()
    expect(rows).toHaveLength(50)
    expect(rows[0]).toHaveTextContent('Club Toastmasters de Sainte-Foy')
    expect(rows[0]).toHaveAttribute('href', '/district/61/club/5097')
    expect(fetchWorld).toHaveBeenCalledWith('2026-10-16')
    // ≤ 150 KB before the first 50 rows (#1809): no shard on this path.
    expect(fetchShard).not.toHaveBeenCalled()
  })

  it('fetches every shard in parallel for the desktop map', async () => {
    serve()
    renderAt('/regions/map')
    await waitFor(() => expect(fetchShard).toHaveBeenCalledTimes(4))
    expect(fetchShard.mock.calls.map(c => c[1]).sort()).toEqual([
      '01',
      '05',
      '12',
      'unassigned',
    ])
    expect(
      await screen.findByRole('region', {
        name: /World club map, coloured by club health/,
      })
    ).toBeInTheDocument()
    expect(
      await screen.findByText('Showing 318 of 318 clubs')
    ).toBeInTheDocument()
  })

  it('fetches only the ?region= shards, and the summary narrows', async () => {
    serve()
    renderAt('/regions/map?region=05')
    expect(
      await screen.findByText('Showing 161 of 161 clubs')
    ).toBeInTheDocument()
    expect(fetchShard.mock.calls.map(c => c[1])).toEqual(['05'])
    const summary = screen.getByTestId('world-map-summary')
    expect(within(summary).getByText('161')).toBeInTheDocument()
  })

  it('a phone search loads the shards and finds clubs in any region', async () => {
    mockIsMobile = true
    serve()
    renderAt('/regions/map?q=5097')
    const rows = await waitFor(async () => {
      const r = await rowsOf()
      expect(r).toHaveLength(1)
      return r
    })
    expect(rows[0]).toHaveTextContent('Sainte-Foy')
    expect(fetchShard).toHaveBeenCalledTimes(4)
  })

  it('ranks by the metric chip from the seed, in ?sort=', async () => {
    mockIsMobile = true
    serve()
    renderAt('/regions/map')
    await rowsOf()
    fireEvent.click(screen.getByRole('button', { name: 'Net growth' }))
    expect(search()).toBe('?sort=netGrowth')
    const rows = await rowsOf()
    expect(rows[0]).toHaveTextContent(world.top.netGrowth[0]!.name)
    expect(fetchShard).not.toHaveBeenCalled()
  })

  it('lists online-only clubs in an "N online clubs" chip, not as pins', async () => {
    const s05 = shardOf('05')
    s05.clubs = s05.clubs.map((c, i) =>
      i < 3 ? { ...c, meetsOnline: true } : c
    )
    serve({ '05': s05 })
    renderAt('/regions/map')
    expect(
      await screen.findByRole('button', { name: /3 online clubs/ })
    ).toBeInTheDocument()
  })

  it('offers Region and District colour modes; ?color=region keys by region', async () => {
    serve()
    renderAt('/regions/map?color=region')
    const legend = await screen.findByRole('group', { name: 'Region legend' })
    expect(within(legend).getByText('Region 05')).toBeInTheDocument()
  })

  it('says so when a shard fails, and still draws the rest', async () => {
    fetchWorld.mockResolvedValue(world)
    fetchShard.mockImplementation(async (_d: string, k: string) => {
      if (k === '12') throw new Error('Region clubs: HTTP 503')
      return shardOf(k)
    })
    renderAt('/regions/map')
    expect(
      await screen.findByText(/1 region could not be loaded/)
    ).toBeInTheDocument()
    expect(
      await screen.findByText(`Showing ${318 - 63} of ${318 - 63} clubs`)
    ).toBeInTheDocument()
  })

  it('says the explorer is not available when the date has no world file', async () => {
    fetchWorld.mockResolvedValue(null)
    renderAt('/regions/map')
    expect(
      await screen.findByTestId('world-map-unavailable')
    ).toBeInTheDocument()
  })

  // AC "Links to the country choropleth #1797": the link is page chrome,
  // there before the data and when the date has no world file (no CLS).
  it.each([
    ['desktop', false],
    ['phone', true],
  ])('links to the country map on %s', async (_label, phone) => {
    mockIsMobile = phone
    fetchWorld.mockResolvedValue(null)
    renderAt('/regions/map')
    const link = await screen.findByRole('link', {
      name: /clubs by country/i,
    })
    expect(link).toHaveAttribute('href', '/history/countries')
    expect(
      await screen.findByTestId('world-map-unavailable')
    ).toBeInTheDocument()
  })
})
