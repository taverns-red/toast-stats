/**
 * /awards — District Club Growth Achievement recipients (#1537).
 *
 * The page owns program year + date (R3) and hands them to the recipients
 * hook. The section must list the September 30 recipients from the
 * checkpoint's own file — a divergent "today" file is wired into the
 * falling-back fetchers so any leak shows — and must not exist at all for a
 * program year before the achievement (forward-only).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import {
  render,
  screen,
  cleanup,
  waitFor,
  within,
} from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProgramYearProvider } from '../../contexts/ProgramYearContext'
import AwardsPage from '../AwardsPage'
import {
  fetchCdnCompetitiveAwards,
  fetchCdnRankingsForDateExact,
} from '../../services/cdn'

vi.mock('../../hooks/useLatestAsOfDate', () => ({
  useLatestAsOfDate: () => ({
    asOfDate: undefined,
    latestSnapshotDate: undefined,
  }),
}))

vi.mock('../../services/cdn', () => {
  const row = (districtId: string, newCharteredClubs: number) => ({
    districtId,
    districtName: `District ${districtId}`,
    region: '07',
    newCharteredClubs,
  })
  const sepFile = {
    rankings: [row('94', 9), row('41', 3), row('61', 2)],
    snapshotDate: '2026-09-30',
    asOfDate: '2026-10-05',
    generatedAt: '2026-10-05T00:00:00Z',
  }
  // What a falling-back fetch would serve: 61 has since reached 12.
  const today = {
    rankings: [row('94', 9), row('41', 3), row('61', 12)],
    asOfDate: '2026-10-05',
    generatedAt: '2026-10-05T00:00:00Z',
  }
  return {
    fetchCdnDates: vi.fn().mockResolvedValue({
      dates: ['2026-05-01', '2026-09-30'],
      count: 2,
      generatedAt: '2026-10-05T00:00:00Z',
    }),
    fetchCdnManifest: vi
      .fn()
      .mockResolvedValue({ latestSnapshotDate: '2026-09-30' }),
    fetchCdnCompetitiveAwards: vi.fn().mockResolvedValue({
      metadata: {
        snapshotId: 'snap',
        calculatedAt: '2026-10-05T00:00:00Z',
        totalDistricts: 3,
      },
      extensionAward: [],
      twentyPlusAward: [],
      retentionAward: [],
      byDistrict: {},
    }),
    fetchCdnSnapshotIndex: vi
      .fn()
      .mockResolvedValue({ '94': ['2026-09-29', '2026-09-30'] }),
    fetchCdnRankingsForDateExact: vi.fn(async (date: string) =>
      date === '2026-09-30' ? sepFile : null
    ),
    fetchCdnRankingsForDate: vi.fn().mockResolvedValue(today),
    fetchCdnRankings: vi.fn().mockResolvedValue(today),
  }
})

const mockedExact = vi.mocked(fetchCdnRankingsForDateExact)
const mockedAwards = vi.mocked(fetchCdnCompetitiveAwards)

const renderAt = (url: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProgramYearProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/awards" element={<AwardsPage />} />
          </Routes>
        </MemoryRouter>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

afterEach(() => cleanup())
beforeEach(() => {
  localStorage.clear()
})

describe('AwardsPage — Club Growth Achievement recipients (#1537)', () => {
  it('lists the September 30 recipients from the checkpoint file, not today’s', async () => {
    renderAt('/awards')
    const sep = await screen.findByTestId('club-growth-recipients-september')
    await waitFor(() => expect(sep).toHaveAttribute('data-status', 'resolved'))
    expect(
      within(sep).getByRole('link', { name: 'District 94' })
    ).toBeInTheDocument()
    expect(
      within(sep).getByRole('link', { name: 'District 41' })
    ).toBeInTheDocument()
    // 61 had 2 on September 30; today's 12 must not make it a recipient.
    expect(within(sep).queryByRole('link', { name: 'District 61' })).toBeNull()
    expect(mockedExact).toHaveBeenCalledWith('2026-09-30')
    expect(screen.getByTestId('club-growth-recipients-march')).toHaveAttribute(
      'data-status',
      'pending'
    )
  })

  it('renders no recipients section for a program year before the achievement', async () => {
    renderAt('/awards?py=2025')
    await waitFor(() => expect(mockedAwards).toHaveBeenCalledWith('2026-05-01'))
    expect(screen.queryByTestId('club-growth-recipients')).toBeNull()
  })
})
