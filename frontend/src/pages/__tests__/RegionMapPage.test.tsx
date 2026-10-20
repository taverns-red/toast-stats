/**
 * Region club explorer (#1808) at /region/:n/map — a routed subpage of the
 * region page (ADR-005): a summary, the clustered map, a top list by the
 * selected metric and search, with every control in the URL (`?q=`,
 * `?sort=`, `?district=`, `?status=`, `?size=`, `?color=`, `?view=map`).
 *
 * Data: one region shard, `snapshots/<date>/clubs-by-region/<NN>.json`
 * (#1800, PR #2124), the recorded staging Region 05 shard of 2026-10-16.
 * The page pins the shard to its own snapshot date (R3).
 *
 * Page mount → pages/__tests__ (R22). MapLibre is stubbed: what the map
 * draws is covered by the pin-layer tests and the preview smoke.
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
import { ClubsByRegionShardSchema } from '@taverns-red/shared-contracts'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import { DarkModeProvider } from '../../contexts/DarkModeContext'
import recorded from '../../../../packages/shared-contracts/src/__tests__/__fixtures__/recorded-clubs-by-region.json'

const shard05 = ClubsByRegionShardSchema.parse(recorded.shards['05'])

let mockIsMobile = false
vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => mockIsMobile,
}))

vi.mock('../../components/map/LazyBasemapMap', () => ({
  default: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="region" aria-label={ariaLabel} data-testid="map-stub" />
  ),
}))

const fetchShard = vi.fn()
vi.mock('../../services/cdn', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/cdn')>()),
  fetchCdnDates: vi.fn().mockResolvedValue({ dates: ['2026-10-16'], count: 1 }),
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2026-10-16'),
  fetchCdnManifest: vi
    .fn()
    .mockResolvedValue({ latestSnapshotDate: '2026-10-16', generatedAt: 'x' }),
  fetchCdnClubsByRegionShard: (date: string, region: string) =>
    fetchShard(date, region),
}))

const RegionMapPage = React.lazy(() => import('../RegionMapPage'))

beforeAll(async () => {
  await Promise.all([
    import('../RegionMapPage'),
    import('../../components/map/MapClubLists'),
    import('../../components/map/MapModePicker'),
  ])
}, 30_000)

afterEach(() => {
  cleanup()
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
        path: '/region/:n/map',
        element: (
          <>
            <LocationProbe />
            <Suspense fallback={null}>
              <RegionMapPage />
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
  // "Top clubs by members", or "13 clubs match “ottawa”" while searching.
  const list = await screen.findByRole('list', {
    name: /^(Top clubs by|\d+ clubs? match)/,
  })
  return within(list).getAllByTestId('mobile-row')
}

describe('RegionMapPage', () => {
  it('shows the region summary and its top clubs by members', async () => {
    fetchShard.mockResolvedValue(shard05)
    renderAt('/region/05/map')
    expect(
      await screen.findByRole('heading', { level: 1, name: /Region 05/ })
    ).toBeInTheDocument()
    const summary = await screen.findByTestId('region-map-summary')
    expect(within(summary).getByText('161')).toBeInTheDocument()
    expect(within(summary).getByText('2,229')).toBeInTheDocument()
    expect(within(summary).getByText('82')).toBeInTheDocument()
    const rows = await rowsOf()
    expect(rows).toHaveLength(50)
    expect(rows[0]).toHaveTextContent('Club Toastmasters de Sainte-Foy')
    expect(rows[0]).toHaveAttribute('href', '/district/61/club/5097')
    expect(fetchShard).toHaveBeenCalledWith('2026-10-16', '05')
  })

  it('ranks by the metric chip, which lives in ?sort=', async () => {
    fetchShard.mockResolvedValue(shard05)
    renderAt('/region/05/map')
    await rowsOf()
    const chip = screen.getByRole('button', { name: 'Net growth' })
    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(search()).toBe('?sort=netGrowth')
    const rows = await rowsOf()
    expect(rows[0]).toHaveTextContent('Genetec Inc.')
    // Default omitted from the URL.
    fireEvent.click(screen.getByRole('button', { name: 'Members' }))
    expect(search()).toBe('')
  })

  it('searches by club name or number, deep-linkable via ?q=', async () => {
    fetchShard.mockResolvedValue(shard05)
    renderAt('/region/05/map?q=ottawa')
    expect(await rowsOf()).toHaveLength(13)
    const box = screen.getByRole('searchbox', { name: /Search clubs/ })
    expect(box).toHaveValue('ottawa')
    fireEvent.change(box, { target: { value: '5097' } })
    // The box is debounced (ClubSearchBox, #814): the URL follows.
    await waitFor(() => expect(search()).toBe('?q=5097'))
    const rows = await rowsOf()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Sainte-Foy')
  })

  it('says so when no club matches the search', async () => {
    fetchShard.mockResolvedValue(shard05)
    renderAt('/region/05/map?q=zzzz')
    expect(await screen.findByText(/No clubs match “zzzz”/)).toBeInTheDocument()
  })

  it('applies URL filters and reports the count to screen readers', async () => {
    fetchShard.mockResolvedValue(shard05)
    renderAt('/region/05/map?status=intervention&sort=dcpGoals')
    expect(
      await screen.findByText('Showing 82 of 161 clubs')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'DCP goals' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('colours by club health by default, district one tap away', async () => {
    fetchShard.mockResolvedValue(shard05)
    renderAt('/region/05/map')
    expect(
      await screen.findByRole('region', { name: /coloured by club health/ })
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('group', { name: 'Club health legend' })
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Colour:/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^District$/ }))
    expect(search()).toBe('?color=district')
    const legend = await screen.findByRole('group', {
      name: 'District legend',
    })
    expect(within(legend).getByText('District 61')).toBeInTheDocument()
  })

  it('stacks zoom and "Reset map view" over the map (#2173)', async () => {
    fetchShard.mockResolvedValue(shard05)
    renderAt('/region/05/map')
    const stack = await screen.findByRole('group', { name: 'Map view' })
    expect(
      within(stack).getByRole('button', { name: 'Reset map view' })
    ).toBeInTheDocument()
  })

  it('is list-first on a phone, with the map one tap away in the URL', async () => {
    mockIsMobile = true
    fetchShard.mockResolvedValue(shard05)
    renderAt('/region/05/map?sort=dcpGoals')
    await rowsOf()
    expect(screen.queryByTestId('map-stub')).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'Map' }))
    expect(await screen.findByTestId('map-stub')).toBeInTheDocument()
    expect(search()).toBe('?sort=dcpGoals&view=map')
    fireEvent.click(screen.getByRole('link', { name: 'List' }))
    expect(search()).toBe('?sort=dcpGoals')
  })

  // #2175 — the shard flags online-only clubs; the region map lists them
  // in the "N online clubs" chip (#2174) with links into their districts.
  it('lists online-only clubs in an "N online clubs" chip (#2175)', async () => {
    const online = new Set(['5097', shard05.clubs[1]!.id])
    fetchShard.mockResolvedValue({
      ...shard05,
      clubs: shard05.clubs.map(c =>
        online.has(c.id) ? { ...c, meetsOnline: true as const } : c
      ),
    })
    renderAt('/region/05/map')
    const chip = await screen.findByRole('button', { name: /2 online clubs/ })
    fireEvent.click(chip)
    expect(
      screen.getByRole('link', { name: 'Club Toastmasters de Sainte-Foy' })
    ).toHaveAttribute('href', '/district/61/club/5097')
  })

  it('shows no online chip for a shard without the flag (#2175)', async () => {
    fetchShard.mockResolvedValue(shard05)
    renderAt('/region/05/map')
    await screen.findByRole('group', { name: 'Club health legend' })
    expect(screen.queryByRole('button', { name: /online club/ })).toBeNull()
  })

  it('says honestly when the date has no region club data', async () => {
    fetchShard.mockResolvedValue(null)
    renderAt('/region/05/map')
    expect(
      await screen.findByText(
        'Region club data is not available for this date yet.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByTestId('region-map-summary')).toBeNull()
    expect(screen.queryByTestId('map-stub')).toBeNull()
  })

  it('reads an unpadded region id as its padded shard key (#2130)', async () => {
    fetchShard.mockResolvedValue(shard05)
    renderAt('/region/5/map')
    await rowsOf()
    expect(fetchShard).toHaveBeenCalledWith('2026-10-16', '05')
  })
})
