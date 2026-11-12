/**
 * The landing page resolves `?date=` against the snapshots that exist (#2635).
 *
 * It hand-rolled its own PY/date derivation and read the raw `?date=`, so
 * `/?date=2020-01-01` fetched rankings for a date with no snapshot and labelled
 * the chip with it (LAND-13a). It now reads the shared controls hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import DistrictsPage from '../DistrictsPage'
import { fetchCdnRankingsForDate } from '../../services/cdn'
import { renderWithProviders } from '../../__tests__/test-utils'

vi.mock('../../services/cdn', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/cdn')>()
  const rankings = {
    rankings: [],
    asOfDate: '2026-11-11',
    generatedAt: '2026-11-11T00:00:00Z',
  }
  return {
    ...actual,
    fetchCdnDates: vi.fn().mockResolvedValue({
      dates: ['2026-03-15', '2026-08-01', '2026-11-11'],
      count: 3,
      generatedAt: '2026-11-11T00:00:00Z',
    }),
    fetchCdnRankings: vi.fn().mockResolvedValue(rankings),
    fetchCdnRankingsForDate: vi.fn().mockResolvedValue(rankings),
    fetchCdnRegionRollups: vi.fn().mockResolvedValue(null),
    fetchCdnCompetitiveAwards: vi.fn().mockResolvedValue(null),
    fetchCdnRegionMembershipSeries: vi.fn().mockResolvedValue(null),
  }
})

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: () => ({
    data: { districts: [] },
    isLoading: false,
    isError: false,
  }),
}))

describe('DistrictsPage date resolution (#2635)', () => {
  beforeEach(() => {
    vi.mocked(fetchCdnRankingsForDate).mockClear()
  })

  it('a ?date= with no snapshot fetches an existing date and the chip never names it', async () => {
    renderWithProviders(<DistrictsPage />, {
      initialEntries: ['/?date=2020-01-01'],
    })
    await waitFor(() =>
      expect(fetchCdnRankingsForDate).toHaveBeenCalledWith('2026-11-11')
    )
    expect(fetchCdnRankingsForDate).not.toHaveBeenCalledWith('2020-01-01')
    const chip = await screen.findByTestId('date-chip')
    expect(chip).not.toHaveTextContent('Jan 1, 2020')
  })

  it('a snapshot date from a prior program year switches the program year', async () => {
    renderWithProviders(<DistrictsPage />, {
      initialEntries: ['/?date=2026-03-15'],
    })
    await waitFor(() =>
      expect(fetchCdnRankingsForDate).toHaveBeenCalledWith('2026-03-15')
    )
    expect(await screen.findByTestId('py-chip')).toHaveTextContent('PY 2025–26')
  })
})
