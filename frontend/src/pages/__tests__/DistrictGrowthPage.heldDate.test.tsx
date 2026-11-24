/**
 * /district/:id/growth on a held day (#3195): the date picker lists the held
 * date (from `allDates`) while the page's default stays on the published one.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import DistrictGrowthPage from '../DistrictGrowthPage'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../../services/cdn', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/cdn')>()),
  fetchCdnReinstatableClubs: vi.fn().mockReturnValue(new Promise(() => {})),
  fetchCdnDates: vi
    .fn()
    .mockResolvedValue({ dates: ['2026-11-20', '2026-11-21'], count: 2 }),
  fetchCdnManifest: vi
    .fn()
    .mockResolvedValue({ latestSnapshotDate: '2026-11-21', generatedAt: 'x' }),
}))
vi.mock('../../components/DistrictDetailHeader', () => ({
  DistrictDetailHeader: (props: { availableDates: string[] }) => (
    <div data-testid="picker">{props.availableDates.join(',')}</div>
  ),
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
      dates: ['2026-11-20', '2026-11-21'],
      allDates: ['2026-11-20', '2026-11-21', '2026-11-22'],
      dateRange: { startDate: '2026-11-20', endDate: '2026-11-21' },
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

afterEach(() => cleanup())

describe('DistrictGrowthPage on a held day (#3195)', () => {
  it('lists the held date in the date picker', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={qc}>
        <ProgramYearProvider>
          <MemoryRouter initialEntries={['/district/61/growth']}>
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
    expect((await screen.findByTestId('picker')).textContent).toContain(
      '2026-11-22'
    )
  })
})
