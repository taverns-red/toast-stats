/**
 * /district/:id/growth — the stage strip's fifth "Can reinstate" card in the
 * page's loading, missing and ready states. The reinstate fetch is the real
 * hook over a mocked CDN call, so a broken wiring fails here and not only in
 * the CLS smoke.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  ReinstatableClubsSchema,
  type ReinstatableClubs,
} from '@taverns-red/shared-contracts'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import DistrictGrowthPage from '../DistrictGrowthPage'
import { fetchCdnReinstatableClubs } from '../../services/cdn'
import reinstatableRecorded from '../../__tests__/fixtures/reinstatable-clubs-2026-11-18.recorded.json'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

vi.mock('../../services/cdn', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/cdn')>()),
  fetchCdnReinstatableClubs: vi.fn(),
  fetchCdnDates: vi
    .fn()
    .mockResolvedValue({ dates: ['2026-11-10', '2026-11-19'], count: 2 }),
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2026-11-19'),
  fetchCdnManifest: vi
    .fn()
    .mockResolvedValue({ latestSnapshotDate: '2026-11-19', generatedAt: 'x' }),
}))

vi.mock('../../components/DistrictDetailHeader', () => ({
  DistrictDetailHeader: () => null,
}))
vi.mock('../../components/DistrictSubnav', () => ({
  DistrictSubnav: () => null,
}))
vi.mock('../../components/GrowthSurvivalLink', () => ({
  GrowthSurvivalLink: () => null,
}))

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: () => ({ data: { districts: [{ id: '61', name: '61' }] } }),
}))
vi.mock('../../hooks/useDistrictData', () => ({
  useDistrictCachedDates: () => ({
    data: {
      dates: ['2026-11-10', '2026-11-19'],
      dateRange: { startDate: '2026-11-10', endDate: '2026-11-19' },
    },
  }),
}))
vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: () => ({ data: null, isLoading: false }),
}))
vi.mock('../../hooks/useDistrictGrowthCounts', () => ({
  useDistrictGrowthCounts: () => ({
    counts: { chartered: 1, suspended: 2 },
    isLoading: false,
  }),
}))
vi.mock('../../hooks/useSuspendedClubs', () => ({
  useSuspendedClubs: () => ({ clubs: [], isLoading: false }),
}))

const mockedReinstatable = vi.mocked(fetchCdnReinstatableClubs)

const fileFor = (date: string): ReinstatableClubs =>
  ReinstatableClubsSchema.parse({ ...reinstatableRecorded, snapshotDate: date })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const renderAt = (date: string) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ProgramYearProvider>
        <MemoryRouter
          initialEntries={[`/district/61/growth?py=2026-2027&date=${date}`]}
        >
          <Routes>
            <Route
              path="/district/:districtId/growth"
              element={<DistrictGrowthPage />}
            />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

const stageIds = async () => {
  const strip = await screen.findByRole('list', { name: 'Club Growth funnel' })
  return within(strip)
    .getAllByRole('listitem')
    .map(li => li.getAttribute('data-testid'))
}

const FOUR = [
  'growth-stage-prospective',
  'growth-stage-chartered',
  'growth-stage-coached',
  'growth-stage-suspended',
]
const FIVE = [...FOUR, 'growth-stage-reinstate']

describe('DistrictGrowthPage reinstate card', () => {
  it('loading: holds the fifth slot on a date that has the file', async () => {
    mockedReinstatable.mockReturnValue(new Promise(() => {}))
    renderAt('2026-11-19')
    expect(await stageIds()).toEqual(FIVE)
    expect(screen.getByTestId('growth-stage-reinstate')).toHaveTextContent(
      'Loading'
    )
    expect(mockedReinstatable).toHaveBeenCalledWith('2026-11-19')
  })

  it('ready: shows the count once the file arrives', async () => {
    const file = fileFor('2026-11-19')
    mockedReinstatable.mockResolvedValue(file)
    renderAt('2026-11-19')
    const card = await screen.findByTestId('growth-stage-reinstate')
    await within(card).findByText(String(file.districts['61']?.length))
    expect(card).not.toHaveTextContent('Loading')
    expect(await stageIds()).toEqual(FIVE)
  })

  it('missing: a date before the first file never reserves the slot', async () => {
    mockedReinstatable.mockReturnValue(new Promise(() => {}))
    renderAt('2026-11-10')
    expect(await stageIds()).toEqual(FOUR)
  })

  it('missing: no fifth card when the file is a 404', async () => {
    mockedReinstatable.mockResolvedValue(null)
    renderAt('2026-11-10')
    await vi.waitFor(() =>
      expect(mockedReinstatable).toHaveBeenCalledWith('2026-11-10')
    )
    expect(await stageIds()).toEqual(FOUR)
  })
})
